import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// ---------------------------------------------------------------------------
// CORS headers shared across all multi-tenant edge functions
// ---------------------------------------------------------------------------
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-org-id, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------
export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function jsonError(message: string, status = 400) {
  return jsonResponse({ error: message }, status)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface OrgContext {
  orgId: string
  userId: string
  userEmail: string
  role: string
  supabaseAdmin: ReturnType<typeof createClient>
  org: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// resolveOrgFromRequest
//
// 1. Extract and verify the JWT from the Authorization header.
// 2. Determine the active org (X-Org-Id header > user_preferences > first membership).
// 3. Confirm the user is a member of that org.
// 4. Return the full org context.
//
// NOTE: Also supports service-to-service calls where:
//   - Authorization header contains the service role key
//   - X-Org-Id header is provided
// In this case, user verification is bypassed and a service context is returned.
// ---------------------------------------------------------------------------
export async function resolveOrgFromRequest(req: Request): Promise<OrgContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }
  const token = authHeader.replace('Bearer ', '')

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  // --- Check if this is a service-to-service call ---
  // If the token matches the service role key and X-Org-Id is provided,
  // bypass user authentication (used for internal function-to-function calls)
  const headerOrgId = req.headers.get('X-Org-Id')
  if (token === serviceRoleKey && headerOrgId) {
    // Service-to-service call - bypass user auth
    const org = await getOrg(supabaseAdmin, headerOrgId)
    return {
      orgId: headerOrgId,
      userId: 'service-account',
      userEmail: 'service@internal',
      role: 'service',
      supabaseAdmin,
      org,
    }
  }

  // --- Standard user authentication flow ---

  // Verify the JWT and retrieve the user
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    throw new Error('Unauthorized')
  }

  const userId = user.id
  const userEmail = user.email || ''

  // --- Resolve which org to use ---

  let orgId: string | null = null

  // 1) Explicit header
  if (headerOrgId) {
    orgId = headerOrgId
  }

  // 2) Persisted preference
  if (!orgId) {
    const { data: pref } = await supabaseAdmin
      .from('user_preferences')
      .select('current_org_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (pref?.current_org_id) {
      orgId = pref.current_org_id
    }
  }

  // 3) First org membership
  if (!orgId) {
    const { data: firstMember } = await supabaseAdmin
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstMember?.org_id) {
      orgId = firstMember.org_id
    }
  }

  if (!orgId) {
    throw new Error('No organization found for this user')
  }

  // --- Verify membership ---
  const { data: membership, error: memberError } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (memberError || !membership) {
    throw new Error('You are not a member of this organization')
  }

  // --- Fetch the full org row ---
  const org = await getOrg(supabaseAdmin, orgId)

  return {
    orgId,
    userId,
    userEmail,
    role: membership.role,
    supabaseAdmin,
    org,
  }
}

// ---------------------------------------------------------------------------
// getOrgIntegration
//
// Looks up the enabled integration config for a given provider.
// Returns the config JSONB as a plain object, or {} if not found.
// ---------------------------------------------------------------------------
export async function getOrgIntegration(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  provider: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('organization_integrations')
    .select('config')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('enabled', true)
    .maybeSingle()

  if (error || !data?.config) {
    return {}
  }

  return data.config as Record<string, string>
}

// ---------------------------------------------------------------------------
// getOrg
//
// Fetch the full organization row by id.
// ---------------------------------------------------------------------------
export async function getOrg(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()

  if (error || !data) {
    throw new Error('Organization not found')
  }

  return data as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// getAutomationSetting
//
// Reads organization_automation_settings for a given automation type.
// Returns { enabled, config } with safe defaults.
// ---------------------------------------------------------------------------
export async function getAutomationSetting(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  automationType: string,
): Promise<{ enabled: boolean; config: Record<string, unknown> }> {
  const { data, error } = await supabaseAdmin
    .from('organization_automation_settings')
    .select('enabled, config')
    .eq('org_id', orgId)
    .eq('automation_type', automationType)
    .maybeSingle()

  if (error || !data) {
    return { enabled: true, config: {} }
  }

  return {
    enabled: data.enabled ?? true,
    config: (data.config as Record<string, unknown>) || {},
  }
}
