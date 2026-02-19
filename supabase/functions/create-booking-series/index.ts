// Supabase Edge Function to create a booking series and generate occurrences
// POST with JSON:
// {
//   leadId: string (required)
//   startsAt: string (ISO datetime, required)
//   durationMinutes: number (default 120)
//   repeatType: 'none' | 'weekly' | 'fortnightly' | '3-weekly' | 'monthly' | '2-monthly' (default 'none')
//   untilDate?: string (ISO date, optional end date)
//   occurrenceCount?: number (optional, generate N occurrences)
//   title?: string
//   notes?: string
//   timezone?: string (default 'Australia/Sydney')
//   updateLeadStatus?: boolean (default true - sets lead to 'Job Won')
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { resolveOrgFromRequest, getOrgIntegration, corsHeaders, jsonResponse as _jr, jsonError } from '../_shared/org-resolver.ts'
import { getPlanConfig, getUtcMonthBounds } from '../_shared/plan.ts'

type RepeatType = 'none' | 'weekly' | 'fortnightly' | '3-weekly' | 'monthly' | '2-monthly'

interface CreateBookingPayload {
  leadId: string
  quoteId: string
  startsAt: string
  durationMinutes?: number
  repeatType?: RepeatType
  untilDate?: string
  occurrenceCount?: number
  title?: string
  notes?: string
  timezone?: string
  updateLeadStatus?: boolean
  testOnly?: boolean
  testEmailTo?: string
}

type QuoteTemplate = {
  id: string
  org_id?: string | null
  lead_id: string | null
  quote_number?: string | null
  address?: string | null
  address_lat?: number | null
  address_lng?: number | null
  description?: string | null
  service?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  addons?: string[] | null
  custom_addons?: any[] | null
  hourly_rate?: number | null
  cleaner_rate?: number | null
  cleaner_rate_type?: string | null
  main_service_hours?: number | null
  add_on_hours?: number | null
  total_hours?: number | null
  subtotal?: number | null
  discount_amount?: number | null
  discount_percentage?: number | null
  net_revenue?: number | null
  gst?: number | null
  total_inc_gst?: number | null
  cleaner_pay?: number | null
  profit?: number | null
  margin?: number | null
  deposit_percentage?: number | null
  deposit_amount?: number | null
  remaining_balance?: number | null
  notes?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  email_id?: string | null
  quote_scope?: string | null
  base_quote_id?: string | null
  quote_version?: number | null
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}

function formatDateTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDateOnly(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    dateStyle: 'full',
  }).format(date)
}

