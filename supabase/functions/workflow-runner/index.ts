/**
 * workflow-runner - Scheduled function that processes due workflow runs.
 *
 * Called periodically (every 1-5 minutes) to:
 * 1. Fetch active workflow runs where next_execute_at <= now
 * 2. Lock and process each run
 * 3. Execute the current step's action
 * 4. Advance to next step or complete the run
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface WorkflowRun {
  id: string
  org_id: string
  workflow_id: string
  entity_type: string
  entity_id: string
  status: string
  current_step: number
  next_execute_at: string
  metadata: Record<string, unknown>
}

interface WorkflowStep {
  id: string
  step_order: number
  action_type: string
  action_config: Record<string, unknown>
}

interface Workflow {
  id: string
  name: string
  enabled: boolean
  trigger_type?: string
  trigger_config?: Record<string, unknown>
  steps: WorkflowStep[]
}

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone_number: string | null
  status: string | null
}

interface Organization {
  id: string
  name: string
  business_name: string | null
  business_email?: string | null
  business_phone?: string | null
  business_abn?: string | null
  business_operating_name?: string | null
  timezone?: string | null
}

interface BookingContext {
  id: string
  series_id?: string | null
  lead_id?: string | null
  quote_id?: string | null
  start_at: string | null
  end_at: string | null
  timezone: string | null
  title: string | null
  status?: string | null
  notes?: string | null
  payment_status?: string | null
  payment_paid_at?: string | null
  payment_amount_cents?: number | null
  payment_link?: string | null
  service_address?: string | null
}

interface QuoteContext {
  id: string
  quote_number: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  service: string | null
  addons: unknown
  custom_addons: unknown
  address: string | null
  subtotal: number | null
  discount_amount: number | null
  gst: number | null
  total_inc_gst: number | null
  deposit_amount: number | null
  remaining_balance: number | null
  share_token?: string | null
  cleaner_pay?: number | null
}

interface CleanerContext {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
}

interface SummaryContext {
  summary_date: string
  timezone: string
  metrics: {
    salesCount: number
    salesTotal: number
    projectedProfit: number
    repeatClientCount: number
    outboundCalls: number
    inboundCalls: number
    leadsCount: number
    quotesCount: number
    cleansTodayCount: number
  }
  salesLines: string[]
  cleanLines: string[]
}

const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
const workflowEmailFrom =
  Deno.env.get('WORKFLOW_EMAIL_FROM') ||
  Deno.env.get('MARKETING_EMAIL_FROM') ||
  Deno.env.get('QUOTE_EMAIL_FROM') ||
  'notifications@sydneypremiumcleaning.com.au'
const workflowEmailReplyTo =
  Deno.env.get('WORKFLOW_EMAIL_REPLY_TO') ||
  Deno.env.get('MARKETING_EMAIL_REPLY_TO') ||
  ''

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}

function formatCurrencyFromCents(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  return formatCurrency(value / 100)
}

function normalizeList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return ''
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
    'http://localhost:5173'
  )
}

function buildQuoteShareUrl(shareToken: string): string {
  const base = getSiteUrl()
  try {
    const url = new URL(base)
    url.searchParams.set('quote', shareToken)
    return url.toString()
  } catch {
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
    return `${trimmed}?quote=${shareToken}`
  }
}

function getReviewLink(): string {
  return (
    Deno.env.get('GOOGLE_REVIEW_URL') ||
    Deno.env.get('REVIEW_URL') ||
    'https://g.page/r/CleaningReview'
  )
}

function formatDateInTimezone(date: Date, timezone: string, type: 'date' | 'time' | 'datetime') {
  if (type === 'time') {
    return new Intl.DateTimeFormat('en-AU', { timeZone: timezone, timeStyle: 'short' }).format(date)
  }
  if (type === 'datetime') {
    return new Intl.DateTimeFormat('en-AU', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(date)
  }
  return new Intl.DateTimeFormat('en-AU', { timeZone: timezone, dateStyle: 'medium' }).format(date)
}

/**
 * Personalize a template string with entity and org data
 */
