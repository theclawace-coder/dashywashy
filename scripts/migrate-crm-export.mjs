import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return {}
  const content = fs.readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = true
      continue
    }
    out[key] = next
    i += 1
  }
  return out
}

const args = parseArgs(process.argv)

const DEFAULT_EXPORT_PATH = 'c:\\\\Users\\\\acebo\\\\Downloads\\\\2026-02-09_crm_export.json'
const DEFAULT_USER_NAME = 'Sydney Premium Cleaning'
const DEFAULT_USER_EMAIL = 'sales@sydneypremiumcleaning.com.au'
const DEFAULT_USER_PASSWORD = 'BeCreative123!!'
const DEFAULT_ORG_NAME = 'Sydney premium cleaning'
const DEFAULT_ORG_BUSINESS_NAME = 'Sydney premium cleaning'

const exportPath = args.file || DEFAULT_EXPORT_PATH
const userName = args['user-name'] || DEFAULT_USER_NAME
const userEmail = args['user-email'] || DEFAULT_USER_EMAIL
const userPassword = args['user-password'] || DEFAULT_USER_PASSWORD
const orgName = args['org-name'] || DEFAULT_ORG_NAME
const orgBusinessName = args['org-business-name'] || DEFAULT_ORG_BUSINESS_NAME

const fileEnv = loadEnvFile()
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  fileEnv.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL).')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function listAllUsers() {
  const all = []
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`Failed to list users: ${error.message}`)
    all.push(...(data?.users || []))
    if (!data?.users?.length || data.users.length < perPage) break
    page += 1
  }
  return all
}

async function findUserByEmail(email) {
  const users = await listAllUsers()
  const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return match || null
}

async function ensureUser(email, password, fullName) {
  const existing = await findUserByEmail(email)
  if (existing?.id) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error || !data?.user) {
      throw new Error(error?.message || `Failed to update user ${email}`)
    }
    return { user: data.user, action: 'updated' }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data?.user) {
    throw new Error(error?.message || `Failed to create user ${email}`)
  }
  return { user: data.user, action: 'created' }
}

async function ensureOrg(name, businessName, { forceNew = false } = {}) {
  const baseSlug = slugify(name)
  if (!baseSlug) throw new Error('Unable to generate org slug from name.')

  if (!forceNew) {
    const { data: existing, error: existingError } = await supabase
      .from('organizations')
      .select('id, slug, name')
      .eq('slug', baseSlug)
      .maybeSingle()
    if (existingError) {
      throw new Error(`Failed to check org slug: ${existingError.message}`)
    }
    if (existing?.id) {
      return { org: existing, orgId: existing.id, slug: existing.slug }
    }
  }

  let slug = baseSlug
  let suffix = 2
  while (true) {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(`Failed to check org slug: ${error.message}`)
    if (!data) break
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  const orgId = crypto.randomUUID()
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      id: orgId,
      name,
      slug,
      business_name: businessName || name,
      business_abn: null,
      business_phone: null,
      business_email: null,
      business_operating_name: null,
      bank_account_name: null,
      bank_bsb: null,
      bank_account_number: null,
    })
    .select()
    .single()

  if (orgError || !org) {
    throw new Error(orgError?.message || 'Failed to create organization')
  }

  return { org, orgId, slug }
}

async function ensureMembership(orgId, userId, displayName) {
  const { error: memberError } = await supabase.from('organization_members').upsert(
    { org_id: orgId, user_id: userId, role: 'owner', display_name: displayName || null },
    { onConflict: 'org_id,user_id' }
  )
  if (memberError) {
    throw new Error(`Failed to upsert org membership: ${memberError.message}`)
  }

  const { error: prefError } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, current_org_id: orgId }, { onConflict: 'user_id' })
  if (prefError) {
    throw new Error(`Failed to upsert user preferences: ${prefError.message}`)
  }
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size))
  }
  return out
}

function stripColumns(rows, cols) {
  if (!cols?.size) return rows
  return rows.map((row) => {
    const next = { ...row }
    for (const col of cols) delete next[col]
    return next
  })
}

