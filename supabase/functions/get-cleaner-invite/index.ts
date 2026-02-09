import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

// ---------------------------------------------------------------------------
// get-cleaner-invite
//
// Public endpoint to validate a cleaner invite token and fetch org info.
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  try {
    let payload: { token?: string }
    try {
      payload = await req.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }

    const token = payload.token?.trim()
    if (!token) {
      return jsonError('token is required', 400)
    }

    const { data: invite, error } = await supabaseAdmin
      .from('cleaner_invites')
      .select('id, token, expires_at, used_at, org_id, organization:organizations(id, name, business_name)')
      .eq('token', token)
      .maybeSingle()

    if (error || !invite) {
      return jsonError('Invite not found', 404)
    }

    if (invite.used_at) {
      return jsonError('Invite already used', 409)
    }

    if (invite.expires_at && new Date(invite.expires_at as string) < new Date()) {
      return jsonError('Invite expired', 410)
    }

    const org = invite.organization as { id: string; name: string; business_name: string | null } | null
    const orgName = org?.business_name || org?.name || 'Our Team'

    return jsonResponse({
      success: true,
      invite: {
        token: invite.token,
        expires_at: invite.expires_at,
      },
      organization: {
        id: invite.org_id,
        name: orgName,
      },
    })
  } catch (err) {
    console.error('get-cleaner-invite error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return jsonError(message, 500)
  }
})