function personalize(
  template: string,
  lead: Lead | null,
  org: Organization | null,
  booking: BookingContext | null,
  quote: QuoteContext | null,
  cleaner: CleanerContext | null,
  summary: SummaryContext | null
): string {
  const tz = booking?.timezone || (org as any)?.timezone || 'Australia/Sydney'
  const bookingStart = booking?.start_at ? new Date(booking.start_at) : null
  const bookingEnd = booking?.end_at ? new Date(booking.end_at) : null

  const bookingDate = bookingStart ? formatDateInTimezone(bookingStart, tz, 'date') : ''
  const bookingTime = bookingStart ? formatDateInTimezone(bookingStart, tz, 'time') : ''
  const bookingDateTime = bookingStart ? formatDateInTimezone(bookingStart, tz, 'datetime') : ''
  const bookingEndDateTime = bookingEnd ? formatDateInTimezone(bookingEnd, tz, 'datetime') : ''

  const quoteShare = quote?.share_token ? buildQuoteShareUrl(quote.share_token) : ''
  const receiptNumber = quote?.quote_number ? `${quote.quote_number}-R` : ''

  const replacements: Record<string, string> = {
    name: lead?.name || 'there',
    first_name: (lead?.name || 'there').split(' ')[0],
    email: lead?.email || '',
    phone: lead?.phone_number || '',
    lead_name: lead?.name || '',
    lead_email: lead?.email || '',
    lead_phone: lead?.phone_number || '',
    lead_number: lead?.phone_number || '',
    business_name: (org as any)?.business_name || (org as any)?.name || '',
    org_name: (org as any)?.name || '',
    org_business_name: (org as any)?.business_name || '',
    org_email: (org as any)?.business_email || '',
    org_phone: (org as any)?.business_phone || '',
    org_abn: (org as any)?.business_abn || '',
    org_operating_name: (org as any)?.business_operating_name || '',
    booking_date: bookingDate,
    booking_time: bookingTime,
    booking_datetime: bookingDateTime,
    booking_end: bookingEndDateTime,
    booking_status: booking?.status || '',
    booking_notes: booking?.notes || '',
    booking_address: booking?.service_address || '',
    booking_title: booking?.title || '',
    service_title: booking?.title || quote?.service || '',
    quote_number: quote?.quote_number || '',
    quote_total: formatCurrency(quote?.total_inc_gst ?? null),
    quote_subtotal: formatCurrency(quote?.subtotal ?? null),
    quote_discount: formatCurrency(quote?.discount_amount ?? null),
    quote_gst: formatCurrency(quote?.gst ?? null),
    quote_deposit: formatCurrency(quote?.deposit_amount ?? null),
    quote_remaining: formatCurrency(quote?.remaining_balance ?? null),
    quote_service: quote?.service || '',
    quote_address: quote?.address || booking?.service_address || '',
    quote_addons: normalizeList(quote?.addons || quote?.custom_addons),
    quote_share_link: quoteShare,
    payment_status: booking?.payment_status || '',
    payment_paid_at: booking?.payment_paid_at || '',
    payment_amount: booking?.payment_amount_cents
      ? formatCurrencyFromCents(booking?.payment_amount_cents)
      : formatCurrency(quote?.total_inc_gst ?? null),
    payment_link: booking?.payment_link || '',
    receipt_number: receiptNumber,
    payment_method: booking?.payment_paid_at ? 'Paid' : '',
    cleaner_name: cleaner?.full_name || '',
    cleaner_phone: cleaner?.phone || '',
    cleaner_email: cleaner?.email || '',
    review_link: getReviewLink(),
    amount: formatCurrency(quote?.total_inc_gst ?? null),
    summary_date: summary?.summary_date || '',
    summary_sales_count: summary ? String(summary.metrics.salesCount) : '',
    summary_sales_total: summary ? formatCurrency(summary.metrics.salesTotal) : '',
    summary_projected_profit: summary ? formatCurrency(summary.metrics.projectedProfit) : '',
    summary_repeat_clients: summary ? String(summary.metrics.repeatClientCount) : '',
    summary_outbound_calls: summary ? String(summary.metrics.outboundCalls) : '',
    summary_inbound_calls: summary ? String(summary.metrics.inboundCalls) : '',
    summary_leads_count: summary ? String(summary.metrics.leadsCount) : '',
    summary_quotes_count: summary ? String(summary.metrics.quotesCount) : '',
    summary_cleans_count: summary ? String(summary.metrics.cleansTodayCount) : '',
    summary_sales_lines: summary ? summary.salesLines.join('\n') : '',
    summary_clean_lines: summary ? summary.cleanLines.join('\n') : '',
  }

  let result = template
  for (const [key, value] of Object.entries(replacements)) {
    const re = new RegExp(`{{\\s*${key}\\s*}}`, 'gi')
    result = result.replace(re, value ?? '')
  }
  return result
}

