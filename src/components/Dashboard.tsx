/**
 * Dashboard - Apple VisionOS Inspired
 * 
 * A calm, powerful command center that shows only what matters now.
 * Everything is cards. Everything responds. Everything feels alive.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, supabaseUrl, supabaseAnonKey, type DialpadCall, type DialpadSms, type DialpadEmail } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { playSaveSound } from '../lib/sounds'
import { subDays } from 'date-fns'
import { GlassCard, Button, Badge, StatCard, ProgressRing, StreakBadge, Encouragement, useToast } from './ui'
import DatePicker from './DatePicker'
import DayComparisonChart from './DayComparisonChart'
import HourlyActivity from './HourlyActivity'
import CommunicationsLog from './CommunicationsLog'
import QuoteTool from './QuoteTool'
import Lead from './Lead'
import SmsLead from './SmsLead'
import BookingModal from './BookingModal'

// Types
interface Metrics {
  uniqueCalls: number
  outboundCalls: number
  inboundCalls: number
  callsOver30s: number
  smsSent: number
  smsReceived: number
  emailsSent: number
  emailsReceived: number
  leads: number
  quotesForUniqueLeads: number
  averageLeadToCallMinutes: number
  medianLeadToCallMinutes: number
  wonJobs: number
  wonJobsSetToday: number
  commsToWonJobRatio: number
  leadToCallAvgPerWonJob: number
  leadsToWonJobRatio: number
}

interface ExtractedLead {
  id: string
  email_id: string
  name?: string | null
  phone_number?: string | null
  email?: string | null
  region_notes?: string | null
  extracted_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  email_subject?: string | null
  email_created_at?: string | null
  status?: string | null
  first_contact?: string | number | null
  lead_to_call_minutes?: number | null
  last_text_date?: string | number | null
  last_text_body?: string | null
}

const LEAD_STATUS_OPTIONS = [
  'Unanswered',
  'Marketing Loop',
  'Follow Up',
  'Quote Sent',
  'Job Won',
  'Jobs Completed',
  'Not interested',
]

// Helper functions
function calculateLeadToCallMinutes(lead: ExtractedLead): number | null {
  if (!lead.first_contact) return null
  const startDate = lead.email_created_at || lead.extracted_at || lead.created_at
  if (!startDate) return null

  const start = new Date(startDate).getTime()
  const end =
    typeof lead.first_contact === 'number'
      ? lead.first_contact
      : new Date(lead.first_contact).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null

  const diffMinutes = (end - start) / (1000 * 60)
  return Number.isFinite(diffMinutes) && diffMinutes >= 0
    ? Number(diffMinutes.toFixed(1))
    : null
}

function formatLeadToCallText(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return 'Not contacted'
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${minutes.toFixed(0)} min`
  const hours = minutes / 60
  return `${hours.toFixed(1)} hr`
}

function isNewLead(lead: ExtractedLead) {
  return !lead.status && !lead.first_contact
}

function isValidAusPhone(phone: string) {
  const cleaned = phone.trim()
  return /^\+61\d{8,9}$/.test(cleaned)
}

function isValidEmail(email: string) {
  const cleaned = email.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)
}

function getLeadDisplayName(lead: ExtractedLead) {
  const name = lead.name?.trim()
  if (name) return name
  const email = lead.email?.trim()
  if (email) return email
  const phone = lead.phone_number?.trim()
  if (phone) return phone
  return 'Unknown'
}

function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const rand = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
  return `${rand()}${rand()}-${rand()}-${rand()}-${rand()}-${rand()}${rand()}${rand()}`
}

// Deduplication functions
const dedupeCallsBySignature = (calls: DialpadCall[]) => {
  const seenCallIds = new Set<string>()
  const deduped: DialpadCall[] = []
  for (const call of calls) {
    if (call.call_id) {
      if (seenCallIds.has(call.call_id)) continue
      seenCallIds.add(call.call_id)
    }
    deduped.push(call)
  }
  return deduped
}

const dedupeSmsById = (sms: DialpadSms[]) => {
  const seenMessageIds = new Set<string>()
  const deduped: DialpadSms[] = []
  for (const msg of sms) {
    if (msg.message_id) {
      if (seenMessageIds.has(msg.message_id)) continue
      seenMessageIds.add(msg.message_id)
    }
    deduped.push(msg)
  }
  return deduped
}

const dedupeEmailsById = (emails: DialpadEmail[]) => {
  const seenMessageIds = new Set<string>()
  const deduped: DialpadEmail[] = []
  for (const email of emails) {
    if (email.message_id) {
      if (seenMessageIds.has(email.message_id)) continue
      seenMessageIds.add(email.message_id)
    }
    deduped.push(email)
  }
  return deduped
}

// Status badge variant mapping
const getStatusBadgeVariant = (status?: string | null): 'default' | 'unanswered' | 'marketing' | 'followup' | 'quote' | 'won' | 'completed' | 'notinterested' => {
  if (!status) return 'default'
  const map: Record<string, typeof getStatusBadgeVariant extends (...args: any[]) => infer R ? R : never> = {
    'Unanswered': 'unanswered',
    'Marketing Loop': 'marketing',
    'Follow Up': 'followup',
    'Quote Sent': 'quote',
    'Job Won': 'won',
    'Jobs Completed': 'completed',
    'Not interested': 'notinterested',
  }
  return map[status] || 'default'
}

// Email webhook status
type EmailWebhookStatus = {
  state: 'checking' | 'connected' | 'expired' | 'missing' | 'error'
  expiresAt?: string
  message?: string
}

// =============================================================================
// MAIN DASHBOARD COMPONENT
// =============================================================================

export default function Dashboard() {
  const { addToast } = useToast()
  const { currentOrg } = useAuth()
  const [metrics, setMetrics] = useState<Metrics>({
    uniqueCalls: 0,
    outboundCalls: 0,
    inboundCalls: 0,
    callsOver30s: 0,
    smsSent: 0,
    smsReceived: 0,
    emailsSent: 0,
    emailsReceived: 0,
    leads: 0,
    quotesForUniqueLeads: 0,
    averageLeadToCallMinutes: 0,
    medianLeadToCallMinutes: 0,
    wonJobs: 0,
    wonJobsSetToday: 0,
    commsToWonJobRatio: 0,
    leadToCallAvgPerWonJob: 0,
    leadsToWonJobRatio: 0,
  })
  const [extractedLeads, setExtractedLeads] = useState<ExtractedLead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [allCalls, setAllCalls] = useState<DialpadCall[]>([])
  const [allSms, setAllSms] = useState<DialpadSms[]>([])
  const [allEmails, setAllEmails] = useState<DialpadEmail[]>([])
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null)
  const [quoteLead, setQuoteLead] = useState<ExtractedLead | null>(null)
  const [bookingLead, setBookingLead] = useState<ExtractedLead | null>(null)
  const [pendingJobWonLead, setPendingJobWonLead] = useState<ExtractedLead | null>(null)
  const [showManualLeadForm, setShowManualLeadForm] = useState(false)
  const [manualLead, setManualLead] = useState({ name: '', phone_number: '', email: '', region_notes: '' })
  const [savingManualLead, setSavingManualLead] = useState(false)
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null)
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null)
  const [emailWebhookStatus, setEmailWebhookStatus] = useState<EmailWebhookStatus>({ state: 'checking' })
  const queryOpenRef = useRef(false)
  
  // Encouragement state
  const [encouragement, setEncouragement] = useState<{ show: boolean; message: string }>({ show: false, message: '' })

  // Calculate streak (days with activity)
  const [streak, setStreak] = useState(0)

  const getStartOfToday = useCallback(() => {
    const now = new Date()
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
    return todayUTC.toISOString()
  }, [])

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    if (!currentOrg) return
    try {
      setError(null)
      const todayStartIso = getStartOfToday()

      const dayStart = selectedDate
        ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0)
        : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0, 0)
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 23, 59, 59, 999)

      const dateStartIso = selectedDate ? dayStart.toISOString() : todayStartIso
      const dateEndIso = dayEnd.toISOString()
      const comparisonAnchor = dayStart

      const lookbackDays = 60
      const lookbackStart = subDays(comparisonAnchor, lookbackDays)
      const lookbackStartIso = new Date(
        lookbackStart.getFullYear(),
        lookbackStart.getMonth(),
        lookbackStart.getDate(),
        0, 0, 0, 0
      ).toISOString()

      const { data: calls, error: callsError } = await supabase
        .from('dialpad_calls')
        .select('*')
        .eq('org_id', currentOrg.id)
        .gte('created_at', lookbackStartIso)
        .order('created_at', { ascending: false })

      if (callsError) throw callsError

      const { data: sms, error: smsError } = await supabase
        .from('dialpad_sms')
        .select('*')
        .eq('org_id', currentOrg.id)
        .gte('created_at', lookbackStartIso)
        .order('created_at', { ascending: false })

      if (smsError) throw smsError

      const { data: emails, error: emailsError } = await supabase
        .from('dialpad_emails')
        .select('*')
        .eq('org_id', currentOrg.id)
        .gte('created_at', lookbackStartIso)
        .order('created_at', { ascending: false })

      if (emailsError) throw emailsError

      const typedCalls = (calls || []) as DialpadCall[]
      const typedSms = (sms || []) as DialpadSms[]
      const typedEmails = (emails || []) as DialpadEmail[]
      
      const dedupedCalls = dedupeCallsBySignature(typedCalls)
      const dedupedSms = dedupeSmsById(typedSms)
      const dedupedEmails = dedupeEmailsById(typedEmails)
      
      setAllCalls(dedupedCalls)
      setAllSms(dedupedSms)
      setAllEmails(dedupedEmails)

      const filteredCalls = dedupedCalls.filter(c => {
        const callTs = new Date(c.created_at).getTime()
        return callTs >= dayStart.getTime() && callTs <= dayEnd.getTime()
      })
      
      const filteredSms = dedupedSms.filter(s => {
        const smsTs = new Date(s.created_at).getTime()
        return smsTs >= dayStart.getTime() && smsTs <= dayEnd.getTime()
      })

      const filteredEmails = dedupedEmails.filter(e => {
        const emailTs = new Date(e.created_at).getTime()
        return emailTs >= dayStart.getTime() && emailTs <= dayEnd.getTime()
      })

      const uniqueCalls = filteredCalls.length
      const outboundCalls = filteredCalls.filter((c) => c.direction === 'outbound').length
      const inboundCalls = filteredCalls.filter((c) => c.direction === 'inbound').length
      const callsOver30s = filteredCalls.filter((c) => c.duration > 30).length
      const smsSent = filteredSms.filter((s) => s.direction === 'outbound').length
      const smsReceived = filteredSms.filter((s) => s.direction === 'inbound').length
      const emailsSent = filteredEmails.filter((e) => e.direction === 'outbound').length
      const emailsReceived = filteredEmails.filter((e) => e.direction === 'inbound').length

      // Fetch leads
      const isLeadEmail = (subject: string | null): boolean => {
        if (!subject) return false
        const normalizedSubject = subject
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&#39;/g, "'")
          .trim()
        const leadPatterns = [
          /^New message from\s+"[^"]+"$/i,
          /^New message from\s+'[^']+'$/i,
          /^New Meta Lead$/i,
          /^New Entry - Lead Form$/i,
        ]
        return leadPatterns.some(pattern => pattern.test(normalizedSubject))
      }

      const leadEmailIds = filteredEmails
        .filter((e) => isLeadEmail(e.subject))
        .map((e) => e.id)

      const leadFilters = [
        `and(created_at.gte.${dateStartIso},created_at.lte.${dateEndIso})`,
        `and(extracted_at.gte.${dateStartIso},extracted_at.lte.${dateEndIso})`,
      ]

      if (leadEmailIds.length > 0) {
        const quotedIds = leadEmailIds.map((id) => `"${id}"`).join(',')
        leadFilters.push(`email_id.in.(${quotedIds})`)
      }

      let extractedLeadsData: ExtractedLead[] = []
      try {
        const leadQuery = supabase
          .from('extracted_leads')
          .select('*')
          .eq('org_id', currentOrg.id)
          .order('created_at', { ascending: false })
          .limit(100)

        const finalQuery = leadFilters.length > 0 ? leadQuery.or(leadFilters.join(',')) : leadQuery

        const { data: extractedLeads, error: extractedLeadsError } = await finalQuery

        if (extractedLeadsError) {
          console.error('Error fetching extracted leads:', extractedLeadsError)
        } else if (extractedLeads) {
          const seenLeadIds = new Set<string>()
          const uniqueExtractedLeads = extractedLeads.filter((lead: any) => {
            if (seenLeadIds.has(lead.id)) return false
            seenLeadIds.add(lead.id)
            return true
          })

          const emailMap = new Map(filteredEmails.map((e) => [e.id, e]))
          extractedLeadsData = uniqueExtractedLeads.map((lead: any) => {
            const email = emailMap.get(lead.email_id)
            const combinedLead: ExtractedLead = {
              ...lead,
              email_subject: email?.subject,
              email_created_at: email?.created_at,
            }
            return {
              ...combinedLead,
              lead_to_call_minutes: calculateLeadToCallMinutes(combinedLead),
            }
          })
        }
      } catch (extractedLeadsErr) {
        console.error('Error fetching extracted leads:', extractedLeadsErr)
      }

      // Fetch quotes
      let quotesForUniqueLeads = 0
      try {
        const { data: quotesData, error: quotesError } = await supabase
          .from('quotes')
          .select('lead_id, created_at')
          .eq('org_id', currentOrg.id)
          .gte('created_at', dateStartIso)
          .lte('created_at', dateEndIso)

        if (quotesError) {
          console.error('Error fetching quotes for metrics:', quotesError)
        } else if (quotesData) {
          const unique = new Set(
            (quotesData as any[])
              .map((q) => q.lead_id)
              .filter((id): id is string => Boolean(id))
          )
          quotesForUniqueLeads = unique.size
        }
      } catch (quotesErr) {
        console.error('Error fetching quotes for metrics:', quotesErr)
      }

      const leadDurations = extractedLeadsData
        .map((lead) => lead.lead_to_call_minutes)
        .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
      
      const averageLeadToCallMinutes = (() => {
        if (leadDurations.length === 0) return 0
        const sum = leadDurations.reduce((acc, val) => acc + val, 0)
        return Number((sum / leadDurations.length).toFixed(1))
      })()
      
      const medianLeadToCallMinutes = (() => {
        if (leadDurations.length === 0) return 0
        const sorted = [...leadDurations].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
        return Number(median.toFixed(1))
      })()
      
      const wonLeads = extractedLeadsData.filter((lead) => lead.status === 'Job Won')
      const wonJobs = wonLeads.length
      const wonJobsSetToday = wonLeads.filter((lead) => {
        if (!lead.updated_at) return false
        const updatedAt = new Date(lead.updated_at).getTime()
        return updatedAt >= dayStart.getTime() && updatedAt <= dayEnd.getTime()
      }).length
      
      const commsScore = callsOver30s + (smsSent + emailsSent) / 2
      const commsToWonJobRatio = wonJobsSetToday > 0 ? Number((commsScore / wonJobsSetToday).toFixed(2)) : 0
      const leadToCallAvgPerWonJob = wonJobsSetToday > 0 ? Number((averageLeadToCallMinutes / wonJobsSetToday).toFixed(2)) : 0
      const leadsToWonJobRatio = wonJobsSetToday > 0 ? Number((extractedLeadsData.length / wonJobsSetToday).toFixed(2)) : 0

      setMetrics({
        uniqueCalls,
        outboundCalls,
        inboundCalls,
        callsOver30s,
        smsSent,
        smsReceived,
        emailsSent,
        emailsReceived,
        leads: extractedLeadsData.length,
        quotesForUniqueLeads,
        averageLeadToCallMinutes,
        medianLeadToCallMinutes,
        wonJobs,
        wonJobsSetToday,
        commsToWonJobRatio,
        leadToCallAvgPerWonJob,
        leadsToWonJobRatio,
      })
      setExtractedLeads(extractedLeadsData)

      // Calculate streak
      let currentStreak = 0
      const today = new Date()
      for (let i = 0; i < 30; i++) {
        const checkDate = subDays(today, i)
        const dayStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate())
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
        
        const hasActivity = dedupedCalls.some(c => {
          const ts = new Date(c.created_at).getTime()
          return ts >= dayStart.getTime() && ts < dayEnd.getTime() && c.duration > 30
        })
        
        if (hasActivity) {
          currentStreak++
        } else if (i > 0) {
          break
        }
      }
      setStreak(currentStreak)

    } catch (err) {
      console.error('Error fetching metrics:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    } finally {
      setIsLoading(false)
    }
  }, [getStartOfToday, selectedDate])

  // Fetch email webhook status
  const fetchEmailWebhookStatus = useCallback(async () => {
    setEmailWebhookStatus((prev) => ({ ...prev, state: 'checking', message: undefined }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setEmailWebhookStatus({ state: 'error', message: 'Not authenticated' })
        return
      }
      const response = await fetch(`${supabaseUrl}/functions/v1/setup-outlook-webhook`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!response.ok) throw new Error(`Status ${response.status}`)
      const data = await response.json()
      const subscriptions = Array.isArray(data?.value) ? data.value : []
      const outlookSubscriptions = subscriptions.filter((sub: { notificationUrl?: string }) =>
        (sub?.notificationUrl || '').includes('/outlook-webhook')
      )

      if (outlookSubscriptions.length === 0) {
        setEmailWebhookStatus({ state: 'missing' })
        return
      }

      const latest = outlookSubscriptions.reduce(
        (acc: { expirationDateTime?: string }, current: { expirationDateTime?: string }) => {
          if (!current.expirationDateTime) return acc
          if (!acc.expirationDateTime) return current
          return new Date(current.expirationDateTime) > new Date(acc.expirationDateTime) ? current : acc
        },
        {}
      )

      const expiresAt = latest.expirationDateTime
      if (!expiresAt) {
        setEmailWebhookStatus({ state: 'missing' })
        return
      }

      const expiresTime = new Date(expiresAt).getTime()
      const now = Date.now()
      if (Number.isNaN(expiresTime) || expiresTime <= now) {
        setEmailWebhookStatus({ state: 'expired', expiresAt })
        return
      }

      setEmailWebhookStatus({ state: 'connected', expiresAt })
    } catch (err) {
      console.error('Error checking email webhook status:', err)
      setEmailWebhookStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Unable to check email status',
      })
    }
  }, [])

  // Initial fetch and realtime subscription
  useEffect(() => {
    if (!currentOrg) return
    fetchMetrics()
    fetchEmailWebhookStatus()
    const emailStatusInterval = setInterval(fetchEmailWebhookStatus, 5 * 60 * 1000)

    // Realtime subscriptions
    const callsChannel = supabase
      .channel('dialpad_calls_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_calls', filter: 'org_id=eq.' + currentOrg.id }, () => fetchMetrics())
      .subscribe()

    const smsChannel = supabase
      .channel('dialpad_sms_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_sms', filter: 'org_id=eq.' + currentOrg.id }, () => fetchMetrics())
      .subscribe()

    const emailsChannel = supabase
      .channel('dialpad_emails_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_emails', filter: 'org_id=eq.' + currentOrg.id }, (payload) => {
        const email = payload.new as any
        const isLead = email?.subject && (
          /^New message from\s+"[^"]+"$/i.test(email.subject.replace(/&quot;/g, '"').trim()) ||
          /^New Meta Lead$/i.test(email.subject.trim())
        )
        
        if (isLead && payload.eventType === 'INSERT') {
          setTimeout(fetchMetrics, 3000)
          setTimeout(fetchMetrics, 8000)
        } else {
          fetchMetrics()
        }
      })
      .subscribe()

    const extractedLeadsChannel = supabase
      .channel('extracted_leads_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extracted_leads', filter: 'org_id=eq.' + currentOrg.id }, () => fetchMetrics())
      .subscribe()

    // Listen for sync-emails event from command palette
    const handleSyncEmails = () => handleSyncEmailsAction()
    window.addEventListener('sync-emails', handleSyncEmails)

    return () => {
      clearInterval(emailStatusInterval)
      supabase.removeChannel(callsChannel)
      supabase.removeChannel(smsChannel)
      supabase.removeChannel(emailsChannel)
      supabase.removeChannel(extractedLeadsChannel)
      window.removeEventListener('sync-emails', handleSyncEmails)
    }
  }, [fetchMetrics, fetchEmailWebhookStatus, currentOrg])

  useEffect(() => {
    if (!currentOrg) return

    const params = new URLSearchParams(window.location.search)
    const editQuoteId = params.get('editQuote')?.trim() || ''
    const leadParam = params.get('lead')?.trim() || ''

    if (!editQuoteId && !leadParam) return
    if (queryOpenRef.current) return
    queryOpenRef.current = true

    let cancelled = false

    const scrubParams = () => {
      params.delete('lead')
      params.delete('editQuote')
      const nextUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '')
      window.history.replaceState({}, '', nextUrl)
    }

    const openQuoteFromParams = async () => {
      try {
        let leadId = leadParam || ''

        if (!leadId && editQuoteId) {
          const { data: quoteRow, error: quoteError } = await supabase
            .from('quotes')
            .select('lead_id')
            .eq('id', editQuoteId)
            .eq('org_id', currentOrg.id)
            .single()

          if (quoteError) {
            console.warn('Failed to resolve quote lead', quoteError)
          } else if (quoteRow?.lead_id) {
            leadId = quoteRow.lead_id
          }
        }

        if (!leadId) {
          addToast({ type: 'error', title: 'Quote link invalid', message: 'No lead found for this quote.' })
          scrubParams()
          return
        }

        const existing = extractedLeads.find((lead) => lead.id === leadId)
        if (existing) {
          if (!cancelled) setQuoteLead(existing)
          scrubParams()
          return
        }

        const { data: leadRow, error: leadError } = await supabase
          .from('extracted_leads')
          .select('*')
          .eq('id', leadId)
          .eq('org_id', currentOrg.id)
          .single()

        if (leadError || !leadRow) {
          console.warn('Failed to load lead for quote edit', leadError)
          addToast({ type: 'error', title: 'Lead not found', message: 'Unable to open the quote editor.' })
          scrubParams()
          return
        }

        if (!cancelled) setQuoteLead(leadRow as ExtractedLead)
        scrubParams()
      } catch (err) {
        console.error('Failed to open quote from URL params', err)
        addToast({ type: 'error', title: 'Quote open failed', message: 'Please try again.' })
        scrubParams()
      }
    }

    openQuoteFromParams()

    return () => {
      cancelled = true
    }
  }, [currentOrg, extractedLeads, addToast])

  // Action handlers
  const handleRefresh = () => {
    setIsLoading(true)
    fetchMetrics()
    addToast({ type: 'info', title: 'Refreshing data...', duration: 2000 })
  }

  const handleSyncEmailsAction = async () => {
    try {
      setIsLoading(true)
      addToast({ type: 'info', title: 'Syncing emails...', message: 'Pulling latest from Outlook' })
      
      const response = await fetch(`${supabaseUrl}/functions/v1/outlook-email-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || 'Failed to sync emails')
      }
      
      const result = await response.json()
      addToast({ type: 'success', title: 'Emails synced', message: `${result.total || 0} emails processed` })
      
      setTimeout(fetchMetrics, 1000)
      fetchEmailWebhookStatus()
    } catch (err) {
      console.error('Error syncing emails:', err)
      addToast({ type: 'error', title: 'Sync failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateLeadStatus = async (leadId: string, status: string | null, skipBookingPrompt = false) => {
    if (!currentOrg) {
      addToast({ type: 'error', title: 'Update failed', message: 'No organization selected' })
      return
    }
    const lead = extractedLeads.find((l) => l.id === leadId)
    const previousStatus = lead?.status || ''

    if (status === 'Job Won' && !skipBookingPrompt && lead) {
      setPendingJobWonLead(lead)
      return
    }

    try {
      setSavingStatusId(leadId)
      setExtractedLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: status || null } : l)))

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${supabaseUrl}/functions/v1/update-lead-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg.id,
        },
        body: JSON.stringify({ leadId, status }),
      })

      let result: any = {}
      try {
        result = await response.json()
      } catch {
        const text = await response.text().catch(() => 'Unknown error')
        throw new Error(`Server error (${response.status}): ${text || 'Invalid response format'}`)
      }

      if (!response.ok || result?.error) {
        throw new Error(result?.error || `HTTP ${response.status}: Failed to update lead status`)
      }

      // Show success toast with contextual message
      const statusMessages: Record<string, string> = {
        'Job Won': '🎉 Nice! Job won.',
        'Quote Sent': '📧 Quote sent to customer',
        'Follow Up': '📞 Scheduled for follow-up',
        'Not interested': 'Lead archived',
      }
      
      addToast({ 
        type: 'success', 
        title: statusMessages[status || ''] || 'Status updated',
        duration: 3000 
      })

      // Show encouragement for wins
      if (status === 'Job Won') {
        setEncouragement({ show: true, message: 'Another win! Keep it up.' })
      }

    } catch (err) {
      console.error('Error updating lead status:', err)
      addToast({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Unknown error' })
      setExtractedLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: previousStatus || null } : l)))
      fetchMetrics()
    } finally {
      setSavingStatusId(null)
    }
  }

  const handleCallLead = async (leadId: string, phoneNumber?: string | null) => {
    if (!currentOrg) return
    if (!phoneNumber) {
      addToast({ type: 'warning', title: 'No phone number', message: 'This lead has no phone number' })
      return
    }

    const leadRecord = extractedLeads.find((lead) => lead.id === leadId)
    const hasFirstContact = Boolean(leadRecord?.first_contact)

    setCallingLeadId(leadId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const response = await fetch(`${supabaseUrl}/functions/v1/call-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'X-Org-Id': currentOrg.id,
        },
        body: JSON.stringify({ phone_number: phoneNumber }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.error) {
        throw new Error(result?.error || 'Failed to initiate call')
      }

      addToast({ type: 'success', title: 'Call initiated', message: `Calling ${leadRecord?.name || phoneNumber}...` })

      if (!hasFirstContact) {
        const nowIso = new Date().toISOString()
        const { data: updatedLead, error: updateError } = await supabase
          .from('extracted_leads')
          .update({ first_contact: nowIso })
          .eq('id', leadId)
          .eq('org_id', currentOrg.id)
          .is('first_contact', null)
          .select('*')
          .maybeSingle()

        if (!updateError) {
          const firstContactValue = updatedLead?.first_contact ?? nowIso
          setExtractedLeads((prev) =>
            prev.map((lead) => {
              if (lead.id !== leadId) return lead
              const nextFirstContact = lead.first_contact || firstContactValue
              return {
                ...lead,
                first_contact: nextFirstContact,
                lead_to_call_minutes: calculateLeadToCallMinutes({ ...lead, first_contact: nextFirstContact }),
              }
            })
          )
        }
      }
    } catch (err) {
      console.error('Error calling lead:', err)
      addToast({ type: 'error', title: 'Call failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setCallingLeadId(null)
    }
  }

  const handleDeleteLead = async (lead: ExtractedLead) => {
    if (!currentOrg) return
    if (!lead.id) return
    if (!window.confirm(lead.name ? `Remove ${lead.name}?` : 'Remove this lead?')) return
    
    setDeletingLeadId(lead.id)
    setExtractedLeads((prev) => prev.filter((l) => l.id !== lead.id))
    
    try {
      const { error: deleteError } = await supabase.from('extracted_leads').delete().eq('id', lead.id).eq('org_id', currentOrg.id)
      if (deleteError) throw deleteError
      addToast({ type: 'success', title: 'Lead removed' })
    } catch (err) {
      console.error('Error deleting lead:', err)
      addToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Unknown error' })
      fetchMetrics()
    } finally {
      setDeletingLeadId(null)
    }
  }

  const handleSaveManualLead = async () => {
    if (!currentOrg) return
    const name = manualLead.name.trim()
    const phone = manualLead.phone_number.trim()
    const email = manualLead.email.trim()
    const notes = manualLead.region_notes.trim()

    if (!name || !phone || !email) {
      addToast({ type: 'warning', title: 'Missing fields', message: 'Name, phone, and email are required' })
      return
    }

    if (!isValidAusPhone(phone)) {
      addToast({ type: 'warning', title: 'Invalid phone', message: 'Must be +61 followed by 8-9 digits' })
      return
    }

    if (!isValidEmail(email)) {
      addToast({ type: 'warning', title: 'Invalid email', message: 'Please enter a valid email address' })
      return
    }

    setSavingManualLead(true)

    try {
      const now = new Date().toISOString()
      const emailId = generateUuid()

      const { error: emailInsertError } = await supabase
        .from('dialpad_emails')
        .insert({
          id: emailId,
          message_id: `manual-${emailId}`,
          direction: 'inbound',
          subject: 'Manual lead entry',
          from_email: email,
          to_email: 'manual-entry@local',
          created_at: now,
          body: notes || null,
          summary: null,
          org_id: currentOrg.id,
        })

      if (emailInsertError) throw emailInsertError

      const payload = {
        email_id: emailId,
        name,
        phone_number: phone,
        email,
        region_notes: notes || null,
        extracted_at: now,
        created_at: now,
        status: null,
        org_id: currentOrg.id,
      }

      const { data, error: insertError } = await supabase
        .from('extracted_leads')
        .insert(payload)
        .select('*')
        .single()

      if (insertError) throw insertError

      const insertedLead: ExtractedLead = { ...payload, ...(data || {}) }
      const leadWithTiming = { ...insertedLead, lead_to_call_minutes: calculateLeadToCallMinutes(insertedLead) }

      setExtractedLeads((prev) => [leadWithTiming, ...prev])
      playSaveSound()
      addToast({ type: 'success', title: 'Lead added', message: `${name} added successfully` })
      
      setManualLead({ name: '', phone_number: '', email: '', region_notes: '' })
      setShowManualLeadForm(false)
    } catch (err) {
      console.error('Error saving manual lead:', err)
      addToast({ type: 'error', title: 'Save failed', message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setSavingManualLead(false)
    }
  }

  const handleBookingSuccess = () => {
    setPendingJobWonLead(null)
    setBookingLead(null)
    fetchMetrics()
    setEncouragement({ show: true, message: 'Booking created! Great work.' })
  }

  const handleBookingSkip = () => {
    if (pendingJobWonLead) {
      handleUpdateLeadStatus(pendingJobWonLead.id, 'Job Won', true)
    }
    setPendingJobWonLead(null)
    setBookingLead(null)
  }

  const handleBookingCancel = () => {
    setPendingJobWonLead(null)
    setBookingLead(null)
  }

  if (!currentOrg) return null

  // Calculate progress percentage
  const dailyGoal = 10 // Won jobs goal
  const progressPercent = Math.min((metrics.wonJobsSetToday / dailyGoal) * 100, 100)

  return (
    <div className="min-h-screen relative">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Section */}
        <header className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-title text-white">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}</h1>
                {streak > 0 && <StreakBadge count={streak} />}
              </div>
              <p className="text-caption">
                {selectedDate 
                  ? selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
                  : "Here's your overview for today"
                }
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap" data-tour="dashboard-quick-actions">
              <DatePicker selectedDate={selectedDate ?? new Date()} onDateChange={setSelectedDate} />
              
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--glass-border)]">
                <div className={`w-2 h-2 rounded-full ${
                  emailWebhookStatus.state === 'connected' ? 'bg-emerald-400' :
                  emailWebhookStatus.state === 'checking' ? 'bg-amber-400 animate-pulse' :
                  'bg-red-400'
                }`} />
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {emailWebhookStatus.state === 'connected' ? 'Emails connected' :
                   emailWebhookStatus.state === 'checking' ? 'Checking...' :
                   'Emails offline'}
                </span>
              </div>

              <Button onClick={handleSyncEmailsAction} loading={isLoading} variant="secondary" size="sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Sync
              </Button>

              <Button onClick={handleRefresh} loading={isLoading} variant="ghost" size="sm">
                <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            </div>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--color-error-muted)] border border-red-500/20">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-400">Error loading data</p>
                <p className="text-xs text-red-300/70">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          
          {/* Left Column - Progress & Key Metrics */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Daily Progress Card */}
            <GlassCard className="p-6" data-tour="dashboard-kpis">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-heading text-white">Today's Progress</h2>
                  <p className="text-caption">{metrics.wonJobsSetToday} of {dailyGoal} jobs won today</p>
                </div>
                <ProgressRing progress={progressPercent} size={64}>
                  <span className="text-sm font-bold text-white">{metrics.wonJobsSetToday}</span>
                </ProgressRing>
              </div>
              
              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-micro mb-1">Calls Made</p>
                  <p className="text-xl font-bold text-white">{isLoading ? '—' : metrics.uniqueCalls}</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-micro mb-1">Meaningful</p>
                  <p className="text-xl font-bold text-[var(--color-accent)]">{isLoading ? '—' : metrics.callsOver30s}</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-micro mb-1">Messages</p>
                  <p className="text-xl font-bold text-white">{isLoading ? '—' : metrics.smsSent + metrics.emailsSent}</p>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)]">
                  <p className="text-micro mb-1">New Leads</p>
                  <p className="text-xl font-bold text-amber-400">{isLoading ? '—' : metrics.leads}</p>
                </div>
              </div>
            </GlassCard>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <StatCard
                label="Outbound"
                value={metrics.outboundCalls}
                loading={isLoading}
                accentColor="#f97316"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5m0 0v5m0-5l-6 6" /></svg>}
              />
              <StatCard
                label="Inbound"
                value={metrics.inboundCalls}
                loading={isLoading}
                accentColor="#22c55e"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
              />
              <StatCard
                label="SMS Sent"
                value={metrics.smsSent}
                loading={isLoading}
                accentColor="#a855f7"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
              />
              <StatCard
                label="Emails"
                value={metrics.emailsSent}
                loading={isLoading}
                accentColor="#3b82f6"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              />
              <StatCard
                label="Quotes"
                value={metrics.quotesForUniqueLeads}
                loading={isLoading}
                accentColor="#06b6d4"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
              />
              <StatCard
                label="Won Jobs"
                value={metrics.wonJobs}
                loading={isLoading}
                accentColor="#10b981"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>}
              />
              <StatCard
                label="Avg Response"
                value={`${metrics.averageLeadToCallMinutes}m`}
                loading={isLoading}
                accentColor="#eab308"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard
                label="Conversion"
                value={metrics.leadsToWonJobRatio > 0 ? `${(100 / metrics.leadsToWonJobRatio).toFixed(0)}%` : '—'}
                loading={isLoading}
                accentColor="#ec4899"
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
              />
            </div>
          </div>

          {/* Right Column - Leads */}
          <div className="xl:col-span-1">
            <GlassCard className="h-full max-h-[600px] flex flex-col" data-tour="dashboard-leads">
              <div className="p-4 border-b border-[var(--glass-border)] flex items-center justify-between">
                <div>
                  <h2 className="text-heading text-white">Today's Leads</h2>
                  <p className="text-caption">{extractedLeads.length} leads to work</p>
                </div>
                <Button 
                  onClick={() => setShowManualLeadForm(true)} 
                  variant="primary" 
                  size="sm"
                  data-testid="lead-add"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Manual Lead Form */}
                {showManualLeadForm && (
                  <div className="p-4 rounded-xl bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-micro">New Lead</span>
                      <button onClick={() => setShowManualLeadForm(false)} className="text-[var(--color-text-muted)] hover:text-white">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <input
                      value={manualLead.name}
                      onChange={(e) => setManualLead(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Name"
                      className="input text-sm"
                      data-testid="lead-manual-name"
                    />
                    <input
                      value={manualLead.phone_number}
                      onChange={(e) => setManualLead(prev => ({ ...prev, phone_number: e.target.value }))}
                      placeholder="+61..."
                      className="input text-sm"
                      data-testid="lead-manual-phone"
                    />
                    <input
                      value={manualLead.email}
                      onChange={(e) => setManualLead(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Email"
                      className="input text-sm"
                      data-testid="lead-manual-email"
                    />
                    <textarea
                      value={manualLead.region_notes}
                      onChange={(e) => setManualLead(prev => ({ ...prev, region_notes: e.target.value }))}
                      placeholder="Notes..."
                      rows={2}
                      className="input text-sm resize-none"
                      data-testid="lead-manual-notes"
                    />
                    <Button onClick={handleSaveManualLead} loading={savingManualLead} variant="primary" className="w-full" data-testid="lead-manual-save">
                      Save Lead
                    </Button>
                  </div>
                )}

                {/* Lead Cards */}
                {extractedLeads.length === 0 && !showManualLeadForm ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-[var(--color-surface)] flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <p className="text-sm text-white mb-1">No leads today</p>
                    <p className="text-xs text-[var(--color-text-muted)]">New leads will appear here</p>
                  </div>
                ) : (
                  extractedLeads.map((lead) => {
                    const isNew = isNewLead(lead)
                    
                    return (
                        <div
                          key={lead.id}
                          className={`lead-card ${isNew ? 'lead-card-new' : ''}`}
                          data-testid="lead-card"
                        >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{getLeadDisplayName(lead)}</p>
                            <p className="text-xs text-[var(--color-text-muted)] truncate">{lead.phone_number || lead.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isNew && <Badge variant="warning" dot>New</Badge>}
                            {lead.status && <Badge variant={getStatusBadgeVariant(lead.status)}>{lead.status}</Badge>}
                          </div>
                        </div>

                        {lead.region_notes && (
                          <p className="text-xs text-[var(--color-text-secondary)] mb-3 truncate-2">{lead.region_notes}</p>
                        )}

                        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-3">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className={lead.first_contact ? 'text-emerald-400' : 'text-amber-400'}>
                            {formatLeadToCallText(lead.lead_to_call_minutes)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={lead.status || ''}
                              onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value || null)}
                              disabled={savingStatusId === lead.id}
                              className="flex-1 min-w-[120px] px-2 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--glass-border)] text-xs text-white focus:outline-none focus:border-[var(--color-accent)]"
                              data-testid="lead-status"
                            >
                            <option value="">Set status...</option>
                            {LEAD_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          
                            <Button
                              onClick={() => handleCallLead(lead.id, lead.phone_number)}
                              loading={callingLeadId === lead.id}
                              variant="primary"
                              size="sm"
                              disabled={!lead.phone_number}
                              data-testid="lead-call"
                            >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </Button>

                            <Button onClick={() => setQuoteLead(lead)} variant="secondary" size="sm" data-testid="lead-quote">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </Button>

                          <SmsLead
                            leadId={lead.id}
                            leadName={lead.name}
                            phoneNumber={lead.phone_number}
                            onSent={({ sentAt, message }) => {
                              setExtractedLeads((prev) =>
                                prev.map((l) => l.id === lead.id ? { ...l, last_text_date: sentAt, last_text_body: message } : l)
                              )
                              addToast({ type: 'success', title: 'SMS sent', message: `Message sent to ${lead.name || 'lead'}` })
                            }}
                          />

                            <button
                              onClick={() => handleDeleteLead(lead)}
                              disabled={deletingLeadId === lead.id}
                              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              data-testid="lead-delete"
                            >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <DayComparisonChart
            calls={allCalls}
            sms={allSms}
            emails={allEmails}
            selectedDate={selectedDate}
            isLoading={isLoading}
            onDateChange={setSelectedDate}
          />
          <HourlyActivity
            calls={allCalls}
            selectedDate={selectedDate}
            isLoading={isLoading}
            onDateChange={setSelectedDate}
          />
        </div>

        {/* Leads Section */}
        <Lead />

        {/* Communications Log */}
        <CommunicationsLog selectedDate={selectedDate} />

        {/* Footer */}
        <footer className="mt-16 text-center py-8 border-t border-[var(--glass-border)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            Operations Hub · Powered by <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">Supabase</a> Real-time
          </p>
        </footer>
      </div>

      {/* Quote Modal */}
      {quoteLead && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[500] p-4"
          onClick={() => setQuoteLead(null)}
        >
          <div
            className="glass-elevated w-full max-w-5xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
              <div>
                <p className="text-micro">Create Quote</p>
                <h3 className="text-heading text-white">
                  {quoteLead.name || 'Lead'} · {quoteLead.email || quoteLead.phone_number || ''}
                </h3>
              </div>
              <button
                onClick={() => setQuoteLead(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <QuoteTool lead={quoteLead} emailId={quoteLead.email_id ?? null} autoEditLatest />
            </div>
          </div>
        </div>
      )}

      {/* Booking Modals */}
      {pendingJobWonLead && (
        <BookingModal
          lead={pendingJobWonLead}
          onClose={handleBookingCancel}
          onSuccess={handleBookingSuccess}
          onSkip={handleBookingSkip}
        />
      )}

      {bookingLead && (
        <BookingModal
          lead={bookingLead}
          onClose={() => setBookingLead(null)}
          onSuccess={() => {
            setBookingLead(null)
            fetchMetrics()
          }}
          onSkip={() => setBookingLead(null)}
        />
      )}

      {/* Encouragement Message */}
      <Encouragement
        message={encouragement.message}
        show={encouragement.show}
        onHide={() => setEncouragement({ show: false, message: '' })}
      />
    </div>
  )
}
