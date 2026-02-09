import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

const ORG_ID = process.env.SEED_ORG_ID || '00000000-0000-0000-0000-000000000001'
const ORG_SLUG = process.env.SEED_ORG_SLUG || 'sydney-premium-cleaning'
const ORG_NAME = process.env.SEED_ORG_NAME || 'Sydney Premium Cleaning'

const DEFAULT_PASSWORD = process.env.TEST_LOGIN_PASSWORD || 'TestPassword123!'

const USERS = [
  { email: 'owner@company.test', fullName: 'Test Owner', role: 'owner' },
  { email: 'admin@company.test', fullName: 'Test Admin', role: 'admin' },
  { email: 'staff@company.test', fullName: 'Test Staff', role: 'staff' },
  { email: 'cleaner@company.test', fullName: 'Test Cleaner', role: 'cleaner' },
]

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

async function ensureOrg() {
  const { error } = await supabase.from('organizations').upsert(
    {
      id: ORG_ID,
      name: ORG_NAME,
      slug: ORG_SLUG,
      business_name: ORG_NAME,
      plan: 'pro',
      max_users: 25,
      max_cleaners: 50,
    },
    { onConflict: 'id' }
  )
  if (error) {
    throw new Error(`Failed to upsert org: ${error.message}`)
  }
}

async function ensureMembership(userId, role, displayName) {
  const { error: memberError } = await supabase.from('organization_members').upsert(
    { org_id: ORG_ID, user_id: userId, role, display_name: displayName },
    { onConflict: 'org_id,user_id' }
  )
  if (memberError) {
    throw new Error(`Failed to upsert org membership: ${memberError.message}`)
  }

  const { error: prefError } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, current_org_id: ORG_ID }, { onConflict: 'user_id' })
  if (prefError) {
    throw new Error(`Failed to upsert user preferences: ${prefError.message}`)
  }
}

async function run() {
  await ensureOrg()

  const results = []
  for (const entry of USERS) {
    const { user, action } = await ensureUser(entry.email, DEFAULT_PASSWORD, entry.fullName)
    await ensureMembership(user.id, entry.role, entry.fullName)
    results.push({ email: entry.email, password: DEFAULT_PASSWORD, role: entry.role, action })
  }

  console.log('Test logins ready:')
  for (const row of results) {
    console.log(`- ${row.email} / ${row.password}  (${row.role}, ${row.action})`)
  }
  console.log(`Org: ${ORG_NAME} (${ORG_SLUG})`)
}

run().catch((err) => {
  console.error(err?.stack || String(err))
  process.exit(1)
})

