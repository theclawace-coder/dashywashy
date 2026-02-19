import { supabase, supabaseAnonKey, supabaseUrl } from './supabase'
import { getMonthlyJobLimit, getPlanLabel, getUtcMonthBounds } from './plans'

export type RepeatType = 'none' | 'weekly' | 'fortnightly' | '3-weekly' | 'monthly' | '2-monthly'

export type CreateBookingPayload = {
  leadId: string
  quoteId: string
  startsAt: string
  durationMinutes: number
  repeatType: RepeatType
  untilDate?: string
  occurrenceCount?: number
  notes?: string
  timezone?: string
  updateLeadStatus?: boolean
}

export type BookingResult = {
  series?: any
  occurrences_created?: number
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

export const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'

export const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: 'none', label: 'One-time (no repeat)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly (every 2 weeks)' },
  { value: '3-weekly', label: 'Every 3 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: '2-monthly', label: 'Every 2 months' },
]

export const DURATION_OPTIONS = [
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 150, label: '2.5 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: '4 hours' },
  { value: 300, label: '5 hours' },
  { value: 360, label: '6 hours' },
]

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

function generateOccurrences(startDate: Date, rrule: string | null, untilDate: Date | null, maxCount: number): Date[] {
  const dates: Date[] = [new Date(startDate)]

  if (!rrule) return dates

  const parts: Record<string, string> = {}
  rrule.split(';').forEach((part) => {
    const [key, value] = part.split('=')
    if (key && value) parts[key] = value
  })

  const freq = parts['FREQ']
  const interval = parseInt(parts['INTERVAL'] || '1', 10)
  let currentDate = new Date(startDate)
  const anchorDay = startDate.getDate()
  const endDate = untilDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000) // default: 1 year

  while (dates.length < maxCount) {
    if (freq === 'WEEKLY') {
      currentDate = new Date(currentDate.getTime() + interval * 7 * 24 * 60 * 60 * 1000)
    } else if (freq === 'MONTHLY') {
      currentDate = addMonthsPreservingDay(currentDate, interval, anchorDay)
    } else {
      break
    }

    if (currentDate > endDate) break
    dates.push(new Date(currentDate))
  }

  return dates
}

async function resolveBaseQuote(quoteId: string, leadId: string) {
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
    throw new Error('Quote not found or does not belong to this lead')
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
      throw new Error('Base quote not found for this lead')
    }

    return base as QuoteTemplate
  }

  return quoteData
}

