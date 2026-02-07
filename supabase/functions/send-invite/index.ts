import {
  resolveOrgFromRequest,
  getOrgIntegration,
  corsHeaders,
  jsonResponse,
  jsonError,
} from '../_shared/org-resolver.ts'

// ---------------------------------------------------------------------------
// send-invite
//
// Sends (or re-sends) an invitation to join the caller's current organization.
// Caller must be an owner or admin.
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
    // 1. Resolve org + verify JWT
    const ctx = await resolveOrgFromRequest(req)
    const { orgId, userId, role, supabaseAdmin, org } = ctx

    // 2. Only owner / admin can invite
    if (role !== 'owner' && role !== 'admin') {
      return jsonError('Only owners and admins can send invites', 403)
    }

    // 3. Parse body
    let payload: { email?: string; role?: string }
    try {
      payload = await req.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }

    const inviteeEmail = payload.email?.trim().toLowerCase()
    if (!inviteeEmail) {
      return jsonError('email is required', 400)
    }

    const inviteeRole = payload.role?.trim() || 'staff'
    const allowedRoles = ['staff', 'admin', 'owner']
    if (!allowedRoles.includes(inviteeRole)) {
      return jsonError(`role must be one of: ${allowedRoles.join(', ')}`, 400)
    }

    // 4. Check if the email is already a member
    // Look up any auth user with this email first
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const matchedUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === inviteeEmail,
    )

    if (matchedUser) {
      const { data: existingMember } = await supabaseAdmin
        .from('organization_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', matchedUser.id)
        .maybeSingle()

      if (existingMember) {
        return jsonError('This email is already a member of the organization', 409)
      }
    }

    // 5. Generate a secure token
    const token = crypto.randomUUID()

    // 6. Check for existing pending invite — update if found, otherwise insert
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days

    const { data: existingInvite } = await supabaseAdmin
      .from('organization_invites')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', inviteeEmail)
      .is('accepted_at', null)
      .maybeSingle()

    let invite: Record<string, unknown>

    if (existingInvite) {
      // Update the existing pending invite with a fresh token & expiry
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('organization_invites')
        .update({
          role: inviteeRole,
          token,
          invited_by: userId,
          expires_at: expiresAt,
        })
        .eq('id', existingInvite.id)
        .select()
        .single()

      if (updateError || !updated) {
        console.error('Error updating invite:', updateError)
        return jsonError(updateError?.message || 'Failed to update invite', 500)
      }
      invite = updated
    } else {
      const { data: created, error: insertError } = await supabaseAdmin
        .from('organization_invites')
        .insert({
          org_id: orgId,
          email: inviteeEmail,
          role: inviteeRole,
          token,
          invited_by: userId,
          expires_at: expiresAt,
        })
        .select()
        .single()

      if (insertError || !created) {
        console.error('Error creating invite:', insertError)
        return jsonError(insertError?.message || 'Failed to create invite', 500)
      }
      invite = created
    }

    // 7. Build invite URL
    const siteUrl =
      Deno.env.get('SITE_URL') || 'http://localhost:5173'
    const inviteUrl = `${siteUrl}/auth/invite/${token}`

    // 8. Send invite email via Resend
    const businessName = (org.business_name as string) || (org.name as string) || 'Our Team'
    const businessEmail = (org.business_email as string) || ''

    // Determine Resend API key — prefer org integration, fall back to env
    const resendIntegration = await getOrgIntegration(supabaseAdmin, orgId, 'resend')
    const resendApiKey =
      resendIntegration.api_key || Deno.env.get('RESEND_API_KEY') || ''

    // Determine from address
    let fromAddress = 'noreply@notifications.example.com'
    if (businessEmail) {
      const domain = businessEmail.split('@')[1]
      if (domain) {
        fromAddress = `noreply@${domain}`
      }
    }
    // Allow integration override
    if (resendIntegration.from_email) {
      fromAddress = resendIntegration.from_email
    }

    let emailSent = false

    if (resendApiKey) {
      const subject = `You've been invited to join ${businessName}`

      const html = `
        <div style="background:#f5f7fb;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:#0f172a;color:#ffffff;padding:20px 24px;">
              <h1 style="margin:0;font-size:20px;">You're Invited</h1>
              <p style="margin:6px 0 0;font-size:14px;">${businessName}</p>
            </div>
            <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#0f172a;">
              <p style="margin:0 0 12px;">Hi,</p>
              <p style="margin:0 0 12px;">
                You've been invited to join <strong>${businessName}</strong> as a
                <strong>${inviteeRole}</strong>.
              </p>
              <p style="margin:0 0 20px;">Click the button below to accept the invitation:</p>
              <div style="text-align:center;margin:24px 0;">
                <a href="${inviteUrl}"
                   style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600;font-size:14px;">
                  Accept Invitation
                </a>
              </div>
              <p style="margin:0 0 8px;color:#64748b;font-size:13px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 16px;word-break:break-all;font-size:13px;">
                <a href="${inviteUrl}" style="color:#2563eb;">${inviteUrl}</a>
              </p>
              <p style="margin:0;color:#64748b;font-size:13px;">
                This invitation expires in 7 days. If you did not expect this email you can safely ignore it.
              </p>
            </div>
            <div style="background:#f8fafc;padding:12px 24px;font-size:12px;color:#94a3b8;">
              Sent by ${businessName}
            </div>
          </div>
        </div>
      `.trim()

      const text = [
        `You've been invited to join ${businessName} as a ${inviteeRole}.`,
        ``,
        `Accept the invitation: ${inviteUrl}`,
        ``,
        `This invitation expires in 7 days.`,
      ].join('\n')

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [inviteeEmail],
            subject,
            html,
            text,
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          console.error('Resend send-invite error:', errText)
        } else {
          emailSent = true
        }
      } catch (emailErr) {
        console.error('Error sending invite email:', emailErr)
      }
    } else {
      console.log('No Resend API key configured — invite email skipped')
    }

    return jsonResponse({
      success: true,
      invite: {
        id: invite.id,
        email: inviteeEmail,
        role: inviteeRole,
        expires_at: expiresAt,
        invite_url: inviteUrl,
      },
      email_sent: emailSent,
    })
  } catch (err) {
    console.error('send-invite error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})
