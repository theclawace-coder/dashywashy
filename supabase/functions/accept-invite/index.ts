import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// ---------------------------------------------------------------------------
// accept-invite
//
// Accepts a pending organization invitation.
// The caller must be authenticated (JWT). The invite is looked up by token.
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonError('Server configuration error', 500)
  }

  // 1. Authenticate the caller
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonError('Unauthorized', 401)
  }
  const jwtToken = authHeader.replace('Bearer ', '')

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwtToken)

  if (userError || !user) {
    return jsonError('Unauthorized', 401)
  }

  // 2. Parse body
  let payload: { token?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const inviteToken = payload.token?.trim()
  if (!inviteToken) {
    return jsonError('token is required', 400)
  }

  try {
    // 3. Look up the invite by token
    const { data: invite, error: inviteError } = await supabase
      .from('organization_invites')
      .select('*')
      .eq('token', inviteToken)
      .maybeSingle()

    if (inviteError || !invite) {
      return jsonError('Invite not found', 404)
    }

    // 4. Validate: not already accepted
    if (invite.accepted_at) {
      return jsonError('This invitation has already been accepted', 409)
    }

    // 5. Validate: not expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return jsonError('This invitation has expired', 410)
    }

    // 6. Verify the authenticated user's email matches the invite email
    const userEmail = user.email?.toLowerCase() || ''
    const inviteEmail = (invite.email as string)?.toLowerCase() || ''

    if (inviteEmail && userEmail && inviteEmail !== userEmail) {
      return jsonError(
        'Your email address does not match the invitation. Please sign in with the correct account.',
        403,
      )
    }

    const orgId = invite.org_id as string
    const inviteRole = (invite.role as string) || 'staff'

    // 7. Check if user is already a member (idempotent)
    const { data: existingMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      // Already a member — still mark the invite as accepted
      await supabase
        .from('organization_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)

      // Fetch org for the response
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, slug, business_name')
        .eq('id', orgId)
        .single()

      return jsonResponse({
        success: true,
        already_member: true,
        organization: org,
      })
    }

    // 8. Insert membership
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        org_id: orgId,
        user_id: user.id,
        role: inviteRole,
      })

    if (memberError) {
      console.error('Error creating membership:', memberError)
      return jsonError(memberError.message || 'Failed to join organization', 500)
    }

    // 9. Mark invite as accepted
    const { error: acceptError } = await supabase
      .from('organization_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    if (acceptError) {
      console.error('Error marking invite as accepted:', acceptError)
      // Non-fatal — user was added successfully
    }

    // 10. Switch user's active org to the new one
    const { error: prefError } = await supabase
      .from('user_preferences')
      .upsert(
        { user_id: user.id, current_org_id: orgId },
        { onConflict: 'user_id' },
      )

    if (prefError) {
      console.error('Error updating user preferences:', prefError)
      // Non-fatal
    }

    // 11. Fetch org details for the response
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, slug, business_name')
      .eq('id', orgId)
      .single()

    return jsonResponse({
      success: true,
      organization: org,
      role: inviteRole,
    })
  } catch (err) {
    console.error('accept-invite error:', err)
    return jsonError(
      err instanceof Error ? err.message : 'Unexpected error',
      500,
    )
  }
})
