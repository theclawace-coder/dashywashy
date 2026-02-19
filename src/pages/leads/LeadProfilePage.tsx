import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, supabaseAnonKey, supabaseUrl, type DialpadCall, type DialpadEmail, type DialpadSms } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Badge, Button, GlassCard, useToast } from '../../components/ui'
import SmsLead from '../../components/SmsLead'
import QuoteTool from '../../components/QuoteTool'
import CommunicationDetailModal from '../../components/CommunicationDetailModal'
import ManualWorkflowRunner from '../../components/automations/ManualWorkflowRunner'
import {
  type CommunicationItem,
  dedupeCalls,
  dedupeEmails,
  dedupeSms,
  formatDuration,
  mapCallsToItems,
  mapEmailsToItems,
  mapSmsToItems,
  normalizeEmail,
  normalizePhone,
  sortByCreatedAtDesc,
} from '../../lib/communications'

type ExtractedLead = {
  id: string
  email_id?: string | null
  name?: string | null
  phone_number?: string | null
  email?: string | null
  region_notes?: string | null
  extracted_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  status?: string | null
  first_contact?: string | number | null
  last_text_date?: string | number | null
  last_text_body?: string | null
}

type QuoteRecord = {
  id: string
  lead_id: string | null
  quote_number?: string | null
  service?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  total_inc_gst?: number | null
  profit?: number | null
  created_at?: string | null
  accepted_payment_method?: string | null
  description?: string | null
  notes?: string | null
  share_token?: string | null
}

type BookingSeriesRecord = {
  id: string
  title?: string | null
  lead_id?: string | null
  starts_at?: string | null
  rrule?: string | null
  status?: string | null
  quote_id?: string | null
}

type LeadJob = {
  id: string
  start_at: string
  end_at?: string | null
  status: string
  payment_status?: string | null
  payment_amount_cents?: number | null
  quote_id?: string | null
  series?: BookingSeriesRecord | null
}

type LeadJournalEntry = {
  id: string
  lead_id: string
  org_id: string
  entry_type: 'note' | 'callback' | 'never_callback'
  body: string
  callback_at?: string | null
  callback_completed_at?: string | null
  created_at: string
  updated_at?: string | null
}

type QuoteTimelineItem = {
  id: string
  type: 'quote'
  created_at: string
  direction: 'outbound'
  quote: QuoteRecord
}

type TimelineItem = CommunicationItem | QuoteTimelineItem

type TimelineFilter = 'all' | 'calls' | 'sms' | 'emails' | 'quotes'

const LEAD_STATUS_OPTIONS = [
  'Unanswered',
  'Marketing Loop',
  'Follow Up',
  'Quote Sent',
  'Job Won',
  'Jobs Completed',
  'Not interested',
  'Archived',
]

const getStatusBadgeVariant = (
  status?: string | null
): 'default' | 'unanswered' | 'marketing' | 'followup' | 'quote' | 'won' | 'completed' | 'notinterested' => {
  if (!status) return 'default'
  const map: Record<string, ReturnType<typeof getStatusBadgeVariant>> = {
    Unanswered: 'unanswered',
    'Marketing Loop': 'marketing',
    'Follow Up': 'followup',
    'Quote Sent': 'quote',
    'Job Won': 'won',
    'Jobs Completed': 'completed',
    'Not interested': 'notinterested',
    Archived: 'notinterested',
  }
  return map[status] || 'default'
}

