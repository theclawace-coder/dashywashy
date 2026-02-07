import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''

const reminderEmailFrom =
  Deno.env.get('REMINDER_EMAIL_FROM') ||
  Deno.env.get('BOOKING_CONFIRMATION_EMAIL_FROM') ||
  Deno.env.get('JOB_WON_EMAIL_FROM') ||
  'notifications@sydneypremiumcleaning.com.au'
const reminderEmailReplyTo =
  Deno.env.get('REMINDER_EMAIL_REPLY_TO') ||
  Deno.env.get('BOOKING_CONFIRMATION_REPLY_TO') ||
  'sales@sydneypremiumcleaning.com.au'

const reminderLeadHours = Number(Deno.env.get('REMINDER_LEAD_HOURS') || '24')
const reminderWindowMinutes = Number(Deno.env.get('REMINDER_WINDOW_MINUTES') || '60')

const businessName = Deno.env.get('BUSINESS_NAME') || 'Sydney Premium Cleaning'
const businessEmail = Deno.env.get('BUSINESS_EMAIL') || 'sales@sydneypremiumcleaning.com.au'
const businessPhone = Deno.env.get('BUSINESS_PHONE') || '0426413984'

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

async function sendReminderEmail(params: {
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

  const subject = subjectOverride?.trim() || 'Hey, your cleaning is in 24 hours'

  const defaultText = [
    `Hi ${customerName},`,
    ``,
    `Hey Your Cleaning is in 24 Hours`,
    ``,
    `Service: ${cleanType}`,
    `When: ${appointmentTime} on ${appointmentDate}`,
    `Address: ${address}`,
    `Add-ons: ${addonsLabel}`,
    ``,
    `🏠 Before We Arrive`,
    `Declutter pathways • Secure valuables • Manage pets`,
    ``,
    `To see the checklist visit https://sydneypremiumcleaning.com.au/cleaning-checklist/`,
    ``,
    `If you need to make changes to this appointment, please call ${businessPhone} or reply to this email.`,
    ``,
    `${businessName}`,
    businessEmail,
    businessPhone,
  ].join('\n')

  const text = bodyOverride
    ? applyBookingPlaceholders(bodyOverride, {
        customerName,
        cleanType,
        appointmentDate,
        appointmentTime,
        address,
        addonsLabel,
      })
    : defaultText

  const html = bodyOverride
    ? `<div style="font-family:Arial,Helvetica,sans-serif;white-space:pre-line;">${text.replace(/\n/g, '<br>')}</div>`
    : `
    <div style="background:#f5f7fb;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#0ea5e9;color:#ffffff;padding:20px 24px;">
          <h1 style="margin:0;font-size:20px;">Hey, your cleaning is in 24 hours</h1>
          <p style="margin:6px 0 0;font-size:14px;">${businessName}</p>
        </div>

        <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#0f172a;">
          <p style="margin:0 0 12px;">Hi ${customerName},</p>
          <p style="margin:0 0 12px;">Just a quick reminder that your clean is booked for tomorrow.</p>

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

          <h3 style="margin:18px 0 6px;font-size:16px;">🏠 Before We Arrive</h3>
          <p style="margin:0 0 12px;">Declutter pathways • Secure valuables • Manage pets</p>

          <p style="margin:0 0 12px;">
            To see the checklist visit
            <a href="https://sydneypremiumcleaning.com.au/cleaning-checklist/" style="color:#0ea5e9;">
              sydneypremiumcleaning.com.au/cleaning-checklist
            </a>
          </p>

          <p style="margin:0 0 12px;">
            If you need to make changes to this appointment, please call ${businessPhone} or reply to this email.
          </p>

          <p style="margin:0;">Thank you,</p>
          <p style="margin:4px 0 0;font-weight:600;">${businessName}</p>
          <p style="margin:4px 0 0;color:#64748b;">${businessEmail}</p>
          <p style="margin:2px 0 0;color:#64748b;">${businessPhone}</p>
        </div>

        <div style="background:#f8fafc;padding:12px 24px;font-size:12px;color:#94a3b8;">
          This is an automated reminder. If you have any questions, reply to this email.
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
      from: reminderEmailFrom,
      to: [to],
      subject,
      text,
      html,
      ...(reminderEmailReplyTo ? { reply_to: reminderEmailReplyTo } : {}),
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

  if (!resendApiKey || !reminderEmailFrom) {
    return jsonResponse({ error: 'Missing email configuration' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let payload: {
    testOnly?: boolean
    testEmailTo?: string
    occurrenceId?: string
    leadHours?: number
    windowMinutes?: number
  } = {}

  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  const defaultLeadHours =
    typeof payload.leadHours === 'number' && Number.isFinite(payload.leadHours)
      ? payload.leadHours
      : reminderLeadHours
  const windowMinutes =
    typeof payload.windowMinutes === 'number' && Number.isFinite(payload.windowMinutes)
      ? payload.windowMinutes
      : reminderWindowMinutes

  let maxLeadHours = defaultLeadHours
  try {
    const { data: leadHourRows } = await supabase
      .from('organization_automation_settings')
      .select('config')
      .eq('automation_type', 'booking_reminder')

    const leadHourValues = (leadHourRows || [])
      .map((row: any) => Number(row?.config?.lead_hours))
      .filter((val: number) => Number.isFinite(val) && val > 0)

    if (leadHourValues.length > 0) {
      maxLeadHours = Math.max(defaultLeadHours, ...leadHourValues)
    }
  } catch {
    maxLeadHours = defaultLeadHours
  }

  const now = new Date()
  const target = new Date(now.getTime() + maxLeadHours * 60 * 60 * 1000)
  const windowMs = Math.max(windowMinutes, 1) * 60 * 1000
  const windowStart = new Date(target.getTime() - windowMs)
  const windowEnd = new Date(target.getTime() + windowMs)

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

  if (payload.testOnly) {
    const testEmailTo = payload.testEmailTo || ''
    if (!testEmailTo) {
      return jsonResponse({ error: 'testEmailTo is required for testOnly mode' }, 400)
    }

    const baseQuery = supabase
      .from('booking_occurrences')
      .select(occurrenceSelect)
      .eq('status', 'scheduled')

    const { data: occurrence, error: occurrenceError } = payload.occurrenceId
      ? await baseQuery.eq('id', payload.occurrenceId).maybeSingle()
      : await baseQuery.gte('start_at', now.toISOString()).order('start_at', { ascending: true }).limit(1).maybeSingle()

    if (occurrenceError || !occurrence) {
      return jsonResponse({ error: 'No occurrence found for test email' }, 404)
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

    await sendReminderEmail({
      to: testEmailTo,
      customerName,
      cleanType,
      appointmentDate,
      appointmentTime,
      address,
      addonsLabel,
    })

    return jsonResponse({ success: true, test_only: true, email_to: testEmailTo })
  }

  const { data: occurrences, error: occurrencesError } = await supabase
    .from('booking_occurrences')
    .select(occurrenceSelect)
    .eq('status', 'scheduled')
    .gte('start_at', windowStart.toISOString())
    .lte('start_at', windowEnd.toISOString())

  if (occurrencesError) {
    return jsonResponse({ error: occurrencesError.message || 'Failed to load occurrences' }, 500)
  }

  if (!occurrences || occurrences.length === 0) {
    return jsonResponse({ success: true, sent_count: 0, skipped: 'no_occurrences' })
  }

  const occurrenceIds = occurrences.map((occ: any) => occ.id)
  const { data: existingReminders } = await supabase
    .from('booking_occurrence_reminders')
    .select('occurrence_id')
    .in('occurrence_id', occurrenceIds)
    .eq('reminder_type', '24h')

  const sentIds = new Set((existingReminders || []).map((row: any) => row.occurrence_id))
  const pendingOccurrences = occurrences.filter((occ: any) => !sentIds.has(occ.id))

  if (pendingOccurrences.length === 0) {
    return jsonResponse({ success: true, sent_count: 0, skipped: 'already_sent' })
  }

  const orgIds = Array.from(new Set(pendingOccurrences.map((occ: any) => occ.org_id).filter(Boolean)))
  const enabledByOrg = new Map<string, boolean>()
  const configByOrg = new Map<string, Record<string, unknown>>()

  if (orgIds.length > 0) {
    const { data: automationRows } = await supabase
      .from('organization_automation_settings')
      .select('org_id, enabled, config')
      .in('org_id', orgIds)
      .eq('automation_type', 'booking_reminder')

    ;(automationRows || []).forEach((row: any) => {
      enabledByOrg.set(row.org_id, row.enabled ?? true)
      configByOrg.set(row.org_id, (row.config as Record<string, unknown>) || {})
    })
  }

  const eligibleOccurrences: any[] = []
  const preSkipped: Array<{ occurrence_id: string; reason: string }> = []

  for (const occ of pendingOccurrences) {
    const enabled = occ.org_id ? (enabledByOrg.get(occ.org_id) ?? true) : true
    if (!enabled) {
      preSkipped.push({ occurrence_id: occ.id, reason: 'automation_disabled' })
      continue
    }

    const config = occ.org_id ? configByOrg.get(occ.org_id) || {} : {}
    const orgLeadHoursRaw = Number((config as any).lead_hours)
    const orgLeadHours = Number.isFinite(orgLeadHoursRaw) && orgLeadHoursRaw > 0 ? orgLeadHoursRaw : defaultLeadHours
    const occStart = occ.start_at ? new Date(occ.start_at) : null
    if (!occStart || Number.isNaN(occStart.getTime())) {
      preSkipped.push({ occurrence_id: occ.id, reason: 'invalid_start_time' })
      continue
    }
    const orgTarget = new Date(now.getTime() + orgLeadHours * 60 * 60 * 1000)
    const orgWindowStart = new Date(orgTarget.getTime() - windowMs)
    const orgWindowEnd = new Date(orgTarget.getTime() + windowMs)
    if (occStart < orgWindowStart || occStart > orgWindowEnd) {
      preSkipped.push({ occurrence_id: occ.id, reason: 'outside_window' })
      continue
    }

    eligibleOccurrences.push(occ)
  }

  const leadIds = eligibleOccurrences
    .map((occ: any) => occ.booking_series?.lead_id)
    .filter((id: string | null | undefined): id is string => Boolean(id))

  const { data: leads, error: leadsError } = leadIds.length
    ? await supabase.from('extracted_leads').select('id, name, email').in('id', leadIds)
    : { data: [], error: null }

  if (leadsError) {
    return jsonResponse({ error: leadsError.message || 'Failed to load leads' }, 500)
  }

  const leadsById = new Map((leads || []).map((lead: any) => [lead.id, lead]))

  let sentCount = 0
  const skipped: Array<{ occurrence_id: string; reason: string }> = [...preSkipped]

  for (const occurrence of eligibleOccurrences) {
    const config = occurrence.org_id ? configByOrg.get(occurrence.org_id) || {} : {}
    const series = occurrence.booking_series
    const quote = occurrence.quotes
    const lead = series?.lead_id ? leadsById.get(series.lead_id) : null

    const customerEmail = quote?.customer_email || lead?.email || ''
    if (!customerEmail) {
      skipped.push({ occurrence_id: occurrence.id, reason: 'missing_customer_email' })
      continue
    }

    const timezone = series?.timezone || 'Australia/Sydney'
    const startAt = occurrence.start_at ? new Date(occurrence.start_at) : null
    const appointmentDate = startAt ? formatDate(startAt, timezone) : '—'
    const appointmentTime = startAt ? formatTime(startAt, timezone) : '—'
    const cleanType = quote?.service || series?.title || 'cleaning service'
    const customerName = quote?.customer_name || lead?.name || 'Client'
    const address = quote?.address || '—'
    const addonsLabel = normalizeList(quote?.addons || quote?.custom_addons || [])

    try {
    await sendReminderEmail({
      to: customerEmail,
      customerName,
      cleanType,
      appointmentDate,
      appointmentTime,
      address,
      addonsLabel,
      subjectOverride: typeof (config as any).subject === 'string' ? ((config as any).subject as string) : undefined,
      bodyOverride: typeof (config as any).body === 'string' ? ((config as any).body as string) : undefined,
    })

      sentCount += 1

      const { error: logError } = await supabase.from('booking_occurrence_reminders').insert({
        occurrence_id: occurrence.id,
        reminder_type: '24h',
        email_to: customerEmail,
        payload: {
          series_id: series?.id || null,
          quote_id: occurrence.quote_id || null,
          start_at: occurrence.start_at || null,
          lead_id: series?.lead_id || null,
        },
      })

      if (logError) {
        console.error('Failed to record reminder log:', logError)
      }
    } catch (err) {
      console.error('Failed to send reminder email:', err)
      skipped.push({ occurrence_id: occurrence.id, reason: 'send_failed' })
    }
  }

  return jsonResponse({
    success: true,
    sent_count: sentCount,
    skipped,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
  })
})
