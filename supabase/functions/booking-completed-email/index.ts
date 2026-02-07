import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getOrgIntegration, getOrg } from '../_shared/org-resolver.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

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

function formatDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    dateStyle: 'full',
  }).format(date)
}

function formatTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    timeStyle: 'short',
  }).format(date)
}

function normalizeList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return 'None'
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'name' in item) return String((item as any).name)
      return JSON.stringify(item)
    })
    .join(', ')
}

function applyBookingPlaceholders(text: string, params: {
  customerName: string
  cleanType: string
  appointmentDate: string
  appointmentTime: string
  address: string
  addonsLabel: string
}) {
  return text
    .replace(/{{\s*name\s*}}/gi, params.customerName)
    .replace(/{{\s*service\s*}}/gi, params.cleanType)
    .replace(/{{\s*date\s*}}/gi, params.appointmentDate)
    .replace(/{{\s*time\s*}}/gi, params.appointmentTime)
    .replace(/{{\s*address\s*}}/gi, params.address)
    .replace(/{{\s*addons\s*}}/gi, params.addonsLabel)
}

async function sendCompletionEmail(params: {
  to: string
  customerName: string
  cleanType: string
  appointmentDate: string
  appointmentTime: string
  address: string
  addonsLabel: string
  subjectOverride?: string
  bodyOverride?: string
}) {
  const { to, customerName, cleanType, appointmentDate, appointmentTime, address, addonsLabel, subjectOverride, bodyOverride } = params

  const subject = subjectOverride?.trim() || 'Job completed — thank you!'

  const text = [
    `Hi ${customerName},`,
    ``,
    `Thank you for choosing ${businessName}. Your job has been completed.`,
    ``,
    `Service: ${cleanType}`,
    `When: ${appointmentTime} on ${appointmentDate}`,
    `Address: ${address}`,
    `Add-ons: ${addonsLabel}`,
    ``,
    `If you need anything else, just reply to this email or call ${businessPhone}.`,
    ``,
    `${businessName}`,
    businessEmail,
    businessPhone,
  ].join('\n')

  const resolvedText = bodyOverride
    ? applyBookingPlaceholders(bodyOverride, {
        customerName,
        cleanType,
        appointmentDate,
        appointmentTime,
        address,
        addonsLabel,
      })
    : text

  const html = bodyOverride
    ? `<div style="font-family:Arial,Helvetica,sans-serif;white-space:pre-line;">${resolvedText.replace(/\n/g, '<br>')}</div>`
    : `
    <div style="background:#f5f7fb;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#10b981;color:#ffffff;padding:20px 24px;">
          <h1 style="margin:0;font-size:20px;">Job completed — thank you!</h1>
          <p style="margin:6px 0 0;font-size:14px;">${businessName}</p>
        </div>

        <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#0f172a;">
          <p style="margin:0 0 12px;">Hi ${customerName},</p>
          <p style="margin:0 0 12px;">Thank you for choosing ${businessName}. Your job has been completed.</p>

          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:16px 0;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:6px 0;color:#64748b;width:140px;">Service</td>
                <td style="padding:6px 0;">${cleanType}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Date</td>
                <td style="padding:6px 0;">${appointmentDate}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Time</td>
                <td style="padding:6px 0;">${appointmentTime}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Address</td>
                <td style="padding:6px 0;">${address}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Add-ons</td>
                <td style="padding:6px 0;">${addonsLabel}</td>
              </tr>
            </table>
          </div>

          <p style="margin:0 0 12px;">
            If you need anything else, just reply to this email or call ${businessPhone}.
          </p>

          <p style="margin:0;">Thank you,</p>
          <p style="margin:4px 0 0;font-weight:600;">${businessName}</p>
          <p style="margin:4px 0 0;color:#64748b;">${businessEmail}</p>
          <p style="margin:2px 0 0;color:#64748b;">${businessPhone}</p>
        </div>

        <div style="background:#f8fafc;padding:12px 24px;font-size:12px;color:#94a3b8;">
          This is an automated update. If you have any questions, reply to this email.
        </div>
      </div>
    </div>
  `.trim()

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: completionEmailFrom,
      to: [to],
      subject,
      text: resolvedText,
      html,
      ...(completionEmailReplyTo ? { reply_to: completionEmailReplyTo } : {}),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Resend send failed: ${errorText}`)
  }
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

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  if (!resendApiKey || !completionEmailFrom) {
    return jsonResponse({ error: 'Missing email configuration' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let payload: {
    testOnly?: boolean
    testEmailTo?: string
    occurrenceId?: string
  } = {}

  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  if (payload.testOnly) {
    const testEmailTo = payload.testEmailTo || ''
    if (!testEmailTo) {
      return jsonResponse({ error: 'testEmailTo is required for testOnly mode' }, 400)
    }
  } else if (!payload.occurrenceId) {
    return jsonResponse({ error: 'occurrenceId is required' }, 400)
  }

  const occurrenceSelect = `
    id,
    org_id,
    series_id,
    start_at,
    quote_id,
    status,
    booking_series ( id, lead_id, title, timezone ),
    quotes ( id, customer_name, customer_email, service, addons, custom_addons, address )
  `

  const { data: occurrence, error: occurrenceError } = payload.occurrenceId
    ? await supabase.from('booking_occurrences').select(occurrenceSelect).eq('id', payload.occurrenceId).maybeSingle()
    : await supabase
        .from('booking_occurrences')
        .select(occurrenceSelect)
        .eq('status', 'completed')
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle()

  if (occurrenceError || !occurrence) {
    return jsonResponse({ error: 'Occurrence not found' }, 404)
  }

  let completionConfig: Record<string, unknown> = {}
  if (!payload.testOnly && (occurrence as any).org_id) {
    const { data: setting } = await supabase
      .from('organization_automation_settings')
      .select('enabled, config')
      .eq('org_id', (occurrence as any).org_id)
      .eq('automation_type', 'booking_completion')
      .maybeSingle()

    if (setting && setting.enabled === false) {
      return jsonResponse({ skipped: true, reason: 'automation_disabled' })
    }
    completionConfig = (setting?.config as Record<string, unknown>) || {}
  }

  if (occurrence.status !== 'completed' && !payload.testOnly) {
    return jsonResponse({ skipped: true, reason: 'occurrence_not_completed' })
  }

  const occurrenceId = occurrence.id
  const { data: existingLog } = await supabase
    .from('booking_occurrence_completion_emails')
    .select('id')
    .eq('occurrence_id', occurrenceId)
    .maybeSingle()

  if (existingLog && !payload.testOnly) {
    return jsonResponse({ skipped: true, reason: 'already_sent' })
  }

  const series = (occurrence as any).booking_series
  const quote = (occurrence as any).quotes

  const leadId = series?.lead_id
  const lead =
    leadId
      ? (
          await supabase
            .from('extracted_leads')
            .select('id, name, email')
            .eq('id', leadId)
            .maybeSingle()
        ).data
      : null

  const timezone = series?.timezone || 'Australia/Sydney'
  const startAt = occurrence.start_at ? new Date(occurrence.start_at) : null
  const appointmentDate = startAt ? formatDate(startAt, timezone) : '—'
  const appointmentTime = startAt ? formatTime(startAt, timezone) : '—'
  const cleanType = quote?.service || series?.title || 'cleaning service'
  const customerName = quote?.customer_name || lead?.name || 'Client'
  const address = quote?.address || '—'
  const addonsLabel = normalizeList(quote?.addons || quote?.custom_addons || [])

  const targetEmail = payload.testOnly ? payload.testEmailTo || '' : quote?.customer_email || lead?.email || ''
  if (!targetEmail) {
    return jsonResponse({ error: 'Missing customer email' }, 400)
  }

  await sendCompletionEmail({
    to: targetEmail,
    customerName,
    cleanType,
    appointmentDate,
    appointmentTime,
    address,
    addonsLabel,
    subjectOverride: typeof (completionConfig as any).subject === 'string' ? ((completionConfig as any).subject as string) : undefined,
    bodyOverride: typeof (completionConfig as any).body === 'string' ? ((completionConfig as any).body as string) : undefined,
  })

  if (!payload.testOnly) {
    const { error: logError } = await supabase.from('booking_occurrence_completion_emails').insert({
      occurrence_id: occurrenceId,
      email_to: targetEmail,
      payload: {
        series_id: series?.id || null,
        quote_id: occurrence.quote_id || null,
        start_at: occurrence.start_at || null,
        lead_id: series?.lead_id || null,
      },
    })

    if (logError) {
      console.error('Failed to record completion email log:', logError)
    }
  }

  return jsonResponse({ success: true, test_only: payload.testOnly === true, email_to: targetEmail })
})
