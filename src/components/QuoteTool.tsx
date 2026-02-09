import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { playSaveSound } from '../lib/sounds'
import { fetchMapboxToken } from '../lib/mapbox'
import {
  createBooking,
  DEFAULT_TIMEZONE,
  DURATION_OPTIONS,
  REPEAT_OPTIONS,
  type CreateBookingPayload,
  type RepeatType,
} from '../lib/booking'
import {
  DEFAULT_PRICING,
  STANDARD_ADD_ONS,
  calculateQuote,
  type CustomAddOn,
  type QuoteInput,
  type QuoteResult,
  type ServiceType,
} from '../lib/quoteCalculator'


type LeadReference = {
  id?: string
  name?: string | null
  phone_number?: string | null
  email?: string | null
}

type QuoteRecord = {
  id: string
  lead_id: string | null
  email_id: string | null
  quote_number?: string | null
  address?: string | null
  address_lat?: number | null
  address_lng?: number | null
  description?: string | null
  service: string
  bedrooms: number
  bathrooms: number
  addons: string[]
  custom_addons: CustomAddOn[]
  hourly_rate: number
  cleaner_rate: number
  cleaner_rate_type?: 'hour' | 'job' | null
  main_service_hours: number
  add_on_hours: number
  total_hours: number
  subtotal: number
  discount_amount: number
  discount_percentage: number
  net_revenue: number
  gst: number
  total_inc_gst: number
  cleaner_pay: number
  profit: number
  margin: number
  deposit_percentage: number
  deposit_amount: number
  remaining_balance: number
  notes?: string | null
  accepted_at?: string | null
  accepted_name?: string | null
  accepted_signature?: string | null
  accepted_checkbox?: boolean | null
  accepted_date?: string | null
  accepted_payment_method?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  share_token?: string | null
  created_at?: string
}

type QuoteToolProps = {
  lead: LeadReference | null
  emailId: string | null
  autoEditLatest?: boolean
}

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: 'general', label: 'General clean' },
  { value: 'deep', label: 'Deep clean' },
  { value: 'move', label: 'Move in/out clean' },
]

const ADD_ON_OPTIONS = Object.entries(STANDARD_ADD_ONS).map(([key, hours]) => ({
  key,
  label: key.replace(/_/g, ' '),
  hours,
}))

const initialCustomAddon: CustomAddOn = { name: '', price: 0 }

const getDefaultBookingDate = () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().split('T')[0]
}

const getDefaultBookingEndDate = () => {
  const sixMonths = new Date()
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  return sixMonths.toISOString().split('T')[0]
}