function formatTimeOnly(date: Date, timezone: string) {
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

async function sendJobWonEmail(params: {
  lead: { id: string; name: string | null; email: string | null; phone_number?: string | null }
  baseQuote: QuoteTemplate
  series: any
  occurrenceDates: Date[]
  durationMinutes: number
  repeatType: RepeatType
  timezone: string
  bookingNotes: string | null
  toOverride?: string | null
  resendApiKey: string
  jobWonNotifyEmail: string
  jobWonEmailFrom: string
  jobWonEmailReplyTo: string
  jobWonAdminUrl: string
  businessName: string
}): Promise<{ sent: boolean; error?: string }> {
  const { resendApiKey, jobWonNotifyEmail, jobWonEmailFrom, jobWonEmailReplyTo, jobWonAdminUrl, businessName } = params
  const targetEmail = params.toOverride || jobWonNotifyEmail
  if (!resendApiKey || !targetEmail || !jobWonEmailFrom) {
    console.log('Job won email skipped: missing RESEND_API_KEY / JOB_WON_NOTIFY_EMAIL / JOB_WON_EMAIL_FROM')
    return { sent: false, error: 'missing_email_configuration' }
  }

  const { lead, baseQuote, series, occurrenceDates, durationMinutes, repeatType, timezone, bookingNotes } = params
  const firstStart = occurrenceDates[0]
  const occurrencePreview = occurrenceDates
    .slice(0, 5)
    .map((d) => formatDateTime(d, timezone))
    .join(', ')
  const occurrencesTotal = occurrenceDates.length

  const subject = `${businessName} — Job Won: ${lead.name || 'Lead'}`

  const text = [
    `${businessName} — Job Won`,
    ``,
    `Lead: ${lead.name || 'Unknown'}`,
    `Email: ${lead.email || '—'}`,
    `Phone: ${lead.phone_number || '—'}`,
    `Lead ID: ${lead.id}`,
    ``,
    `Booking`,
    `Title: ${series.title || '—'}`,
    `Timezone: ${timezone}`,
    `Start: ${firstStart ? formatDateTime(firstStart, timezone) : '—'}`,
    `Duration: ${durationMinutes} mins`,
    `Repeat: ${repeatType}`,
    `Until: ${series.until_date || '—'}`,
    `Occurrences: ${occurrencesTotal}`,
    `Upcoming (first 5): ${occurrencePreview || '—'}`,
    `Notes: ${bookingNotes || '—'}`,
    ``,
    `Service Address: ${baseQuote.address || '—'}`,
    ``,
    `Quote`,
    `Quote Number: ${baseQuote.quote_number || '—'}`,
    `Service: ${baseQuote.service || '—'}`,
    `Bedrooms: ${baseQuote.bedrooms ?? '—'}`,
    `Bathrooms: ${baseQuote.bathrooms ?? '—'}`,
    `Addons: ${normalizeList(baseQuote.addons)}`,
    `Custom Addons: ${normalizeList(baseQuote.custom_addons)}`,
    `Hours: ${baseQuote.total_hours ?? '—'}`,
    `Subtotal: ${formatCurrency(baseQuote.subtotal ?? null)}`,
    `Discount: ${formatCurrency(baseQuote.discount_amount ?? null)}`,
    `Total inc GST: ${formatCurrency(baseQuote.total_inc_gst ?? null)}`,
    `Deposit: ${formatCurrency(baseQuote.deposit_amount ?? null)}`,
    `Remaining: ${formatCurrency(baseQuote.remaining_balance ?? null)}`,
    `Quote Notes: ${baseQuote.notes || '—'}`,
    ...(jobWonAdminUrl ? [`Admin: ${jobWonAdminUrl}`] : []),
  ].join('\n')

  const html = `
    <div style="background:#f5f7fb;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#0ea5e9;color:#ffffff;padding:20px 24px;">
          <h1 style="margin:0;font-size:20px;">Job Won</h1>
          <p style="margin:6px 0 0;font-size:14px;">Sydney Premium Cleaning</p>
        </div>

        <div style="padding:20px 24px;">
          <h2 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Lead</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#64748b;">Name</td><td style="padding:6px 0;">${lead.name || 'Unknown'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;">${lead.email || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;">${lead.phone_number || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Lead ID</td><td style="padding:6px 0;">${lead.id}</td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>

          <h2 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Booking</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#64748b;">Title</td><td style="padding:6px 0;">${series.title || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Timezone</td><td style="padding:6px 0;">${timezone}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Start</td><td style="padding:6px 0;">${firstStart ? formatDateTime(firstStart, timezone) : '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Duration</td><td style="padding:6px 0;">${durationMinutes} mins</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Repeat</td><td style="padding:6px 0;">${repeatType}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Until</td><td style="padding:6px 0;">${series.until_date || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Occurrences</td><td style="padding:6px 0;">${occurrencesTotal}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Upcoming (first 5)</td><td style="padding:6px 0;">${occurrencePreview || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Notes</td><td style="padding:6px 0;">${bookingNotes || '—'}</td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>

          <h2 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Service Address</h2>
          <p style="margin:0;font-size:14px;">${baseQuote.address || '—'}</p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>

          <h2 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Quote</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#64748b;">Quote Number</td><td style="padding:6px 0;">${baseQuote.quote_number || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Service</td><td style="padding:6px 0;">${baseQuote.service || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Bedrooms</td><td style="padding:6px 0;">${baseQuote.bedrooms ?? '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Bathrooms</td><td style="padding:6px 0;">${baseQuote.bathrooms ?? '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Addons</td><td style="padding:6px 0;">${normalizeList(baseQuote.addons)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Custom Addons</td><td style="padding:6px 0;">${normalizeList(baseQuote.custom_addons)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Hours</td><td style="padding:6px 0;">${baseQuote.total_hours ?? '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Subtotal</td><td style="padding:6px 0;">${formatCurrency(baseQuote.subtotal ?? null)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Discount</td><td style="padding:6px 0;">${formatCurrency(baseQuote.discount_amount ?? null)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Total inc GST</td><td style="padding:6px 0;">${formatCurrency(baseQuote.total_inc_gst ?? null)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Deposit</td><td style="padding:6px 0;">${formatCurrency(baseQuote.deposit_amount ?? null)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Remaining</td><td style="padding:6px 0;">${formatCurrency(baseQuote.remaining_balance ?? null)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Quote Notes</td><td style="padding:6px 0;">${baseQuote.notes || '—'}</td></tr>
          </table>

          ${
            jobWonAdminUrl
              ? `<div style="margin-top:20px;text-align:center;">
                  <a href="${jobWonAdminUrl}" style="background:#0ea5e9;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;font-weight:600;">
                    Open Dashboard
                  </a>
                </div>`
              : ''
          }
        </div>

        <div style="background:#f8fafc;padding:16px 24px;font-size:12px;color:#64748b;">
          Sydney Premium Cleaning · sales@sydneypremiumcleaning.com.au
        </div>
      </div>
    </div>
  `.trim()

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: jobWonEmailFrom,
        to: [targetEmail],
        subject,
        text,
        html,
        ...(jobWonEmailReplyTo ? { reply_to: jobWonEmailReplyTo } : {}),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to send job won email:', errorText)
      return { sent: false, error: errorText }
    }
    return { sent: true }
  } catch (err) {
    console.error('Error sending job won email:', err)
    return { sent: false, error: err instanceof Error ? err.message : 'unknown_error' }
  }
}

