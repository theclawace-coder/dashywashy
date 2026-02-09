import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase'

type RepeatType = 'none' | 'weekly' | 'fortnightly' | '3-weekly' | 'monthly' | '2-monthly'

interface Lead {
  id: string
  name?: string | null
  email?: string | null
  phone_number?: string | null
  region_notes?: string | null
}

interface Quote {
  id: string
  quote_number?: string | null
  service?: string | null
  total_inc_gst?: number | null
  created_at: string
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

interface BookingModalProps {
  lead: Lead
  onClose: () => void
  onSuccess?: (seriesId: string) => void
  onSkip?: () => void
}

type CreateBookingPayload = {
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

const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'

const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: 'none', label: 'One-time (no repeat)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly (every 2 weeks)' },
  { value: '3-weekly', label: 'Every 3 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: '2-monthly', label: 'Every 2 months' },
]

const DURATION_OPTIONS = [
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
  const endDate = untilDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000) // default: 1 year

  while (dates.length < maxCount) {
    if (freq === 'WEEKLY') {
      currentDate = new Date(currentDate.getTime() + interval * 7 * 24 * 60 * 60 * 1000)
    } else if (freq === 'MONTHLY') {
      const nextMonth = new Date(currentDate)
      nextMonth.setMonth(nextMonth.getMonth() + interval)
      currentDate = nextMonth
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

async function createBookingViaEdge(payload: CreateBookingPayload) {
  try {
    // Try using supabase client first
    const { data, error } = await supabase.functions.invoke('create-booking-series', {
      body: payload,
    })

    if (error) {
      throw new Error(error.message || 'Edge function failed')
    }
    if (data?.error) {
      throw new Error(data.error)
    }
    if (!data?.series?.id) {
      throw new Error('Edge function did not return a booking id')
    }

    return data
  } catch (err) {
    // If supabase.functions.invoke fails (e.g., network error, CORS issue), try direct fetch
    // This handles cases where the Supabase client has issues but the endpoint is accessible
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    
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
        throw new Error(responseData?.error || `Edge function failed (${response.status})`)
      }
      
      if (!responseData?.series?.id) {
        throw new Error('Edge function did not return a booking id')
      }

      return responseData
    } catch (fetchErr) {
      // Re-throw with a more descriptive error message
      const fetchErrorMsg = fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error'
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.')
      }
      // Re-throw the original error if fetch also fails, but include fetch error for debugging
      throw err instanceof Error ? err : new Error(`Edge function unavailable: ${fetchErrorMsg}`)
    }
  }
}

async function createBookingDirect(payload: CreateBookingPayload) {
  const startDate = new Date(payload.startsAt)
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Please enter a valid date and time')
  }

  const rrule = repeatTypeToRRule(payload.repeatType)
  const untilDate = payload.untilDate ? new Date(payload.untilDate) : null
  const maxOccurrences = payload.occurrenceCount || (rrule ? 52 : 1)

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
    })
    .select()
    .single()

  if (seriesError || !series) {
    throw new Error(seriesError?.message || 'Failed to create booking series')
  }

  const occurrenceDates = generateOccurrences(startDate, rrule, untilDate, maxOccurrences)
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

  return { series }
}

