import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const dialpadToken = Deno.env.get('DIALPAD_API_KEY') || ''
const dialpadUserId = Deno.env.get('DIALPAD_USER_ID') || '6452247499866112'
const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
const emailFrom = Deno.env.get('MARKETING_EMAIL_FROM') || Deno.env.get('QUOTE_EMAIL_FROM') || 'notifications@sydneypremiumcleaning.com.au'
const emailReplyTo = Deno.env.get('MARKETING_EMAIL_REPLY_TO') || 'sales@sydneypremiumcleaning.com.au'

const SMS_ENDPOINT = 'https://dialpad.com/api/v2/sms'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    },
  })
}

function personalize(text: string, name?: string | null): string {
  if (!text) return ''
  return text.replace(/{{\s*name\s*}}/gi, name?.trim() || 'there')
}

// Calculate next send time based on step and schedule
function calculateNextSendTime(step: number, startedAt: Date, isEmail: boolean): Date | null {
  if (step >= 7) return null // Journey complete
  
  if (isEmail) {
    // Email schedule: +1 day, +5 days, +14 days, +32 days, +44 days, +79 days, +121 days
    const emailDelays = [1, 5, 14, 32, 44, 79, 121] // days from start
    const delayDays = emailDelays[step] || 121 // Next step delay
    return new Date(startedAt.getTime() + delayDays * 24 * 60 * 60 * 1000)
  } else {
    // SMS schedule: immediate, +3 days, +7 days, +14 days, +14 days, +1 month, +1 month
    // Step 1 is immediate (0 days), step 2 is +3 days from step 1, step 3 is +7 days from step 2, etc.
    const smsDelays = [0, 3, 7, 14, 14, 30, 30] // days from previous step
    let totalDays = 0
    for (let i = 0; i <= step; i++) {
      totalDays += smsDelays[i] || 0
    }
    return new Date(startedAt.getTime() + totalDays * 24 * 60 * 60 * 1000)
  }
}

