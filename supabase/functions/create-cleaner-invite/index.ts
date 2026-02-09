import { resolveOrgFromRequest, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

// ---------------------------------------------------------------------------
// create-cleaner-invite
//
// Creates a one-time cleaner intake link for the caller's organization.
// Caller must be owner/admin/manager.
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
    const ctx = await resolveOrgFromRequest(req)
    const { orgId, userId, role, supabaseAdmin, org } = ctx

    if (!['owner', 'admin', 'manager'].includes(role)) {
      return jsonError('Only owners, admins, and managers can create cleaner invites', 403)
    }

    let payload: { email?: string }
    try {
      payload = await req.json()
    } catch {
      payload = {}
    }

    const email = payload.email?.trim().toLowerCase() || null
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: invite, error: insertError } = await supabaseAdmin
      .from('cleaner_invites')
      .insert({
        org_id: orgId,
        invited_by: userId,
        token,
        email,
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (insertError || !invite) {
      console.error('Error creating cleaner invite:', insertError)
      return jsonError(insertError?.message || 'Failed to create cleaner invite', 500)
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'
    const inviteUrl = `${siteUrl}/cleaners/invite/${token}`

    const businessName = (org.business_name as string) || (org.name as string) || 'Your Team'

    return jsonResponse({
      success: true,
      invite: {
        id: invite.id,
        email,
        expires_at: expiresAt,
        invite_url: inviteUrl,
      },
      organization: {
        id: orgId,
        name: businessName,
      },
    })
  } catch (err) {
    console.error('create-cleaner-invite error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})