/**
 * Calculate delay in milliseconds for a wait action
 */
function calculateDelayMs(config: Record<string, unknown>): number {
  const delayValue = (config.delay_value as number) || 0
  const delayUnit = (config.delay_unit as string) || 'days'

  switch (delayUnit) {
    case 'minutes':
      return delayValue * 60 * 1000
    case 'hours':
      return delayValue * 60 * 60 * 1000
    case 'days':
      return delayValue * 24 * 60 * 60 * 1000
    default:
      return delayValue * 24 * 60 * 60 * 1000
  }
}

function getLocalDateInfo(timezone: string, baseDate = new Date()) {
  const localNow = new Date(baseDate.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = baseDate.getTime() - localNow.getTime()
  const startLocal = new Date(localNow)
  startLocal.setHours(0, 0, 0, 0)
  const endLocal = new Date(localNow)
  endLocal.setHours(23, 59, 59, 999)
  const startUtc = new Date(startLocal.getTime() + offsetMs)
  const endUtc = new Date(endLocal.getTime() + offsetMs)
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(baseDate)
  return { localNow, startUtc, endUtc, localDate, offsetMs }
}

function getScheduledTimeUtc(timezone: string, timeValue: string, now = new Date()) {
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = now.getTime() - localNow.getTime()
  const [hoursStr, minutesStr] = timeValue.split(':')
  const hours = Number(hoursStr || 0)
  const minutes = Number(minutesStr || 0)
  const localTarget = new Date(localNow)
  localTarget.setHours(hours, minutes, 0, 0)
  return new Date(localTarget.getTime() + offsetMs)
}

async function buildDailySummary(
  supabase: SupabaseClient,
  orgId: string,
  timezone: string,
  summaryDate?: string
): Promise<SummaryContext> {
  const targetDate = summaryDate ? new Date(`${summaryDate}T12:00:00`) : new Date()
  const { startUtc, endUtc, localDate } = getLocalDateInfo(timezone, targetDate)

  const startIso = startUtc.toISOString()
  const endIso = endUtc.toISOString()

  const { data: bookingSeries, error: bookingSeriesError } = await supabase
    .from('booking_series')
    .select('id, lead_id, quote_id, rrule, title, starts_at, timezone, created_at, org_id')
    .eq('org_id', orgId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (bookingSeriesError) {
    throw bookingSeriesError
  }

  const salesCount = (bookingSeries || []).length
  const repeatClientCount = (bookingSeries || []).filter((series) => Boolean(series.rrule)).length

  const quoteIds = (bookingSeries || [])
    .map((series: any) => series.quote_id)
    .filter((id: string | null) => Boolean(id))

  let salesTotal = 0
  let projectedProfit = 0

  if (quoteIds.length > 0) {
    const { data: seriesQuotes, error: seriesQuotesError } = await supabase
      .from('quotes')
      .select('id, total_inc_gst, cleaner_pay')
      .eq('org_id', orgId)
      .in('id', quoteIds)

    if (seriesQuotesError) throw seriesQuotesError

    salesTotal = (seriesQuotes || []).reduce((sum, quote: any) => sum + (quote.total_inc_gst || 0), 0)
    projectedProfit = (seriesQuotes || []).reduce(
      (sum, quote: any) => sum + ((quote.total_inc_gst || 0) - (quote.cleaner_pay || 0)),
      0
    )
  }

  const { data: calls, error: callsError } = await supabase
    .from('dialpad_calls')
    .select('id, direction, created_at, org_id')
    .eq('org_id', orgId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (callsError) throw callsError

  const outboundCalls = (calls || []).filter((call: any) => call.direction === 'outbound').length
  const inboundCalls = (calls || []).filter((call: any) => call.direction === 'inbound').length

  const { data: leads, error: leadsError } = await supabase
    .from('extracted_leads')
    .select('id, created_at, org_id')
    .eq('org_id', orgId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (leadsError) throw leadsError

  const leadsCount = (leads || []).length

  const { data: quotes, error: quotesError } = await supabase
    .from('quotes')
    .select('id, base_quote_id, created_at, org_id')
    .eq('org_id', orgId)
    .is('base_quote_id', null)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (quotesError) throw quotesError

  const quotesCount = (quotes || []).length

  const { data: occurrences, error: occurrencesError } = await supabase
    .from('booking_occurrences')
    .select('id, series_id, start_at, cleaner_id, org_id')
    .eq('org_id', orgId)
    .gte('start_at', startIso)
    .lte('start_at', endIso)

  if (occurrencesError) throw occurrencesError

  const cleansTodayCount = (occurrences || []).length

  const leadIds = (bookingSeries || [])
    .map((series: any) => series.lead_id)
    .filter((id: string | null) => Boolean(id))

  const cleanerIds = (occurrences || [])
    .map((occ: any) => occ.cleaner_id)
    .filter((id: string | null) => Boolean(id))

  const [leadResult, cleanerResult, quoteResult] = await Promise.all([
    leadIds.length
      ? supabase.from('extracted_leads').select('id, name').in('id', leadIds)
      : Promise.resolve({ data: [], error: null }),
    cleanerIds.length
      ? supabase.from('cleaners').select('id, full_name').in('id', cleanerIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length
      ? supabase
          .from('quotes')
          .select('id, service, bedrooms, bathrooms, addons, custom_addons, total_inc_gst, cleaner_pay')
          .in('id', quoteIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (leadResult.error) throw leadResult.error
  if (cleanerResult.error) throw cleanerResult.error
  if (quoteResult.error) throw quoteResult.error

  const leadsById = new Map((leadResult.data || []).map((lead: any) => [lead.id, lead]))
  const cleanersById = new Map((cleanerResult.data || []).map((cleaner: any) => [cleaner.id, cleaner]))
  const quotesById = new Map((quoteResult.data || []).map((quote: any) => [quote.id, quote]))

  const salesLines = (bookingSeries || []).map((series: any) => {
    const lead = series.lead_id ? leadsById.get(series.lead_id) : null
    const quote = series.quote_id ? quotesById.get(series.quote_id) : null
    const tz = series.timezone || timezone
    const startsAt = series.starts_at ? new Date(series.starts_at) : null
    const scheduledTime = startsAt ? formatDateInTimezone(startsAt, tz, 'time') : '—'
    const scheduledDate = startsAt ? formatDateInTimezone(startsAt, tz, 'date') : '—'
    const serviceLabel = quote?.service || series.title || 'Service'
    const bedBath = `${quote?.bedrooms ?? '—'} Bedroom ${quote?.bathrooms ?? '—'} bath`
    const addons = normalizeList(quote?.addons)
    const price = formatCurrency(quote?.total_inc_gst || 0)
    const cleanerCost = formatCurrency(quote?.cleaner_pay || 0)
    const profit = formatCurrency((quote?.total_inc_gst || 0) - (quote?.cleaner_pay || 0))
    const customerName = lead?.name || 'Unknown'

    return `${customerName} | ${serviceLabel} | ${bedBath} + (${addons}) - ${scheduledTime} | ${scheduledDate} - ${price} - ${cleanerCost} - ${profit}`
  })

  const seriesById = new Map((bookingSeries || []).map((series: any) => [series.id, series]))
  const cleanLines = (occurrences || []).map((occ: any) => {
    const series = seriesById.get(occ.series_id)
    const lead = series?.lead_id ? leadsById.get(series.lead_id) : null
    const cleaner = occ.cleaner_id ? cleanersById.get(occ.cleaner_id) : null
    const tz = series?.timezone || timezone
    const startAt = occ.start_at ? new Date(occ.start_at) : null
    const timeLabel = startAt ? formatDateInTimezone(startAt, tz, 'time') : '—'
    const dateLabel = startAt ? formatDateInTimezone(startAt, tz, 'date') : '—'
    const customerName = lead?.name || 'Unknown'
    const cleanerName = cleaner?.full_name || 'Unassigned'
    return `${customerName} - ${timeLabel} ${dateLabel} - Cleaner - ${cleanerName}`
  })

  return {
    summary_date: localDate,
    timezone,
    metrics: {
      salesCount,
      salesTotal,
      projectedProfit,
      repeatClientCount,
      outboundCalls,
      inboundCalls,
      leadsCount,
      quotesCount,
      cleansTodayCount,
    },
    salesLines,
    cleanLines,
  }
}

async function ensureScheduledRuns(supabase: SupabaseClient, now: Date) {
  const { data: scheduledWorkflows, error } = await supabase
    .from('workflows')
    .select('id, org_id, trigger_type, trigger_config, enabled, steps:workflow_steps(id, step_order)')
    .eq('trigger_type', 'scheduled')
    .eq('enabled', true)

  if (error) {
    console.error('[workflow-runner] Failed to load scheduled workflows:', error)
    return
  }

  const workflows = scheduledWorkflows || []
  if (workflows.length === 0) return

  const orgIds = Array.from(new Set(workflows.map((w: any) => w.org_id).filter(Boolean)))
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, use_workflow_automations, timezone')
    .in('id', orgIds)

  const orgFlags = new Map((orgs || []).map((o: any) => [o.id, o]))

  for (const workflow of workflows as any[]) {
    const orgInfo = orgFlags.get(workflow.org_id)
    if (!orgInfo?.use_workflow_automations) continue
    if (!workflow.steps || workflow.steps.length === 0) continue

    const triggerConfig = (workflow.trigger_config || {}) as Record<string, unknown>
    const timeValue = typeof triggerConfig.time === 'string' ? triggerConfig.time : '18:00'
    const timezone = (triggerConfig.timezone as string) || orgInfo.timezone || 'Australia/Sydney'
    const scheduledTime = getScheduledTimeUtc(timezone, timeValue, now)
    const { localDate } = getLocalDateInfo(timezone, now)

    if (now < scheduledTime) {
      continue
    }

    const { data: existing } = await supabase
      .from('workflow_runs')
      .select('id, status')
      .eq('workflow_id', workflow.id)
      .eq('metadata->>scheduled_date', localDate)
      .in('status', ['active', 'paused', 'completed', 'failed', 'cancelled'])
      .limit(1)
      .maybeSingle()

    if (existing) continue

    const nextExecuteAt = scheduledTime.toISOString()
    await supabase.from('workflow_runs').insert({
      org_id: workflow.org_id,
      workflow_id: workflow.id,
      entity_type: 'org',
      entity_id: workflow.org_id,
      status: 'active',
      current_step: 1,
      next_execute_at: nextExecuteAt,
      metadata: {
        trigger_event: 'scheduled',
        scheduled_date: localDate,
        scheduled_time: timeValue,
        timezone,
      },
    })
  }
}

/**
 * Execute a single action
 */
async function executeAction(
  supabase: SupabaseClient,
  actionType: string,
  actionConfig: Record<string, unknown>,
  lead: Lead | null,
  org: Organization | null,
  orgId: string,
  booking: BookingContext | null,
  quote: QuoteContext | null,
  cleaner: CleanerContext | null,
  summary: SummaryContext | null
): Promise<{ success: boolean; result?: unknown; error?: string; skipped?: boolean }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  try {
    const onlyIf = (actionConfig.only_if || actionConfig.onlyIf) as Record<string, unknown> | undefined
    if (onlyIf) {
      const paymentStatus = booking?.payment_status || ''
      const leadStatus = lead?.status || ''
      const bookingStatus = booking?.status || ''
      if (onlyIf.payment_status && paymentStatus !== String(onlyIf.payment_status)) {
        return { success: true, skipped: true, result: { skipped: true, reason: 'payment_status_mismatch' } }
      }
      if (onlyIf.payment_status_not && paymentStatus === String(onlyIf.payment_status_not)) {
        return { success: true, skipped: true, result: { skipped: true, reason: 'payment_status_blocked' } }
      }
      if (onlyIf.lead_status && leadStatus !== String(onlyIf.lead_status)) {
        return { success: true, skipped: true, result: { skipped: true, reason: 'lead_status_mismatch' } }
      }
      if (onlyIf.lead_status_not && leadStatus === String(onlyIf.lead_status_not)) {
        return { success: true, skipped: true, result: { skipped: true, reason: 'lead_status_blocked' } }
      }
      if (onlyIf.booking_status && bookingStatus !== String(onlyIf.booking_status)) {
        return { success: true, skipped: true, result: { skipped: true, reason: 'booking_status_mismatch' } }
      }
      if (onlyIf.booking_status_not && bookingStatus === String(onlyIf.booking_status_not)) {
        return { success: true, skipped: true, result: { skipped: true, reason: 'booking_status_blocked' } }
      }
    }

    switch (actionType) {
      case 'send_sms': {
        const message = actionConfig.message as string
        if (!message) {
          return { success: false, error: 'No message configured' }
        }
        const recipient = (actionConfig.recipient as string) || 'lead'
        const explicitTo = actionConfig.to as string | undefined
        const targetPhone =
          explicitTo ||
          (recipient === 'cleaner' ? cleaner?.phone : recipient === 'org' ? (org as any)?.business_phone : lead?.phone_number)

        if (!targetPhone) {
          return { success: false, error: 'No phone number available for this recipient' }
        }

        const personalizedMessage = personalize(message, lead, org, booking, quote, cleaner, summary)

        // Call the dialpad-send-sms function
        const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'X-Org-Id': orgId,
          },
          body: JSON.stringify({
            phone_number: targetPhone,
            message: personalizedMessage,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return { success: false, error: `SMS failed: ${errorText}` }
        }

        return { success: true, result: { message: personalizedMessage } }
      }

      case 'send_email': {
        const subject = actionConfig.subject as string
        const body = actionConfig.body as string
        if (!subject || !body) {
          return { success: false, error: 'No subject or body configured' }
        }
        const recipient = (actionConfig.recipient as string) || 'lead'
        const explicitTo = actionConfig.to as string | undefined
        const targetEmail =
          explicitTo ||
          (recipient === 'org' ? ((org as any)?.business_email || '') : lead?.email || '')
        if (!targetEmail) {
          return { success: false, error: 'No email available for this recipient' }
        }
        if (!resendApiKey) {
          return { success: false, error: 'RESEND_API_KEY not configured' }
        }

        const personalizedSubject = personalize(subject, lead, org, booking, quote, cleaner, summary)
        const personalizedBody = personalize(body, lead, org, booking, quote, cleaner, summary)

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: workflowEmailFrom,
            to: [targetEmail],
            subject: personalizedSubject,
            text: personalizedBody,
            html: personalizedBody.replace(/\n/g, '<br>'),
            ...(workflowEmailReplyTo ? { reply_to: workflowEmailReplyTo } : {}),
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return { success: false, error: `Resend error: ${errorText}` }
        }

        const result = await response.json().catch(() => ({}))
        return {
          success: true,
          result: {
            subject: personalizedSubject,
            to: lead.email,
            message_id: result?.id || null,
          },
        }
      }

      case 'make_call': {
        if (!lead?.phone_number) {
          return { success: false, error: 'Lead has no phone number' }
        }

        // Call the dialpad-initiate-call function
        const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-initiate-call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'X-Org-Id': orgId,
          },
          body: JSON.stringify({
            phone_number: lead.phone_number,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return { success: false, error: `Call failed: ${errorText}` }
        }

        return { success: true, result: { phone: lead.phone_number } }
      }

      case 'update_status': {
        const newStatus = actionConfig.new_status as string
        if (!newStatus) {
          return { success: false, error: 'No new status configured' }
        }
        if (!lead) {
          return { success: false, error: 'No lead found' }
        }

        const { error: updateError } = await supabase
          .from('extracted_leads')
          .update({ status: newStatus })
          .eq('id', lead.id)

        if (updateError) {
          return { success: false, error: `Status update failed: ${updateError.message}` }
        }

        return { success: true, result: { new_status: newStatus } }
      }

      case 'wait': {
        // Wait actions don't actually "execute" - they just delay the next step
        return { success: true, result: { waited: true } }
      }

      default:
        return { success: false, error: `Unknown action type: ${actionType}` }
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Process a single workflow run
 */
async function processRun(
  supabase: SupabaseClient,
  run: WorkflowRun,
  workflow: Workflow,
  runnerId: string
): Promise<{ success: boolean; completed: boolean; error?: string }> {
  const steps = workflow.steps.sort((a, b) => a.step_order - b.step_order)
  const currentStepIndex = run.current_step - 1

  if (currentStepIndex >= steps.length) {
    // All steps completed
    await supabase
      .from('workflow_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', run.id)

    return { success: true, completed: true }
  }

  const currentStep = steps[currentStepIndex]

  // Get lead data
  let lead: Lead | null = null
  let booking: BookingContext | null = null
  let quote: QuoteContext | null = null
  let cleaner: CleanerContext | null = null
  let summary: SummaryContext | null = null
  if (run.entity_type === 'lead') {
    const { data } = await supabase
      .from('extracted_leads')
      .select('id, name, email, phone_number, status')
      .eq('id', run.entity_id)
      .single()
    lead = data
    if (lead?.id) {
      const { data: latestQuote } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_name, customer_email, customer_phone, service, addons, custom_addons, address, subtotal, discount_amount, gst, total_inc_gst, deposit_amount, remaining_balance, share_token, cleaner_pay')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      quote = latestQuote as QuoteContext | null
    }
  }
  if (run.entity_type === 'booking') {
    const { data: occurrence } = await supabase
      .from('booking_occurrences')
      .select('id, start_at, end_at, status, notes, payment_status, payment_paid_at, payment_amount_cents, payment_link, cleaner_id, series_id, quote_id, series:booking_series(id, title, timezone, lead_id, quote_id, service_address)')
      .eq('id', run.entity_id)
      .single()
    if (occurrence) {
      booking = {
        id: occurrence.id,
        series_id: occurrence.series_id,
        lead_id: occurrence.series?.lead_id || null,
        quote_id: occurrence.quote_id || occurrence.series?.quote_id || null,
        start_at: occurrence.start_at,
        end_at: occurrence.end_at,
        timezone: occurrence.series?.timezone || null,
        title: occurrence.series?.title || null,
        status: occurrence.status || null,
        notes: occurrence.notes || null,
        payment_status: occurrence.payment_status || null,
        payment_paid_at: occurrence.payment_paid_at || null,
        payment_amount_cents: occurrence.payment_amount_cents ?? null,
        payment_link: occurrence.payment_link || null,
        service_address: occurrence.series?.service_address || null,
      }
      const leadId = occurrence.series?.lead_id
      if (leadId) {
        const { data } = await supabase
          .from('extracted_leads')
          .select('id, name, email, phone_number, status')
          .eq('id', leadId)
          .single()
        lead = data
      }

      const quoteId = occurrence.quote_id || occurrence.series?.quote_id || null
      if (quoteId) {
        const { data: q } = await supabase
          .from('quotes')
          .select('id, quote_number, customer_name, customer_email, customer_phone, service, addons, custom_addons, address, subtotal, discount_amount, gst, total_inc_gst, deposit_amount, remaining_balance, share_token, cleaner_pay')
          .eq('id', quoteId)
          .maybeSingle()
        quote = q as QuoteContext | null
      }

      if (occurrence.cleaner_id) {
        const { data: c } = await supabase
          .from('cleaners')
          .select('id, full_name, phone, email')
          .eq('id', occurrence.cleaner_id)
          .maybeSingle()
        cleaner = c as CleanerContext | null
      }
    }
  }

  // Get org data
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, business_name, business_email, business_phone, business_abn, business_operating_name, timezone')
    .eq('id', run.org_id)
    .single()

  // Build summary context for scheduled workflows
  if (workflow.trigger_type === 'scheduled') {
    const tz = (workflow.trigger_config?.timezone as string) || (org as any)?.timezone || 'Australia/Sydney'
    const scheduledDate = (run.metadata as any)?.scheduled_date as string | undefined
    summary = await buildDailySummary(supabase, run.org_id, tz, scheduledDate)
  }

  // Execute the action
  const result = await executeAction(
    supabase,
    currentStep.action_type,
    currentStep.action_config,
    lead,
    org,
    run.org_id,
    booking,
    quote,
    cleaner,
    summary
  )

  // Log the step execution
  await supabase.from('workflow_step_logs').insert({
    org_id: run.org_id,
    run_id: run.id,
    step_id: currentStep.id,
    step_order: currentStep.step_order,
    action_type: currentStep.action_type,
    status: result.skipped ? 'skipped' : result.success ? 'success' : 'failed',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    result: result.result ? result.result : null,
    error: result.error || null,
  })

  if (!result.success) {
    // Mark run as failed
    await supabase
      .from('workflow_runs')
      .update({
        status: 'failed',
        last_error: result.error,
        locked_at: null,
        locked_by: null,
      })
      .eq('id', run.id)

    return { success: false, completed: false, error: result.error }
  }

  // Advance to next step
  const nextStepIndex = currentStepIndex + 1

  if (nextStepIndex >= steps.length) {
    // All steps completed
    await supabase
      .from('workflow_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_step: run.current_step + 1,
        locked_at: null,
        locked_by: null,
      })
      .eq('id', run.id)

    return { success: true, completed: true }
  }

  // Calculate next execution time based on next step
  const nextStep = steps[nextStepIndex]
  let nextExecuteAt = new Date()

  if (nextStep.action_type === 'wait') {
    const delayMs = calculateDelayMs(nextStep.action_config)
    nextExecuteAt = new Date(Date.now() + delayMs)
  }

  // Update run to next step
  await supabase
    .from('workflow_runs')
    .update({
      current_step: run.current_step + 1,
      next_execute_at: nextExecuteAt.toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', run.id)

  return { success: true, completed: false }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const runnerId = `runner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.log(`[workflow-runner] Starting run ${runnerId}`)

  try {
    // Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date().toISOString()

    // Ensure scheduled workflows have runs for today
    try {
      await ensureScheduledRuns(supabase, new Date())
    } catch (err) {
      console.error('[workflow-runner] Failed to ensure scheduled runs:', err)
    }

    // Fetch due workflow runs that aren't locked
    const { data: dueRuns, error: fetchError } = await supabase
      .from('workflow_runs')
      .select(`
        id,
        org_id,
        workflow_id,
        entity_type,
        entity_id,
        status,
        current_step,
        next_execute_at,
        metadata
      `)
      .eq('status', 'active')
      .lte('next_execute_at', now)
      .is('locked_at', null)
      .limit(50)

    if (fetchError) {
      console.error('[workflow-runner] Error fetching runs:', fetchError)
      throw fetchError
    }

    console.log(`[workflow-runner] Found ${dueRuns?.length || 0} due runs`)

    if (!dueRuns || dueRuns.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, completed: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let processed = 0
    let completed = 0
    let failed = 0
    const orgFlagCache = new Map<string, boolean>()

    for (const run of dueRuns) {
      if (!orgFlagCache.has(run.org_id)) {
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('use_workflow_automations')
          .eq('id', run.org_id)
          .maybeSingle()
        orgFlagCache.set(run.org_id, Boolean(orgRow?.use_workflow_automations))
      }

      if (!orgFlagCache.get(run.org_id)) {
        await supabase
          .from('workflow_runs')
          .update({ locked_at: null, locked_by: null })
          .eq('id', run.id)
        continue
      }

      // Try to lock the run
      const lockTime = new Date().toISOString()
      const { data: lockedRun, error: lockError } = await supabase
        .from('workflow_runs')
        .update({
          locked_at: lockTime,
          locked_by: runnerId,
        })
        .eq('id', run.id)
        .is('locked_at', null)
        .select()
        .single()

      if (lockError || !lockedRun) {
        console.log(`[workflow-runner] Failed to lock run ${run.id} - already locked`)
        continue
      }

      // Fetch the workflow with steps
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select(`
          id,
          name,
          enabled,
          trigger_type,
          trigger_config,
          steps:workflow_steps(id, step_order, action_type, action_config)
        `)
        .eq('id', run.workflow_id)
        .single()

      if (workflowError || !workflow) {
        console.error(`[workflow-runner] Workflow not found for run ${run.id}`)
        await supabase
          .from('workflow_runs')
          .update({
            status: 'failed',
            last_error: 'Workflow not found',
            locked_at: null,
            locked_by: null,
          })
          .eq('id', run.id)
        failed++
        continue
      }

      if (!workflow.enabled) {
        console.log(`[workflow-runner] Workflow ${workflow.id} is disabled, cancelling run`)
        await supabase
          .from('workflow_runs')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
          })
          .eq('id', run.id)
        continue
      }

      // Process the run
      const result = await processRun(
        supabase,
        run as WorkflowRun,
        workflow as unknown as Workflow,
        runnerId
      )

      processed++
      if (result.completed) {
        completed++
      } else if (!result.success) {
        failed++
      }
    }

    console.log(`[workflow-runner] Finished: processed=${processed}, completed=${completed}, failed=${failed}`)

    return new Response(
      JSON.stringify({ success: true, processed, completed, failed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[workflow-runner] Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
