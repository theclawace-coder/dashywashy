import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

// ---------------------------------------------------------------------------
// submit-cleaner-invite
//
// Public endpoint to submit cleaner details using a one-time invite token.
// ---------------------------------------------------------------------------

type CleanerPayload = {
  full_name?: string
  phone?: string | null
  email?: string | null
  base_location_text?: string | null
  base_lat?: number | null
  base_lng?: number | null
  abn?: string | null
  bank_account_name?: string | null
  bank_bsb?: string | null
  bank_account_number?: string | null
  min_booking_minutes?: number | null
  notice_hours?: number | null
  cancellation_policy?: string | null
  has_transport?: boolean | null
  transport_type?: string | null
  max_travel_km?: number | null
  can_transport_equipment?: boolean | null
  public_liability_policy_number?: string | null
  public_liability_expiry?: string | null
  team_size?: number | null
  rates?: Record<string, number> | null
  availability?: Record<string, Record<string, boolean>> | null
  active?: boolean | null
}

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
    let payload: { token?: string; cleaner?: CleanerPayload }
    try {
      payload = await req.json()
    } catch {
      return jsonError('Invalid JSON body', 400)
    }

    const token = payload.token?.trim()
    if (!token) {
      return jsonError('token is required', 400)
    }

    const cleaner = payload.cleaner || {}
    const fullName = cleaner.full_name?.trim()
    if (!fullName) {
      return jsonError('full_name is required', 400)
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('cleaner_invites')
      .select('id, token, expires_at, used_at, org_id')
      .eq('token', token)
      .maybeSingle()

    if (inviteError || !invite) {
      return jsonError('Invite not found', 404)
    }

    if (invite.used_at) {
      return jsonError('Invite already used', 409)
    }

    if (invite.expires_at && new Date(invite.expires_at as string) < new Date()) {
      return jsonError('Invite expired', 410)
    }

    if (!invite.org_id) {
      return jsonError('Invite is missing organization context', 500)
    }

    const insertPayload: Record<string, unknown> = {
      org_id: invite.org_id,
      full_name: fullName,
    }

    if (cleaner.phone?.trim()) insertPayload.phone = cleaner.phone.trim()
    if (cleaner.email?.trim()) insertPayload.email = cleaner.email.trim().toLowerCase()
    if (cleaner.base_location_text?.trim()) insertPayload.base_location_text = cleaner.base_location_text.trim()
    if (typeof cleaner.base_lat === 'number') insertPayload.base_lat = cleaner.base_lat
    if (typeof cleaner.base_lng === 'number') insertPayload.base_lng = cleaner.base_lng
    if (cleaner.abn?.trim()) insertPayload.abn = cleaner.abn.trim()
    if (cleaner.bank_account_name?.trim()) insertPayload.bank_account_name = cleaner.bank_account_name.trim()
    if (cleaner.bank_bsb?.trim()) insertPayload.bank_bsb = cleaner.bank_bsb.trim()
    if (cleaner.bank_account_number?.trim()) insertPayload.bank_account_number = cleaner.bank_account_number.trim()
    if (typeof cleaner.min_booking_minutes === 'number' && cleaner.min_booking_minutes > 0) {
      insertPayload.min_booking_minutes = cleaner.min_booking_minutes
    }
    if (typeof cleaner.notice_hours === 'number' && cleaner.notice_hours >= 0) {
      insertPayload.notice_hours = cleaner.notice_hours
    }
    if (cleaner.cancellation_policy?.trim()) insertPayload.cancellation_policy = cleaner.cancellation_policy.trim()
    if (typeof cleaner.has_transport === 'boolean') insertPayload.has_transport = cleaner.has_transport
    if (cleaner.transport_type?.trim()) insertPayload.transport_type = cleaner.transport_type.trim()
    if (typeof cleaner.max_travel_km === 'number' && cleaner.max_travel_km >= 0) {
      insertPayload.max_travel_km = cleaner.max_travel_km
    }
    if (typeof cleaner.can_transport_equipment === 'boolean') {
      insertPayload.can_transport_equipment = cleaner.can_transport_equipment
    }
    if (cleaner.public_liability_policy_number?.trim()) {
      insertPayload.public_liability_policy_number = cleaner.public_liability_policy_number.trim()
    }
    if (cleaner.public_liability_expiry?.trim()) {
      insertPayload.public_liability_expiry = cleaner.public_liability_expiry.trim()
    }
    if (typeof cleaner.team_size === 'number' && cleaner.team_size > 0) {
      insertPayload.team_size = cleaner.team_size
    }
    if (cleaner.rates && typeof cleaner.rates === 'object') {
      insertPayload.rates = cleaner.rates
    }
    if (cleaner.availability && typeof cleaner.availability === 'object') {
      insertPayload.availability = cleaner.availability
    }
    if (typeof cleaner.active === 'boolean') insertPayload.active = cleaner.active

    const { data: created, error: insertError } = await supabaseAdmin
      .from('cleaners')
      .insert(insertPayload)
      .select('id')
      .single()

    if (insertError || !created) {
      console.error('Error creating cleaner from invite:', insertError)
      return jsonError(insertError?.message || 'Failed to create cleaner', 500)
    }

    const { error: markError } = await supabaseAdmin
      .from('cleaner_invites')
      .update({ used_at: new Date().toISOString(), used_cleaner_id: created.id })
      .eq('id', invite.id)

    if (markError) {
      console.error('Error marking invite used:', markError)
    }

    return jsonResponse({
      success: true,
      cleaner_id: created.id,
    })
  } catch (err) {
    console.error('submit-cleaner-invite error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return jsonError(message, 500)
  }
})
