import { resolveOrgFromRequest, getAutomationSetting, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

// Calculate next send time based on step and schedule
function calculateNextSendTime(step: number, startedAt: Date, isEmail: boolean): Date {
  const now = new Date()
  
  if (isEmail) {
    // Email schedule: +1 day, +5 days, +14 days, +32 days, +44 days, +79 days, +121 days
    const emailDelays = [1, 5, 14, 32, 44, 79, 121] // days from start
    const delayDays = emailDelays[step - 1] || 1
    return new Date(startedAt.getTime() + delayDays * 24 * 60 * 60 * 1000)
  } else {
    // SMS schedule: immediate, +3 days, +7 days, +14 days, +14 days, +1 month, +1 month
    // Step 1 is immediate (0 days), step 2 is +3 days from step 1, step 3 is +7 days from step 2, etc.
    const smsDelays = [0, 3, 7, 14, 14, 30, 30] // days from previous step
    let totalDays = 0
    for (let i = 0; i < step; i++) {
      totalDays += smsDelays[i] || 0
    }
    return new Date(startedAt.getTime() + totalDays * 24 * 60 * 60 * 1000)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
  const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)
  const supabase = supabaseAdmin

  const [smsSetting, emailSetting] = await Promise.all([
    getAutomationSetting(supabase, orgId, 'marketing_sms'),
    getAutomationSetting(supabase, orgId, 'marketing_email'),
  ])

  let payload: {
    action?: string
    leadId?: string
    journeyType?: 'sms' | 'email' | 'both'
    step?: number
  } = {}

  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { action, leadId, journeyType = 'both', step } = payload

  if (!action || !leadId) {
    return jsonResponse({ error: 'action and leadId are required' }, 400)
  }

  try {
    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from('extracted_leads')
      .select('id, name, email, phone_number, status')
      .eq('id', leadId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (leadError || !lead) {
      return jsonResponse({ error: 'Lead not found' }, 404)
    }

    const now = new Date()

    if (action === 'start') {
      // Start or restart journeys
      const results: any = {}

      if (journeyType === 'sms' || journeyType === 'both') {
        if (!smsSetting.enabled) {
          results.sms = { skipped: 'disabled' }
        } else {
        if (!lead.phone_number) {
          results.sms = { error: 'Lead has no phone number' }
        } else {
          // Check if journey exists
          const { data: existingSms } = await supabase
            .from('marketing_sms_journeys')
            .select('id')
            .eq('lead_id', leadId)
            .maybeSingle()

          if (existingSms) {
            // Reactivate
            const nextSend = calculateNextSendTime(1, now, false)
            const { error: updateError } = await supabase
              .from('marketing_sms_journeys')
              .update({
                status: 'active',
                current_step: step || 1,
                next_send_at: step ? calculateNextSendTime(step, now, false).toISOString() : nextSend.toISOString(),
                started_at: now.toISOString(),
                completed_at: null,
                cancelled_at: null,
                last_error: null,
                updated_at: now.toISOString(),
              })
              .eq('id', existingSms.id)

            results.sms = updateError ? { error: updateError.message } : { success: true, journey_id: existingSms.id }
          } else {
            // Create new
            const nextSend = calculateNextSendTime(step || 1, now, false)
            const { data: newJourney, error: createError } = await supabase
              .from('marketing_sms_journeys')
              .insert({
                lead_id: leadId,
                status: 'active',
                current_step: step || 1,
                next_send_at: nextSend.toISOString(),
                started_at: now.toISOString(),
              })
              .select('id')
              .single()

            results.sms = createError ? { error: createError.message } : { success: true, journey_id: newJourney.id }
          }
        }
        }
      }

      if (journeyType === 'email' || journeyType === 'both') {
        if (!emailSetting.enabled) {
          results.email = { skipped: 'disabled' }
        } else {
        if (!lead.email) {
          results.email = { error: 'Lead has no email' }
        } else {
          // Check if journey exists
          const { data: existingEmail } = await supabase
            .from('marketing_email_journeys')
            .select('id')
            .eq('lead_id', leadId)
            .maybeSingle()

          if (existingEmail) {
            // Reactivate
            const nextSend = calculateNextSendTime(step || 1, now, true)
            const { error: updateError } = await supabase
              .from('marketing_email_journeys')
              .update({
                status: 'active',
                current_step: step || 1,
                next_send_at: step ? calculateNextSendTime(step, now, true).toISOString() : nextSend.toISOString(),
                started_at: now.toISOString(),
                completed_at: null,
                cancelled_at: null,
                last_error: null,
                updated_at: now.toISOString(),
              })
              .eq('id', existingEmail.id)

            results.email = updateError ? { error: updateError.message } : { success: true, journey_id: existingEmail.id }
          } else {
            // Create new - email step 1 is +1 day from start
            const nextSend = calculateNextSendTime(step || 1, now, true)
            const { data: newJourney, error: createError } = await supabase
              .from('marketing_email_journeys')
              .insert({
                lead_id: leadId,
                status: 'active',
                current_step: step || 1,
                next_send_at: nextSend.toISOString(),
                started_at: now.toISOString(),
              })
              .select('id')
              .single()

            results.email = createError ? { error: createError.message } : { success: true, journey_id: newJourney.id }
          }
        }
        }
      }

      return jsonResponse({ success: true, results })
    }

    if (action === 'pause') {
      const results: any = {}

      if (journeyType === 'sms' || journeyType === 'both') {
        const { error: pauseError } = await supabase
          .from('marketing_sms_journeys')
          .update({ status: 'paused', updated_at: now.toISOString() })
          .eq('lead_id', leadId)
          .eq('status', 'active')

        results.sms = pauseError ? { error: pauseError.message } : { success: true }
      }

      if (journeyType === 'email' || journeyType === 'both') {
        const { error: pauseError } = await supabase
          .from('marketing_email_journeys')
          .update({ status: 'paused', updated_at: now.toISOString() })
          .eq('lead_id', leadId)
          .eq('status', 'active')

        results.email = pauseError ? { error: pauseError.message } : { success: true }
      }

      return jsonResponse({ success: true, results })
    }

    if (action === 'resume') {
      const results: any = {}

      if (journeyType === 'sms' || journeyType === 'both') {
        const { data: journey } = await supabase
          .from('marketing_sms_journeys')
          .select('current_step, started_at')
          .eq('lead_id', leadId)
          .eq('status', 'paused')
          .maybeSingle()

        if (journey) {
          const nextSend = calculateNextSendTime(journey.current_step, new Date(journey.started_at), false)
          const { error: resumeError } = await supabase
            .from('marketing_sms_journeys')
            .update({
              status: 'active',
              next_send_at: nextSend.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('lead_id', leadId)
            .eq('status', 'paused')

          results.sms = resumeError ? { error: resumeError.message } : { success: true }
        } else {
          results.sms = { error: 'No paused SMS journey found' }
        }
      }

      if (journeyType === 'email' || journeyType === 'both') {
        const { data: journey } = await supabase
          .from('marketing_email_journeys')
          .select('current_step, started_at')
          .eq('lead_id', leadId)
          .eq('status', 'paused')
          .maybeSingle()

        if (journey) {
          const nextSend = calculateNextSendTime(journey.current_step, new Date(journey.started_at), true)
          const { error: resumeError } = await supabase
            .from('marketing_email_journeys')
            .update({
              status: 'active',
              next_send_at: nextSend.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('lead_id', leadId)
            .eq('status', 'paused')

          results.email = resumeError ? { error: resumeError.message } : { success: true }
        } else {
          results.email = { error: 'No paused email journey found' }
        }
      }

      return jsonResponse({ success: true, results })
    }

    if (action === 'cancel' || action === 'stop') {
      const results: any = {}

      if (journeyType === 'sms' || journeyType === 'both') {
        const { error: cancelError } = await supabase
          .from('marketing_sms_journeys')
          .update({
            status: 'cancelled',
            cancelled_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('lead_id', leadId)
          .in('status', ['active', 'paused'])

        results.sms = cancelError ? { error: cancelError.message } : { success: true }
      }

      if (journeyType === 'email' || journeyType === 'both') {
        const { error: cancelError } = await supabase
          .from('marketing_email_journeys')
          .update({
            status: 'cancelled',
            cancelled_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('lead_id', leadId)
          .in('status', ['active', 'paused'])

        results.email = cancelError ? { error: cancelError.message } : { success: true }
      }

      return jsonResponse({ success: true, results })
    }

    if (action === 'set_step') {
      if (step === undefined || step < 1 || step > 7) {
        return jsonResponse({ error: 'step must be between 1 and 7' }, 400)
      }

      const results: any = {}

      if (journeyType === 'sms' || journeyType === 'both') {
        const { data: journey } = await supabase
          .from('marketing_sms_journeys')
          .select('started_at')
          .eq('lead_id', leadId)
          .maybeSingle()

        if (journey) {
          const nextSend = calculateNextSendTime(step, new Date(journey.started_at), false)
          const { error: updateError } = await supabase
            .from('marketing_sms_journeys')
            .update({
              current_step: step,
              next_send_at: nextSend.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('lead_id', leadId)

          results.sms = updateError ? { error: updateError.message } : { success: true, step, next_send_at: nextSend.toISOString() }
        } else {
          results.sms = { error: 'SMS journey not found' }
        }
      }

      if (journeyType === 'email' || journeyType === 'both') {
        const { data: journey } = await supabase
          .from('marketing_email_journeys')
          .select('started_at')
          .eq('lead_id', leadId)
          .maybeSingle()

        if (journey) {
          const nextSend = calculateNextSendTime(step, new Date(journey.started_at), true)
          const { error: updateError } = await supabase
            .from('marketing_email_journeys')
            .update({
              current_step: step,
              next_send_at: nextSend.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('lead_id', leadId)

          results.email = updateError ? { error: updateError.message } : { success: true, step, next_send_at: nextSend.toISOString() }
        } else {
          results.email = { error: 'Email journey not found' }
        }
      }

      return jsonResponse({ success: true, results })
    }

    if (action === 'send_now') {
      const results: any = {}

      if (journeyType === 'sms' || journeyType === 'both') {
        const { error: updateError } = await supabase
          .from('marketing_sms_journeys')
          .update({
            next_send_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('lead_id', leadId)
          .eq('status', 'active')

        results.sms = updateError ? { error: updateError.message } : { success: true, next_send_at: now.toISOString() }
      }

      if (journeyType === 'email' || journeyType === 'both') {
        const { error: updateError } = await supabase
          .from('marketing_email_journeys')
          .update({
            next_send_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('lead_id', leadId)
          .eq('status', 'active')

        results.email = updateError ? { error: updateError.message } : { success: true, next_send_at: now.toISOString() }
      }

      return jsonResponse({ success: true, results })
    }

    return jsonResponse({ error: 'Invalid action. Use: start, pause, resume, cancel, stop, set_step, send_now' }, 400)
  } catch (err) {
    console.error('Error in marketing-loop-actions:', err)
    return jsonError(err instanceof Error ? err.message : 'Unexpected error', 500)
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})
