import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
const defaultToEmail = Deno.env.get('JOB_WON_NOTIFY_EMAIL') || ''
const defaultFromEmail = Deno.env.get('JOB_WON_EMAIL_FROM') || ''
const summaryToEmail = Deno.env.get('DAILY_SUMMARY_NOTIFY_EMAIL') || defaultToEmail
const summaryFromEmail = Deno.env.get('DAILY_SUMMARY_EMAIL_FROM') || defaultFromEmail
const summaryTimezone = Deno.env.get('DAILY_SUMMARY_TIMEZONE') || 'Australia/Sydney'

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
  if (value == null) return '0'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
}

function formatDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    dateStyle: 'medium',
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

function getDateRangeForTimezone(timezone: string) {
  const now = new Date()
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMs = now.getTime() - localNow.getTime()

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
  }).format(now)

  return { now, localNow, startUtc, endUtc, localDate }
}

async function sendDailySummaryEmail(params: {
  to: string
  from: string
  localDate: string
  summaryTimezone: string
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
}) {
  const { to, from, localDate, summaryTimezone, metrics, salesLines, cleanLines } = params

  const subject = `Daily Summary (${localDate})`
  const text = [
    `Hey Erfan`,
    ``,
    `Today We Had`,
    `${metrics.salesCount} Number of Sales`,
    `${formatCurrency(metrics.salesTotal)} (Sum of all Sales Today)`,
    `${formatCurrency(metrics.projectedProfit)} Projected Profit of Sales (Sales - Cleaner Fee)`,
    `${metrics.repeatClientCount} is a Repeat Client (Weekly Monthly etc)`,
    `${metrics.outboundCalls} Unique Outbound Calls`,
    `${metrics.inboundCalls} Unique Inbound Calls`,
    `${metrics.leadsCount} Unique Leads`,
    `${metrics.quotesCount} Amount of Quotes`,
    `${metrics.cleansTodayCount} Amount Of Cleans that were on today`,
    ``,
    `Sales`,
    ...(salesLines.length > 0 ? salesLines : ['No sales today']),
    ``,
    `Cleans`,
    ...(cleanLines.length > 0 ? cleanLines : ['No cleans today']),
    ``,
    `Timezone: ${summaryTimezone}`,
  ].join('\n')

  const html = `
    <p>Hey Erfan</p>
    <p>Today We Had</p>
    <ul>
      <li><strong>${metrics.salesCount}</strong> Number of Sales</li>
      <li><strong>${formatCurrency(metrics.salesTotal)}</strong> (Sum of all Sales Today)</li>
      <li><strong>${formatCurrency(metrics.projectedProfit)}</strong> Projected Profit of Sales (Sales - Cleaner Fee)</li>
      <li><strong>${metrics.repeatClientCount}</strong> is a Repeat Client (Weekly Monthly etc)</li>
      <li><strong>${metrics.outboundCalls}</strong> Unique Outbound Calls</li>
      <li><strong>${metrics.inboundCalls}</strong> Unique Inbound Calls</li>
      <li><strong>${metrics.leadsCount}</strong> Unique Leads</li>
      <li><strong>${metrics.quotesCount}</strong> Amount of Quotes</li>
      <li><strong>${metrics.cleansTodayCount}</strong> Amount Of Cleans that were on today</li>
    </ul>
    <h3>Sales</h3>
    <ul>
      ${
        salesLines.length > 0
          ? salesLines.map((line) => `<li>${line}</li>`).join('')
          : '<li>No sales today</li>'
      }
    </ul>
    <h3>Cleans</h3>
    <ul>
      ${
        cleanLines.length > 0
          ? cleanLines.map((line) => `<li>${line}</li>`).join('')
          : '<li>No cleans today</li>'
      }
    </ul>
    <p>Timezone: ${summaryTimezone}</p>
  `.trim()

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
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

  if (!resendApiKey || !summaryToEmail || !summaryFromEmail) {
    return jsonResponse({ error: 'Missing email configuration' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let payload: { date?: string; force?: boolean } = {}
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  const force = payload?.force === true

  try {
    const { data: orgRows } = await supabase
      .from('organizations')
      .select('id, use_workflow_automations')
    const allMigrated = (orgRows || []).length > 0 && (orgRows || []).every((row: any) => row.use_workflow_automations)
    if (allMigrated) {
      return jsonResponse({ skipped: true, reason: 'workflow_automations_enabled' })
    }
  } catch {
    // If org lookup fails, continue with legacy summary
  }

  const { localNow } = getDateRangeForTimezone(summaryTimezone)

  let summaryDate = payload?.date || null
  if (summaryDate && !/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) {
    return jsonResponse({ error: 'Invalid date format, use YYYY-MM-DD' }, 400)
  }

  if (!summaryDate) {
    summaryDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: summaryTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  }

  const now = new Date()
  const targetLocalDate = new Date(`${summaryDate}T12:00:00`)
  const localNowForOffset = new Date(now.toLocaleString('en-US', { timeZone: summaryTimezone }))
  const offsetMs = now.getTime() - localNowForOffset.getTime()
  const startUtc = new Date(new Date(targetLocalDate).setHours(0, 0, 0, 0) + offsetMs)
  const endUtc = new Date(new Date(targetLocalDate).setHours(23, 59, 59, 999) + offsetMs)

  if (!force && localNow.getHours() !== 18) {
    return jsonResponse({ skipped: true, reason: 'Not scheduled hour', localHour: localNow.getHours() })
  }

  const { data: existingLog } = await supabase
    .from('daily_summary_logs')
    .select('id')
    .eq('summary_date', summaryDate)
    .maybeSingle()

  if (existingLog && !force) {
    return jsonResponse({ skipped: true, reason: 'Already sent', summary_date: summaryDate })
  }

  const startIso = startUtc.toISOString()
  const endIso = endUtc.toISOString()

  const { data: bookingSeries, error: bookingSeriesError } = await supabase
    .from('booking_series')
    .select('id, lead_id, quote_id, rrule, title, starts_at, timezone, created_at')
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (bookingSeriesError) {
    return jsonResponse({ error: bookingSeriesError.message || 'Failed to load booking series' }, 500)
  }

  const salesCount = (bookingSeries || []).length
  const repeatClientCount = (bookingSeries || []).filter((series) => Boolean(series.rrule)).length

  const quoteIds = (bookingSeries || [])
    .map((series) => series.quote_id)
    .filter((id): id is string => Boolean(id))

  let salesTotal = 0
  let projectedProfit = 0

  if (quoteIds.length > 0) {
    const { data: seriesQuotes, error: seriesQuotesError } = await supabase
      .from('quotes')
      .select('id, total_inc_gst, cleaner_pay')
      .in('id', quoteIds)

    if (seriesQuotesError) {
      return jsonResponse({ error: seriesQuotesError.message || 'Failed to load sales quotes' }, 500)
    }

    salesTotal = (seriesQuotes || []).reduce((sum, quote) => sum + (quote.total_inc_gst || 0), 0)
    projectedProfit = (seriesQuotes || []).reduce(
      (sum, quote) => sum + ((quote.total_inc_gst || 0) - (quote.cleaner_pay || 0)),
      0
    )
  }

  const { data: calls, error: callsError } = await supabase
    .from('dialpad_calls')
    .select('id, direction, created_at')
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (callsError) {
    return jsonResponse({ error: callsError.message || 'Failed to load calls' }, 500)
  }

  const outboundCalls = (calls || []).filter((call) => call.direction === 'outbound').length
  const inboundCalls = (calls || []).filter((call) => call.direction === 'inbound').length

  const { data: leads, error: leadsError } = await supabase
    .from('extracted_leads')
    .select('id, created_at')
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (leadsError) {
    return jsonResponse({ error: leadsError.message || 'Failed to load leads' }, 500)
  }

  const leadsCount = (leads || []).length

  const { data: quotes, error: quotesError } = await supabase
    .from('quotes')
    .select('id, base_quote_id, created_at')
    .is('base_quote_id', null)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (quotesError) {
    return jsonResponse({ error: quotesError.message || 'Failed to load quotes' }, 500)
  }

  const quotesCount = (quotes || []).length

  const { data: occurrences, error: occurrencesError } = await supabase
    .from('booking_occurrences')
    .select('id, series_id, start_at, cleaner_id')
    .gte('start_at', startIso)
    .lte('start_at', endIso)

  if (occurrencesError) {
    return jsonResponse({ error: occurrencesError.message || 'Failed to load cleans' }, 500)
  }

  const cleansTodayCount = (occurrences || []).length

  const leadIds = (bookingSeries || [])
    .map((series) => series.lead_id)
    .filter((id): id is string => Boolean(id))

  const cleanerIds = (occurrences || [])
    .map((occ) => occ.cleaner_id)
    .filter((id): id is string => Boolean(id))

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

  if (leadResult.error) {
    return jsonResponse({ error: leadResult.error.message || 'Failed to load leads for sales' }, 500)
  }
  if (cleanerResult.error) {
    return jsonResponse({ error: cleanerResult.error.message || 'Failed to load cleaners' }, 500)
  }
  if (quoteResult.error) {
    return jsonResponse({ error: quoteResult.error.message || 'Failed to load quotes for sales lines' }, 500)
  }

  const leadsById = new Map((leadResult.data || []).map((lead) => [lead.id, lead]))
  const cleanersById = new Map((cleanerResult.data || []).map((cleaner) => [cleaner.id, cleaner]))
  const quotesById = new Map((quoteResult.data || []).map((quote) => [quote.id, quote]))

  const salesLines = (bookingSeries || []).map((series) => {
    const lead = series.lead_id ? leadsById.get(series.lead_id) : null
    const quote = series.quote_id ? quotesById.get(series.quote_id) : null
    const tz = series.timezone || summaryTimezone
    const startsAt = series.starts_at ? new Date(series.starts_at) : null
    const scheduledTime = startsAt ? formatTime(startsAt, tz) : '—'
    const scheduledDate = startsAt ? formatDate(startsAt, tz) : '—'
    const serviceLabel = quote?.service || series.title || 'Service'
    const bedBath = `${quote?.bedrooms ?? '—'} Bedroom ${quote?.bathrooms ?? '—'} bath`
    const addons = normalizeList(quote?.addons)
    const price = formatCurrency(quote?.total_inc_gst || 0)
    const cleanerCost = formatCurrency(quote?.cleaner_pay || 0)
    const profit = formatCurrency((quote?.total_inc_gst || 0) - (quote?.cleaner_pay || 0))
    const customerName = lead?.name || 'Unknown'

    return `${customerName} | ${serviceLabel} | ${bedBath} + (${addons}) - ${scheduledTime} | ${scheduledDate} - ${price} - ${cleanerCost} - ${profit}`
  })

  const seriesById = new Map((bookingSeries || []).map((series) => [series.id, series]))
  const cleanLines = (occurrences || []).map((occ) => {
    const series = seriesById.get(occ.series_id)
    const lead = series?.lead_id ? leadsById.get(series.lead_id) : null
    const cleaner = occ.cleaner_id ? cleanersById.get(occ.cleaner_id) : null
    const tz = series?.timezone || summaryTimezone
    const startAt = occ.start_at ? new Date(occ.start_at) : null
    const timeLabel = startAt ? formatTime(startAt, tz) : '—'
    const dateLabel = startAt ? formatDate(startAt, tz) : '—'
    const customerName = lead?.name || 'Unknown'
    const cleanerName = cleaner?.full_name || 'Unassigned'
    return `${customerName} - ${timeLabel} ${dateLabel} - Cleaner - ${cleanerName}`
  })

  await sendDailySummaryEmail({
    to: summaryToEmail,
    from: summaryFromEmail,
    localDate: summaryDate,
    summaryTimezone,
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
  })

  const { error: logError } = await supabase
    .from('daily_summary_logs')
    .insert({
      summary_date: summaryDate,
      timezone: summaryTimezone,
      payload: {
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
    })

  if (logError) {
    console.error('Failed to record daily summary log:', logError)
  }

  return jsonResponse({ success: true, summary_date: summaryDate })
})