async function getNextQuoteVersion(baseQuoteId: string) {
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

async function createBookingViaEdge(payload: CreateBookingPayload): Promise<BookingResult> {
  // Try using supabase client first
  const { data, error } = await supabase.functions.invoke('create-booking-series', {
    body: payload,
  })

  if (error) {
    throw new Error(error.message || 'Edge function failed')
  }
  if (data?.error) {
    const err = new Error(data.message || data.error)
    if (data.error === 'plan_limit_reached') {
      ;(err as any).code = 'plan_limit_reached'
    }
    throw err
  }
  if (!data?.series?.id) {
    throw new Error('Edge function did not return a booking id')
  }

  return data as BookingResult
}

async function createBookingDirect(payload: CreateBookingPayload): Promise<BookingResult> {
  const startDate = new Date(payload.startsAt)
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Please enter a valid date and time')
  }

  const rrule = repeatTypeToRRule(payload.repeatType)
  const untilDate = payload.untilDate ? new Date(payload.untilDate) : null
  const maxOccurrences = payload.occurrenceCount || (rrule ? 52 : 1)
  const occurrenceDates = generateOccurrences(startDate, rrule, untilDate, maxOccurrences)

  // Verify lead exists
  const { data: leadExists, error: leadError } = await supabase
    .from('extracted_leads')
    .select('id')
    .eq('id', payload.leadId)
    .maybeSingle()

  if (leadError || !leadExists) {
    throw new Error('Lead not found')
  }

  const baseQuote = await resolveBaseQuote(payload.quoteId, payload.leadId)

  const orgId = baseQuote.org_id
  if (!orgId) {
    throw new Error('Quote is missing org context; cannot create booking')
  }

  // Enforce monthly job limits for direct inserts (fallback path)
  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single()

  if (orgError) {
    throw new Error('Unable to verify plan limits. Please try again.')
  }

  const planLimit = getMonthlyJobLimit(orgRow?.plan)
  if (planLimit !== null) {
    const { start, end } = getUtcMonthBounds(new Date())
    const { count, error: usageError } = await supabase
      .from('booking_occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())

    if (usageError) {
      throw new Error('Unable to verify plan limits. Please try again.')
    }

    const used = count ?? 0
    if (used + occurrenceDates.length > planLimit) {
      const planLabel = getPlanLabel(orgRow?.plan)
      const err = new Error(`Your ${planLabel} plan allows ${planLimit} scheduled jobs per month. You have ${used} already and tried to add ${occurrenceDates.length}.`)
      ;(err as any).code = 'plan_limit_reached'
      throw err
    }
  }

  const quoteAddress = baseQuote.address || null
  const quoteLat = typeof baseQuote.address_lat === 'number' ? baseQuote.address_lat : null
  const quoteLng = typeof baseQuote.address_lng === 'number' ? baseQuote.address_lng : null

  const { data: series, error: seriesError } = await supabase
    .from('booking_series')
    .insert({
      org_id: orgId,
      lead_id: payload.leadId,
      quote_id: baseQuote.id,
      title: 'Regular clean',
      timezone: payload.timezone || DEFAULT_TIMEZONE,
      starts_at: startDate.toISOString(),
      duration_minutes: payload.durationMinutes || 120,
      rrule,
      until_date: untilDate ? untilDate.toISOString().split('T')[0] : null,
      occurrence_count: payload.occurrenceCount || null,
      notes: payload.notes || null,
      status: 'active',
      service_address: quoteAddress,
      service_lat: quoteLat,
      service_lng: quoteLng,
    })
    .select()
    .single()

  if (seriesError || !series) {
    throw new Error(seriesError?.message || 'Failed to create booking series')
  }

  const startingVersion = await getNextQuoteVersion(baseQuote.id)
  const variantPayloads = occurrenceDates.map((_, index) => buildVariantPayload(baseQuote, startingVersion + index))

  const { data: variants, error: variantsError } = await supabase
    .from('quotes')
    .insert(variantPayloads)
    .select('id, quote_version')

  if (variantsError || !variants || variants.length !== occurrenceDates.length) {
    await supabase.from('booking_series').delete().eq('id', series.id)
    throw new Error(variantsError?.message || 'Failed to create quote variants')
  }

  const variantIds = variants.map((v: any) => v.id)

  const occurrenceRecords = occurrenceDates.map((date, index) => {
    const endDate = new Date(date.getTime() + (payload.durationMinutes || 120) * 60 * 1000)
    return {
      org_id: orgId,
      series_id: series.id,
      start_at: date.toISOString(),
      end_at: endDate.toISOString(),
      status: 'scheduled',
      quote_id: variantIds[index],
    }
  })

  const { error: occurrencesError } = await supabase.from('booking_occurrences').insert(occurrenceRecords)
  if (occurrencesError) {
    await supabase.from('booking_series').delete().eq('id', series.id)
    await supabase.from('quotes').delete().in('id', variantIds)
    throw new Error(occurrencesError.message || 'Failed to create booking occurrences')
  }

  if (payload.updateLeadStatus !== false) {
    await supabase.from('extracted_leads').update({ status: 'Job Won' }).eq('id', payload.leadId)
  }

  return { series, occurrences_created: occurrenceRecords.length }
}

export async function createBooking(payload: CreateBookingPayload): Promise<BookingResult> {
  try {
    return await createBookingViaEdge(payload)
  } catch (edgeErr) {
    const errorMessage = edgeErr instanceof Error ? edgeErr.message : 'Unknown error'

    // Check if it's a network/fetch error
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('fetch')) {
      console.warn('Supabase client invoke failed with network error, trying direct fetch:', errorMessage)
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      const response = await fetch(`${supabaseUrl}/functions/v1/create-booking-series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const responseData = await response.json().catch(() => ({}))

      if (!response.ok || responseData?.error) {
        const err = new Error(responseData?.message || responseData?.error || `Edge function failed (${response.status})`)
        if (responseData?.error === 'plan_limit_reached') {
          ;(err as any).code = 'plan_limit_reached'
        }
        throw err
      }

      if (!responseData?.series?.id) {
        throw new Error('Edge function did not return a booking id')
      }

      return responseData as BookingResult
    } catch (fetchErr) {
      const fetchErrorMsg = fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error'
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.')
      }
      console.warn('Edge function fetch fallback failed, attempting direct insert:', fetchErrorMsg)
      return createBookingDirect(payload)
    }
  }
}