async function upsertRows(table, rows, { onConflict = 'id', batchSize = 500 } = {}) {
  if (!rows.length) return { inserted: 0, removedColumns: [] }
  const removedCols = new Set()

  const batches = chunk(rows, batchSize)
  for (const batch of batches) {
    let attemptRows = stripColumns(batch, removedCols)
    while (true) {
      const { error } = await supabase.from(table).upsert(attemptRows, {
        onConflict,
        ignoreDuplicates: false,
      })

      if (!error) break

      const missingMatch = error.message.match(/Could not find the '(.+?)' column/)
      if (missingMatch) {
        const missingCol = missingMatch[1]
        if (!removedCols.has(missingCol)) {
          removedCols.add(missingCol)
        }
        attemptRows = stripColumns(batch, removedCols)
        continue
      }

      throw new Error(`Failed to upsert into ${table}: ${error.message}`)
    }
  }

  return { inserted: rows.length, removedColumns: Array.from(removedCols) }
}

async function fetchBySlug(table, slugs) {
  if (!slugs.length) return new Map()
  const { data, error } = await supabase.from(table).select('id, slug').in('slug', slugs)
  if (error) throw new Error(`Failed to fetch ${table} by slug: ${error.message}`)
  const map = new Map()
  for (const row of data || []) {
    if (row?.slug) map.set(row.slug, row.id)
  }
  return map
}

async function fetchByStepVariant(table, rows) {
  const steps = Array.from(new Set(rows.map((row) => row.step).filter((step) => Number.isInteger(step))))
  if (!steps.length) return new Map()
  const { data, error } = await supabase
    .from(table)
    .select('id, step, variant')
    .in('step', steps)
  if (error) throw new Error(`Failed to fetch ${table} by step/variant: ${error.message}`)
  const map = new Map()
  for (const row of data || []) {
    const key = `${row.step}|${row.variant ?? 1}`
    map.set(key, row.id)
  }
  return map
}

async function fetchByLeadId(table, leadIds) {
  if (!leadIds.length) return new Map()
  const { data, error } = await supabase.from(table).select('id, lead_id').in('lead_id', leadIds)
  if (error) throw new Error(`Failed to fetch ${table} by lead_id: ${error.message}`)
  const map = new Map()
  for (const row of data || []) {
    if (row?.lead_id) map.set(row.lead_id, row.id)
  }
  return map
}

function applyIdMap(rows, field, idMap) {
  if (!rows?.length || !idMap?.size) return rows
  return rows.map((row) => {
    const current = row[field]
    const nextId = idMap.get(current)
    if (!nextId) return row
    return { ...row, [field]: nextId }
  })
}

function pickJourneyTimestamp(row) {
  const candidates = [
    row.updated_at,
    row.created_at,
    row.started_at,
    row.completed_at,
    row.cancelled_at,
  ].filter(Boolean)
  if (!candidates.length) return 0
  const ts = candidates
    .map((value) => {
      const time = new Date(value).getTime()
      return Number.isFinite(time) ? time : 0
    })
    .sort((a, b) => b - a)[0]
  return ts || 0
}

function dedupeJourneys(rows) {
  const bestByLead = new Map()
  for (const row of rows) {
    const leadId = row.lead_id
    if (!leadId) continue
    const ts = pickJourneyTimestamp(row)
    const existing = bestByLead.get(leadId)
    if (!existing || ts > existing.ts) {
      bestByLead.set(leadId, { row, ts })
    }
  }

  const deduped = []
  for (const row of rows) {
    const leadId = row.lead_id
    if (!leadId) {
      deduped.push(row)
      continue
    }
    const best = bestByLead.get(leadId)
    if (best?.row?.id === row.id) {
      deduped.push(row)
    }
  }

  return { deduped }
}

async function normalizeTemplatesBySlug(table, rows, orgId) {
  const slugs = Array.from(
    new Set(rows.map((row) => row.slug).filter((slug) => typeof slug === 'string' && slug.length))
  )
  const existingMap = await fetchBySlug(table, slugs)
  const idMap = new Map()
  const normalized = rows.map((row) => {
    const existingId = existingMap.get(row.slug)
    if (existingId) idMap.set(row.id, existingId)
    return { ...row, id: existingId ?? row.id, org_id: orgId }
  })
  return { normalized, idMap }
}

async function normalizeTemplatesByStepVariant(table, rows, orgId) {
  const existingMap = await fetchByStepVariant(table, rows)
  const idMap = new Map()
  const normalized = rows.map((row) => {
    const key = `${row.step}|${row.variant ?? 1}`
    const existingId = existingMap.get(key)
    if (existingId) idMap.set(row.id, existingId)
    return { ...row, id: existingId ?? row.id, org_id: orgId }
  })
  return { normalized, idMap }
}

