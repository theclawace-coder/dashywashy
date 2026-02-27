import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''

const receiptEmailFrom =
  Deno.env.get('RECEIPT_EMAIL_FROM') ||
  Deno.env.get('COMPLETION_EMAIL_FROM') ||
  Deno.env.get('BOOKING_CONFIRMATION_EMAIL_FROM') ||
  Deno.env.get('JOB_WON_EMAIL_FROM') ||
  'notifications@sydneypremiumcleaning.com.au'
const receiptEmailReplyTo =
  Deno.env.get('RECEIPT_EMAIL_REPLY_TO') ||
  Deno.env.get('COMPLETION_EMAIL_REPLY_TO') ||
  Deno.env.get('BOOKING_CONFIRMATION_REPLY_TO') ||
  'sales@sydneypremiumcleaning.com.au'

const businessName = Deno.env.get('BUSINESS_NAME') || 'Sydney Premium Cleaning'
const businessLegalName = Deno.env.get('BUSINESS_LEGAL_NAME') || ''
const businessOperatingName =
  Deno.env.get('BUSINESS_OPERATING_NAME') || 'SYDNEY PREMIUM CLEANING AU'
const businessEmail = Deno.env.get('BUSINESS_EMAIL') || 'sales@sydneypremiumcleaning.com.au'
const businessPhone = Deno.env.get('BUSINESS_PHONE') || '0426413984'
const businessAbn = Deno.env.get('BUSINESS_ABN') || '95 675 300 875'
const businessAddress = Deno.env.get('BUSINESS_ADDRESS') || '—'

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

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}

function formatCurrencyFromCents(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return formatCurrency(value / 100)
}

function formatDateTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    dateStyle: 'full',
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

function getSiteUrl(): string {
  return (
    Deno.env.get('SITE_URL') ||
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('APP_URL') ||
    ''
  )
}

function buildPublicQuoteUrl(shareToken: string): string | null {
  const siteUrl = getSiteUrl()
  if (!siteUrl) return null

  try {
    const base = new URL(siteUrl)
    const url = new URL('/quote', `${base.protocol}//${base.host}`)
    url.searchParams.set('quote', shareToken)
    return url.toString()
  } catch {
    return null
  }
}