async function sendCustomerBookingConfirmationEmail(params: {
  lead: { id: string; name: string | null; email: string | null; phone_number?: string | null }
  baseQuote: QuoteTemplate
  series: any
  occurrenceDates: Date[]
  durationMinutes: number
  timezone: string
  bookingNotes: string | null
  resendApiKey: string
  bookingCustomerEmailFrom: string
  bookingCustomerReplyTo: string
  businessName: string
  businessEmail: string
  businessPhone: string
}) {
  const { resendApiKey, bookingCustomerEmailFrom, bookingCustomerReplyTo, businessName, businessEmail, businessPhone } = params
  if (!resendApiKey || !bookingCustomerEmailFrom) {
    console.log('Customer confirmation skipped: missing RESEND_API_KEY / BOOKING_CONFIRMATION_EMAIL_FROM')
    return { sent: false, error: 'missing_email_configuration' }
  }

  const { lead, baseQuote, occurrenceDates, timezone } = params
  const customerEmail = baseQuote.customer_email || lead.email || ''
  if (!customerEmail) {
    console.log('Customer confirmation skipped: missing customer email')
    return { sent: false, error: 'missing_customer_email' }
  }

  const customerName = baseQuote.customer_name || lead.name || 'Client'
  const cleanType = baseQuote.service || 'cleaning service'
  const firstStart = occurrenceDates[0]
  const appointmentDate = firstStart ? formatDateOnly(firstStart, timezone) : '—'
  const appointmentTime = firstStart ? formatTimeOnly(firstStart, timezone) : '—'

  const subject = `${customerName} | ${businessName} appointment is confirmed`

  const text = [
    `Hi ${customerName},`,
    ``,
    `Thank you for booking with ${businessName}.`,
    ``,
    `Your ${cleanType} is confirmed for ${appointmentTime} on ${appointmentDate}.`,
    ``,
    `If you need to make changes to this appointment, please call ${businessPhone} or reply to this email.`,
    ``,
    `Thank you for your business,`,
    ``,
    `${businessName}`,
    businessEmail,
    businessPhone,
  ].join('\n')

  const html = `
    <div style="background:#f5f7fb;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#0ea5e9;color:#ffffff;padding:20px 24px;">
          <h1 style="margin:0;font-size:20px;">Appointment Confirmed</h1>
          <p style="margin:6px 0 0;font-size:14px;">${businessName}</p>
        </div>

        <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#0f172a;">
          <p style="margin:0 0 12px;">Hi ${customerName},</p>
          <p style="margin:0 0 12px;">Thank you for booking with ${businessName}.</p>

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
            </table>
          </div>

          <p style="margin:0 0 12px;">
            If you need to make changes to this appointment, please call ${businessPhone} or reply to this email.
          </p>

          <p style="margin:0;">Thank you for your business,</p>
          <p style="margin:4px 0 0;font-weight:600;">${businessName}</p>
          <p style="margin:4px 0 0;color:#64748b;">${businessEmail}</p>
          <p style="margin:2px 0 0;color:#64748b;">${businessPhone}</p>
        </div>

        <div style="background:#f8fafc;padding:12px 24px;font-size:12px;color:#94a3b8;">
          This is an automated confirmation. If you have any questions, reply to this email.
        </div>
      </div>
    </div>
  `.trim()

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: bookingCustomerEmailFrom,
        to: [customerEmail],
        subject,
        text,
        html,
        ...(bookingCustomerReplyTo ? { reply_to: bookingCustomerReplyTo } : {}),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to send customer confirmation email:', errorText)
      return { sent: false, error: errorText }
    }
    return { sent: true }
  } catch (err) {
    console.error('Error sending customer confirmation email:', err)
    return { sent: false, error: err instanceof Error ? err.message : 'unknown_error' }
  }
}