async function sendSMS(phoneNumber: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!dialpadToken) {
    return { success: false, error: 'DIALPAD_API_KEY not configured' }
  }

  try {
    const response = await fetch(SMS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${dialpadToken}`,
      },
      body: JSON.stringify({
        infer_country_code: false,
        to_numbers: [phoneNumber],
        user_id: dialpadUserId,
        text: message.trim(),
      }),
    })

    const textBody = await response.text()
    let parsed: any = null
    try {
      parsed = textBody ? JSON.parse(textBody) : null
    } catch {
      parsed = null
    }

    if (!response.ok || parsed?.error) {
      return { success: false, error: parsed?.error || textBody || `HTTP ${response.status}` }
    }

    return { success: true, messageId: parsed?.message_id || parsed?.id || 'unknown' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [to],
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
        reply_to: emailReplyTo,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Resend error: ${errorText}` }
    }

    const data = await response.json()
    return { success: true, messageId: data.id || 'unknown' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function loadAutomationFlags(
  supabase: ReturnType<typeof createClient>,
  automationType: string,
  orgIds: string[]
): Promise<Map<string, boolean>> {
  const enabledByOrg = new Map<string, boolean>()
  if (orgIds.length === 0) return enabledByOrg

  const { data } = await supabase
    .from('organization_automation_settings')
    .select('org_id, enabled')
    .in('org_id', orgIds)
    .eq('automation_type', automationType)

  ;(data || []).forEach((row: any) => {
    enabledByOrg.set(row.org_id, row.enabled ?? true)
  })

  return enabledByOrg
}

async function loadWorkflowFlags(
  supabase: ReturnType<typeof createClient>,
  orgIds: string[]
): Promise<Map<string, boolean>> {
  const byOrg = new Map<string, boolean>()
  if (orgIds.length === 0) return byOrg

  const { data } = await supabase
    .from('organizations')
    .select('id, use_workflow_automations')
    .in('id', orgIds)

  ;(data || []).forEach((row: any) => {
    byOrg.set(row.id, Boolean(row.use_workflow_automations))
  })

  return byOrg
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const now = new Date()
  const nowIso = now.toISOString()
  const lockId = `runner-${Date.now()}`

  try {
    // Process SMS journeys
    const { data: smsJourneys, error: smsError } = await supabase
      .from('marketing_sms_journeys')
      .select('id, lead_id, org_id, current_step, started_at, next_send_at')
      .eq('status', 'active')
      .lte('next_send_at', nowIso)
      .is('locked_at', null)
      .limit(50)

    if (smsError) {
      console.error('Error fetching SMS journeys:', smsError)
    }

    const smsResults: any[] = []

    if (smsJourneys && smsJourneys.length > 0) {
      const smsOrgIds = Array.from(new Set(smsJourneys.map((j) => j.org_id).filter(Boolean)))
      const smsEnabledByOrg = await loadAutomationFlags(supabase, 'marketing_sms', smsOrgIds as string[])
      const smsWorkflowByOrg = await loadWorkflowFlags(supabase, smsOrgIds as string[])
      // Lock journeys
      const journeyIds = smsJourneys.map((j) => j.id)
      await supabase
        .from('marketing_sms_journeys')
        .update({ locked_at: nowIso, locked_by: lockId })
        .in('id', journeyIds)

      for (const journey of smsJourneys) {
        const workflowEnabled = journey.org_id ? (smsWorkflowByOrg.get(journey.org_id) ?? false) : false
        if (workflowEnabled) {
          await supabase
            .from('marketing_sms_journeys')
            .update({
              status: 'paused',
              last_error: 'workflow_automations_enabled',
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq('id', journey.id)
          continue
        }
        const smsEnabled = journey.org_id ? (smsEnabledByOrg.get(journey.org_id) ?? true) : true
        if (!smsEnabled) {
          await supabase
            .from('marketing_sms_journeys')
            .update({
              status: 'paused',
              last_error: 'automation_disabled',
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq('id', journey.id)
          continue
        }
        try {
          // Get lead info
          const { data: lead } = await supabase
            .from('extracted_leads')
            .select('id, name, phone_number')
            .eq('id', journey.lead_id)
            .maybeSingle()

          if (!lead || !lead.phone_number) {
            await supabase
              .from('marketing_sms_journeys')
              .update({
                status: 'cancelled',
                cancelled_at: nowIso,
                last_error: 'Lead has no phone number',
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)
            continue
          }

          // Get template
          const { data: template } = await supabase
            .from('marketing_sms_templates')
            .select('id, body')
            .eq('step', journey.current_step)
            .eq('is_default', true)
            .maybeSingle()

          if (!template) {
            await supabase
              .from('marketing_sms_journeys')
              .update({
                last_error: `No template found for step ${journey.current_step}`,
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)
            continue
          }

          const personalizedBody = personalize(template.body, lead.name)

          // Send SMS
          const sendResult = await sendSMS(lead.phone_number, personalizedBody)

          // Log attempt
          await supabase.from('marketing_sms_logs').insert({
            journey_id: journey.id,
            lead_id: journey.lead_id,
            step: journey.current_step,
            template_id: template.id,
            body: personalizedBody,
            status: sendResult.success ? 'sent' : 'failed',
            dialpad_message_id: sendResult.messageId,
            error: sendResult.error,
            scheduled_for: journey.next_send_at,
            sent_at: sendResult.success ? nowIso : null,
          })

          if (sendResult.success) {
            // Advance step or complete
            const nextStep = journey.current_step + 1
            const nextSend = nextStep <= 7
              ? calculateNextSendTime(journey.current_step, new Date(journey.started_at), false)
              : null

            await supabase
              .from('marketing_sms_journeys')
              .update({
                current_step: nextStep > 7 ? 7 : nextStep,
                next_send_at: nextSend?.toISOString() || null,
                status: nextStep > 7 ? 'completed' : 'active',
                completed_at: nextStep > 7 ? nowIso : null,
                last_error: null,
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)

            smsResults.push({ journey_id: journey.id, step: journey.current_step, status: 'sent' })
          } else {
            await supabase
              .from('marketing_sms_journeys')
              .update({
                last_error: sendResult.error || 'Send failed',
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)

            smsResults.push({ journey_id: journey.id, step: journey.current_step, status: 'failed', error: sendResult.error })
          }
        } catch (err) {
          console.error(`Error processing SMS journey ${journey.id}:`, err)
          await supabase
            .from('marketing_sms_journeys')
            .update({
              last_error: err instanceof Error ? err.message : 'Unexpected error',
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq('id', journey.id)
        }
      }
    }

    // Process Email journeys
    const { data: emailJourneys, error: emailError } = await supabase
      .from('marketing_email_journeys')
      .select('id, lead_id, org_id, current_step, started_at, next_send_at')
      .eq('status', 'active')
      .lte('next_send_at', nowIso)
      .is('locked_at', null)
      .limit(50)

    if (emailError) {
      console.error('Error fetching email journeys:', emailError)
    }

    const emailResults: any[] = []

    if (emailJourneys && emailJourneys.length > 0) {
      const emailOrgIds = Array.from(new Set(emailJourneys.map((j) => j.org_id).filter(Boolean)))
      const emailEnabledByOrg = await loadAutomationFlags(supabase, 'marketing_email', emailOrgIds as string[])
      const emailWorkflowByOrg = await loadWorkflowFlags(supabase, emailOrgIds as string[])
      // Lock journeys
      const journeyIds = emailJourneys.map((j) => j.id)
      await supabase
        .from('marketing_email_journeys')
        .update({ locked_at: nowIso, locked_by: lockId })
        .in('id', journeyIds)

      for (const journey of emailJourneys) {
        const workflowEnabled = journey.org_id ? (emailWorkflowByOrg.get(journey.org_id) ?? false) : false
        if (workflowEnabled) {
          await supabase
            .from('marketing_email_journeys')
            .update({
              status: 'paused',
              last_error: 'workflow_automations_enabled',
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq('id', journey.id)
          continue
        }
        const emailEnabled = journey.org_id ? (emailEnabledByOrg.get(journey.org_id) ?? true) : true
        if (!emailEnabled) {
          await supabase
            .from('marketing_email_journeys')
            .update({
              status: 'paused',
              last_error: 'automation_disabled',
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq('id', journey.id)
          continue
        }
        try {
          // Get lead info
          const { data: lead } = await supabase
            .from('extracted_leads')
            .select('id, name, email')
            .eq('id', journey.lead_id)
            .maybeSingle()

          if (!lead || !lead.email) {
            await supabase
              .from('marketing_email_journeys')
              .update({
                status: 'cancelled',
                cancelled_at: nowIso,
                last_error: 'Lead has no email',
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)
            continue
          }

          // Get template
          const { data: template } = await supabase
            .from('marketing_email_templates')
            .select('id, subject, body')
            .eq('step', journey.current_step)
            .eq('is_default', true)
            .maybeSingle()

          if (!template) {
            await supabase
              .from('marketing_email_journeys')
              .update({
                last_error: `No template found for step ${journey.current_step}`,
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)
            continue
          }

          const personalizedSubject = personalize(template.subject, lead.name)
          const personalizedBody = personalize(template.body, lead.name)

          // Send Email
          const sendResult = await sendEmail(lead.email, personalizedSubject, personalizedBody)

          // Log attempt
          await supabase.from('marketing_email_logs').insert({
            journey_id: journey.id,
            lead_id: journey.lead_id,
            step: journey.current_step,
            template_id: template.id,
            subject: personalizedSubject,
            body: personalizedBody,
            status: sendResult.success ? 'sent' : 'failed',
            resend_message_id: sendResult.messageId,
            error: sendResult.error,
            scheduled_for: journey.next_send_at,
            sent_at: sendResult.success ? nowIso : null,
          })

          if (sendResult.success) {
            // Advance step or complete
            const nextStep = journey.current_step + 1
            const nextSend = nextStep <= 7
              ? calculateNextSendTime(journey.current_step, new Date(journey.started_at), true)
              : null

            await supabase
              .from('marketing_email_journeys')
              .update({
                current_step: nextStep > 7 ? 7 : nextStep,
                next_send_at: nextSend?.toISOString() || null,
                status: nextStep > 7 ? 'completed' : 'active',
                completed_at: nextStep > 7 ? nowIso : null,
                last_error: null,
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)

            emailResults.push({ journey_id: journey.id, step: journey.current_step, status: 'sent' })
          } else {
            await supabase
              .from('marketing_email_journeys')
              .update({
                last_error: sendResult.error || 'Send failed',
                locked_at: null,
                locked_by: null,
                updated_at: nowIso,
              })
              .eq('id', journey.id)

            emailResults.push({ journey_id: journey.id, step: journey.current_step, status: 'failed', error: sendResult.error })
          }
        } catch (err) {
          console.error(`Error processing email journey ${journey.id}:`, err)
          await supabase
            .from('marketing_email_journeys')
            .update({
              last_error: err instanceof Error ? err.message : 'Unexpected error',
              locked_at: null,
              locked_by: null,
              updated_at: nowIso,
            })
            .eq('id', journey.id)
        }
      }
    }

    return jsonResponse({
      success: true,
      processed_at: nowIso,
      sms: {
        processed: smsResults.length,
        results: smsResults,
      },
      email: {
        processed: emailResults.length,
        results: emailResults,
      },
    })
  } catch (err) {
    console.error('Error in marketing-loop-runner:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