export default function BookingModal({ lead, onClose, onSuccess, onSkip }: BookingModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successData, setSuccessData] = useState<{ occurrencesCreated: number; startDate: string; seriesId?: string } | null>(null)
  
  // Form state
  const [date, setDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  })
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(120)
  const [repeatType, setRepeatType] = useState<RepeatType>('weekly')
  const [endType, setEndType] = useState<'never' | 'date' | 'count'>('never')
  const [endDate, setEndDate] = useState(() => {
    const sixMonths = new Date()
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    return sixMonths.toISOString().split('T')[0]
  })
  const [occurrenceCount, setOccurrenceCount] = useState(12)
  const [notes, setNotes] = useState('')

  // Quote selection state
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('')

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'unset' }
  }, [])

  // Load available quotes for this lead
  useEffect(() => {
    const loadQuotes = async () => {
      setLoadingQuotes(true)
      try {
        const { data, error } = await supabase
          .from('quotes')
          .select('id, quote_number, service, total_inc_gst, created_at')
          .eq('lead_id', lead.id)
          .is('base_quote_id', null)
          .order('created_at', { ascending: false })

        if (error) throw error
        setQuotes(data || [])

        // Auto-select the most recent quote if available
        if (data && data.length > 0 && !selectedQuoteId) {
          setSelectedQuoteId(data[0].id)
        }
      } catch (err) {
        console.error('Failed to load quotes:', err)
        setError('Failed to load available quotes')
      } finally {
        setLoadingQuotes(false)
      }
    }

    loadQuotes()
  }, [lead.id, selectedQuoteId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const startsAt = new Date(`${date}T${time}:00`)
      
      if (!selectedQuoteId) {
        setError('Please select a quote')
        setIsSubmitting(false)
        return
      }

      const payload: CreateBookingPayload = {
        leadId: lead.id,
        quoteId: selectedQuoteId,
        startsAt: startsAt.toISOString(),
        durationMinutes: duration,
        repeatType,
        notes: notes || undefined,
        updateLeadStatus: true,
        timezone: DEFAULT_TIMEZONE,
      }

      if (repeatType !== 'none') {
        if (endType === 'date') {
          payload.untilDate = endDate
        } else if (endType === 'count') {
          payload.occurrenceCount = occurrenceCount
        }
      }

      let result
      try {
        result = await createBookingViaEdge(payload)
      } catch (edgeErr) {
        console.warn('Edge function failed, retrying with direct database insert:', edgeErr)
        // Fallback to direct database insert if edge function fails
        // This handles cases where edge functions aren't accessible (e.g., CORS, network issues)
        try {
          result = await createBookingDirect(payload)
        } catch (directErr) {
          // If direct insert also fails, throw with a helpful message
          console.error('Both edge function and direct insert failed:', { edgeErr, directErr })
          throw new Error(
            directErr instanceof Error 
              ? directErr.message 
              : 'Failed to create booking. Please check your connection and try again.'
          )
        }
      }

      // Show success popup
      const occurrencesCreated = result?.occurrences_created || (result?.series ? 1 : 0)
      const seriesId = result?.series?.id
      setSuccessData({
        occurrencesCreated,
        startDate: payload.startsAt,
        seriesId,
      })
      setShowSuccess(true)
      
      // Auto-close after 3 seconds, then call success callback
      setTimeout(() => {
        setShowSuccess(false)
        setTimeout(() => {
          // Call success callback after popup is dismissed
          onSuccess?.(seriesId)
          onClose()
        }, 300) // Small delay for animation
      }, 3000)
    } catch (err) {
      console.error('Error creating booking:', err)
      setError(err instanceof Error ? err.message : 'Failed to create booking')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    onSkip?.()
    onClose()
  }

  const modal = (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10000] p-4"
      onClick={showSuccess ? undefined : onClose}
    >
      <div 
        className="bg-[#1a1d24] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Schedule First Booking</h3>
                <p className="text-sm text-emerald-300/70">
                  {lead.name || 'Lead'} — Job Won! 🎉
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto max-h-[60vh]">
          {/* Quote Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Quote *
            </label>
            {loadingQuotes ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading quotes...
              </div>
            ) : quotes.length === 0 ? (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                No quotes found for this lead. Please create a quote first.
              </div>
            ) : (
              <div className="space-y-2">
                {quotes.map((quote) => (
                  <label
                    key={quote.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedQuoteId === quote.id
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="quote"
                      value={quote.id}
                      checked={selectedQuoteId === quote.id}
                      onChange={(e) => setSelectedQuoteId(e.target.value)}
                      required
                      className="text-emerald-500 focus:ring-emerald-500/50"
                    />
                    <div className="flex-1">
                      <div className="font-medium">
                        {quote.quote_number || 'Quote'} - {quote.service || 'Service'}
                      </div>
                      <div className="text-xs opacity-70">
                        ${quote.total_inc_gst?.toFixed(2) || 'N/A'} inc GST • {new Date(quote.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
            >
              {DURATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-[#1a1d24]">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Repeat Type */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Repeat
            </label>
            <div className="grid grid-cols-2 gap-2">
              {REPEAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRepeatType(opt.value)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                    repeatType === opt.value
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* End Condition (only for recurring) */}
          {repeatType !== 'none' && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">
                End Condition
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'never', label: 'Never' },
                  { value: 'date', label: 'Until Date' },
                  { value: 'count', label: 'After # Visits' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEndType(opt.value as typeof endType)}
                    className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                      endType === opt.value
                        ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {endType === 'date' && (
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              )}

              {endType === 'count' && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={occurrenceCount}
                    onChange={(e) => setOccurrenceCount(Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                  <span className="text-sm text-gray-400">visits</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any special instructions..."
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Skip for now
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-medium shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Booking
                </>
              )}
            </button>
          </div>
        </div>

        {/* Success Popup Overlay */}
        {showSuccess && successData && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10001] transition-opacity duration-300">
            <div className="bg-[#1a1d24] border border-emerald-500/30 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl transform transition-all duration-300 scale-100">
              <div className="flex flex-col items-center text-center space-y-4">
                {/* Success Icon */}
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
                  <svg
                    className="w-10 h-10 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>

                {/* Success Message */}
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">Booking Scheduled!</h3>
                  <p className="text-emerald-300/80 text-sm mb-1">
                    {successData.occurrencesCreated === 1
                      ? '1 booking occurrence created'
                      : `${successData.occurrencesCreated} booking occurrences created`}
                  </p>
                  <p className="text-gray-400 text-xs">
                    First booking: {new Date(successData.startDate).toLocaleString()}
                  </p>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => {
                    const seriesId = successData?.seriesId
                    setShowSuccess(false)
                    setTimeout(() => {
                      // Call success callback after popup is dismissed
                      if (seriesId) {
                        onSuccess?.(seriesId)
                      }
                      onClose()
                    }, 300)
                  }}
                  className="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-medium transition-all"
                >
                  Great!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
