async function resolveBaseQuote(
  supabase: ReturnType<typeof createClient>,
  quoteId: string,
  leadId: string
) {
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select(
      `
        id, org_id, lead_id, quote_number, address, address_lat, address_lng, description, service, bedrooms, bathrooms,
        addons, custom_addons, hourly_rate, cleaner_rate, cleaner_rate_type, main_service_hours, add_on_hours,
        total_hours, subtotal, discount_amount, discount_percentage, net_revenue, gst, total_inc_gst, cleaner_pay,
        profit, margin, deposit_percentage, deposit_amount, remaining_balance, notes, customer_name, customer_phone,
        customer_email, email_id, quote_scope, base_quote_id, quote_version
      `
    )
    .eq('id', quoteId)
    .eq('lead_id', leadId)
    .single()

  if (quoteError || !quote) {
    return { error: 'Quote not found or does not belong to this lead', quote: null }
  }

  const quoteData = quote as QuoteTemplate
  if (quoteData.quote_scope === 'occurrence_variant' && quoteData.base_quote_id) {
    const { data: base, error: baseError } = await supabase
      .from('quotes')
      .select(
        `
          id, org_id, lead_id, quote_number, address, address_lat, address_lng, description, service, bedrooms, bathrooms,
          addons, custom_addons, hourly_rate, cleaner_rate, cleaner_rate_type, main_service_hours, add_on_hours,
          total_hours, subtotal, discount_amount, discount_percentage, net_revenue, gst, total_inc_gst, cleaner_pay,
          profit, margin, deposit_percentage, deposit_amount, remaining_balance, notes, customer_name, customer_phone,
          customer_email, email_id, quote_scope, base_quote_id, quote_version
        `
      )
      .eq('id', quoteData.base_quote_id)
      .eq('lead_id', leadId)
      .single()

    if (baseError || !base) {
      return { error: 'Base quote not found for this lead', quote: null }
    }

    return { error: null, quote: base as QuoteTemplate }
  }

  return { error: null, quote: quoteData }
}

async function getNextQuoteVersion(
  supabase: ReturnType<typeof createClient>,
  baseQuoteId: string
) {
  const { data, error } = await supabase
    .from('quotes')
    .select('quote_version')
    .eq('base_quote_id', baseQuoteId)
    .order('quote_version', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0 || data[0]?.quote_version == null) {
    return 2
  }

  return Number(data[0].quote_version) + 1
}