function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export default function QuoteTool({ lead, emailId, autoEditLatest = false }: QuoteToolProps) {
  const { currentOrg } = useAuth()
  const [form, setForm] = useState<QuoteInput>({
    service: 'general',
    bedrooms: 2,
    bathrooms: 1,
    addons: [],
    customAddons: [initialCustomAddon],
    clientHourlyRate: DEFAULT_PRICING.CLIENT_HOURLY_RATE,
    cleanerHourlyRate: DEFAULT_PRICING.CLEANER_HOURLY_RATE,
    cleanerRateType: 'hour',
    discountApplied: false,
    discountPercentage: DEFAULT_PRICING.DEFAULT_DISCOUNT_PCT,
    depositPercentage: DEFAULT_PRICING.DEFAULT_DEPOSIT_PCT,
  })
  const [calcResult, setCalcResult] = useState<QuoteResult | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [loadingQuotes, setLoadingQuotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [address, setAddress] = useState('')
  const [addressLat, setAddressLat] = useState<number | null>(null)
  const [addressLng, setAddressLng] = useState<number | null>(null)
  const [mapboxToken, setMapboxToken] = useState<string | null>(null)
  const [mapboxError, setMapboxError] = useState<string | null>(null)
  const [addressResults, setAddressResults] = useState<{ place_name: string; center?: [number, number] }[]>([])
  const [isAddressSearching, setIsAddressSearching] = useState(false)
  const [isDescLoading, setIsDescLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [customerName, setCustomerName] = useState(lead?.name || '')
  const [customerEmail, setCustomerEmail] = useState(lead?.email || '')
  const [customerPhone, setCustomerPhone] = useState(lead?.phone_number || '')

  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [editingShareToken, setEditingShareToken] = useState<string | null>(null)
  const [editingQuoteNumber, setEditingQuoteNumber] = useState<string | null>(null)
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [stripeLinkUrl, setStripeLinkUrl] = useState<string | null>(null)
  const [stripeLinkError, setStripeLinkError] = useState<string | null>(null)
  const [stripeLinkLoading, setStripeLinkLoading] = useState(false)
  const [isEmailSending, setIsEmailSending] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSmsSending, setIsSmsSending] = useState(false)
  const [smsError, setSmsError] = useState<string | null>(null)
  const [scheduleBooking, setScheduleBooking] = useState(false)
  const [bookingDate, setBookingDate] = useState<string>(getDefaultBookingDate)
  const [bookingTime, setBookingTime] = useState('09:00')
  const [bookingDuration, setBookingDuration] = useState<number>(120)
  const [bookingRepeat, setBookingRepeat] = useState<RepeatType>('weekly')
  const [bookingEndType, setBookingEndType] = useState<'never' | 'date' | 'count'>('never')
  const [bookingEndDate, setBookingEndDate] = useState<string>(getDefaultBookingEndDate)
  const [bookingOccurrenceCount, setBookingOccurrenceCount] = useState<number>(12)
  const [bookingNotes, setBookingNotes] = useState('')
  const [bookingStatusMessage, setBookingStatusMessage] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)

  const leadId = lead?.id || null
  const latestQuote = quotes[0] || null

  const shareUrl = useMemo(() => {
    if (!latestQuote?.share_token) return null
    const url = new URL('/quote', window.location.origin)
    url.searchParams.set('quote', latestQuote.share_token)
    return url.toString()
  }, [latestQuote])

  useEffect(() => {
    fetchMapboxToken(currentOrg?.id)
      .then((token) => {
        setMapboxToken(token)
        setMapboxError(null)
      })
      .catch((err) => {
        console.error('Mapbox token load failed', err)
        setMapboxError(err instanceof Error ? err.message : 'Unable to load Mapbox token')
      })
  }, [currentOrg?.id])

  const refreshQuotes = useCallback(async () => {
    if (!leadId) return
    setLoadingQuotes(true)
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('org_id', currentOrg!.id)
        .eq('lead_id', leadId)
        .is('base_quote_id', null)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load quotes', error)
        return
      }

      setQuotes((data || []) as QuoteRecord[])
    } finally {
      setLoadingQuotes(false)
    }
  }, [leadId])

  useEffect(() => {
    refreshQuotes()
  }, [refreshQuotes])

  // In some contexts (e.g. job modal), default to editing the latest quote so "Update quote" is the normal action.
  useEffect(() => {
    if (!autoEditLatest) return
    if (loadingQuotes) return
    if (editingQuoteId) return
    const latest = quotes[0]
    if (!latest) return
    loadQuoteIntoForm(latest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditLatest, loadingQuotes, quotes, editingQuoteId])

  // Auto-load quote if editQuote parameter is present
  useEffect(() => {
    if (quotes.length === 0 || loadingQuotes) return
    
    const params = new URLSearchParams(window.location.search)
    const editQuoteId = params.get('editQuote')
    
    if (editQuoteId && !editingQuoteId) {
      const quoteToEdit = quotes.find((q) => q.id === editQuoteId)
      if (quoteToEdit) {
        // Load quote into form
        setEditingQuoteId(quoteToEdit.id)
        setEditingShareToken(quoteToEdit.share_token || null)
        setEditingQuoteNumber(quoteToEdit.quote_number || null)
        setEditingLeadId(quoteToEdit.lead_id || null)
        setForm({
          service: quoteToEdit.service as ServiceType,
          bedrooms: quoteToEdit.bedrooms,
          bathrooms: quoteToEdit.bathrooms,
          addons: quoteToEdit.addons || [],
          customAddons: quoteToEdit.custom_addons?.length ? quoteToEdit.custom_addons : [initialCustomAddon],
          clientHourlyRate: Number(quoteToEdit.hourly_rate),
          cleanerHourlyRate: Number(quoteToEdit.cleaner_rate),
          cleanerRateType: quoteToEdit.cleaner_rate_type === 'job' ? 'job' : 'hour',
          discountApplied: quoteToEdit.discount_amount > 0,
          discountPercentage:
            typeof quoteToEdit.discount_percentage === 'number'
              ? quoteToEdit.discount_percentage
              : quoteToEdit.discount_amount > 0
              ? DEFAULT_PRICING.DEFAULT_DISCOUNT_PCT
              : 0,
          depositPercentage: Number(quoteToEdit.deposit_percentage),
        })
        setNotes(quoteToEdit.notes || '')
        setDescription(quoteToEdit.description || '')
        setAddress(quoteToEdit.address || '')
        setCustomerName(quoteToEdit.customer_name || lead?.name || '')
        setCustomerEmail(quoteToEdit.customer_email || lead?.email || '')
        setCustomerPhone(quoteToEdit.customer_phone || lead?.phone_number || '')
        
        // Remove editQuote from URL
        params.delete('editQuote')
        const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
        window.history.replaceState({}, '', newUrl)
      }
    }
  }, [quotes, loadingQuotes, editingQuoteId, lead])

  // Keep quotes in sync when they change (e.g., paid via public link)
  useEffect(() => {
    if (!leadId) return
    const channel = supabase
      .channel(`quotes_${leadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotes', filter: `lead_id=eq.${leadId}` },
        () => {
          refreshQuotes()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [leadId, refreshQuotes])

  // Recalculate whenever inputs change
  useEffect(() => {
    try {
      const result = calculateQuote(form)
      setCalcResult(result)
      setCalcError(null)
    } catch (err) {
      setCalcResult(null)
      setCalcError(err instanceof Error ? err.message : 'Unable to calculate quote')
    }
  }, [form])

  const handleInputChange = <K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggleAddon = (addonKey: string) => {
    setForm((prev) => {
      const exists = prev.addons.includes(addonKey)
      return {
        ...prev,
        addons: exists ? prev.addons.filter((k) => k !== addonKey) : [...prev.addons, addonKey],
      }
    })
  }

  const updateCustomAddon = (index: number, patch: Partial<CustomAddOn>) => {
    setForm((prev) => {
      const next = [...prev.customAddons]
      next[index] = { ...next[index], ...patch }
      return { ...prev, customAddons: next }
    })
  }

  const addCustomAddonRow = () => {
    setForm((prev) => ({ ...prev, customAddons: [...prev.customAddons, { ...initialCustomAddon }] }))
  }

  const removeCustomAddonRow = (index: number) => {
    setForm((prev) => {
      const next = prev.customAddons.filter((_, i) => i !== index)
      return { ...prev, customAddons: next.length ? next : [{ ...initialCustomAddon }] }
    })
  }

  // Proactively push quote address/coords + quote link onto any booking for this lead.
  const syncQuoteToBooking = useCallback(async (quote: QuoteRecord | null) => {
    if (!quote?.id || !quote.lead_id) return
    try {
      const { data: seriesRows, error: seriesErr } = await supabase
        .from('booking_series')
        .select('id, quote_id, status, created_at')
        .eq('org_id', currentOrg!.id)
        .eq('lead_id', quote.lead_id)
        .order('created_at', { ascending: false })

      if (seriesErr || !seriesRows || seriesRows.length === 0) return

      const rows = seriesRows as any[]
      // Prefer the series already linked to this quote, otherwise the newest active (non-cancelled),
      // otherwise (single booking per lead) the only series.
      const target =
        rows.find((s) => s.quote_id === quote.id) ||
        rows.find((s) => !s.quote_id && s.status !== 'cancelled') ||
        (rows.length === 1 ? rows[0] : null)

      if (!target?.id) return

      const hasLatLng = typeof quote.address_lat === 'number' && typeof quote.address_lng === 'number'
      // Avoid unnecessary round-trips if nothing would change.
      if (target.quote_id === quote.id && !quote.address && !hasLatLng) return

      const updatePayload: Record<string, any> = { quote_id: quote.id }
      if (quote.address) {
        updatePayload.service_address = quote.address
      }
      if (hasLatLng) {
        updatePayload.service_lat = quote.address_lat
        updatePayload.service_lng = quote.address_lng
      }

      await supabase.from('booking_series').update(updatePayload).eq('id', target.id).eq('org_id', currentOrg!.id)
    } catch (err) {
      console.warn('Quote save: failed to sync booking address/quote link', err)
    }
  }, [])

  // Clamp numeric values to prevent database overflow
  // numeric(10,2) max = 99999999.99, numeric(6,2) max = 9999.99, numeric(5,2) max = 999.99
  const clampValue = (val: number, max: number) => Math.min(Math.max(0, val), max)
  const clamp10_2 = (val: number) => clampValue(val, 99999999.99)
  const clamp6_2 = (val: number) => clampValue(val, 9999.99)
  const clamp5_2 = (val: number) => clampValue(val, 999.99)
  const formatCurrency = (val?: number | null) =>
    typeof val === 'number' && Number.isFinite(val)
      ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(val)
      : '—'
  const ADDON_DISPLAY_NAMES: Record<string, string> = {
    inside_oven_clean: 'Inside Oven Clean',
    inside_fridge_clean: 'Inside Fridge Clean',
    inside_freezer_clean: 'Inside Freezer Clean',
    inside_windows_and_tracks: 'Inside Windows & Tracks',
    blinds_up_to_5_sets: 'Blinds (up to 5 sets)',
    balcony_clean: 'Balcony Clean',
    garage_sweep_and_cobwebs: 'Garage Sweep & Cobwebs',
    carpet_steam_clean_1_room: 'Carpet Steam Clean (1 room)',
    wall_spot_cleaning: 'Wall Spot Cleaning',
    extra_bathroom: 'Extra Bathroom',
    extra_bedroom: 'Extra Bedroom',
  }
  const humanizeAddonKey = (value: string) => {
    const mapped = ADDON_DISPLAY_NAMES[value]
    if (mapped) return mapped
    return value
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }
  const formatAddons = (addons?: string[] | null, customAddons?: CustomAddOn[] | null) => {
    const parts: string[] = []
    if (Array.isArray(addons)) {
      addons.forEach((item) => {
        if (typeof item === 'string' && item.trim() !== '') {
          parts.push(humanizeAddonKey(item.trim()))
        }
      })
    }
    if (Array.isArray(customAddons)) {
      customAddons.forEach((addon) => {
        if (addon?.name && addon.name.trim() !== '') {
          parts.push(addon.name.trim())
        }
      })
    }
    return parts.join(', ')
  }

  const handleSaveQuote = async (mode: 'auto' | 'new' = 'auto') => {
    setBookingError(null)
    setBookingStatusMessage(null)
    if (!leadId && !editingLeadId) {
      setCalcError('Extract the lead first to attach the quote.')
      return
    }
    if (!calcResult) {
      setCalcError('Fix calculation errors before saving.')
      return
    }

    // Validate that values are reasonable before saving
    const MAX_MONETARY = 99999999.99
    const MAX_HOURS = 9999.99
    if (calcResult.totalIncGst > MAX_MONETARY) {
      setCalcError(`Total amount ($${calcResult.totalIncGst.toFixed(2)}) exceeds maximum allowed. Reduce prices or add-ons.`)
      return
    }
    if (calcResult.totalLaborHours > MAX_HOURS) {
      setCalcError(`Total hours (${calcResult.totalLaborHours}) exceeds maximum allowed (${MAX_HOURS}).`)
      return
    }

    setIsSaving(true)
    setSaveMessage(null)
    try {
      const shareToken = generateShareToken()
      const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26))
      const digits = Math.floor(Math.random() * 9000 + 1000)
      const quoteNumber = `${letter}${digits}`
      // Filter out empty custom add-ons (name is empty or price is 0 with no name)
      const filteredCustomAddons = form.customAddons.filter(
        (addon) => addon.name && addon.name.trim() !== ''
      )
      const payload = {
        lead_id: leadId || editingLeadId,
        email_id: emailId ?? null,
        quote_number: editingQuoteNumber || quoteNumber,
        address: address || null,
        address_lat: addressLat,
        address_lng: addressLng,
        description: description || null,
        service: form.service,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        addons: form.addons,
        custom_addons: filteredCustomAddons,
        hourly_rate: clamp10_2(form.clientHourlyRate),
        cleaner_rate: clamp10_2(form.cleanerHourlyRate),
        cleaner_rate_type: form.cleanerRateType,
        main_service_hours: clamp6_2(calcResult.mainServiceHours),
        add_on_hours: clamp6_2(calcResult.totalAddOnHours),
        total_hours: clamp6_2(calcResult.totalLaborHours),
        subtotal: clamp10_2(calcResult.subtotal),
        discount_amount: clamp10_2(calcResult.discountAmount),
      discount_percentage: clamp5_2(form.discountPercentage),
        net_revenue: clamp10_2(calcResult.netRevenue),
        gst: clamp10_2(calcResult.gst),
        total_inc_gst: clamp10_2(calcResult.totalIncGst),
        cleaner_pay: clamp10_2(calcResult.cleanerPay),
        profit: clamp10_2(calcResult.profit),
        margin: clamp6_2(calcResult.profitMarginPct),
        deposit_percentage: clamp5_2(form.depositPercentage),
        deposit_amount: clamp10_2(calcResult.depositAmount),
        remaining_balance: clamp10_2(calcResult.remainingBalance),
        notes: notes || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        share_token: editingShareToken || shareToken,
      }

      let saved: QuoteRecord | null = null
      const shouldUpdate = mode === 'auto' ? Boolean(editingQuoteId) : false
      if (shouldUpdate) {
        const { data, error } = await supabase.from('quotes').update(payload).eq('id', editingQuoteId).eq('org_id', currentOrg!.id).select('*').single()
        if (error) throw error
        saved = data as QuoteRecord
      } else {
        const { data, error } = await supabase.from('quotes').insert({ ...payload, org_id: currentOrg!.id }).select('*').single()
        if (error) throw error
        saved = data as QuoteRecord
      }

      const targetLeadId = leadId || editingLeadId
      if (targetLeadId) {
        const { error: leadErr } = await supabase
          .from('extracted_leads')
          .update({
            name: customerName || null,
            email: customerEmail || null,
            phone_number: customerPhone || null,
          })
          .eq('id', targetLeadId)
          .eq('org_id', currentOrg!.id)
        if (leadErr) {
          console.error('Failed to update extracted lead contact info', leadErr)
        }
      }

      // Keep the booking in sync with this quote (address + explicit quote link)
      await syncQuoteToBooking(saved)

      const savedQuoteId = saved?.id || editingQuoteId
      let bookingSuccessText: string | null = null

      if (scheduleBooking) {
        if (!targetLeadId || !savedQuoteId) {
          setBookingError('Need a lead and quote to create a booking.')
        } else {
          try {
            const startDate = new Date(`${bookingDate}T${bookingTime}:00`)
            if (Number.isNaN(startDate.getTime())) {
              throw new Error('Pick a valid booking date and time for the booking.')
            }

            const bookingPayload: CreateBookingPayload = {
              leadId: targetLeadId,
              quoteId: savedQuoteId,
              startsAt: startDate.toISOString(),
              durationMinutes: bookingDuration,
              repeatType: bookingRepeat,
              notes: bookingNotes || notes || undefined,
              updateLeadStatus: true,
              timezone: DEFAULT_TIMEZONE,
            }

            if (bookingRepeat !== 'none') {
              if (bookingEndType === 'date') {
                bookingPayload.untilDate = bookingEndDate
              } else if (bookingEndType === 'count') {
                bookingPayload.occurrenceCount = bookingOccurrenceCount
              }
            }

            const bookingResult = await createBooking(bookingPayload)
            const occurrencesCreated =
              typeof bookingResult?.occurrences_created === 'number'
                ? bookingResult.occurrences_created
                : bookingRepeat === 'none'
                ? 1
                : undefined

            bookingSuccessText = `Booking scheduled${
              occurrencesCreated ? ` (${occurrencesCreated} occurrence${occurrencesCreated === 1 ? '' : 's'})` : ''
            } starting ${startDate.toLocaleString()}.`
            setBookingStatusMessage(bookingSuccessText)
          } catch (bookingErr) {
            const msg = bookingErr instanceof Error ? bookingErr.message : 'Failed to schedule booking'
            setBookingError(msg)
          }
        }
      }

      setQuotes((prev) => {
        if (editingQuoteId && saved) {
          return prev.map((q) => (q.id === editingQuoteId ? saved! : q))
        }
        return saved ? [saved, ...prev] : prev
      })
      resetEditing()
      const baseSaveMessage = 'Quote saved and linked to the lead.'
      setSaveMessage(bookingSuccessText ? `${baseSaveMessage} ${bookingSuccessText}` : baseSaveMessage)
      playSaveSound()
    } catch (err: any) {
      console.error('Failed to save quote', err)
      const msg = err?.message || err?.error_description || (typeof err === 'string' ? err : 'Failed to save quote')
      setCalcError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateStripeLink = async () => {
    if (!calcResult) {
      setStripeLinkError('Calculate the quote first.')
      return
    }
    const amountCents = Math.round((calcResult.totalIncGst || 0) * 100)
    if (!amountCents || amountCents < 50) {
      setStripeLinkError('Amount must be at least $0.50 AUD.')
      return
    }

    setStripeLinkLoading(true)
    setStripeLinkError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const shareToken = latestQuote?.share_token || editingShareToken
      const successUrl = shareToken
        ? `${window.location.origin}/quote?quote=${shareToken}&payment_status=success`
        : `${window.location.origin}/quote?payment_status=success`
      const cancelUrl = shareToken
        ? `${window.location.origin}/quote?quote=${shareToken}&payment_status=cancelled`
        : `${window.location.origin}/quote?payment_status=cancelled`

      const response = await fetch(`${supabaseUrl}/functions/v1/create-payment-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg!.id,
        },
        body: JSON.stringify({
          amount_cents: amountCents,
          currency: 'aud',
          quoteId: editingQuoteId || latestQuote?.id || leadId || 'manual',
          customerName: customerName || lead?.name || '',
          customerEmail: customerEmail || lead?.email || '',
          description: description || `Cleaning service for ${customerName || lead?.name || 'customer'}`,
          success_url: successUrl,
          cancel_url: cancelUrl,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'Failed to create Stripe link')
      }

      setStripeLinkUrl(data.url)
      setSaveMessage('Stripe payment link created.')
    } catch (err) {
      console.error('Stripe link error:', err)
      setStripeLinkError(err instanceof Error ? err.message : 'Failed to create Stripe link')
    } finally {
      setStripeLinkLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setSaveMessage('Share link copied to clipboard')
    } catch (err) {
      console.error('Copy failed', err)
      setCalcError('Could not copy link. Copy manually instead.')
    }
  }

  const handleSendQuoteEmail = async () => {
    if (!latestQuote?.id) {
      setEmailError('Save the quote before emailing it.')
      return
    }
    const targetEmail = customerEmail || latestQuote.customer_email || lead?.email || ''
    if (!targetEmail) {
      setEmailError('Add a customer email before sending.')
      return
    }

    setIsEmailSending(true)
    setEmailError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${supabaseUrl}/functions/v1/quote-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg!.id,
        },
        body: JSON.stringify({
          quoteId: latestQuote.id,
          shareUrl,
          emailOverride: targetEmail,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to send quote email')
      }
      setSaveMessage(`Quote email sent to ${data?.email_to || targetEmail}.`)
    } catch (err) {
      console.error('Quote email send failed', err)
      setEmailError(err instanceof Error ? err.message : 'Failed to send quote email')
    } finally {
      setIsEmailSending(false)
    }
  }

  const handleSendQuoteSms = async () => {
    if (!latestQuote?.id) {
      setSmsError('Save the quote before sending SMS.')
      return
    }
    if (!shareUrl) {
      setSmsError('Share link unavailable. Save the quote to generate a link.')
      return
    }
    const targetPhone = customerPhone || latestQuote.customer_phone || lead?.phone_number || ''
    if (!targetPhone) {
      setSmsError('Add a customer phone number before sending.')
      return
    }

    const customerLabel = customerName || lead?.name || 'there'
    const addressLabel = address || latestQuote.address || ''
    const serviceLabel = `${latestQuote.service || 'Cleaning'} clean`
    const roomsLabel = `${latestQuote.bedrooms} bedroom, ${latestQuote.bathrooms} bathroom`
    const addonsLabel = formatAddons(latestQuote.addons, latestQuote.custom_addons)
    const gstLabel = formatCurrency(latestQuote.gst)
    const totalLabel = formatCurrency(latestQuote.total_inc_gst)
    const addonsLine = addonsLabel ? `Add-ons: ${addonsLabel}` : ''
    const addressLine = addressLabel ? `Here is your quote for ${addressLabel}.` : 'Here is your quote.'

    const smsBody = [
      `Hey ${customerLabel},`,
      addressLine,
      `${serviceLabel} — ${roomsLabel}.`,
      addonsLine,
      '',
      'Price breakdown',
      `GST: ${gstLabel}`,
      `Total: ${totalLabel}`,
      '',
      `Here is the link to the full quote + payment details:`,
      shareUrl,
      '',
      'Thanks, get back to me ASAP so I can book you in.',
    ]
      .filter((line) => line.trim() !== '')
      .join('\n')

    setIsSmsSending(true)
    setSmsError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${supabaseUrl}/functions/v1/internal-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg!.id,
        },
        body: JSON.stringify({
          phone_number: targetPhone,
          message: smsBody,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to send SMS (status ${response.status})`)
      }

      const targetLeadId = leadId || editingLeadId
      if (targetLeadId) {
        const sentAtIso = new Date().toISOString()
        const { error: updateError } = await supabase
          .from('extracted_leads')
          .update({ last_text_date: sentAtIso, last_text_body: smsBody })
          .eq('id', targetLeadId)
        if (updateError) {
          console.error('Failed to update last_text_date', updateError)
        }
      }

      setSaveMessage(`Quote SMS sent to ${targetPhone}.`)
    } catch (err: any) {
      console.error('Quote SMS send failed', err)
      setSmsError(err instanceof Error ? err.message : 'Failed to send quote SMS')
    } finally {
      setIsSmsSending(false)
    }
  }

  const renderResultRow = (label: string, value: string) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  )

  const handleAddressSearch = useCallback(
    async (query: string) => {
      if (!query || query.length < 3 || !mapboxToken) {
        setAddressResults([])
        setIsAddressSearching(false)
        return
      }
      setIsAddressSearching(true)
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query
        )}.json?access_token=${mapboxToken}&autocomplete=true&limit=5&country=AU`
        const res = await fetch(url)
        const data = await res.json()
        const suggestions =
          data?.features
            ?.map((f: any) => ({
              place_name: f?.place_name as string,
              center: f?.center as [number, number] | undefined, // [lng, lat]
            }))
            .filter((x: any) => typeof x?.place_name === 'string' && x.place_name.length > 0) || []
        setAddressResults(suggestions)
      } catch (err) {
        console.error('Address lookup failed', err)
        setAddressResults([])
      } finally {
        setIsAddressSearching(false)
      }
    },
    [mapboxToken]
  )

  const resetBookingFields = useCallback(() => {
    setScheduleBooking(false)
    setBookingDate(getDefaultBookingDate())
    setBookingTime('09:00')
    setBookingDuration(120)
    setBookingRepeat('weekly')
    setBookingEndType('never')
    setBookingEndDate(getDefaultBookingEndDate())
    setBookingOccurrenceCount(12)
    setBookingNotes('')
    setBookingStatusMessage(null)
    setBookingError(null)
  }, [])

  const handleGenerateDescription = async () => {
    setIsDescLoading(true)
    setCalcError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-quote-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg!.id,
        },
        body: JSON.stringify({
          customerName: lead?.name || 'customer',
          service: form.service,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          addons: form.addons,
          customAddons: form.customAddons,
          notes: notes || '',
        }),
      })
      const data = await res.json()
      const text = data?.description?.trim()
      if (!res.ok || !text) throw new Error(data?.error || 'No description returned')
      setDescription(text)
    } catch (err) {
      console.error('Description generation failed', err)
      setCalcError(err instanceof Error ? err.message : 'Failed to generate description')
    } finally {
      setIsDescLoading(false)
    }
  }

  const applyLeadDefaults = useCallback(() => {
    setCustomerName(lead?.name || '')
    setCustomerEmail(lead?.email || '')
    setCustomerPhone(lead?.phone_number || '')
  }, [lead?.email, lead?.name, lead?.phone_number])

  useEffect(() => {
    applyLeadDefaults()
  }, [applyLeadDefaults])

  const loadQuoteIntoForm = (quote: QuoteRecord) => {
    resetBookingFields()
    setEditingQuoteId(quote.id)
    setEditingShareToken(quote.share_token || null)
    setEditingQuoteNumber(quote.quote_number || null)
    setEditingLeadId(quote.lead_id || null)
    setForm({
      service: quote.service as ServiceType,
      bedrooms: quote.bedrooms,
      bathrooms: quote.bathrooms,
      addons: quote.addons || [],
      customAddons: quote.custom_addons?.length ? quote.custom_addons : [initialCustomAddon],
      clientHourlyRate: Number(quote.hourly_rate),
      cleanerHourlyRate: Number(quote.cleaner_rate),
      cleanerRateType: quote.cleaner_rate_type === 'job' ? 'job' : 'hour',
      discountApplied: quote.discount_amount > 0,
      discountPercentage:
        typeof quote.discount_percentage === 'number'
          ? quote.discount_percentage
          : quote.discount_amount > 0
          ? DEFAULT_PRICING.DEFAULT_DISCOUNT_PCT
          : 0,
      depositPercentage: Number(quote.deposit_percentage),
    })
    setNotes(quote.notes || '')
    setDescription(quote.description || '')
    setAddress(quote.address || '')
    setAddressLat(typeof quote.address_lat === 'number' ? quote.address_lat : null)
    setAddressLng(typeof quote.address_lng === 'number' ? quote.address_lng : null)
    setCustomerName(quote.customer_name || lead?.name || '')
    setCustomerEmail(quote.customer_email || lead?.email || '')
    setCustomerPhone(quote.customer_phone || lead?.phone_number || '')
  }

  const resetEditing = () => {
    setEditingQuoteId(null)
    setEditingShareToken(null)
    setEditingQuoteNumber(null)
    setEditingLeadId(null)
    applyLeadDefaults()
    resetBookingFields()
  }

  if (!currentOrg) return null

  return (
    <div className="rounded-xl border border-white/10 bg-[var(--color-surface-light)] p-4 space-y-4" data-tour="quote-builder">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-[var(--color-text-muted)] tracking-wider">Quote tool</p>
          <h4 className="text-white font-semibold">Cleaning Price Calculator</h4>
          <p className="text-xs text-[var(--color-text-muted)]">
            Linked to this lead. Focused on inputs → math → saved quote.
          </p>
        </div>
        {lead?.name && <span className="text-sm text-emerald-200">Lead: {lead.name}</span>}
      </div>

      {!leadId && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
          Extract the lead information first to enable quoting.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Service type</label>
          <select
            value={form.service}
            onChange={(e) => handleInputChange('service', e.target.value as ServiceType)}
            className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
          >
            {SERVICE_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Bedrooms</label>
          <input
            type="number"
            min={1}
            max={6}
            value={form.bedrooms}
            onChange={(e) => handleInputChange('bedrooms', Number(e.target.value))}
            className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Bathrooms</label>
          <input
            type="number"
            min={1}
            max={3}
            value={form.bathrooms}
            onChange={(e) => handleInputChange('bathrooms', Number(e.target.value))}
            className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Standard add-ons</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg border border-white/10 bg-black/10">
            {ADD_ON_OPTIONS.map((addon) => (
              <label key={addon.key} className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={form.addons.includes(addon.key)}
                  onChange={() => toggleAddon(addon.key)}
                />
                <span className="flex-1 truncate">{addon.label}</span>
                <span className="text-[var(--color-text-muted)] text-xs">{addon.hours}h</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Custom add-ons (fixed price)</label>
          <div className="space-y-2">
            {form.customAddons.map((addon, idx) => (
              <div key={idx} className="grid grid-cols-6 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Name"
                  value={addon.name}
                  onChange={(e) => updateCustomAddon(idx, { name: e.target.value })}
                  className="col-span-3 rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                />
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step="1"
                  value={addon.price}
                  onChange={(e) => updateCustomAddon(idx, { price: Number(e.target.value) })}
                  className="col-span-2 rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                />
                <button
                  onClick={() => removeCustomAddonRow(idx)}
                  className="col-span-1 text-xs text-red-300 hover:text-red-200"
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={addCustomAddonRow}
              type="button"
              className="text-xs text-emerald-300 hover:text-emerald-200"
            >
              + Add custom add-on
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Customer</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
            />
            <input
              type="email"
              placeholder="Email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              placeholder="Phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>

          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Service address</label>
          {mapboxError && (
            <div className="text-[11px] text-red-200">
              Map search unavailable: {mapboxError}
            </div>
          )}
          <input
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setAddressLat(null)
              setAddressLng(null)
              handleAddressSearch(e.target.value)
            }}
            placeholder="Search or type address (powered by Mapbox; you can edit manually)"
            className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
            onBlur={() => setTimeout(() => setAddressResults([]), 150)}
          />
          {isAddressSearching && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] px-1">
              <svg className="w-4 h-4 animate-spin text-cyan-300" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching addresses…
            </div>
          )}
          {addressResults.length > 0 && (
            <div className="border border-white/10 rounded-lg bg-black/50 max-h-40 overflow-y-auto text-sm">
              {addressResults.map((item) => (
                <button
                  key={item.place_name}
                  type="button"
                  onClick={() => {
                    setAddress(item.place_name)
                    setAddressLng(item.center?.[0] ?? null)
                    setAddressLat(item.center?.[1] ?? null)
                    setAddressResults([])
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-white/10 text-white"
                >
                  {item.place_name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            {typeof addressLat === 'number' && typeof addressLng === 'number'
              ? `Pinned: ${addressLat.toFixed(5)}, ${addressLng.toFixed(5)}`
              : 'Not pinned yet — pick a suggestion to save coordinates.'}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Short description</label>
          <div className="flex gap-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="30-60 word summary for the customer"
              className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={handleGenerateDescription}
              disabled={isDescLoading}
              className="self-start px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs disabled:opacity-60"
            >
              {isDescLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Notes for this quote</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Scheduling, access, scope, or payment notes"
          className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
        />
      </div>

      <div className="space-y-3 rounded-lg border border-white/10 p-3 bg-black/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h5 className="text-sm text-white font-semibold">Schedule first booking (optional)</h5>
            <p className="text-xs text-[var(--color-text-muted)]">
              Same details as “Schedule First Booking” modal. If enabled, the booking is created when you save the quote.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-white">
            <input
              type="checkbox"
              checked={scheduleBooking}
              onChange={(e) => {
                setScheduleBooking(e.target.checked)
                setBookingError(null)
              }}
              disabled={!leadId}
            />
            <span className={leadId ? '' : 'text-[var(--color-text-muted)]'}>Schedule with save</span>
          </label>
        </div>

        {!leadId && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            Extract or select the lead first to create a booking.
          </div>
        )}

        {scheduleBooking && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Time</label>
                <input
                  type="time"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Duration</label>
                <select
                  value={bookingDuration}
                  onChange={(e) => setBookingDuration(Number(e.target.value))}
                  className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Repeat</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {REPEAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBookingRepeat(opt.value)}
                    className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                      bookingRepeat === opt.value
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                        : 'bg-[var(--color-surface)] border-white/10 text-white hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {bookingRepeat !== 'none' && (
              <div className="space-y-2 rounded-lg border border-white/10 p-3 bg-black/10">
                <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">End condition</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'never', label: 'Never' },
                    { value: 'date', label: 'Until date' },
                    { value: 'count', label: 'After # visits' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBookingEndType(opt.value as typeof bookingEndType)}
                      className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                        bookingEndType === opt.value
                          ? 'bg-teal-500/20 border-teal-500/50 text-teal-200'
                          : 'bg-[var(--color-surface)] border-white/10 text-white hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {bookingEndType === 'date' && (
                  <input
                    type="date"
                    value={bookingEndDate}
                    onChange={(e) => setBookingEndDate(e.target.value)}
                    className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                  />
                )}

                {bookingEndType === 'count' && (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={bookingOccurrenceCount}
                      onChange={(e) => setBookingOccurrenceCount(Number(e.target.value))}
                      className="w-24 rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
                    />
                    <span className="text-xs text-[var(--color-text-muted)]">visits</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Booking notes</label>
              <textarea
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={2}
                placeholder="Access, parking, or cleaner notes (optional)"
                className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
              />
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Timezone: {DEFAULT_TIMEZONE}. Lead status is set to Job Won when the booking is created.
              </p>
            </div>

            {bookingStatusMessage && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs">
                {bookingStatusMessage}
              </div>
            )}

            {bookingError && (
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
                {bookingError}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Client hourly rate</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={form.clientHourlyRate}
            onChange={(e) => handleInputChange('clientHourlyRate', Number(e.target.value))}
            className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Cleaner rate</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={10000}
              value={form.cleanerHourlyRate}
              onChange={(e) => handleInputChange('cleanerHourlyRate', Number(e.target.value))}
              className="flex-1 rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
            />
            <select
              value={form.cleanerRateType}
              onChange={(e) => handleInputChange('cleanerRateType', e.target.value as QuoteInput['cleanerRateType'])}
              className="rounded-lg bg-[var(--color-surface)] border border-white/10 px-2 py-2 text-xs text-white"
            >
              <option value="hour">per hour</option>
              <option value="job">per job</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Discount %</label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.discountApplied}
              onChange={(e) => handleInputChange('discountApplied', e.target.checked)}
            />
            <input
              type="number"
              min={0}
              max={100}
              value={form.discountPercentage}
              onChange={(e) => handleInputChange('discountPercentage', Number(e.target.value))}
              className="flex-1 rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Deposit %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.depositPercentage}
            onChange={(e) => handleInputChange('depositPercentage', Number(e.target.value))}
            className="w-full rounded-lg bg-[var(--color-surface)] border border-white/10 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      {calcError && (
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
          {calcError}
        </div>
      )}
      {saveMessage && (
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm" data-testid="quote-save-message">
          {saveMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-white/10 p-3 space-y-2 bg-black/10">
          <h5 className="text-sm text-white font-semibold">Quote breakdown</h5>
          {calcResult ? (
            <>
              {renderResultRow('Main service hours', `${calcResult.mainServiceHours} h`)}
              {renderResultRow('Main service cost', `$${calcResult.mainServiceCost.toFixed(2)}`)}
              {renderResultRow('Add-on hours', `${calcResult.totalAddOnHours} h`)}
              {renderResultRow('Add-on cost', `$${calcResult.totalAddOnCost.toFixed(2)}`)}
              {renderResultRow('Custom add-ons', `$${calcResult.totalCustomAddOnCost.toFixed(2)}`)}
              {renderResultRow('Subtotal', `$${calcResult.subtotal.toFixed(2)}`)}
              {renderResultRow('Discount', `$${calcResult.discountAmount.toFixed(2)}`)}
              {renderResultRow('Net revenue', `$${calcResult.netRevenue.toFixed(2)}`)}
              {renderResultRow('GST (10%)', `$${calcResult.gst.toFixed(2)}`)}
              {renderResultRow('Total inc GST', `$${calcResult.totalIncGst.toFixed(2)}`)}
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Enter inputs to see totals.</p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 p-3 space-y-2 bg-black/10">
          <h5 className="text-sm text-white font-semibold">Operational metrics</h5>
          {calcResult ? (
            <>
              {renderResultRow('Total labor hours', `${calcResult.totalLaborHours} h`)}
              {renderResultRow('Cleaner pay', `$${calcResult.cleanerPay.toFixed(2)}`)}
              {renderResultRow('Profit', `$${calcResult.profit.toFixed(2)}`)}
              {renderResultRow('Profit margin', `${calcResult.profitMarginPct}%`)}
              {renderResultRow('Profit per hour', `$${calcResult.profitPerHour.toFixed(2)}`)}
              {renderResultRow('Deposit', `$${calcResult.depositAmount.toFixed(2)}`)}
              {renderResultRow('Remaining balance', `$${calcResult.remainingBalance.toFixed(2)}`)}
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Totals will appear here.</p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 p-3 space-y-3 bg-black/10">
          <h5 className="text-sm text-white font-semibold">Save & share</h5>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleSaveQuote('auto')}
              disabled={!leadId || !calcResult || isSaving}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 disabled:opacity-60"
              data-testid="quote-save"
            >
              {isSaving ? 'Saving...' : editingQuoteId ? 'Update quote' : 'Save quote'}
            </button>
            {editingQuoteId && (
              <button
                onClick={() => handleSaveQuote('new')}
                disabled={!leadId || !calcResult || isSaving}
                className="w-full rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm py-2 disabled:opacity-60"
                type="button"
                data-testid="quote-save-new"
              >
                Save as new quote
              </button>
            )}
            <button
              onClick={handleCopyLink}
              disabled={!shareUrl}
              className="w-full rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm py-2 disabled:opacity-60"
              data-testid="quote-copy-link"
            >
              Copy share link
            </button>
            <button
              onClick={handleSendQuoteEmail}
              disabled={!latestQuote || isEmailSending}
              className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 disabled:opacity-60"
              type="button"
              data-testid="quote-email"
            >
              {isEmailSending ? 'Sending quote…' : 'Email quote'}
            </button>
            <button
              onClick={handleSendQuoteSms}
              disabled={!latestQuote || isSmsSending || !shareUrl}
              className="w-full inline-flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm py-2 disabled:opacity-60"
              type="button"
              data-testid="quote-sms"
            >
              {isSmsSending ? 'Sending SMS…' : 'SMS quote'}
            </button>
            {shareUrl && (
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center rounded-lg bg-[var(--color-surface)] border border-white/10 text-white text-sm py-2"
                data-testid="quote-share-open"
              >
                Open public link
              </a>
            )}
          </div>
          {emailError && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
              {emailError}
            </div>
          )}
          {smsError && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
              {smsError}
            </div>
          )}

          <div
            className={`relative rounded-lg border border-white/10 p-3 space-y-2 bg-black/5 ${
              latestQuote?.accepted_payment_method === 'card_paid' ? 'opacity-80' : ''
            }`}
          >
            {latestQuote?.accepted_payment_method === 'card_paid' && (
              <div className="absolute inset-0 rounded-lg border border-emerald-400/30 pointer-events-none flex items-center justify-center">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/25 text-emerald-100 border border-emerald-400/40 font-semibold text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Paid
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h6 className="text-sm text-white font-semibold">Payment link</h6>
              {stripeLinkLoading && <span className="text-xs text-[var(--color-text-muted)]">Creating…</span>}
            </div>
            <button
              onClick={handleCreateStripeLink}
              disabled={!calcResult || stripeLinkLoading || latestQuote?.accepted_payment_method === 'card_paid'}
              className="w-full rounded-lg text-white text-sm font-semibold py-2 disabled:opacity-60 bg-blue-600 hover:bg-blue-700 disabled:bg-emerald-700/30 disabled:border disabled:border-emerald-500/40"
              type="button"
              data-testid="quote-stripe-generate"
            >
              {latestQuote?.accepted_payment_method === 'card_paid' ? 'Paid' : 'Generate Stripe Payment Link'}
            </button>
            {stripeLinkError && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-200 text-xs">{stripeLinkError}</div>
            )}
            {stripeLinkUrl && (
              <div className="space-y-1 text-xs text-[var(--color-text-muted)] break-words">
                <div className="text-white">Link ready:</div>
                <a className="text-emerald-300 break-words" href={stripeLinkUrl} target="_blank" rel="noreferrer">
                  {stripeLinkUrl}
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    if (!stripeLinkUrl) return
                    try {
                      await navigator.clipboard.writeText(stripeLinkUrl)
                      setSaveMessage('Stripe link copied to clipboard')
                    } catch {
                      setStripeLinkError('Copy failed; copy manually.')
                    }
                  }}
                  className="text-blue-300 underline"
                >
                  Copy link
                </button>
              </div>
            )}
          </div>

          {latestQuote && (
            <div className="text-xs text-[var(--color-text-muted)] space-y-1">
              <div>Quote #: {latestQuote.quote_number || 'pending'}</div>
              <div>Last saved: {new Date(latestQuote.created_at || '').toLocaleString()}</div>
              <div>Total inc GST: ${latestQuote.total_inc_gst?.toFixed(2)}</div>
              <div>Deposit: ${latestQuote.deposit_amount?.toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-white/10 p-3 bg-black/5">
        <div className="flex items-center justify-between">
          <h5 className="text-sm text-white font-semibold">Saved quotes for this lead</h5>
          {loadingQuotes && <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>}
        </div>
        {quotes.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No quotes yet.</p>
        ) : (
          <div className="space-y-2">
            {quotes.map((quote) => (
              <div
                key={quote.id}
                className={`relative border border-white/10 rounded-lg p-2 text-sm text-white ${
                  quote.accepted_payment_method === 'card_paid' ? 'bg-emerald-500/10 border-emerald-400/30' : ''
                }`}
              >
                {quote.accepted_payment_method === 'card_paid' && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/25 text-emerald-100 border border-emerald-400/40">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Paid
                  </span>
                )}
                <div className="flex items-center justify-between pr-16">
                  <div className="font-semibold capitalize">
                    {quote.service} clean {quote.quote_number ? `· ${quote.quote_number}` : ''}
                  </div>
                  <div className="text-[var(--color-text-muted)]">
                    {new Date(quote.created_at || '').toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)] mt-1">
                  <span>{quote.bedrooms} bed / {quote.bathrooms} bath</span>
                  <span>Total inc GST: ${quote.total_inc_gst?.toFixed(2)}</span>
                  <span>Profit: ${quote.profit?.toFixed(2)}</span>
                  {quote.notes && <span className="truncate max-w-[220px]">Notes: {quote.notes}</span>}
                  {quote.share_token && (
                    <a
                      href={`${window.location.origin}/quote?quote=${quote.share_token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300"
                    >
                      View link
                    </a>
                  )}
                  <button
                    onClick={() => loadQuoteIntoForm(quote)}
                    className="text-blue-300 underline"
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      const confirmed = window.confirm('Delete this quote?')
                      if (!confirmed) return
                      const { error } = await supabase.from('quotes').delete().eq('id', quote.id).eq('org_id', currentOrg!.id)
                      if (error) {
                        console.error('Delete failed', error)
                        setCalcError(error.message || 'Failed to delete quote')
                      } else {
                        setQuotes((prev) => prev.filter((q) => q.id !== quote.id))
                        if (editingQuoteId === quote.id) {
                          resetEditing()
                        }
                      }
                    }}
                    className="text-red-300 underline"
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
