/**
 * CompletedJobs - Apple VisionOS Payment & Jobs Tracker
 * 
 * A beautiful interface for tracking completed jobs and payments.
 * Glass cards, contextual feedback, and clear payment status.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { useAuth } from '../lib/auth'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { playSaveSound } from '../lib/sounds'
import { GlassCard, Button, Badge, useToast, StatCard } from './ui'
import PaymentReminderSms from './PaymentReminderSms'
import ReviewReminderSms from './ReviewReminderSms'

const googleReviewUrl =
  import.meta.env.VITE_GOOGLE_REVIEW_URL ||
  'https://g.page/r/CleaningReview'
type PaymentStatus = 'waiting_payment' | 'invoice_sent' | 'paid'

interface BookingSeries {
  id: string
  lead_id: string
  title: string
  timezone: string
  starts_at: string
  duration_minutes: number
  rrule: string | null
  status: string
  notes: string | null
  quote_id?: string | null
  lead?: Lead | null
}

interface BookingOccurrence {
  id: string
  series_id: string
  quote_id?: string | null
  start_at: string
  end_at: string
  status: string
  notes: string | null
  original_start_at: string | null
  payment_status?: PaymentStatus | null
  payment_link?: string | null
  payment_amount_cents?: number | null
  payment_notes?: string | null
  payment_paid_at?: string | null
}

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone_number: string | null
  region_notes: string | null
}

interface QuoteRecord {
  id: string
  lead_id: string | null
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  total_inc_gst?: number | null
  share_token?: string | null
  quote_number?: string | null
  service?: string | null
  accepted_payment_method?: string | null
}

type CompletedRow = {
  occurrence: BookingOccurrence
  series: BookingSeries
  lead: Lead | null
  quote?: QuoteRecord | null
}

type PaymentSmsLog = {
  id: string
  occurrence_id: string
  template_id?: string | null
  body: string
  tone?: string | null
  amount_cents?: number | null
  sent_at: string
}

const PAYMENT_CONFIG: Record<PaymentStatus, { color: string; bgMuted: string; icon: string; label: string }> = {
  waiting_payment: { color: '#fbbf24', bgMuted: 'rgba(251, 191, 36, 0.1)', icon: '⏳', label: 'Waiting' },
  invoice_sent: { color: '#38bdf8', bgMuted: 'rgba(56, 189, 248, 0.1)', icon: '📧', label: 'Invoice Sent' },
  paid: { color: '#34d399', bgMuted: 'rgba(52, 211, 153, 0.1)', icon: '✅', label: 'Paid' },
}

type PaymentFilter = 'all' | 'paid' | 'awaiting_payment' | 'past_due'
type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'amount_desc' | 'amount_asc'

export default function CompletedJobs() {
  const { currentOrg } = useAuth()
  const { addToast } = useToast()
  const [rows, setRows] = useState<CompletedRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({})
  const [callingId, setCallingId] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')
  const [paymentLogs, setPaymentLogs] = useState<Record<string, PaymentSmsLog | null>>({})
  const [lastCalls, setLastCalls] = useState<Record<string, string | null>>({})
  const [notesInputs, setNotesInputs] = useState<Record<string, string>>({})
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null)
  const [pastDueRows, setPastDueRows] = useState<CompletedRow[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const getAmountCentsForRow = useCallback(
    (row: CompletedRow) => {
      const manualInput = amountInputs[row.occurrence.id]
      if (manualInput) {
        const parsed = Number.parseFloat(manualInput)
        if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100)
      }
      if (row.occurrence.payment_amount_cents !== undefined && row.occurrence.payment_amount_cents !== null && Number.isFinite(row.occurrence.payment_amount_cents)) {
        return row.occurrence.payment_amount_cents
      }
      if (row.quote?.total_inc_gst !== undefined && row.quote?.total_inc_gst !== null) {
        const value = Number(row.quote.total_inc_gst)
        if (Number.isFinite(value)) return Math.round(value * 100)
      }
      return null
    },
    [amountInputs]
  )

  const getDisplayStatus = useCallback((row: CompletedRow): PaymentStatus => {
    const quotePaid = row.quote?.accepted_payment_method === 'card_paid'
    if (row.occurrence.payment_status === 'paid' || quotePaid) return 'paid'
    return (row.occurrence.payment_status as PaymentStatus) || 'waiting_payment'
  }, [])

  const loadSmsMetadata = useCallback(async (occurrenceIds: string[]) => {
    if (!occurrenceIds.length) return
    try {
      const { data: payLogs, error: payLogsErr } = await supabase
        .from('payment_sms_logs')
        .select('*')
        .eq('org_id', currentOrg!.id)
        .in('occurrence_id', occurrenceIds)
        .order('sent_at', { ascending: false })

      if (payLogsErr) throw payLogsErr

      const payLatest: Record<string, PaymentSmsLog | null> = {}
      for (const log of (payLogs || []) as PaymentSmsLog[]) {
        if (!payLatest[log.occurrence_id]) {
          payLatest[log.occurrence_id] = log
        }
      }
      setPaymentLogs(payLatest)
    } catch (err) {
      console.error('Failed to load SMS logs', err)
    }
  }, [])

  const loadLastCalls = useCallback(async (rows: CompletedRow[]) => {
    try {
      const phoneNumbers = Array.from(new Set(rows.map((r) => r.lead?.phone_number).filter(Boolean))) as string[]
      if (!phoneNumbers.length) return

      const callsMap: Record<string, string | null> = {}
      const callPromises = phoneNumbers.map(async (phone) => {
        const { data: calls } = await supabase
          .from('dialpad_calls')
          .select('created_at, external_number')
          .eq('org_id', currentOrg!.id)
          .or(`external_number.eq.${phone},external_number.eq.+${phone}`)
          .order('created_at', { ascending: false })
          .limit(1)

        if (calls && calls.length > 0) {
          callsMap[phone] = calls[0].created_at
        }
      })

      await Promise.all(callPromises)

      const lastCallsByOccurrence: Record<string, string | null> = {}
      rows.forEach((row) => {
        if (row.lead?.phone_number && callsMap[row.lead.phone_number]) {
          lastCallsByOccurrence[row.occurrence.id] = callsMap[row.lead.phone_number]
        }
      })

      setLastCalls((prev) => ({ ...prev, ...lastCallsByOccurrence }))
    } catch (err) {
      console.error('Failed to load last calls', err)
    }
  }, [])

  const fetchCompleted = useCallback(async () => {
    setIsLoading(true)
    try {
      const nowIso = new Date().toISOString()

      const { data, error: occError } = await supabase
        .from('booking_occurrences')
        .select(`*, series:booking_series(*, lead:extracted_leads(*))`)
        .eq('org_id', currentOrg!.id)
        .eq('status', 'completed')
        .order('start_at', { ascending: false })
        .limit(1000)

      if (occError) throw occError

      const occurrences = (data || []) as any[]

      const { data: overdueData, error: overdueErr } = await supabase
        .from('booking_occurrences')
        .select(`*, series:booking_series!inner(*, lead:extracted_leads(*))`)
        .eq('org_id', currentOrg!.id)
        .lte('start_at', nowIso)
        .in('status', ['scheduled', 'skipped'])
        .order('start_at', { ascending: false })
        .limit(1000)

      if (overdueErr) throw overdueErr
      const overdueOccurrences = (overdueData || []) as any[]
      const allOccurrences = [...occurrences, ...overdueOccurrences]

      const quoteIds = Array.from(new Set(allOccurrences.map((occ) => occ?.quote_id || occ?.series?.quote_id).filter(Boolean))) as string[]

      const quotesById: Record<string, QuoteRecord> = {}
      if (quoteIds.length) {
        const { data: quotes } = await supabase.from('quotes').select('id, lead_id, customer_name, customer_email, customer_phone, total_inc_gst, share_token, quote_number, service, accepted_payment_method').eq('org_id', currentOrg!.id).in('id', quoteIds)
        if (quotes) {
          for (const quote of quotes as QuoteRecord[]) {
            quotesById[quote.id] = quote
          }
        }
      }

      const fallbackLeadIds = Array.from(new Set(allOccurrences.map((occ) => (!occ?.series?.quote_id ? occ?.series?.lead?.id : null)).filter(Boolean))) as string[]
      const latestQuotes: Record<string, QuoteRecord> = {}
      if (fallbackLeadIds.length) {
        const { data: quotes } = await supabase.from('quotes').select('id, lead_id, customer_name, customer_email, customer_phone, total_inc_gst, share_token, quote_number, service, accepted_payment_method').eq('org_id', currentOrg!.id).in('lead_id', fallbackLeadIds).order('created_at', { ascending: false })
        if (quotes) {
          for (const quote of quotes as QuoteRecord[]) {
            if (quote.lead_id && !latestQuotes[quote.lead_id]) {
              latestQuotes[quote.lead_id] = quote
            }
          }
        }
      }

      const mapOccurrences = (list: any[]): CompletedRow[] =>
        list.map((occ) => {
          const series = occ.series as BookingSeries
          const lead = (series?.lead as Lead) || null
          const linkedQuoteId = occ?.quote_id || series?.quote_id
          const linkedQuote = linkedQuoteId ? quotesById[linkedQuoteId] : null
          const fallbackQuote = series?.quote_id ? null : (lead?.id ? latestQuotes[lead.id] : null)
          const quote = linkedQuote || fallbackQuote || null
          return { occurrence: occ as BookingOccurrence, series, lead, quote }
        })

      const mappedCompleted = mapOccurrences(occurrences)
      const mappedOverdue = mapOccurrences(overdueOccurrences)

      setRows(mappedCompleted)
      setPastDueRows(mappedOverdue)

      const notesMap: Record<string, string> = {}
      const allRows = [...mappedCompleted, ...mappedOverdue]
      allRows.forEach((row) => {
        if (row.occurrence.notes) {
          notesMap[row.occurrence.id] = row.occurrence.notes
        }
      })
      setNotesInputs((prev) => ({ ...prev, ...notesMap }))

      const occurrenceIds = allRows.map((m) => m.occurrence.id)
      if (occurrenceIds.length) {
        await loadSmsMetadata(occurrenceIds)
        await loadLastCalls(allRows)
      }
    } catch (err: any) {
      console.error('Failed to load completed jobs', err)
      addToast({ type: 'error', title: 'Failed to load', message: err?.message })
    } finally {
      setIsLoading(false)
    }
  }, [loadSmsMetadata, loadLastCalls, addToast])

  useEffect(() => {
    fetchCompleted()
  }, [fetchCompleted])

  const handleCallCustomer = async (row: CompletedRow) => {
    const phoneNumber = row.lead?.phone_number
    if (!phoneNumber) {
      addToast({ type: 'warning', title: 'No phone number' })
      return
    }
    setCallingId(row.occurrence.id)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/call-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ phone_number: phoneNumber }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) throw new Error(result?.error || 'Failed to initiate call')
      addToast({ type: 'success', title: '📞 Calling...', message: `Calling ${row.lead?.name || phoneNumber}` })
      setLastCalls((prev) => ({ ...prev, [row.occurrence.id]: new Date().toISOString() }))
    } catch (err: any) {
      addToast({ type: 'error', title: 'Call failed', message: err?.message })
    } finally {
      setCallingId(null)
    }
  }

  const updateLocalOccurrence = useCallback((occurrenceId: string, updates: Partial<BookingOccurrence>) => {
    const applyUpdates = (list: CompletedRow[]) =>
      list.map((r) => (r.occurrence.id === occurrenceId ? { ...r, occurrence: { ...r.occurrence, ...updates } } : r))
    setRows(applyUpdates)
    setPastDueRows(applyUpdates)
  }, [])

  const handleSaveNotes = async (occurrenceId: string, notes: string) => {
    setSavingNotesId(occurrenceId)
    try {
      const { error: updateError } = await supabase.from('booking_occurrences').update({ notes: notes.trim() || null }).eq('id', occurrenceId).eq('org_id', currentOrg!.id)
      if (updateError) throw updateError
      updateLocalOccurrence(occurrenceId, { notes: notes.trim() || null })
      addToast({ type: 'success', title: 'Notes saved' })
      playSaveSound()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to save notes', message: err?.message })
    } finally {
      setSavingNotesId(null)
    }
  }

  const handlePaymentStatus = async (id: string, status: PaymentStatus) => {
    setUpdatingId(id)
    const row = rows.find((r) => r.occurrence.id === id) || pastDueRows.find((r) => r.occurrence.id === id)
    const amountCents = row ? getAmountCentsForRow(row) : null
    const payload: Record<string, any> = { payment_status: status }
    if (amountCents) payload.payment_amount_cents = amountCents
    if (status === 'paid') {
      payload.payment_paid_at = new Date().toISOString()
      payload.payment_notes = `Marked paid manually on ${new Date().toLocaleString()}`
    }

    try {
      const { error: updateError } = await supabase.from('booking_occurrences').update(payload).eq('id', id).eq('org_id', currentOrg!.id)
      if (updateError) throw updateError
      updateLocalOccurrence(id, payload)
      addToast({ type: 'success', title: status === 'paid' ? '✅ Marked as paid!' : 'Status updated' })
      playSaveSound()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Update failed', message: err?.message })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleCreatePaymentLink = async (row: CompletedRow) => {
    const { occurrence, series, lead, quote } = row
    const amountValue = amountInputs[occurrence.id] || (quote?.total_inc_gst ? quote.total_inc_gst.toString() : '')
    const parsed = Number.parseFloat(amountValue)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      addToast({ type: 'warning', title: 'Enter valid amount', message: 'Please enter an amount to generate a link' })
      return
    }
    const amountCents = Math.round(parsed * 100)

    setUpdatingId(occurrence.id)
    try {
      const description = series.title || quote?.service || `Cleaning for ${lead?.name || 'customer'}`
      const response = await fetch(`${supabaseUrl}/functions/v1/create-payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          amount_cents: amountCents,
          currency: 'aud',
          occurrenceId: occurrence.id,
          quoteId: quote?.id || '',
          customerName: lead?.name || '',
          customerEmail: lead?.email || '',
          description,
          success_url: `${window.location.origin}/payment-success`,
          cancel_url: `${window.location.origin}/payment-cancel`,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.url) throw new Error(data?.error || 'Failed to create Stripe link')

      const { error: updateError } = await supabase
        .from('booking_occurrences')
        .update({ payment_link: data.url, payment_status: 'invoice_sent', payment_amount_cents: amountCents })
        .eq('id', occurrence.id)
        .eq('org_id', currentOrg!.id)

      if (updateError) throw updateError

      updateLocalOccurrence(occurrence.id, { payment_link: data.url, payment_status: 'invoice_sent', payment_amount_cents: amountCents })
      addToast({ type: 'success', title: '🔗 Payment link created!' })
    } catch (err: any) {
      addToast({ type: 'error', title: 'Link creation failed', message: err?.message })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleCopyLink = async (link?: string | null) => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      addToast({ type: 'success', title: 'Link copied!' })
    } catch {
      addToast({ type: 'error', title: 'Copy failed' })
    }
  }

  const shareUrlForQuote = useCallback((quote?: QuoteRecord | null) => {
    if (!quote?.share_token) return null
    const url = new URL(window.location.href)
    url.searchParams.set('quote', quote.share_token)
    return url.toString()
  }, [])

  const combinedRows = useMemo(() => {
    const byId = new Map<string, CompletedRow>()
    rows.forEach((r) => byId.set(r.occurrence.id, r))
    pastDueRows.forEach((r) => {
      if (!byId.has(r.occurrence.id)) byId.set(r.occurrence.id, r)
    })
    return Array.from(byId.values())
  }, [rows, pastDueRows])

  const totalPaid = useMemo(() => combinedRows.filter((r) => getDisplayStatus(r) === 'paid').length, [combinedRows, getDisplayStatus])
  const totalAwaiting = useMemo(() => combinedRows.filter((r) => getDisplayStatus(r) === 'waiting_payment').length, [combinedRows, getDisplayStatus])
  const totalRevenue = useMemo(() => combinedRows.filter((r) => getDisplayStatus(r) === 'paid').reduce((sum, r) => sum + (getAmountCentsForRow(r) || 0) / 100, 0), [combinedRows, getDisplayStatus, getAmountCentsForRow])

  const filteredAndSortedRows = useMemo(() => {
    const sourceRows = paymentFilter === 'past_due' ? pastDueRows : combinedRows
    let filtered = sourceRows

    if (paymentFilter === 'paid') {
      filtered = filtered.filter((r) => getDisplayStatus(r) === 'paid')
    } else if (paymentFilter === 'awaiting_payment') {
      filtered = filtered.filter((r) => getDisplayStatus(r) === 'waiting_payment')
    }

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date_desc': return new Date(b.occurrence.start_at).getTime() - new Date(a.occurrence.start_at).getTime()
        case 'date_asc': return new Date(a.occurrence.start_at).getTime() - new Date(b.occurrence.start_at).getTime()
        case 'name_asc': return (a.lead?.name || '').localeCompare(b.lead?.name || '')
        case 'name_desc': return (b.lead?.name || '').localeCompare(a.lead?.name || '')
        case 'amount_desc': return (getAmountCentsForRow(b) || 0) - (getAmountCentsForRow(a) || 0)
        case 'amount_asc': return (getAmountCentsForRow(a) || 0) - (getAmountCentsForRow(b) || 0)
        default: return 0
      }
    })
  }, [combinedRows, pastDueRows, paymentFilter, sortBy, getAmountCentsForRow, getDisplayStatus])

  if (!currentOrg) return null

  return (
    <div className="min-h-screen p-6" data-tour="payment-tracking">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-title text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Completed Jobs
            </h1>
            <p className="text-caption mt-1">Track payments and send reminders</p>
          </div>
          <Button onClick={fetchCompleted} loading={isLoading} variant="primary" size="sm">
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Jobs"
            value={combinedRows.length}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
            accentColor="#64748b"
            onClick={() => setPaymentFilter('all')}
          />
          <StatCard
            label="Paid"
            value={totalPaid}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            accentColor="#34d399"
            onClick={() => setPaymentFilter('paid')}
          />
          <StatCard
            label="Awaiting Payment"
            value={totalAwaiting}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            accentColor="#fbbf24"
            onClick={() => setPaymentFilter('awaiting_payment')}
          />
          <StatCard
            label="Total Revenue"
            value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            accentColor="#10b981"
          />
        </div>

        {/* Filters */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              {(['all', 'paid', 'awaiting_payment', 'past_due'] as PaymentFilter[]).map((filter) => (
                <Button
                  key={filter}
                  variant={paymentFilter === filter ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setPaymentFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter === 'paid' ? 'Paid' : filter === 'awaiting_payment' ? 'Awaiting' : 'Past Due'}
                </Button>
              ))}
            </div>
            <div className="flex-1" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="input px-3 py-2"
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="amount_desc">Highest amount</option>
              <option value="amount_asc">Lowest amount</option>
            </select>
          </div>
        </GlassCard>

        {/* Jobs List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-2xl shimmer" />
            ))}
          </div>
        ) : filteredAndSortedRows.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-surface-elevated)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">No jobs found</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">Try adjusting your filters</p>
          </GlassCard>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedRows.map((row) => {
              const { occurrence, series, lead, quote } = row
              const paymentStatus = getDisplayStatus(row)
              const config = PAYMENT_CONFIG[paymentStatus]
              const quoteShareUrl = shareUrlForQuote(quote)
              const amountCents = getAmountCentsForRow(row)
              const isExpanded = expandedId === occurrence.id

              return (
                <GlassCard 
                  key={occurrence.id} 
                  className="overflow-hidden transition-all"
                  onClick={() => setExpandedId(isExpanded ? null : occurrence.id)}
                >
                  <div className="p-5">
                    {/* Main Row */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {/* Status Indicator */}
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                          style={{ background: config.bgMuted }}
                        >
                          {config.icon}
                        </div>
                        
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-white">
                              {lead?.name || 'Customer'}
                            </h3>
                            <Badge 
                              variant={paymentStatus === 'paid' ? 'success' : paymentStatus === 'invoice_sent' ? 'info' : 'warning'}
                            >
                              {config.label}
                            </Badge>
                            {quote?.accepted_payment_method === 'card_paid' && (
                              <Badge variant="success">Stripe</Badge>
                            )}
                          </div>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {series.title} • {format(new Date(occurrence.start_at), 'EEE, MMM d • h:mm a')}
                          </p>
                          {lead?.phone_number && (
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">{lead.phone_number}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Amount */}
                        <div className="text-right">
                          <p className="text-2xl font-bold text-white font-mono">
                            ${amountCents ? (amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                          </p>
                          {lastCalls[occurrence.id] && (
                            <p className="text-xs text-[var(--color-text-muted)]">
                              Called {formatDistanceToNow(new Date(lastCalls[occurrence.id]!), { addSuffix: true })}
                            </p>
                          )}
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleCallCustomer(row)}
                            loading={callingId === occurrence.id}
                            disabled={!lead?.phone_number}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </Button>
                          <PaymentReminderSms
                            occurrenceId={occurrence.id}
                            leadName={lead?.name}
                            phoneNumber={lead?.phone_number || undefined}
                            paymentLink={occurrence.payment_link || undefined}
                            quoteLink={quoteShareUrl || undefined}
                            amountCents={amountCents}
                            onSent={() => {
                              addToast({ type: 'success', title: '💬 Payment reminder sent!' })
                              fetchCompleted()
                            }}
                          />
                          <ReviewReminderSms
                            occurrenceId={occurrence.id}
                            leadName={lead?.name}
                            phoneNumber={lead?.phone_number || undefined}
                            reviewLink={googleReviewUrl}
                            onSent={() => {
                              addToast({ type: 'success', title: '⭐ Review request sent!' })
                              fetchCompleted()
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-[var(--glass-border)] space-y-4 animate-in fade-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                        {/* Payment Status Actions */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--color-text-muted)]">Set status:</span>
                          <Button size="sm" variant={paymentStatus === 'waiting_payment' ? 'primary' : 'ghost'} onClick={() => handlePaymentStatus(occurrence.id, 'waiting_payment')} disabled={updatingId === occurrence.id}>
                            Waiting
                          </Button>
                          <Button size="sm" variant={paymentStatus === 'invoice_sent' ? 'primary' : 'ghost'} onClick={() => handlePaymentStatus(occurrence.id, 'invoice_sent')} disabled={updatingId === occurrence.id}>
                            Invoice Sent
                          </Button>
                          <Button size="sm" variant={paymentStatus === 'paid' ? 'primary' : 'ghost'} onClick={() => handlePaymentStatus(occurrence.id, 'paid')} disabled={updatingId === occurrence.id}>
                            Mark Paid
                          </Button>
                        </div>

                        {/* Payment Link Section */}
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <label className="text-micro mb-2 block">Invoice amount (AUD)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={amountInputs[occurrence.id] || (occurrence.payment_amount_cents ? (occurrence.payment_amount_cents / 100).toFixed(2) : quote?.total_inc_gst?.toString() || '')}
                              onChange={(e) => setAmountInputs((prev) => ({ ...prev, [occurrence.id]: e.target.value }))}
                              className="input w-full"
                              placeholder="0.00"
                            />
                          </div>
                          <Button onClick={() => handleCreatePaymentLink(row)} loading={updatingId === occurrence.id} variant="primary">
                            Create Payment Link
                          </Button>
                          {occurrence.payment_link && (
                            <>
                              <Button onClick={() => handleCopyLink(occurrence.payment_link)} variant="secondary">
                                Copy Link
                              </Button>
                              <a href={occurrence.payment_link} target="_blank" rel="noreferrer">
                                <Button variant="secondary">Open Link</Button>
                              </a>
                            </>
                          )}
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="text-micro mb-2 block">Notes</label>
                          <div className="flex gap-2">
                            <textarea
                              value={notesInputs[occurrence.id] || ''}
                              onChange={(e) => setNotesInputs((prev) => ({ ...prev, [occurrence.id]: e.target.value }))}
                              onBlur={() => {
                                const currentNotes = notesInputs[occurrence.id] || ''
                                if (currentNotes !== (occurrence.notes || '')) {
                                  handleSaveNotes(occurrence.id, currentNotes)
                                }
                              }}
                              placeholder="Add notes..."
                              className="input flex-1 resize-none"
                              rows={2}
                            />
                            {savingNotesId === occurrence.id && (
                              <span className="text-xs text-[var(--color-text-muted)] self-center">Saving...</span>
                            )}
                          </div>
                        </div>

                        {/* Quote Info */}
                        {quote && (
                          <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                            <span>Quote #: {quote.quote_number || quote.id.slice(0, 8)}</span>
                            {quote.total_inc_gst && <span>Total: ${quote.total_inc_gst.toFixed(2)}</span>}
                            {quoteShareUrl && (
                              <a href={quoteShareUrl} target="_blank" rel="noreferrer" className="text-[var(--color-accent)] hover:underline">
                                View Quote →
                              </a>
                            )}
                          </div>
                        )}

                        {/* Last Reminder Info */}
                        {paymentLogs[occurrence.id] && (
                          <p className="text-xs text-[var(--color-text-muted)]">
                            Last payment reminder: {formatDistanceToNow(new Date(paymentLogs[occurrence.id]!.sent_at), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </GlassCard>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