function buildVariantPayload(baseQuote: QuoteTemplate, version: number) {
  const baseNumber = baseQuote.quote_number || null
  const quoteNumber = baseNumber ? `${baseNumber}v${version}` : null

  return {
    org_id: baseQuote.org_id ?? null,
    lead_id: baseQuote.lead_id,
    email_id: baseQuote.email_id ?? null,
    quote_number: quoteNumber,
    address: baseQuote.address ?? null,
    address_lat: baseQuote.address_lat ?? null,
    address_lng: baseQuote.address_lng ?? null,
    description: baseQuote.description ?? null,
    service: baseQuote.service ?? null,
    bedrooms: baseQuote.bedrooms ?? null,
    bathrooms: baseQuote.bathrooms ?? null,
    addons: baseQuote.addons ?? [],
    custom_addons: baseQuote.custom_addons ?? [],
    hourly_rate: baseQuote.hourly_rate ?? null,
    cleaner_rate: baseQuote.cleaner_rate ?? null,
    cleaner_rate_type: baseQuote.cleaner_rate_type ?? null,
    main_service_hours: baseQuote.main_service_hours ?? null,
    add_on_hours: baseQuote.add_on_hours ?? null,
    total_hours: baseQuote.total_hours ?? null,
    subtotal: baseQuote.subtotal ?? null,
    discount_amount: baseQuote.discount_amount ?? null,
    discount_percentage: baseQuote.discount_percentage ?? null,
    net_revenue: baseQuote.net_revenue ?? null,
    gst: baseQuote.gst ?? null,
    total_inc_gst: baseQuote.total_inc_gst ?? null,
    cleaner_pay: baseQuote.cleaner_pay ?? null,
    profit: baseQuote.profit ?? null,
    margin: baseQuote.margin ?? null,
    deposit_percentage: baseQuote.deposit_percentage ?? null,
    deposit_amount: baseQuote.deposit_amount ?? null,
    remaining_balance: baseQuote.remaining_balance ?? null,
    notes: baseQuote.notes ?? null,
    customer_name: baseQuote.customer_name ?? null,
    customer_phone: baseQuote.customer_phone ?? null,
    customer_email: baseQuote.customer_email ?? null,
    share_token: null,
    accepted_at: null,
    accepted_payment_method: null,
    base_quote_id: baseQuote.id,
    quote_scope: 'occurrence_variant',
    quote_version: version,
  }
}