async function normalizeJourneysByLeadId(table, rows, orgId) {
  const leadIds = Array.from(
    new Set(rows.map((row) => row.lead_id).filter((leadId) => typeof leadId === 'string' && leadId.length))
  )
  const existingMap = await fetchByLeadId(table, leadIds)
  const idMap = new Map()
  const normalized = rows.map((row) => {
    const existingId = existingMap.get(row.lead_id)
    if (existingId) idMap.set(row.id, existingId)
    return { ...row, id: existingId ?? row.id, org_id: orgId }
  })
  return { normalized, idMap }
}

async function normalizeByField(table, rows, field, orgId) {
  const values = Array.from(
    new Set(rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined))
  )
  if (!values.length) {
    return { normalized: rows.map((row) => ({ ...row, org_id: orgId })) }
  }

  const { data, error } = await supabase.from(table).select(`id, ${field}`).in(field, values)
  if (error) throw new Error(`Failed to fetch ${table} by ${field}: ${error.message}`)

  const existingMap = new Map()
  for (const row of data || []) {
    existingMap.set(row[field], row.id)
  }

  const normalized = rows.map((row) => {
    const existingId = existingMap.get(row[field])
    return { ...row, id: existingId ?? row.id, org_id: orgId }
  })

  return { normalized }
}