function formatTimestamp(value?: string | number | null) {
  if (!value) return '-'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function formatPhoneNumber(number: string | null | undefined) {
  if (!number) return 'Unknown'
  const cleaned = number.replace(/[^\d+]/g, '')
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 ${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return number
}

function toDateTimeLocalInputValue(date: Date) {
  const two = (n: number) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = two(date.getMonth() + 1)
  const dd = two(date.getDate())
  const hh = two(date.getHours())
  const min = two(date.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function parseRRule(rrule: string | null) {
  if (!rrule) return null
  const parts: Record<string, string> = {}
  rrule.split(';').forEach((part) => {
    const [key, value] = part.split('=')
    if (key && value) parts[key] = value
  })
  return {
    freq: parts['FREQ'] || null,
    interval: parseInt(parts['INTERVAL'] || '1', 10),
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

function rruleToLabel(rrule: string | null) {
  const parsed = parseRRule(rrule)
  if (!parsed?.freq) return 'One-time'
  if (parsed.freq === 'WEEKLY') {
    if (parsed.interval === 1) return 'Weekly'
    if (parsed.interval === 2) return 'Fortnightly'
    if (parsed.interval === 3) return 'Every 3 weeks'
    return `Every ${parsed.interval} weeks`
  }
  if (parsed.freq === 'MONTHLY') {
    if (parsed.interval === 1) return 'Monthly'
    if (parsed.interval === 2) return 'Every 2 months'
    return `Every ${parsed.interval} months`
  }
  return 'Repeats'
}

function generateOccurrencesUntil(startDate: Date, rrule: string | null, untilDate: Date, maxCount: number) {
  const dates: Date[] = [new Date(startDate)]
  if (!rrule) return dates

  const parsed = parseRRule(rrule)
  if (!parsed?.freq) return dates

  let currentDate = new Date(startDate)
  const anchorDay = startDate.getDate()
  while (dates.length < maxCount) {
    if (parsed.freq === 'WEEKLY') {
      currentDate = new Date(currentDate.getTime() + parsed.interval * 7 * 24 * 60 * 60 * 1000)
    } else if (parsed.freq === 'MONTHLY') {
      currentDate = addMonthsPreservingDay(currentDate, parsed.interval, anchorDay)
    } else {
      break
    }

    if (currentDate > untilDate) break
    dates.push(new Date(currentDate))
  }

  return dates
}

function countOccurrencesInMonth(startsAt: string, rrule: string | null, monthStart: Date, monthEnd: Date) {
  if (!rrule) return 0
  const startDate = new Date(startsAt)
  if (Number.isNaN(startDate.getTime())) return 0

  let effectiveMonthStart = monthStart
  let effectiveMonthEnd = monthEnd

  if (startDate > monthEnd) {
    effectiveMonthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 0, 0, 0, 0)
    effectiveMonthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999)
  }

  const occurrences = generateOccurrencesUntil(startDate, rrule, effectiveMonthEnd, 200)
  return occurrences.filter((date) => date >= effectiveMonthStart && date <= effectiveMonthEnd).length
}

function getContentPreview(item: CommunicationItem) {
  if (item.type === 'call') {
    if (item.summary) {
      const firstPoint = item.summary.split(/[\n\u2022]/).filter((s) => s.trim())[0]
      return firstPoint?.trim() || 'Summary available'
    }
    const durationStr = formatDuration(item.duration)
    return durationStr ? `${durationStr} call` : 'No summary yet'
  }
  if (item.type === 'sms') {
    return item.content?.substring(0, 60) + (item.content && item.content.length > 60 ? '...' : '') || 'No content'
  }
  if (item.type === 'email') {
    return item.subject || 'No subject'
  }
  return '-'
}

export default function LeadProfilePage() {
  const { leadId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { currentOrg } = useAuth()

  const [lead, setLead] = useState<ExtractedLead | null>(null)
  const [leadLoading, setLeadLoading] = useState(true)
  const [leadError, setLeadError] = useState<string | null>(null)

  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TimelineFilter>('all')

  const [selectedItem, setSelectedItem] = useState<CommunicationItem | null>(null)
  const [isFetchingSummary, setIsFetchingSummary] = useState(false)
  const [isCalling, setIsCalling] = useState(false)
  const [showAutomationRunner, setShowAutomationRunner] = useState(false)

  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [jobs, setJobs] = useState<LeadJob[]>([])
  const [series, setSeries] = useState<BookingSeriesRecord[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [notesInput, setNotesInput] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [journalEntries, setJournalEntries] = useState<LeadJournalEntry[]>([])
  const [journalLoading, setJournalLoading] = useState(true)
  const [journalError, setJournalError] = useState<string | null>(null)
  const [journalNoteInput, setJournalNoteInput] = useState('')
  const [callbackNoteInput, setCallbackNoteInput] = useState('')
  const [callbackAtInput, setCallbackAtInput] = useState('')
  const [isAddingJournalNote, setIsAddingJournalNote] = useState(false)
  const [isSchedulingCallback, setIsSchedulingCallback] = useState(false)
  const [isArchivingLead, setIsArchivingLead] = useState(false)

  const returnTo = searchParams.get('return')

  const fetchLead = useCallback(async () => {
    if (!currentOrg || !leadId) return
    try {
      setLeadLoading(true)
      setLeadError(null)
      const { data, error } = await supabase
        .from('extracted_leads')
        .select('*')
        .eq('org_id', currentOrg.id)
        .eq('id', leadId)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        setLead(null)
        setLeadError('Lead not found')
        return
      }
      setLead(data as ExtractedLead)
    } catch (err) {
      console.error('Failed to load lead', err)
      setLeadError(err instanceof Error ? err.message : 'Failed to load lead')
      setLead(null)
    } finally {
      setLeadLoading(false)
    }
  }, [currentOrg, leadId])

  const fetchTimeline = useCallback(async () => {
    if (!currentOrg || !lead) return
    try {
      setTimelineLoading(true)
      setTimelineError(null)

      const [callsRes, smsRes, emailsRes, quotesRes] = await Promise.all([
        supabase
          .from('dialpad_calls')
          .select('*')
          .eq('org_id', currentOrg.id)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('dialpad_sms')
          .select('*')
          .eq('org_id', currentOrg.id)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('dialpad_emails')
          .select('*')
          .eq('org_id', currentOrg.id)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('quotes')
          .select('*')
          .eq('org_id', currentOrg.id)
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false }),
      ])

      if (callsRes.error) console.error('Failed to fetch calls', callsRes.error)
      if (smsRes.error) console.error('Failed to fetch SMS', smsRes.error)
      if (emailsRes.error) console.error('Failed to fetch emails', emailsRes.error)
      if (quotesRes.error) console.error('Failed to fetch quotes', quotesRes.error)

      let calls = dedupeCalls((callsRes.data || []) as DialpadCall[])
      let sms = dedupeSms((smsRes.data || []) as DialpadSms[])
      let emails = dedupeEmails((emailsRes.data || []) as DialpadEmail[])

      const leadPhone = normalizePhone(lead.phone_number)
      const leadEmail = normalizeEmail(lead.email)
      const leadEmailId = lead.email_id || null

      if (leadPhone) {
        calls = calls.filter((call) => normalizePhone(call.external_number) === leadPhone)
        sms = sms.filter((message) => normalizePhone(message.external_number) === leadPhone)
      } else {
        calls = []
        sms = []
      }

      emails = emails.filter((email) => {
        if (leadEmail) {
          const from = normalizeEmail(email.from_email)
          const to = normalizeEmail(email.to_email)
          if (from === leadEmail || to === leadEmail) return true
        }
        if (leadEmailId && email.id === leadEmailId) return true
        return false
      })

      if (leadEmailId && !emails.some((email) => email.id === leadEmailId)) {
        const { data } = await supabase
          .from('dialpad_emails')
          .select('*')
          .eq('org_id', currentOrg.id)
          .eq('id', leadEmailId)
          .maybeSingle()
        if (data) {
          emails = dedupeEmails([...emails, data as DialpadEmail])
        }
      }

      const communicationItems: CommunicationItem[] = [
        ...mapCallsToItems(calls),
        ...mapSmsToItems(sms),
        ...mapEmailsToItems(emails),
      ]

      const quoteRows = (quotesRes.data || []) as QuoteRecord[]
      setQuotes(quoteRows)

      const quoteItems: QuoteTimelineItem[] = quoteRows.map((quote) => ({
        id: quote.id,
        type: 'quote',
        created_at: quote.created_at || new Date().toISOString(),
        direction: 'outbound',
        quote,
      }))

      const merged = sortByCreatedAtDesc<TimelineItem>([...communicationItems, ...quoteItems])
      setTimeline(merged)
    } catch (err) {
      console.error('Failed to load timeline', err)
      setTimelineError(err instanceof Error ? err.message : 'Failed to load timeline')
    } finally {
      setTimelineLoading(false)
    }
  }, [currentOrg, lead])

  const fetchJobsAndSeries = useCallback(async () => {
    if (!currentOrg || !lead) return
    try {
      setJobsLoading(true)
      setJobsError(null)

      const [occRes, seriesRes] = await Promise.all([
        supabase
          .from('booking_occurrences')
          .select('id, start_at, end_at, status, payment_status, payment_amount_cents, quote_id, series:booking_series!inner(id, title, lead_id, rrule, status, quote_id)')
          .eq('org_id', currentOrg.id)
          .eq('series.lead_id', lead.id)
          .order('start_at', { ascending: true })
          .limit(500),
        supabase
          .from('booking_series')
          .select('id, title, lead_id, starts_at, rrule, status, quote_id')
          .eq('org_id', currentOrg.id)
          .eq('lead_id', lead.id)
          .order('starts_at', { ascending: true }),
      ])

      if (occRes.error) throw occRes.error
      if (seriesRes.error) {
        console.error('Failed to load booking series', seriesRes.error)
      }

      const normalizedJobs: LeadJob[] = (occRes.data || []).map((job: any) => {
        const seriesData = Array.isArray(job.series) ? job.series[0] : job.series
        const normalizedSeries = seriesData
          ? {
              id: String(seriesData.id),
              title: seriesData.title ?? null,
              lead_id: seriesData.lead_id ?? null,
              rrule: seriesData.rrule ?? null,
              status: seriesData.status ?? null,
              quote_id: seriesData.quote_id ?? null,
            }
          : null
        return {
          id: String(job.id),
          start_at: job.start_at,
          end_at: job.end_at ?? null,
          status: job.status,
          payment_status: job.payment_status ?? null,
          payment_amount_cents: job.payment_amount_cents ?? null,
          quote_id: job.quote_id ?? null,
          series: normalizedSeries,
        }
      })

      const normalizedSeries: BookingSeriesRecord[] = (seriesRes.data || []).map((item: any) => ({
        id: String(item.id),
        title: item.title ?? null,
        lead_id: item.lead_id ?? null,
        starts_at: item.starts_at ?? null,
        rrule: item.rrule ?? null,
        status: item.status ?? null,
        quote_id: item.quote_id ?? null,
      }))

      setJobs(normalizedJobs)
      setSeries(normalizedSeries)
    } catch (err) {
      console.error('Failed to load jobs', err)
      setJobsError(err instanceof Error ? err.message : 'Failed to load jobs')
      setJobs([])
      setSeries([])
    } finally {
      setJobsLoading(false)
    }
  }, [currentOrg, lead])

  const fetchJournalEntries = useCallback(async () => {
    if (!currentOrg || !lead) return
    try {
      setJournalLoading(true)
      setJournalError(null)

      const { data, error } = await supabase
        .from('lead_journal_entries')
        .select('*')
        .eq('org_id', currentOrg.id)
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(250)

      if (error) throw error
      setJournalEntries((data || []) as LeadJournalEntry[])
    } catch (err) {
      console.error('Failed to load lead journal', err)
      setJournalError(err instanceof Error ? err.message : 'Failed to load lead journal')
      setJournalEntries([])
    } finally {
      setJournalLoading(false)
    }
  }, [currentOrg, lead])

  useEffect(() => {
    fetchLead()
  }, [fetchLead])

  useEffect(() => {
    if (!lead) return
    fetchTimeline()
  }, [lead, fetchTimeline])

  useEffect(() => {
    if (!lead) return
    fetchJobsAndSeries()
  }, [lead, fetchJobsAndSeries])

  useEffect(() => {
    if (!lead) return
    setNotesInput(lead.region_notes || '')
  }, [lead?.id, lead?.region_notes])

  useEffect(() => {
    if (!lead) return
    fetchJournalEntries()
    const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000)
    inTwoHours.setMinutes(0, 0, 0)
    setCallbackAtInput(toDateTimeLocalInputValue(inTwoHours))
  }, [lead?.id, fetchJournalEntries])

  useEffect(() => {
    if (!currentOrg || !leadId) return
    const channels = [
      supabase
        .channel('lead_profile_calls')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_calls', filter: 'org_id=eq.' + currentOrg.id }, () => fetchTimeline())
        .subscribe(),
      supabase
        .channel('lead_profile_sms')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_sms', filter: 'org_id=eq.' + currentOrg.id }, () => fetchTimeline())
        .subscribe(),
      supabase
        .channel('lead_profile_emails')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_emails', filter: 'org_id=eq.' + currentOrg.id }, () => fetchTimeline())
        .subscribe(),
      supabase
        .channel('lead_profile_quotes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: 'org_id=eq.' + currentOrg.id }, () => fetchTimeline())
        .subscribe(),
      supabase
        .channel('lead_profile_jobs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_occurrences', filter: 'org_id=eq.' + currentOrg.id }, () => fetchJobsAndSeries())
        .subscribe(),
      supabase
        .channel('lead_profile_series')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_series', filter: 'org_id=eq.' + currentOrg.id }, () => fetchJobsAndSeries())
        .subscribe(),
      supabase
        .channel('lead_profile_lead')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'extracted_leads', filter: `id=eq.${leadId}` }, () => fetchLead())
        .subscribe(),
      supabase
        .channel('lead_profile_journal')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_journal_entries', filter: 'lead_id=eq.' + leadId }, () => fetchJournalEntries())
        .subscribe(),
    ]

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel))
    }
  }, [currentOrg, leadId, fetchTimeline, fetchJobsAndSeries, fetchLead, fetchJournalEntries])

  useEffect(() => {
    if (!lead) return
    const editQuote = searchParams.get('editQuote')
    if (editQuote && !showQuoteModal) {
      setShowQuoteModal(true)
    }
  }, [lead, searchParams, showQuoteModal])

  const filteredTimeline = useMemo(() => {
    if (filter === 'all') return timeline
    return timeline.filter((item) => {
      if (filter === 'quotes') return item.type === 'quote'
      if (filter === 'calls') return item.type === 'call'
      if (filter === 'sms') return item.type === 'sms'
      if (filter === 'emails') return item.type === 'email'
      return true
    })
  }, [filter, timeline])

  const quotesById = useMemo(() => new Map(quotes.map((quote) => [quote.id, quote])), [quotes])

  const latestQuote = useMemo(() => {
    let latest: QuoteRecord | null = null
    for (const quote of quotes) {
      if (!latest) {
        latest = quote
        continue
      }
      const latestTime = latest.created_at ? new Date(latest.created_at).getTime() : 0
      const quoteTime = quote.created_at ? new Date(quote.created_at).getTime() : 0
      if (quoteTime >= latestTime) {
        latest = quote
      }
    }
    return latest
  }, [quotes])

  const sortedQuotes = useMemo(() => {
    return [...quotes].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
      return timeB - timeA
    })
  }, [quotes])

  const upcomingJobs = useMemo(() => {
    const now = Date.now()
    return jobs
      .filter((job) => job.status === 'scheduled' && new Date(job.start_at).getTime() >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  }, [jobs])

  const completedJobs = useMemo(() => {
    return jobs
      .filter((job) => job.status === 'completed')
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
  }, [jobs])

  const recurringSeriesSummaries = useMemo(() => {
    const recurringSeries = series.filter((item) => item.rrule)
    if (!recurringSeries.length) return []

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    return recurringSeries.map((item) => {
      const quote = item.quote_id ? quotesById.get(item.quote_id) : latestQuote
      const quoteValue = quote?.total_inc_gst || 0
      const occurrencesThisMonth = item.starts_at
        ? countOccurrencesInMonth(item.starts_at, item.rrule || null, monthStart, monthEnd)
        : 0
      return {
        ...item,
        occurrencesThisMonth,
        monthlyRevenue: quoteValue * occurrencesThisMonth,
        quoteValue,
      }
    })
  }, [series, quotesById, latestQuote])

  const monthlyRecurringRevenue = useMemo(() => {
    return recurringSeriesSummaries.reduce((sum, item) => sum + item.monthlyRevenue, 0)
  }, [recurringSeriesSummaries])

  const lifetimeRevenue = useMemo(() => {
    return jobs.reduce((sum, job) => {
      if (job.status !== 'completed') return sum
      const quoteId = job.quote_id || job.series?.quote_id || null
      const quote = quoteId ? quotesById.get(quoteId) : null
      const isPaid = job.payment_status === 'paid' || quote?.accepted_payment_method === 'card_paid'
      if (!isPaid) return sum
      const amount = typeof job.payment_amount_cents === 'number'
        ? job.payment_amount_cents / 100
        : quote?.total_inc_gst || 0
      return sum + amount
    }, 0)
  }, [jobs, quotesById])

  const isNeverCallBackLead = useMemo(() => {
    return journalEntries.some((entry) => entry.entry_type === 'never_callback')
  }, [journalEntries])

  const notesDirty = notesInput.trim() !== (lead?.region_notes || '')

  const openQuoteModal = (quoteId?: string) => {
    if (quoteId) {
      const params = new URLSearchParams(window.location.search)
      params.set('editQuote', quoteId)
      const next = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState({}, '', next)
    }
    setShowQuoteModal(true)
  }

  const openJobModal = (occurrenceId: string) => {
    window.dispatchEvent(new CustomEvent('open-job-modal', { detail: { occurrenceId } }))
  }

  const closeQuoteModal = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete('editQuote')
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
    window.history.replaceState({}, '', next)
    setShowQuoteModal(false)
  }

  const handleFetchSummary = async () => {
    if (!selectedItem || selectedItem.type !== 'call' || !selectedItem.call_id) return

    setIsFetchingSummary(true)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/get-transcript-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ call_id: selectedItem.call_id }),
      })

      const data = await response.json()
      if (data.success && (data.transcript || data.summary)) {
        setSelectedItem((prev) =>
          prev
            ? {
                ...prev,
                transcript: data.transcript || prev.transcript,
                summary: data.summary || prev.summary,
              }
            : null
        )
        setTimeline((prev) =>
          prev.map((item) =>
            item.type === 'call' && item.id === selectedItem.id
              ? { ...item, transcript: data.transcript || item.transcript, summary: data.summary || item.summary }
              : item
          )
        )
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
      addToast({ type: 'error', title: 'Summary failed', message: 'Unable to fetch call summary.' })
    } finally {
      setIsFetchingSummary(false)
    }
  }

  const handleCallLead = async () => {
    if (!lead?.phone_number) {
      addToast({ type: 'warning', title: 'No phone number', message: 'This lead has no phone number.' })
      return
    }

    setIsCalling(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')
      if (!currentOrg?.id) throw new Error('No organization selected')

      const response = await fetch(`${supabaseUrl}/functions/v1/call-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg.id,
        },
        body: JSON.stringify({ phone_number: lead.phone_number }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        throw new Error(result?.error || `HTTP ${response.status}`)
      }

      addToast({ type: 'success', title: 'Calling...', message: `Calling ${lead.name || lead.phone_number}` })

      if (!lead.first_contact) {
        const nowIso = new Date().toISOString()
        await supabase
          .from('extracted_leads')
          .update({ first_contact: nowIso })
          .eq('id', lead.id)
          .eq('org_id', currentOrg.id)
        setLead((prev) => (prev ? { ...prev, first_contact: nowIso } : prev))
      }
    } catch (err) {
      console.error('Error calling lead:', err)
      addToast({ type: 'error', title: 'Call failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsCalling(false)
    }
  }

  const handleUpdateStatus = async (status: string) => {
    if (!lead) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')
      if (!currentOrg?.id) throw new Error('No organization selected')

      const response = await fetch(`${supabaseUrl}/functions/v1/update-lead-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg.id,
        },
        body: JSON.stringify({ leadId: lead.id, status: status || null }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        throw new Error(result?.error || `HTTP ${response.status}`)
      }

      setLead((prev) => (prev ? { ...prev, status: status || null } : prev))
      addToast({ type: 'success', title: 'Status updated' })
    } catch (err) {
      console.error('Failed to update status', err)
      addToast({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const handleSaveNotes = async () => {
    if (!lead || !currentOrg) return
    const nextNotes = notesInput.trim()
    if (nextNotes === (lead.region_notes || '')) return
    setIsSavingNotes(true)
    try {
      const { error } = await supabase
        .from('extracted_leads')
        .update({ region_notes: nextNotes || null })
        .eq('id', lead.id)
        .eq('org_id', currentOrg.id)

      if (error) throw error

      setLead((prev) => (prev ? { ...prev, region_notes: nextNotes || null } : prev))
      addToast({ type: 'success', title: 'Notes saved' })
    } catch (err) {
      console.error('Failed to save notes', err)
      addToast({ type: 'error', title: 'Save failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsSavingNotes(false)
    }
  }

  const handleAddJournalNote = async () => {
    if (!lead || !currentOrg) return
    const body = journalNoteInput.trim()
    if (!body) return
    setIsAddingJournalNote(true)
    try {
      const { error } = await supabase.from('lead_journal_entries').insert({
        org_id: currentOrg.id,
        lead_id: lead.id,
        entry_type: 'note',
        body,
      })
      if (error) throw error
      setJournalNoteInput('')
      addToast({ type: 'success', title: 'Note added' })
      fetchJournalEntries()
    } catch (err) {
      console.error('Failed to add journal note', err)
      addToast({ type: 'error', title: 'Failed to add note', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsAddingJournalNote(false)
    }
  }

  const applyCallbackOffsetDays = (days: number) => {
    const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    target.setHours(9, 0, 0, 0)
    setCallbackAtInput(toDateTimeLocalInputValue(target))
  }

  const handleScheduleCallback = async () => {
    if (!lead || !currentOrg) return
    const body = callbackNoteInput.trim()
    if (!body) {
      addToast({ type: 'warning', title: 'Add callback details' })
      return
    }

    const callbackDate = callbackAtInput ? new Date(callbackAtInput) : null
    if (!callbackDate || Number.isNaN(callbackDate.getTime())) {
      addToast({ type: 'warning', title: 'Pick a valid date/time' })
      return
    }

    setIsSchedulingCallback(true)
    try {
      const { error } = await supabase.from('lead_journal_entries').insert({
        org_id: currentOrg.id,
        lead_id: lead.id,
        entry_type: 'callback',
        body,
        callback_at: callbackDate.toISOString(),
      })
      if (error) throw error
      setCallbackNoteInput('')
      addToast({ type: 'success', title: 'Callback scheduled' })
      fetchJournalEntries()
    } catch (err) {
      console.error('Failed to schedule callback', err)
      addToast({ type: 'error', title: 'Schedule failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsSchedulingCallback(false)
    }
  }

  const handleMarkCallbackDone = async (entryId: string) => {
    if (!currentOrg) return
    try {
      const { error } = await supabase
        .from('lead_journal_entries')
        .update({ callback_completed_at: new Date().toISOString() })
        .eq('id', entryId)
        .eq('org_id', currentOrg.id)
      if (error) throw error
      fetchJournalEntries()
      addToast({ type: 'success', title: 'Callback marked done' })
    } catch (err) {
      console.error('Failed to mark callback done', err)
      addToast({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const handleNeverCallBack = async () => {
    if (!lead || !currentOrg) return
    const confirmed = window.confirm(
      'Never call back and archive this lead? This also cancels active automations for this lead.'
    )
    if (!confirmed) return

    setIsArchivingLead(true)
    try {
      const nowIso = new Date().toISOString()

      const { error: leadErr } = await supabase
        .from('extracted_leads')
        .update({ status: 'Archived' })
        .eq('id', lead.id)
        .eq('org_id', currentOrg.id)
      if (leadErr) throw leadErr

      const { error: runsErr } = await supabase
        .from('workflow_runs')
        .update({
          status: 'cancelled',
          cancelled_at: nowIso,
          last_error: 'never_call_back',
          updated_at: nowIso,
        })
        .eq('org_id', currentOrg.id)
        .eq('entity_type', 'lead')
        .eq('entity_id', lead.id)
        .in('status', ['active', 'paused'])
      if (runsErr) throw runsErr

      // Best effort legacy journey shutdown for orgs still using old marketing-loop tables.
      const legacyUpdates = await Promise.all([
        supabase
          .from('marketing_sms_journeys')
          .update({ status: 'cancelled', cancelled_at: nowIso, updated_at: nowIso })
          .eq('org_id', currentOrg.id)
          .eq('lead_id', lead.id)
          .in('status', ['active', 'paused']),
        supabase
          .from('marketing_email_journeys')
          .update({ status: 'cancelled', cancelled_at: nowIso, updated_at: nowIso })
          .eq('org_id', currentOrg.id)
          .eq('lead_id', lead.id)
          .in('status', ['active', 'paused']),
      ])
      legacyUpdates.forEach(({ error }) => {
        if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
          console.warn('Legacy journey update warning:', error.message)
        }
      })

      const { error: journalErr } = await supabase.from('lead_journal_entries').insert({
        org_id: currentOrg.id,
        lead_id: lead.id,
        entry_type: 'never_callback',
        body: 'Marked as never call back. Lead archived and active automations cancelled.',
      })
      if (journalErr) throw journalErr

      setLead((prev) => (prev ? { ...prev, status: 'Archived' } : prev))
      fetchJournalEntries()
      addToast({ type: 'success', title: 'Lead archived', message: 'Automations cancelled and lead removed from pipeline.' })
    } catch (err) {
      console.error('Failed to archive lead', err)
      addToast({ type: 'error', title: 'Archive failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsArchivingLead(false)
    }
  }

  if (leadLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (leadError || !lead) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="w-full max-w-md p-8 text-center">
          <h1 className="text-title text-white mb-2">Lead not found</h1>
          <p className="text-caption mb-4">{leadError || 'Unable to load lead details.'}</p>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Lead Profile</h1>
            <p className="text-xs text-[var(--color-text-muted)]">All conversations and quotes for this lead</p>
          </div>
          {returnTo && (
            <Button variant="ghost" onClick={() => navigate(returnTo)}>
              Back
            </Button>
          )}
        </div>

        {isNeverCallBackLead && (
          <div className="relative overflow-hidden rounded-xl border-2 border-red-500/60 bg-red-950/30 px-4 py-5 md:px-6 md:py-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(248,113,113,0.3),transparent_55%)]" />
            <div className="relative flex items-center justify-center">
              <div className="rotate-[-7deg] border-4 border-red-300/90 bg-red-950/70 px-4 py-2">
                <p className="text-center text-2xl font-black uppercase tracking-[0.18em] text-red-100 md:text-4xl">
                  Don't Call Back
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
          <div className="space-y-4">
            <GlassCard
              className={`p-5 ${isNeverCallBackLead ? 'border-2 border-red-500/60 bg-red-950/25 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg text-white font-semibold">{lead.name || lead.email || lead.phone_number || 'Lead'}</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">ID: {lead.id.slice(0, 8)}</p>
                </div>
                {lead.status && <Badge variant={getStatusBadgeVariant(lead.status)}>{lead.status}</Badge>}
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Phone</span>
                  <span className="text-white">{lead.phone_number ? formatPhoneNumber(lead.phone_number) : '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Email</span>
                  <span className="text-white truncate max-w-[180px] text-right">{lead.email || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">First contact</span>
                  <span className="text-white">{formatTimestamp(lead.first_contact)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Last SMS</span>
                  <span className="text-white">{formatTimestamp(lead.last_text_date)}</span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <select
                  value={lead.status || ''}
                  onChange={(e) => handleUpdateStatus(e.target.value)}
                  className="input text-sm"
                >
                  <option value="">Set status...</option>
                  {LEAD_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCallLead}
                    loading={isCalling}
                    disabled={!lead.phone_number}
                  >
                    Call
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openQuoteModal()}
                  >
                    Create Quote
                  </Button>
                </div>

                <SmsLead
                  leadId={lead.id}
                  leadName={lead.name}
                  phoneNumber={lead.phone_number || undefined}
                  onSent={({ sentAt, message }) => {
                    setLead((prev) =>
                      prev
                        ? {
                            ...prev,
                            last_text_date: sentAt,
                            last_text_body: message,
                          }
                        : prev
                    )
                    addToast({ type: 'success', title: 'SMS sent', message: `Message sent to ${lead.name || 'lead'}` })
                  }}
                />
                <Button variant="ghost" size="sm" onClick={() => setShowAutomationRunner(true)}>
                  Run Automation
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleNeverCallBack}
                  loading={isArchivingLead}
                  className="w-full border border-red-300/60 font-semibold uppercase tracking-[0.08em]"
                >
                  Never Call Back
                </Button>
              </div>
            </GlassCard>
          </div>

          <div className="space-y-4">
            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg text-white font-semibold">Customer Summary</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">Jobs and revenue snapshot</p>
                </div>
                {jobsLoading && (
                  <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {jobsError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  {jobsError}
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10">
                  <p className="text-xs text-[var(--color-text-muted)]">Upcoming Jobs</p>
                  <p className="text-lg text-white font-semibold">{jobsLoading ? '-' : upcomingJobs.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10">
                  <p className="text-xs text-[var(--color-text-muted)]">Completed Jobs</p>
                  <p className="text-lg text-white font-semibold">{jobsLoading ? '-' : completedJobs.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10">
                  <p className="text-xs text-[var(--color-text-muted)]">Lifetime Revenue</p>
                  <p className="text-lg text-white font-semibold">{jobsLoading ? '-' : formatCurrency(lifetimeRevenue)}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">Paid jobs only</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10">
                  <p className="text-xs text-[var(--color-text-muted)]">Recurring Monthly</p>
                  <p className="text-lg text-white font-semibold">
                    {jobsLoading || recurringSeriesSummaries.length === 0 ? '-' : formatCurrency(monthlyRecurringRevenue)}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {recurringSeriesSummaries.length === 0 ? 'Not recurring' : `${recurringSeriesSummaries.length} schedule${recurringSeriesSummaries.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Upcoming Jobs</p>
                  </div>
                  {jobsLoading ? (
                    <div className="space-y-2">
                      {[...Array(2)].map((_, idx) => (
                        <div key={idx} className="shimmer h-12 rounded-lg" />
                      ))}
                    </div>
                  ) : upcomingJobs.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)]">No upcoming jobs scheduled.</p>
                  ) : (
                    <div className="space-y-2">
                      {upcomingJobs.slice(0, 4).map((job) => (
                        <div key={job.id} className="p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm text-white font-medium">{job.series?.title || 'Job'}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{formatTimestamp(job.start_at)}</p>
                            {job.series?.rrule && (
                              <p className="text-[11px] text-cyan-300">{rruleToLabel(job.series.rrule)}</p>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => openJobModal(job.id)}>
                            Open
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Completed Jobs</p>
                  </div>
                  {jobsLoading ? (
                    <div className="space-y-2">
                      {[...Array(2)].map((_, idx) => (
                        <div key={idx} className="shimmer h-12 rounded-lg" />
                      ))}
                    </div>
                  ) : completedJobs.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)]">No completed jobs yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {completedJobs.slice(0, 4).map((job) => {
                        const quoteId = job.quote_id || job.series?.quote_id || null
                        const quote = quoteId ? quotesById.get(quoteId) : null
                        const isPaid = job.payment_status === 'paid' || quote?.accepted_payment_method === 'card_paid'
                        const amount = typeof job.payment_amount_cents === 'number'
                          ? job.payment_amount_cents / 100
                          : quote?.total_inc_gst || null
                        return (
                          <div key={job.id} className="p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm text-white font-medium">{job.series?.title || 'Job'}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">{formatTimestamp(job.start_at)}</p>
                              <p className={`text-[11px] ${isPaid ? 'text-emerald-300' : 'text-amber-300'}`}>
                                {isPaid ? 'Paid' : 'Payment pending'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-white font-semibold">{typeof amount === 'number' ? `$${amount.toFixed(2)}` : '-'}</p>
                              <Button variant="ghost" size="sm" onClick={() => openJobModal(job.id)}>
                                Open
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg text-white font-semibold">Quotes</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">{timelineLoading ? 'Loading quotes...' : `${sortedQuotes.length} quotes`}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => openQuoteModal()}>
                  New Quote
                </Button>
              </div>

              {timelineLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, idx) => (
                    <div key={idx} className="shimmer h-12 rounded-lg" />
                  ))}
                </div>
              ) : sortedQuotes.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No quotes yet for this customer.</p>
              ) : (
                <div className="space-y-2">
                  {sortedQuotes.slice(0, 6).map((quote) => (
                    <button
                      key={quote.id}
                      onClick={() => openQuoteModal(quote.id)}
                      className="w-full text-left p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10 hover:border-cyan-400/40 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-white font-medium">
                            {quote.service || 'Quote'} {quote.quote_number ? `- ${quote.quote_number}` : ''}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {quote.created_at ? new Date(quote.created_at).toLocaleString() : 'Unknown date'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-white font-semibold">
                            {quote.total_inc_gst !== null && quote.total_inc_gst !== undefined
                              ? `$${quote.total_inc_gst.toFixed(2)}`
                              : '-'}
                          </p>
                          {quote.accepted_payment_method === 'card_paid' && (
                            <p className="text-[11px] text-emerald-300">Paid</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg text-white font-semibold">Lead Journal</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">Timestamped notes and callbacks</p>
                </div>
                {journalLoading && (
                  <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {journalError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  {journalError}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                <div className="space-y-2">
                  <label className="text-xs text-[var(--color-text-muted)]">Add note</label>
                  <textarea
                    value={journalNoteInput}
                    onChange={(e) => setJournalNoteInput(e.target.value)}
                    placeholder="Write a note..."
                    className="input w-full min-h-[90px] resize-none"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleAddJournalNote}
                    loading={isAddingJournalNote}
                    disabled={!journalNoteInput.trim()}
                  >
                    Add Timestamped Note
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[var(--color-text-muted)]">Schedule callback</label>
                  <input
                    value={callbackNoteInput}
                    onChange={(e) => setCallbackNoteInput(e.target.value)}
                    placeholder="Call back Antonia and requote her"
                    className="input w-full"
                  />
                  <input
                    type="datetime-local"
                    value={callbackAtInput}
                    onChange={(e) => setCallbackAtInput(e.target.value)}
                    className="input w-full"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => applyCallbackOffsetDays(1)}>+1 day</Button>
                    <Button size="sm" variant="ghost" onClick={() => applyCallbackOffsetDays(3)}>+3 days</Button>
                    <Button size="sm" variant="ghost" onClick={() => applyCallbackOffsetDays(7)}>+7 days</Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleScheduleCallback}
                      loading={isSchedulingCallback}
                      disabled={!callbackNoteInput.trim() || !callbackAtInput}
                    >
                      Schedule
                    </Button>
                  </div>
                </div>
              </div>

              {journalLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, idx) => (
                    <div key={idx} className="shimmer h-12 rounded-lg" />
                  ))}
                </div>
              ) : journalEntries.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">No journal entries yet.</p>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {journalEntries.map((entry) => {
                    const isCallback = entry.entry_type === 'callback'
                    const isDone = Boolean(entry.callback_completed_at)
                    return (
                      <div key={entry.id} className="p-3 rounded-lg bg-[var(--color-surface-light)] border border-white/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                entry.entry_type === 'never_callback'
                                  ? 'notinterested'
                                  : isCallback
                                  ? 'followup'
                                  : 'default'
                              }
                            >
                              {entry.entry_type === 'never_callback'
                                ? 'Never Call Back'
                                : isCallback
                                ? 'Callback'
                                : 'Note'}
                            </Badge>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                          {isCallback && (
                            <div className="flex items-center gap-2">
                              <span className={`text-xs ${isDone ? 'text-emerald-300' : 'text-amber-300'}`}>
                                {isDone ? 'Completed' : 'Scheduled'}
                              </span>
                              {!isDone && (
                                <Button size="sm" variant="ghost" onClick={() => handleMarkCallbackDone(entry.id)}>
                                  Done
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-white mt-2 whitespace-pre-wrap">{entry.body}</p>
                        {isCallback && entry.callback_at && (
                          <p className="text-xs text-cyan-300 mt-1">
                            Callback at {new Date(entry.callback_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg text-white font-semibold">Customer Notes</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">Visible to your team</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveNotes}
                  disabled={!notesDirty}
                  loading={isSavingNotes}
                >
                  Save
                </Button>
              </div>
              <textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Add notes about this customer..."
                className="input w-full min-h-[120px] resize-none"
              />
              {notesDirty && (
                <p className="text-[11px] text-[var(--color-text-muted)] mt-2">Unsaved changes</p>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg text-white font-semibold">Activity</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {timelineLoading ? 'Loading timeline...' : `${filteredTimeline.length} items`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 p-0.5 bg-[var(--color-surface)] rounded-lg">
                  {(['all', 'calls', 'sms', 'emails', 'quotes'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        filter === f
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                          : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'sms' ? 'SMS' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {timelineError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                  {timelineError}
                </div>
              )}

              {timelineLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, idx) => (
                    <div key={idx} className="shimmer h-16 rounded-lg" />
                  ))}
                </div>
              ) : filteredTimeline.length === 0 ? (
                <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
                  No activity yet for this lead.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTimeline.map((item) => {
                    if (item.type === 'quote') {
                      const quote = item.quote
                      return (
                        <div
                          key={`quote-${item.id}`}
                          className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/10 hover:border-cyan-400/40 transition cursor-pointer"
                          onClick={() => openQuoteModal(item.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="quote">Quote</Badge>
                                <span className="text-sm text-white font-semibold">
                                  {quote.service || 'Quote'} {quote.quote_number ? `- ${quote.quote_number}` : ''}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                {quote.bedrooms || 0} bed / {quote.bathrooms || 0} bath
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-semibold">
                                {quote.total_inc_gst !== null && quote.total_inc_gst !== undefined
                                  ? `$${quote.total_inc_gst.toFixed(2)}`
                                  : '-'}
                              </div>
                              <div className="text-xs text-[var(--color-text-muted)]">
                                {new Date(item.created_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          {quote.accepted_payment_method === 'card_paid' && (
                            <div className="mt-2 text-xs text-emerald-300">Paid via card</div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/10 hover:border-cyan-400/40 transition cursor-pointer"
                        onClick={() => setSelectedItem(item)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                                  item.type === 'call'
                                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                                    : item.type === 'sms'
                                    ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                }`}
                              >
                                {item.type.toUpperCase()}
                              </span>
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {item.type === 'email'
                                  ? item.direction === 'outbound'
                                    ? 'Sent'
                                    : 'Received'
                                  : item.direction === 'outbound'
                                  ? 'Sent'
                                  : 'Received'}
                              </span>
                            </div>
                            <p className="text-sm text-white mt-1">{getContentPreview(item)}</p>
                          </div>
                          <div className="text-right text-xs text-[var(--color-text-muted)]">
                            <div>{item.type === 'email' ? item.from_email || item.to_email || 'Unknown' : formatPhoneNumber(item.external_number)}</div>
                            <div>{new Date(item.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </div>

      {selectedItem && (
        <CommunicationDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onFetchSummary={handleFetchSummary}
          isLoading={isFetchingSummary}
        />
      )}

      {showQuoteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[500] p-4" onClick={closeQuoteModal}>
          <div className="glass-elevated w-full max-w-5xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
              <div>
                <p className="text-micro">Quote</p>
                <h3 className="text-heading text-white">
                  {lead.name || 'Lead'} - {lead.email || lead.phone_number || ''}
                </h3>
              </div>
              <button
                onClick={closeQuoteModal}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <QuoteTool lead={lead} emailId={lead.email_id ?? null} />
            </div>
          </div>
        </div>
      )}

      {lead && currentOrg && (
        <ManualWorkflowRunner
          open={showAutomationRunner}
          onClose={() => setShowAutomationRunner(false)}
          orgId={currentOrg.id}
          entityType="lead"
          entityId={lead.id}
          entityLabel={lead.name || lead.email || lead.phone_number || 'Lead'}
        />
      )}
    </div>
  )
}