// Convert repeat type to RRULE string
function repeatTypeToRRule(repeatType: RepeatType): string | null {
  switch (repeatType) {
    case 'weekly':
      return 'FREQ=WEEKLY;INTERVAL=1'
    case 'fortnightly':
      return 'FREQ=WEEKLY;INTERVAL=2'
    case '3-weekly':
      return 'FREQ=WEEKLY;INTERVAL=3'
    case 'monthly':
      return 'FREQ=MONTHLY;INTERVAL=1'
    case '2-monthly':
      return 'FREQ=MONTHLY;INTERVAL=2'
    case 'none':
    default:
      return null
  }
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function addMonthsPreservingDay(date: Date, months: number, anchorDay: number) {
  const next = new Date(date)
  const targetMonthIndex = next.getMonth() + months
  const targetYear = next.getFullYear() + Math.floor(targetMonthIndex / 12)
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12
  const targetDay = Math.min(anchorDay, getDaysInMonth(targetYear, normalizedMonth))
  next.setFullYear(targetYear, normalizedMonth, targetDay)
  return next
}

// Generate occurrence dates from an RRULE
function generateOccurrences(
  startDate: Date,
  rrule: string | null,
  untilDate: Date | null,
  maxCount: number
): Date[] {
  const dates: Date[] = [new Date(startDate)]

  if (!rrule) {
    return dates // One-time booking
  }

  // Parse the RRULE
  const parts: Record<string, string> = {}
  rrule.split(';').forEach(part => {
    const [key, value] = part.split('=')
    if (key && value) parts[key] = value
  })

  const freq = parts['FREQ']
  const interval = parseInt(parts['INTERVAL'] || '1', 10)

  let currentDate = new Date(startDate)
  const anchorDay = startDate.getDate()
  const endDate = untilDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000) // Default: 1 year

  while (dates.length < maxCount) {
    // Advance to next occurrence
    if (freq === 'WEEKLY') {
      currentDate = new Date(currentDate.getTime() + interval * 7 * 24 * 60 * 60 * 1000)
    } else if (freq === 'MONTHLY') {
      currentDate = addMonthsPreservingDay(currentDate, interval, anchorDay)
    } else {
      break // Unknown frequency
    }

    // Check if we've passed the end date
    if (currentDate > endDate) {
      break
    }

    dates.push(new Date(currentDate))
  }

  return dates
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
  const { orgId, supabaseAdmin, org } = await resolveOrgFromRequest(req)
  const resendConfig = await getOrgIntegration(supabaseAdmin, orgId, 'resend')
  const resendApiKey = resendConfig.api_key || ''
  const jobWonNotifyEmail = resendConfig.job_won_notify_email || (org.business_email as string) || ''
  const jobWonEmailFrom = resendConfig.from_email || 'notifications@example.com'
  const jobWonEmailReplyTo = resendConfig.reply_to || ''
  const jobWonAdminUrl = (org.admin_dashboard_url as string) || ''
  const bookingCustomerEmailFrom = resendConfig.booking_confirmation_from || jobWonEmailFrom
  const bookingCustomerReplyTo = resendConfig.booking_confirmation_reply_to || ''
  const businessName = (org.business_name as string) || 'Cleaning Service'
  const businessEmail = (org.business_email as string) || ''
  const businessPhone = (org.business_phone as string) || ''

  const supabase = supabaseAdmin

  let payload: CreateBookingPayload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  // Validate required fields
  if (!payload.leadId) {
    return jsonResponse({ error: 'leadId is required' }, 400)
  }
  if (!payload.quoteId) {
    return jsonResponse({ error: 'quoteId is required' }, 400)
  }
  if (!payload.startsAt) {
    return jsonResponse({ error: 'startsAt is required' }, 400)
  }

  const startDate = new Date(payload.startsAt)
  if (isNaN(startDate.getTime())) {
    return jsonResponse({ error: 'startsAt must be a valid ISO date' }, 400)
  }

  const durationMinutes = payload.durationMinutes || 120
  const repeatType = payload.repeatType || 'none'
  const rrule = repeatTypeToRRule(repeatType)
  const timezone = payload.timezone || 'Australia/Sydney'
  const title = payload.title || 'Regular clean'
  const notes = payload.notes || null
  const updateLeadStatus = payload.updateLeadStatus !== false

  // Parse until date if provided
  let untilDate: Date | null = null
  if (payload.untilDate) {
    untilDate = new Date(payload.untilDate)
    if (isNaN(untilDate.getTime())) {
      return jsonResponse({ error: 'untilDate must be a valid ISO date' }, 400)
    }
  }

  // Max occurrences to generate (default 52 for a year of weekly, or use provided count)
  const maxOccurrences = payload.occurrenceCount || (rrule ? 52 : 1)

  try {
    const planConfig = getPlanConfig(org.plan)

    // 1. Verify the lead exists
    const { data: lead, error: leadError } = await supabase
      .from('extracted_leads')
      .select('id, name, email, phone_number')
      .eq('id', payload.leadId)
      .single()

    if (leadError || !lead) {
      return jsonResponse({ error: 'Lead not found' }, 404)
    }

    // 2. Resolve the base quote for this series
    const { error: quoteError, quote: baseQuote } = await resolveBaseQuote(supabase, payload.quoteId, payload.leadId)
    if (quoteError || !baseQuote) {
      return jsonResponse({ error: quoteError || 'Quote not found or does not belong to this lead' }, 404)
    }

    // Pre-calc occurrences so we can enforce plan limits before any inserts
    const occurrenceDates = generateOccurrences(startDate, rrule, untilDate, maxOccurrences)

    if (payload.testOnly !== true && planConfig.monthlyJobLimit !== null) {
      const { start, end } = getUtcMonthBounds(new Date())
      const { count, error: usageError } = await supabase
        .from('booking_occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())

      if (usageError) {
        console.error('Error checking monthly usage:', usageError)
        return jsonResponse({ error: 'Unable to verify plan limits. Please try again.' }, 500)
      }

      const used = count ?? 0
      const projected = used + occurrenceDates.length

      if (projected > planConfig.monthlyJobLimit) {
        return jsonResponse(
          {
            error: 'plan_limit_reached',
            message: `Your ${planConfig.label} plan allows ${planConfig.monthlyJobLimit} scheduled jobs per month. You have ${used} already and tried to add ${occurrenceDates.length}.`,
            limit: planConfig.monthlyJobLimit,
            used,
            requested: occurrenceDates.length,
            plan: planConfig.id,
          },
          402
        )
      }
    }

    if (payload.testOnly === true) {
      const seriesPreview = {
        title,
        timezone,
        until_date: untilDate ? untilDate.toISOString().split('T')[0] : null,
      }

      const sendResult = await sendJobWonEmail({
        lead,
        baseQuote,
        series: seriesPreview,
        occurrenceDates,
        durationMinutes,
        repeatType,
        timezone,
        bookingNotes: notes,
        toOverride: payload.testEmailTo || null,
        resendApiKey,
        jobWonNotifyEmail,
        jobWonEmailFrom,
        jobWonEmailReplyTo,
        jobWonAdminUrl,
        businessName,
      })

      return jsonResponse({ success: true, test_only: true, send_result: sendResult })
    }

    // Extract address fields from base quote
    const quoteAddress = baseQuote.address || null
    const quoteLat = typeof baseQuote.address_lat === 'number' ? baseQuote.address_lat : null
    const quoteLng = typeof baseQuote.address_lng === 'number' ? baseQuote.address_lng : null

    // 3. Create the booking series with synced address from base quote
    const { data: series, error: seriesError } = await supabase
      .from('booking_series')
      .insert({
        lead_id: payload.leadId,
        quote_id: baseQuote.id,
        title,
        timezone,
        starts_at: startDate.toISOString(),
        duration_minutes: durationMinutes,
        rrule,
        until_date: untilDate ? untilDate.toISOString().split('T')[0] : null,
        occurrence_count: payload.occurrenceCount || null,
        notes,
        status: 'active',
        service_address: quoteAddress,
        service_lat: quoteLat,
        service_lng: quoteLng,
        org_id: orgId,
      })
      .select()
      .single()

    if (seriesError || !series) {
      console.error('Error creating booking series:', seriesError)
      return jsonResponse({ error: seriesError?.message || 'Failed to create booking series' }, 500)
    }

    // 4. Create quote variants for each occurrence (receipt + adjustable pricing)
    const startingVersion = await getNextQuoteVersion(supabase, baseQuote.id)
    const variantPayloads = occurrenceDates.map((_, index) =>
      buildVariantPayload(baseQuote, startingVersion + index)
    )

    const { data: variants, error: variantsError } = await supabase
      .from('quotes')
      .insert(variantPayloads)
      .select('id, quote_version')

    if (variantsError || !variants || variants.length !== occurrenceDates.length) {
      console.error('Error creating quote variants:', variantsError)
      await supabase.from('booking_series').delete().eq('id', series.id)
      return jsonResponse({ error: variantsError?.message || 'Failed to create quote variants' }, 500)
    }

    const variantIds = variants.map((v: any) => v.id)

    // 5. Create occurrence records linked to their variant quotes
    const occurrenceRecords = occurrenceDates.map((date, index) => {
      const endDate = new Date(date.getTime() + durationMinutes * 60 * 1000)
      return {
        org_id: orgId,
        series_id: series.id,
        start_at: date.toISOString(),
        end_at: endDate.toISOString(),
        status: 'scheduled',
        quote_id: variantIds[index],
      }
    })

    const { data: occurrences, error: occurrencesError } = await supabase
      .from('booking_occurrences')
      .insert(occurrenceRecords)
      .select()

    if (occurrencesError) {
      console.error('Error creating occurrences:', occurrencesError)
      // Roll back the series and variants so we don't return a "success" without any occurrences
      const { error: rollbackError } = await supabase.from('booking_series').delete().eq('id', series.id)
      if (rollbackError) {
        console.error('Failed to rollback series after occurrence error:', rollbackError)
      }
      await supabase.from('quotes').delete().in('id', variantIds)
      return jsonResponse(
        {
          error: 'Failed to create booking occurrences',
          details: occurrencesError.message || occurrencesError,
        },
        500
      )
    }

    // 5. Update lead status to "Job Won" if requested
    if (updateLeadStatus) {
      const { error: statusError } = await supabase
        .from('extracted_leads')
        .update({ status: 'Job Won' })
        .eq('id', payload.leadId)

      if (statusError) {
        console.error('Error updating lead status:', statusError)
        // Don't fail - booking was created successfully
      }
    }

    await sendJobWonEmail({
      lead,
      baseQuote,
      series,
      occurrenceDates,
      durationMinutes,
      repeatType,
      timezone,
      bookingNotes: notes,
      resendApiKey,
      jobWonNotifyEmail,
      jobWonEmailFrom,
      jobWonEmailReplyTo,
      jobWonAdminUrl,
      businessName,
    })

    await sendCustomerBookingConfirmationEmail({
      lead,
      baseQuote,
      series,
      occurrenceDates,
      durationMinutes,
      timezone,
      bookingNotes: notes,
      resendApiKey,
      bookingCustomerEmailFrom,
      bookingCustomerReplyTo,
      businessName,
      businessEmail,
      businessPhone,
    })

    return jsonResponse({
      success: true,
      series: {
        id: series.id,
        lead_id: series.lead_id,
        title: series.title,
        starts_at: series.starts_at,
        duration_minutes: series.duration_minutes,
        rrule: series.rrule,
        status: series.status,
      },
      occurrences_created: occurrences?.length || occurrenceDates.length,
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return jsonError(message, 500)
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})
















