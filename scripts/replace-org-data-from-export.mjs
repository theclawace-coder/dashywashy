import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function stripColumns(rows, cols) {
  if (!cols?.size || !rows?.length) return rows
  return rows.map((row) => {
    const next = { ...row }
    for (const col of cols) delete next[col]
    return next
  })
}

function isRetryableErrorMessage(message) {
  if (!message) return false
  const text = String(message).toLowerCase()
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('upstream request timeout') ||
    text.includes('fetch failed') ||
    text.includes('network')
  )
}

async function withRetry(action, label, maxAttempts = 5) {
  let attempt = 1
  let lastError = null
  while (attempt <= maxAttempts) {
    try {
      return await action()
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : String(err)
      if (!isRetryableErrorMessage(message) || attempt === maxAttempts) break
      const delayMs = Math.min(15000, 1000 * 2 ** (attempt - 1))
      console.warn(`${label} attempt ${attempt}/${maxAttempts} failed (${message}). Retrying in ${delayMs}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      attempt += 1
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function listAllUsers(supabase) {
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

async function resolveOrgIdForUser(supabase, userEmail) {
  const users = await listAllUsers(supabase)
  const user = users.find((u) => (u.email || '').toLowerCase() === userEmail.toLowerCase())
  if (!user) throw new Error(`User not found: ${userEmail}`)

  const { data: pref, error: prefErr } = await supabase
    .from('user_preferences')
    .select('current_org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (prefErr) throw new Error(`Failed loading user_preferences: ${prefErr.message}`)
  if (pref?.current_org_id) return { userId: user.id, orgId: pref.current_org_id }

  const { data: member, error: memErr } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (memErr) throw new Error(`Failed loading organization_members: ${memErr.message}`)
  if (!member?.org_id) throw new Error(`No organization membership found for ${userEmail}`)
  return { userId: user.id, orgId: member.org_id }
}

async function fetchAllByOrg(supabase, table, orgId, batchSize = 1000) {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('org_id', orgId)
      .range(from, from + batchSize - 1)
    if (error) {
      if (error.code === 'PGRST205') return all
      throw new Error(`Failed selecting ${table}: ${error.message}`)
    }
    const rows = data || []
    all.push(...rows)
    if (rows.length < batchSize) break
    from += batchSize
  }
  return all
}

async function deleteByOrg(supabase, table, orgId) {
  await withRetry(async () => {
    const { error } = await supabase.from(table).delete().eq('org_id', orgId)
    if (error) {
      if (error.code === 'PGRST205') return
      throw new Error(`Failed deleting from ${table}: ${error.message}`)
    }
  }, `Delete ${table}`)
}

async function upsertRows(supabase, table, rows, onConflict = 'id', batchSize = 500) {
  if (!rows.length) return { inserted: 0, removedColumns: [] }
  const removedCols = new Set()
  const batches = chunk(rows, batchSize)

  for (const batch of batches) {
    let attemptRows = stripColumns(batch, removedCols)
    while (true) {
      const { error } = await withRetry(
        async () =>
          await supabase.from(table).upsert(attemptRows, {
            onConflict,
            ignoreDuplicates: false,
          }),
        `Upsert ${table}`
      )
      if (!error) break

      const missingMatch = error.message.match(/Could not find the '(.+?)' column/)
      if (missingMatch) {
        removedCols.add(missingMatch[1])
        attemptRows = stripColumns(batch, removedCols)
        continue
      }
      throw new Error(`Failed to upsert into ${table}: ${error.message}`)
    }
  }

  return { inserted: rows.length, removedColumns: Array.from(removedCols) }
}

async function buildTemplateMaps(supabase, orgId, exportData) {
  const bySlugTables = ['sms_templates', 'payment_sms_templates', 'review_sms_templates']
  const stepVariantTables = ['marketing_sms_templates', 'marketing_email_templates']
  const idMaps = {}
  const existingIdSets = {}

  for (const table of bySlugTables) {
    const exportRows = Array.isArray(exportData[table]) ? exportData[table] : []
    const slugs = Array.from(new Set(exportRows.map((r) => r.slug).filter(Boolean)))

    let existingRows = []
    {
      const scoped = await supabase.from(table).select('id, slug').eq('org_id', orgId)
      if (!scoped.error) {
        existingRows = scoped.data || []
      } else if (scoped.error.code === '42703' || /org_id/i.test(scoped.error.message || '')) {
        const global = await supabase.from(table).select('id, slug')
        if (global.error && global.error.code !== 'PGRST205') {
          throw new Error(`Failed fetching ${table}: ${global.error.message}`)
        }
        existingRows = global.data || []
      } else if (scoped.error.code !== 'PGRST205') {
        throw new Error(`Failed fetching ${table}: ${scoped.error.message}`)
      }
    }

    const bySlug = new Map((existingRows || []).map((r) => [r.slug, r.id]))
    const idSet = new Set((existingRows || []).map((r) => r.id))
    const map = new Map()
    for (const row of exportRows) {
      if (row?.id && row?.slug && bySlug.has(row.slug)) map.set(row.id, bySlug.get(row.slug))
    }
    idMaps[table] = map
    existingIdSets[table] = idSet
    for (const slug of slugs) {
      if (!bySlug.has(slug)) {
        // no-op; logs will null template_id when no mapping exists
      }
    }
  }

  for (const table of stepVariantTables) {
    const exportRows = Array.isArray(exportData[table]) ? exportData[table] : []
    let existingRows = []
    {
      const scoped = await supabase.from(table).select('id, step, variant').eq('org_id', orgId)
      if (!scoped.error) {
        existingRows = scoped.data || []
      } else if (scoped.error.code === '42703' || /org_id/i.test(scoped.error.message || '')) {
        const global = await supabase.from(table).select('id, step, variant')
        if (global.error && global.error.code !== 'PGRST205') {
          throw new Error(`Failed fetching ${table}: ${global.error.message}`)
        }
        existingRows = global.data || []
      } else if (scoped.error.code !== 'PGRST205') {
        throw new Error(`Failed fetching ${table}: ${scoped.error.message}`)
      }
    }

    const byKey = new Map((existingRows || []).map((r) => [`${r.step}|${r.variant ?? 1}`, r.id]))
    const idSet = new Set((existingRows || []).map((r) => r.id))
    const map = new Map()
    for (const row of exportRows) {
      const key = `${row.step}|${row.variant ?? 1}`
      const mapped = byKey.get(key)
      if (row?.id && mapped) map.set(row.id, mapped)
    }
    idMaps[table] = map
    existingIdSets[table] = idSet
  }

  return { idMaps, existingIdSets }
}

function remapLogTemplateId(rows, map, existingIdSet) {
  if (!rows?.length) return []
  return rows.map((row) => {
    const original = row.template_id
    if (!original) return row
    const mapped = map?.get(original)
    if (mapped) return { ...row, template_id: mapped }
    if (existingIdSet?.has(original)) return row
    return { ...row, template_id: null }
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

function dedupeJourneysByLead(rows) {
  if (!Array.isArray(rows) || !rows.length) return { rows: [], idMap: new Map() }
  const bestByLead = new Map()
  for (const row of rows) {
    const leadId = row?.lead_id
    if (!leadId) continue
    const ts = pickJourneyTimestamp(row)
    const existing = bestByLead.get(leadId)
    if (!existing || ts > existing.ts) {
      bestByLead.set(leadId, { row, ts })
    }
  }

  const seen = new Set()
  const out = []
  const idMap = new Map()
  for (const row of rows) {
    const leadId = row?.lead_id
    if (!leadId) {
      out.push(row)
      if (row?.id) idMap.set(row.id, row.id)
      continue
    }
    const best = bestByLead.get(leadId)?.row
    if (best?.id && row?.id) idMap.set(row.id, best.id)
    if (seen.has(leadId)) continue
    if (best && best.id === row.id) {
      out.push(row)
      seen.add(leadId)
    }
  }
  return { rows: out, idMap }
}

async function run() {
  const args = parseArgs(process.argv)
  const exportPath = args.file || 'c:\\Users\\acebo\\Downloads\\2026-02-26_crm_export (1).json'
  const userEmail = args['user-email'] || 'sales@sydneypremiumcleaning.com.au'
  const dryRun = Boolean(args['dry-run'])

  if (!fs.existsSync(exportPath)) {
    throw new Error(`Export file not found: ${exportPath}`)
  }

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

  if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL).')
  if (!SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.')

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const raw = fs.readFileSync(exportPath, 'utf8')
  const exportData = JSON.parse(raw)
  const { userId, orgId } = args['org-id']
    ? { userId: null, orgId: args['org-id'] }
    : await resolveOrgIdForUser(supabase, userEmail)

  const { data: orgRow, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .single()
  if (orgErr) throw new Error(`Failed loading target org: ${orgErr.message}`)

  const SETTINGS_TABLES = new Set([
    'sms_templates',
    'payment_sms_templates',
    'review_sms_templates',
    'marketing_sms_templates',
    'marketing_email_templates',
    'organization_integrations',
    'organization_automation_settings',
    'organizations',
    'organization_members',
    'user_preferences',
  ])

  const DELETE_ORDER = [
    'booking_occurrence_completion_emails',
    'booking_occurrence_receipt_emails',
    'cleaner_job_reviews',
    'cleaner_payouts',
    'marketing_sms_logs',
    'marketing_email_logs',
    'payment_sms_logs',
    'review_sms_logs',
    'marketing_sms_journeys',
    'marketing_email_journeys',
    'booking_occurrences',
    'booking_series',
    'quotes',
    'todos',
    'dialpad_calls',
    'dialpad_sms',
    'webhook_logs',
    'daily_summary_logs',
    'extracted_leads',
    'dialpad_emails',
    'cleaners',
  ]

  const INSERT_ORDER = [
    'dialpad_emails',
    'extracted_leads',
    'cleaners',
    'quotes',
    'booking_series',
    'booking_occurrences',
    'cleaner_job_reviews',
    'cleaner_payouts',
    'booking_occurrence_receipt_emails',
    'booking_occurrence_completion_emails',
    'marketing_sms_journeys',
    'marketing_email_journeys',
    'marketing_sms_logs',
    'marketing_email_logs',
    'payment_sms_logs',
    'review_sms_logs',
    'todos',
    'dialpad_calls',
    'dialpad_sms',
    'daily_summary_logs',
    'webhook_logs',
  ]

  const ON_CONFLICT = {
    daily_summary_logs: 'summary_date',
  }

  const BATCH_SIZE = {
    dialpad_calls: 100,
    dialpad_sms: 100,
    webhook_logs: 100,
    dialpad_emails: 150,
  }

  const backupTables = [...new Set([...DELETE_ORDER, ...INSERT_ORDER])]
  const backup = {}
  for (const table of backupTables) {
    backup[table] = await fetchAllByOrg(supabase, table, orgId)
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.resolve(__dirname, '_backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `org_${orgId}_before_replace_${timestamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8')

  const { idMaps, existingIdSets } = await buildTemplateMaps(supabase, orgId, exportData)

  if (Array.isArray(exportData.marketing_sms_logs)) {
    exportData.marketing_sms_logs = remapLogTemplateId(
      exportData.marketing_sms_logs,
      idMaps.marketing_sms_templates,
      existingIdSets.marketing_sms_templates
    )
  }
  if (Array.isArray(exportData.marketing_email_logs)) {
    exportData.marketing_email_logs = remapLogTemplateId(
      exportData.marketing_email_logs,
      idMaps.marketing_email_templates,
      existingIdSets.marketing_email_templates
    )
  }
  if (Array.isArray(exportData.payment_sms_logs)) {
    exportData.payment_sms_logs = remapLogTemplateId(
      exportData.payment_sms_logs,
      idMaps.payment_sms_templates,
      existingIdSets.payment_sms_templates
    )
  }
  if (Array.isArray(exportData.review_sms_logs)) {
    exportData.review_sms_logs = remapLogTemplateId(
      exportData.review_sms_logs,
      idMaps.review_sms_templates,
      existingIdSets.review_sms_templates
    )
  }

  let marketingSmsJourneyIdMap = new Map()
  let marketingEmailJourneyIdMap = new Map()
  if (Array.isArray(exportData.marketing_sms_journeys)) {
    const deduped = dedupeJourneysByLead(exportData.marketing_sms_journeys)
    exportData.marketing_sms_journeys = deduped.rows
    marketingSmsJourneyIdMap = deduped.idMap
  }
  if (Array.isArray(exportData.marketing_email_journeys)) {
    const deduped = dedupeJourneysByLead(exportData.marketing_email_journeys)
    exportData.marketing_email_journeys = deduped.rows
    marketingEmailJourneyIdMap = deduped.idMap
  }

  if (Array.isArray(exportData.marketing_sms_logs) && marketingSmsJourneyIdMap.size) {
    exportData.marketing_sms_logs = exportData.marketing_sms_logs.map((row) => ({
      ...row,
      journey_id: row?.journey_id ? marketingSmsJourneyIdMap.get(row.journey_id) || row.journey_id : row?.journey_id,
    }))
  }
  if (Array.isArray(exportData.marketing_email_logs) && marketingEmailJourneyIdMap.size) {
    exportData.marketing_email_logs = exportData.marketing_email_logs.map((row) => ({
      ...row,
      journey_id: row?.journey_id ? marketingEmailJourneyIdMap.get(row.journey_id) || row.journey_id : row?.journey_id,
    }))
  }

  const importCounts = {}
  for (const table of INSERT_ORDER) {
    if (SETTINGS_TABLES.has(table)) continue
    importCounts[table] = Array.isArray(exportData[table]) ? exportData[table].length : 0
  }

  console.log('Target account:', userEmail)
  console.log('Target org:', `${orgRow.name} (${orgRow.slug})`)
  console.log('Target org_id:', orgId)
  console.log('User ID:', userId || 'n/a')
  console.log('Backup saved:', backupPath)
  console.log('Import row counts:')
  for (const [table, count] of Object.entries(importCounts)) {
    console.log(`- ${table}: ${count}`)
  }

  if (dryRun) {
    console.log('Dry run complete. No data changed.')
    return
  }

  for (const table of DELETE_ORDER) {
    if (SETTINGS_TABLES.has(table)) continue
    await deleteByOrg(supabase, table, orgId)
  }

  const summary = []
  const exportQuoteIdSet = new Set(
    (Array.isArray(exportData.quotes) ? exportData.quotes : [])
      .map((row) => row?.id)
      .filter(Boolean)
  )
  for (const table of INSERT_ORDER) {
    if (SETTINGS_TABLES.has(table)) continue
    const rows = Array.isArray(exportData[table]) ? exportData[table] : []
    if (!rows.length) continue
    let result
    if (table === 'quotes') {
      const normalized = rows.map((row) => ({
        ...row,
        base_quote_id:
          row?.base_quote_id && exportQuoteIdSet.has(row.base_quote_id) ? row.base_quote_id : null,
        org_id: orgId,
      }))
      const firstPassRows = normalized.map((row) => ({ ...row, base_quote_id: null }))
      await upsertRows(
        supabase,
        table,
        firstPassRows,
        ON_CONFLICT[table] || 'id',
        BATCH_SIZE[table] || 100
      )
      const secondPassRows = normalized.filter((row) => row.base_quote_id)
      result = await upsertRows(
        supabase,
        table,
        secondPassRows,
        ON_CONFLICT[table] || 'id',
        BATCH_SIZE[table] || 100
      )
    } else {
      const withOrg = rows.map((row) => ({ ...row, org_id: orgId }))
      result = await upsertRows(
        supabase,
        table,
        withOrg,
        ON_CONFLICT[table] || 'id',
        BATCH_SIZE[table] || 100
      )
    }
    summary.push({ table, rows: rows.length, removedColumns: result.removedColumns })
  }

  console.log('Replace completed successfully.')
  for (const row of summary) {
    const removedNote =
      row.removedColumns?.length ? ` (removed columns: ${row.removedColumns.join(', ')})` : ''
    console.log(`- ${row.table}: ${row.rows} rows${removedNote}`)
  }
}

run().catch((err) => {
  console.error(err?.stack || String(err))
  process.exit(1)
})