async function sendReceiptEmail(params: {
  to: string
  receiptNumber: string
  issueDate: string
  customerName: string
  customerEmail: string
  serviceLabel: string
  serviceDate: string
  serviceAddress: string
  addonsLabel: string
  subtotalLabel: string
  discountLabel: string
  gstLabel: string
  totalLabel: string
  paidAmountLabel: string
  paymentMethod: string
  shareUrl?: string | null
  businessName?: string
  businessLegalName?: string
  businessOperatingName?: string
  businessEmail?: string
  businessPhone?: string
  businessAbn?: string
}) {
  const {
    to,
    receiptNumber,
    issueDate,
    customerName,
    customerEmail,
    serviceLabel,
    serviceDate,
    serviceAddress,
    addonsLabel,
    subtotalLabel,
    discountLabel,
    gstLabel,
    totalLabel,
    paidAmountLabel,
    paymentMethod,
    shareUrl,
    businessName: businessNameParam,
    businessLegalName: businessLegalNameParam,
    businessOperatingName: businessOperatingNameParam,
    businessEmail: businessEmailParam,
    businessPhone: businessPhoneParam,
    businessAbn: businessAbnParam,
  } = params

  const resolvedBusinessName = businessNameParam || businessName
  const resolvedBusinessLegalName = businessLegalNameParam || businessLegalName
  const resolvedBusinessOperatingName = businessOperatingNameParam || businessOperatingName
  const resolvedBusinessEmail = businessEmailParam || businessEmail
  const resolvedBusinessPhone = businessPhoneParam || businessPhone
  const resolvedBusinessAbn = businessAbnParam || businessAbn
  const subject = `Receipt — ${resolvedBusinessName}`

  const text = [
    `Tax Invoice / Receipt`,
    ``,
    `${resolvedBusinessName}`,
    ...(resolvedBusinessLegalName ? [`Legal name: ${resolvedBusinessLegalName}`] : []),
    `Operating as business name: ${resolvedBusinessOperatingName}`,
    `ABN: ${resolvedBusinessAbn}`,
    `Email: ${resolvedBusinessEmail}`,
    `Phone: ${resolvedBusinessPhone}`,
    ``,
    `Receipt number: ${receiptNumber}`,
    `Issue date: ${issueDate}`,
    `Payment method: ${paymentMethod}`,
    ``,
    `Bill to: ${customerName}${customerEmail ? ` <${customerEmail}>` : ''}`,
    ``,
    `Service: ${serviceLabel}`,
    `Service date: ${serviceDate}`,
    `Service address: ${serviceAddress}`,
    `Add-ons: ${addonsLabel}`,
    ``,
    `Subtotal: ${subtotalLabel}`,
    `Discount: ${discountLabel}`,
    `GST (10%): ${gstLabel}`,
    `Total (inc GST): ${totalLabel}`,
    `Paid: ${paidAmountLabel}`,
    ...(shareUrl ? [``, `View & Pay Online: ${shareUrl}`] : []),
    ``,
    `Thank you for your business.`,
  ].join('\n')

  const html = `
    <div style="background:#f5f7fb;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#111827;color:#ffffff;padding:20px 24px;">
          <h1 style="margin:0;font-size:20px;">Tax Invoice / Receipt</h1>
          <p style="margin:6px 0 0;font-size:14px;">${resolvedBusinessName}</p>
        </div>

        <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#0f172a;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
            ${
              resolvedBusinessLegalName
                ? `<tr>
                    <td style="padding:4px 0;color:#64748b;width:160px;">Legal name</td>
                    <td style="padding:4px 0;">${resolvedBusinessLegalName}</td>
                  </tr>`
                : ''
            }
            <tr>
              <td style="padding:4px 0;color:#64748b;width:160px;">Operating as</td>
              <td style="padding:4px 0;">${resolvedBusinessOperatingName}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;width:160px;">ABN</td>
              <td style="padding:4px 0;">${resolvedBusinessAbn}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;">Email</td>
              <td style="padding:4px 0;">${resolvedBusinessEmail}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#64748b;">Phone</td>
              <td style="padding:4px 0;">${resolvedBusinessPhone}</td>
            </tr>
          </table>

          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
            <div style="flex:1 1 200px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Receipt</div>
              <div style="margin-top:6px;">No. ${receiptNumber}</div>
              <div style="margin-top:4px;color:#64748b;">Issued ${issueDate}</div>
              <div style="margin-top:4px;color:#64748b;">Payment method: ${paymentMethod}</div>
            </div>
            <div style="flex:1 1 200px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">Bill to</div>
              <div style="margin-top:6px;">${customerName}</div>
              ${customerEmail ? `<div style="margin-top:4px;color:#64748b;">${customerEmail}</div>` : ''}
            </div>
          </div>

          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:6px 0;color:#64748b;width:160px;">Service</td>
                <td style="padding:6px 0;">${serviceLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Service date</td>
                <td style="padding:6px 0;">${serviceDate}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Service address</td>
                <td style="padding:6px 0;">${serviceAddress}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Add-ons</td>
                <td style="padding:6px 0;">${addonsLabel}</td>
              </tr>
            </table>
          </div>

          <div style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:4px 0;color:#64748b;">Subtotal</td>
                <td style="padding:4px 0;text-align:right;">${subtotalLabel}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#64748b;">Discount</td>
                <td style="padding:4px 0;text-align:right;">${discountLabel}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#64748b;">GST (10%)</td>
                <td style="padding:4px 0;text-align:right;">${gstLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-weight:600;">Total (inc GST)</td>
                <td style="padding:6px 0;text-align:right;font-weight:600;">${totalLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#0f172a;font-weight:600;">Paid</td>
                <td style="padding:6px 0;text-align:right;color:#0f172a;font-weight:600;">${paidAmountLabel}</td>
              </tr>
            </table>
          </div>

          ${
            shareUrl
              ? `<div style="margin:18px 0 0;">
                  <a href="${shareUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600;">
                    View &amp; Pay Online
                  </a>
                </div>`
              : ''
          }

          <p style="margin:16px 0 0;color:#64748b;font-size:12px;">
            GST included where applicable. Keep this receipt for your records.
          </p>
        </div>

        <div style="background:#f8fafc;padding:12px 24px;font-size:12px;color:#94a3b8;">
          This is an automated receipt. If anything looks incorrect, reply to this email.
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
      from: receiptEmailFrom,
      to: [to],
      subject,
      text,
      html,
      ...(receiptEmailReplyTo ? { reply_to: receiptEmailReplyTo } : {}),
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

  if (!resendApiKey || !receiptEmailFrom) {
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
    start_at,
    status,
    payment_status,
    payment_paid_at,
    payment_amount_cents,
    payment_notes,
    quote_id,
    booking_series ( id, lead_id, title, timezone, service_address ),
    quotes ( id, quote_number, customer_name, customer_email, customer_phone, service, addons, custom_addons, address, subtotal, discount_amount, gst, total_inc_gst, share_token )
  `

  const { data: occurrence, error: occurrenceError } = payload.occurrenceId
    ? await supabase.from('booking_occurrences').select(occurrenceSelect).eq('id', payload.occurrenceId).maybeSingle()
    : await supabase
        .from('booking_occurrences')
        .select(occurrenceSelect)
        .eq('payment_status', 'paid')
        .order('payment_paid_at', { ascending: false })
        .limit(1)
        .maybeSingle()

  if (occurrenceError || !occurrence) {
    return jsonResponse({ error: 'Occurrence not found' }, 404)
  }

  const occurrenceOrgId = (occurrence as any).org_id || null
  let orgRow: any = null
  if (occurrenceOrgId) {
    const { data } = await supabase
      .from('organizations')
      .select('use_workflow_automations, business_name, business_legal_name, business_operating_name, business_email, business_phone, business_abn, business_address')
      .eq('id', occurrenceOrgId)
      .maybeSingle()
    orgRow = data
    if (orgRow?.use_workflow_automations) {
      return jsonResponse({ success: true, skipped: 'workflow_automations_enabled' })
    }
  }

  if (occurrence.payment_status !== 'paid' && !payload.testOnly) {
    return jsonResponse({ skipped: true, reason: 'occurrence_not_paid' })
  }

  const occurrenceId = occurrence.id
  const { data: existingLog } = await supabase
    .from('booking_occurrence_receipt_emails')
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
  const serviceDate = startAt ? formatDateTime(startAt, timezone) : '—'

  const customerName = quote?.customer_name || lead?.name || 'Client'
  const customerEmail = quote?.customer_email || lead?.email || ''
  const serviceLabel = quote?.service || series?.title || 'cleaning service'
  const serviceAddress = quote?.address || series?.service_address || '—'
  const addonsLabel = normalizeList(quote?.addons || quote?.custom_addons || [])

  const paidAmountLabel =
    typeof occurrence.payment_amount_cents === 'number'
      ? formatCurrencyFromCents(occurrence.payment_amount_cents)
      : formatCurrency(quote?.total_inc_gst ?? null)

  const totalLabel = formatCurrency(quote?.total_inc_gst ?? null)
  const subtotalLabel = formatCurrency(quote?.subtotal ?? null)
  const discountLabel = formatCurrency(quote?.discount_amount ?? null)
  const gstLabel = formatCurrency(quote?.gst ?? null)

  const paidAt = occurrence.payment_paid_at ? new Date(occurrence.payment_paid_at) : new Date()
  const issueDate = formatDateTime(paidAt, timezone)
  const receiptNumber = quote?.quote_number ? `${quote.quote_number}-R` : occurrence.id
  const paymentMethod = occurrence.payment_notes || 'Paid'
  const shareUrl = quote?.share_token ? buildPublicQuoteUrl(String(quote.share_token)) : null

  const orgBusinessName = (orgRow?.business_name as string) || businessName
  const orgBusinessLegalName = (orgRow?.business_legal_name as string) || businessLegalName
  const orgBusinessOperatingName = (orgRow?.business_operating_name as string) || businessOperatingName
  const orgBusinessEmail = (orgRow?.business_email as string) || businessEmail
  const orgBusinessPhone = (orgRow?.business_phone as string) || businessPhone
  const orgBusinessAbn = (orgRow?.business_abn as string) || businessAbn

  const targetEmail = payload.testOnly ? payload.testEmailTo || '' : customerEmail
  if (!targetEmail) {
    return jsonResponse({ error: 'Missing customer email' }, 400)
  }

  await sendReceiptEmail({
    to: targetEmail,
    receiptNumber,
    issueDate,
    customerName,
    customerEmail,
    serviceLabel,
    serviceDate,
    serviceAddress,
    addonsLabel,
    subtotalLabel,
    discountLabel,
    gstLabel,
    totalLabel,
    paidAmountLabel,
    paymentMethod,
    shareUrl,
    businessName: orgBusinessName,
    businessLegalName: orgBusinessLegalName,
    businessOperatingName: orgBusinessOperatingName,
    businessEmail: orgBusinessEmail,
    businessPhone: orgBusinessPhone,
    businessAbn: orgBusinessAbn,
  })

  if (!payload.testOnly) {
    const { error: logError } = await supabase.from('booking_occurrence_receipt_emails').insert({
      occurrence_id: occurrenceId,
      email_to: targetEmail,
      payload: {
        series_id: series?.id || null,
        quote_id: occurrence.quote_id || null,
        start_at: occurrence.start_at || null,
        lead_id: series?.lead_id || null,
        payment_paid_at: occurrence.payment_paid_at || null,
        payment_amount_cents: occurrence.payment_amount_cents ?? null,
      },
    })

    if (logError) {
      console.error('Failed to record receipt email log:', logError)
    }
  }

  return jsonResponse({ success: true, test_only: payload.testOnly === true, email_to: targetEmail })
})
