import { createClient, type User } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'http://127.0.0.1:54321'

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_ORG_SLUG = 'e2e-test-org'
export const TEST_USER_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e.user@company.test'
export const TEST_USER_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'

function getAdminClient() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for admin test setup.')
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function findUserByEmail(email: string): Promise<User> {
  const admin = getAdminClient()
  const { data, error } = await admin.auth.admin.listUsers()

  if (error) {
    throw new Error(`Failed to list users: ${error.message}`)
  }

  const user = data.users.find(
    (entry) => entry.email?.toLowerCase() === email.toLowerCase()
  )

  if (!user) {
    throw new Error(`User not found for email ${email}`)
  }

  return user
}

export async function ensureTestUser(): Promise<User> {
  const admin = getAdminClient()

  try {
    const existing = await findUserByEmail(TEST_USER_EMAIL)
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Test User' },
    })
    if (error || !data.user) {
      throw new Error(error?.message || 'Failed to update test user')
    }
    return data.user
  } catch {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Test User' },
    })

    if (error || !data.user) {
      throw new Error(error?.message || 'Failed to create test user')
    }

    return data.user
  }
}

export async function ensureUser(email: string, password: string, fullName?: string): Promise<User> {
  const admin = getAdminClient()
  try {
    const existing = await findUserByEmail(email)
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || existing.user_metadata?.full_name || 'E2E User' },
    })

    if (error || !data.user) {
      throw new Error(error?.message || 'Failed to update user')
    }

    return data.user
  } catch {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || 'E2E User' },
    })

    if (error || !data.user) {
      throw new Error(error?.message || 'Failed to create user')
    }

    return data.user
  }
}

export async function ensureTestUserWithOrg(): Promise<{ user: User; orgId: string }> {
  const user = await ensureTestUser()
  const org = await ensureTestOrg()
  await ensureOrgMembership(user.id, org.id)
  return { user, orgId: org.id }
}

export async function ensureOrgMembership(userId: string, orgId: string) {
  const admin = getAdminClient()

  const { error: memberError } = await admin
    .from('organization_members')
    .upsert(
      { org_id: orgId, user_id: userId, role: 'admin' },
      { onConflict: 'org_id,user_id' }
    )

  if (memberError) {
    throw new Error(`Failed to add org membership: ${memberError.message}`)
  }

  const { error: prefError } = await admin
    .from('user_preferences')
    .upsert(
      { user_id: userId, current_org_id: orgId },
      { onConflict: 'user_id' }
    )

  if (prefError) {
    throw new Error(`Failed to set user preferences: ${prefError.message}`)
  }
}

export async function setTourCompleted(userId: string, completed = true) {
  const admin = getAdminClient()
  const payload = completed
    ? { user_id: userId, tour_completed: true, tour_completed_at: new Date().toISOString() }
    : { user_id: userId, tour_completed: false, tour_completed_at: null }

  const { error } = await admin
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    if (error.message && error.message.includes('tour_completed')) {
      return
    }
    throw new Error(`Failed to update tour preference: ${error.message}`)
  }
}

export async function ensureSeedOrgMembership(userId: string) {
  return ensureOrgMembership(userId, DEFAULT_ORG_ID)
}

export async function ensureTestOrg(): Promise<{ id: string }> {
  const admin = getAdminClient()

  const { data: existing, error: findError } = await admin
    .from('organizations')
    .select('id, slug')
    .eq('slug', TEST_ORG_SLUG)
    .maybeSingle()

  if (findError) {
    throw new Error(`Failed to look up test org: ${findError.message}`)
  }

  if (existing?.id) {
    return { id: existing.id }
  }

  const name = 'E2E Test Org'
  const { data: created, error: createError } = await admin
    .from('organizations')
    .insert({ name, slug: TEST_ORG_SLUG, business_name: name })
    .select('id')
    .single()

  if (createError || !created?.id) {
    throw new Error(createError?.message || 'Failed to create test org')
  }

  return { id: created.id }
}

export async function findAnyQuoteShareToken(orgId?: string): Promise<string | null> {
  const admin = getAdminClient()

  let query = admin
    .from('quotes')
    .select('share_token')
    .not('share_token', 'is', null)
    .limit(1)

  if (orgId) {
    query = query.eq('org_id', orgId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch share token: ${error.message}`)
  }

  const token = data?.[0]?.share_token
  return token || null
}

export async function ensureLeadForToday(orgId = DEFAULT_ORG_ID): Promise<string> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('extracted_leads')
    .select('id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(`Failed to fetch extracted lead: ${error.message}`)
  }
  const lead = data?.[0]
  if (!lead?.id) {
    throw new Error('No extracted leads found to run quote flow. Seed data is required.')
  }

  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from('extracted_leads')
    .update({ created_at: now, extracted_at: now, updated_at: now })
    .eq('id', lead.id)
    .eq('org_id', orgId)

  if (updateError) {
    throw new Error(`Failed to update extracted lead timestamps: ${updateError.message}`)
  }

  return lead.id
}