async function run() {
  if (!fs.existsSync(exportPath)) {
    throw new Error(`Export file not found: ${exportPath}`)
  }

  const raw = fs.readFileSync(exportPath, 'utf8')
  const data = JSON.parse(raw)

  const { user, action: userAction } = await ensureUser(userEmail, userPassword, userName)
  const { org, orgId, slug } = await ensureOrg(orgName, orgBusinessName, {
    forceNew: Boolean(args['force-new-org']),
  })
  await ensureMembership(orgId, user.id, userName)

  const idMaps = {
    sms_templates: new Map(),
    payment_sms_templates: new Map(),
    review_sms_templates: new Map(),
    marketing_sms_templates: new Map(),
    marketing_email_templates: new Map(),
    marketing_sms_journeys: new Map(),
    marketing_email_journeys: new Map(),
  }

  if (Array.isArray(data.sms_templates) && data.sms_templates.length) {
    const { normalized, idMap } = await normalizeTemplatesBySlug(
      'sms_templates',
      data.sms_templates,
      orgId
    )
    data.sms_templates = normalized
    idMaps.sms_templates = idMap
  }

  if (Array.isArray(data.payment_sms_templates) && data.payment_sms_templates.length) {
    const { normalized, idMap } = await normalizeTemplatesBySlug(
      'payment_sms_templates',
      data.payment_sms_templates,
      orgId
    )
    data.payment_sms_templates = normalized
    idMaps.payment_sms_templates = idMap
  }

  if (Array.isArray(data.review_sms_templates) && data.review_sms_templates.length) {
    const { normalized, idMap } = await normalizeTemplatesBySlug(
      'review_sms_templates',
      data.review_sms_templates,
      orgId
    )
    data.review_sms_templates = normalized
    idMaps.review_sms_templates = idMap
  }

  if (Array.isArray(data.marketing_sms_templates) && data.marketing_sms_templates.length) {
    const { normalized, idMap } = await normalizeTemplatesByStepVariant(
      'marketing_sms_templates',
      data.marketing_sms_templates,
      orgId
    )
    data.marketing_sms_templates = normalized
    idMaps.marketing_sms_templates = idMap
  }

  if (Array.isArray(data.marketing_email_templates) && data.marketing_email_templates.length) {
    const { normalized, idMap } = await normalizeTemplatesByStepVariant(
      'marketing_email_templates',
      data.marketing_email_templates,
      orgId
    )
    data.marketing_email_templates = normalized
    idMaps.marketing_email_templates = idMap
  }

  if (Array.isArray(data.marketing_sms_journeys) && data.marketing_sms_journeys.length) {
    const original = data.marketing_sms_journeys
    const { deduped } = dedupeJourneys(original)
    const { normalized } = await normalizeJourneysByLeadId(
      'marketing_sms_journeys',
      deduped,
      orgId
    )
    data.marketing_sms_journeys = normalized

    const normalizedByLead = new Map()
    for (const row of normalized) {
      if (row.lead_id) normalizedByLead.set(row.lead_id, row.id)
    }

    const idMap = new Map()
    for (const row of original) {
      const mapped = row.lead_id ? normalizedByLead.get(row.lead_id) : null
      if (mapped) idMap.set(row.id, mapped)
    }
    idMaps.marketing_sms_journeys = idMap
  }

  if (Array.isArray(data.marketing_email_journeys) && data.marketing_email_journeys.length) {
    const original = data.marketing_email_journeys
    const { deduped } = dedupeJourneys(original)
    const { normalized } = await normalizeJourneysByLeadId(
      'marketing_email_journeys',
      deduped,
      orgId
    )
    data.marketing_email_journeys = normalized

    const normalizedByLead = new Map()
    for (const row of normalized) {
      if (row.lead_id) normalizedByLead.set(row.lead_id, row.id)
    }

    const idMap = new Map()
    for (const row of original) {
      const mapped = row.lead_id ? normalizedByLead.get(row.lead_id) : null
      if (mapped) idMap.set(row.id, mapped)
    }
    idMaps.marketing_email_journeys = idMap
  }

  if (Array.isArray(data.marketing_sms_logs) && data.marketing_sms_logs.length) {
    let logs = data.marketing_sms_logs
    logs = applyIdMap(logs, 'template_id', idMaps.marketing_sms_templates)
    logs = applyIdMap(logs, 'journey_id', idMaps.marketing_sms_journeys)
    data.marketing_sms_logs = logs
  }

  if (Array.isArray(data.marketing_email_logs) && data.marketing_email_logs.length) {
    let logs = data.marketing_email_logs
    logs = applyIdMap(logs, 'template_id', idMaps.marketing_email_templates)
    logs = applyIdMap(logs, 'journey_id', idMaps.marketing_email_journeys)
    data.marketing_email_logs = logs
  }

  if (Array.isArray(data.payment_sms_logs) && data.payment_sms_logs.length) {
    data.payment_sms_logs = applyIdMap(
      data.payment_sms_logs,
      'template_id',
      idMaps.payment_sms_templates
    )
  }

  if (Array.isArray(data.review_sms_logs) && data.review_sms_logs.length) {
    data.review_sms_logs = applyIdMap(
      data.review_sms_logs,
      'template_id',
      idMaps.review_sms_templates
    )
  }

  if (Array.isArray(data.daily_summary_logs) && data.daily_summary_logs.length) {
    const { normalized } = await normalizeByField(
      'daily_summary_logs',
      data.daily_summary_logs,
      'summary_date',
      orgId
    )
    data.daily_summary_logs = normalized
  }

  const TABLE_ORDER = [
    // Leads can reference dialpad emails via email_id
    'dialpad_emails',
    'extracted_leads',

    // Core operational data
    'cleaners',
    'quotes',
    'booking_series',
    'booking_occurrences',
    'cleaner_job_reviews',
    'cleaner_payouts',
    'booking_occurrence_receipt_emails',
    'booking_occurrence_completion_emails',

    // Templates -> journeys -> logs
    'sms_templates',
    'payment_sms_templates',
    'review_sms_templates',
    'marketing_sms_templates',
    'marketing_email_templates',
    'marketing_sms_journeys',
    'marketing_email_journeys',
    'marketing_sms_logs',
    'marketing_email_logs',

    // Misc
    'todos',
    'dialpad_calls',
    'dialpad_sms',
    'daily_summary_logs',
    'webhook_logs',
  ]

  const exportTables = Object.keys(data)
  const orderedTables = [
    ...TABLE_ORDER,
    ...exportTables.filter((t) => !TABLE_ORDER.includes(t)),
  ]

  const summary = []
  for (const table of orderedTables) {
    const rows = Array.isArray(data[table]) ? data[table] : []
    if (!rows.length) continue
    const withOrg = rows.map((row) => ({ ...row, org_id: orgId }))
    const result = await upsertRows(table, withOrg, { onConflict: 'id', batchSize: 500 })
    summary.push({
      table,
      rows: rows.length,
      removedColumns: result.removedColumns,
    })
  }

  console.log('Migration complete.')
  console.log(`User: ${user.email} (${userAction})`)
  console.log(`Org: ${org.name} (${slug})`)
  console.log(`Org ID: ${orgId}`)
  for (const row of summary) {
    const removedNote = row.removedColumns?.length
      ? ` (removed columns: ${row.removedColumns.join(', ')})`
      : ''
    console.log(`- ${row.table}: ${row.rows} rows${removedNote}`)
  }
}

run().catch((err) => {
  console.error(err?.stack || String(err))
  process.exit(1)
})
