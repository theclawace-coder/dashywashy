import { useState, useEffect, useCallback } from 'react'
import { supabase, type DialpadCall, type DialpadSms, type DialpadEmail } from '../lib/supabase'
import { isSameDay, startOfDay, endOfDay, addDays } from 'date-fns'

type CommunicationType = 'all' | 'calls' | 'sms' | 'emails'

interface CommunicationItem {
  id: string
  type: 'call' | 'sms' | 'email'
  direction: 'inbound' | 'outbound'
  created_at: string
  // Call-specific
  call_id?: string
  duration?: number
  transcript?: string | null
  summary?: string | null
  external_number?: string | null
  // SMS-specific
  message_id?: string
  content?: string | null
  // Email-specific
  subject?: string | null
  from_email?: string | null
  to_email?: string | null
  body?: string | null
}

interface TranscriptModalProps {
  item: CommunicationItem
  onClose: () => void
  onFetchSummary: () => void
  isLoading: boolean
}

// Format duration - Handle both old (milliseconds) and new (seconds) values
// Moved outside component so it can be used in TranscriptModal
function formatDuration(duration: number | undefined) {
  if (!duration) return null
  // If duration is > 3600 (1 hour in seconds), it's likely stored incorrectly as milliseconds
  let durationInSeconds: number
  if (duration > 3600) {
    durationInSeconds = Math.floor(duration / 1000)
  } else {
    durationInSeconds = Math.floor(duration)
  }
  const minutes = Math.floor(durationInSeconds / 60)
  const seconds = durationInSeconds % 60
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

function TranscriptModal({ item, onClose, onFetchSummary, isLoading }: TranscriptModalProps) {
  // Format the summary as bullet points if it's not already
  const formatSummary = (summary: string | null | undefined) => {
    if (!summary) return null
    // Split by bullet points or newlines
    const lines = summary.split(/[\n•]/).filter(line => line.trim())
    return lines
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-surface)] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              item.type === 'call' ? 'bg-cyan-500/20 text-cyan-400' :
              item.type === 'sms' ? 'bg-violet-500/20 text-violet-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              {item.type === 'call' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              )}
              {item.type === 'sms' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              )}
              {item.type === 'email' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-white font-semibold">
                {item.type === 'call' ? 'Call Details' : item.type === 'sms' ? 'SMS Details' : 'Email Details'}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                {item.external_number || item.from_email || item.to_email || 'Unknown Contact'}
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

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {/* Call Summary Section */}
          {item.type === 'call' && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                  Call Summary
                </h4>
                {!item.summary && (
                  <button
                    onClick={onFetchSummary}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Get AI Summary
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5">
                {item.summary ? (
                  <ul className="space-y-2">
                    {formatSummary(item.summary)?.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-white">
                        <span className="text-cyan-400 mt-1">•</span>
                        <span>{point.trim()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[var(--color-text-muted)] italic">
                    Click "Get AI Summary" to generate a summary from the call transcript.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* SMS Content */}
          {item.type === 'sms' && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Message Content
              </h4>
              <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5">
                {item.content ? (
                  <p className="text-white whitespace-pre-wrap">{item.content}</p>
                ) : (
                  <p className="text-[var(--color-text-muted)] italic">
                    No message content available.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Email Content */}
          {item.type === 'email' && (
            <>
              <div className="mb-4">
                <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                  Subject
                </h4>
                <p className="text-white">{item.subject || 'No subject'}</p>
              </div>
              {item.body && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                    Email Body
                  </h4>
                  <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5 max-h-48 overflow-y-auto">
                    <div 
                      className="email-body-content"
                      dangerouslySetInnerHTML={{ __html: item.body }}
                      style={{
                        color: 'white',
                        fontFamily: 'inherit',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Transcript Section for Calls */}
          {item.type === 'call' && item.transcript && (
            <div>
              <h4 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                Full Transcript
              </h4>
              <div className="p-4 rounded-xl bg-[var(--color-surface-light)] border border-white/5 max-h-64 overflow-y-auto">
                <pre className="text-white text-sm whitespace-pre-wrap font-mono leading-relaxed">
                  {item.transcript}
                </pre>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--color-text-muted)]">Direction:</span>
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                  item.direction === 'outbound' 
                    ? 'bg-orange-500/20 text-orange-400' 
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {item.direction === 'outbound' ? 'Sent' : 'Received'}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)]">Date:</span>
                <span className="ml-2 text-white">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
              {item.type === 'call' && item.duration !== undefined && (
                <div>
                  <span className="text-[var(--color-text-muted)]">Duration:</span>
                  <span className="ml-2 text-white">
                    {formatDuration(item.duration) || '-'}
                  </span>
                </div>
              )}
              {item.type === 'email' && (
                <>
                  <div>
                    <span className="text-[var(--color-text-muted)]">From:</span>
                    <span className="ml-2 text-white">{item.from_email || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-muted)]">To:</span>
                    <span className="ml-2 text-white">{item.to_email || '-'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CommunicationsLog() {
  const [filter, setFilter] = useState<CommunicationType>('all')
  const [items, setItems] = useState<CommunicationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<CommunicationItem | null>(null)
  const [isFetchingSummary, setIsFetchingSummary] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set())

  const fetchCommunications = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      console.log('[CommunicationsLog] Fetching communications...')

      // Fetch all communications in parallel
      const [callsRes, smsRes, emailsRes] = await Promise.all([
        supabase
          .from('dialpad_calls')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(selectedDate ? 200 : 100),
        supabase
          .from('dialpad_sms')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(selectedDate ? 200 : 100),
        supabase
          .from('dialpad_emails')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(selectedDate ? 200 : 100),
      ])

      // Check for errors and handle them (log but don't block rendering)
      if (callsRes.error) {
        console.error('[CommunicationsLog] Error fetching calls:', callsRes.error)
      }
      if (smsRes.error) {
        console.error('[CommunicationsLog] Error fetching SMS:', smsRes.error)
      }
      if (emailsRes.error) {
        console.error('[CommunicationsLog] Error fetching emails:', emailsRes.error)
        setError(`Failed to fetch emails: ${emailsRes.error.message}`)
      }

      console.log('[CommunicationsLog] Fetched:', {
        calls: callsRes.data?.length || 0,
        sms: smsRes.data?.length || 0,
        emails: emailsRes.data?.length || 0
      })

      // Apply date filter in memory if selected
      let callsData = callsRes.data || []
      let smsData = smsRes.data || []
      let emailsData = emailsRes.data || []

      if (selectedDate) {
        const startOfSelectedDay = startOfDay(selectedDate)
        const endOfSelectedDay = endOfDay(selectedDate)
        
        callsData = callsData.filter(call => {
          const callDate = new Date(call.created_at)
          return callDate >= startOfSelectedDay && callDate <= endOfSelectedDay
        })
        
        smsData = smsData.filter(sms => {
          const smsDate = new Date(sms.created_at)
          return smsDate >= startOfSelectedDay && smsDate <= endOfSelectedDay
        })
        
        emailsData = emailsData.filter(email => {
          const emailDate = new Date(email.created_at)
          return emailDate >= startOfSelectedDay && emailDate <= endOfSelectedDay
        })
      }

      // Deduplicate calls by call_id
      const seenCallIds = new Set<string>()
      const dedupedCalls = callsData.filter((call: DialpadCall) => {
        if (call.call_id) {
          if (seenCallIds.has(call.call_id)) return false
          seenCallIds.add(call.call_id)
        }
        return true
      })

      // Deduplicate SMS by message_id
      const seenSmsIds = new Set<string>()
      const dedupedSms = smsData.filter((sms: DialpadSms) => {
        if (sms.message_id) {
          if (seenSmsIds.has(sms.message_id)) return false
          seenSmsIds.add(sms.message_id)
        }
        return true
      })

      // Deduplicate emails by message_id first
      const seenEmailIds = new Set<string>()
      const dedupedByMessageId = emailsData.filter((email: DialpadEmail) => {
        if (email.message_id) {
          if (seenEmailIds.has(email.message_id)) return false
          seenEmailIds.add(email.message_id)
        }
        return true
      })

      // Additional deduplication: same subject + from + to + timestamp (within 1 second)
      // This catches cases where Microsoft Graph creates multiple entries for the same email
      const seenEmailSignatures = new Set<string>()
      const dedupedEmails = dedupedByMessageId.filter((email: DialpadEmail) => {
        const timestamp = new Date(email.created_at).getTime()
        const roundedTimestamp = Math.floor(timestamp / 1000)
        const signature = `${email.subject || ''}|${email.from_email || ''}|${email.to_email || ''}|${roundedTimestamp}|${email.direction}`
        
        if (seenEmailSignatures.has(signature)) return false
        seenEmailSignatures.add(signature)
        return true
      })

      console.log('[CommunicationsLog] After deduplication:', {
        calls: `${dedupedCalls.length} (removed ${callsData.length - dedupedCalls.length})`,
        sms: `${dedupedSms.length} (removed ${smsData.length - dedupedSms.length})`,
        emails: `${dedupedEmails.length} (removed ${emailsData.length - dedupedEmails.length}, by message_id: ${dedupedByMessageId.length}, by signature: ${dedupedEmails.length})`
      })

      const communications: CommunicationItem[] = []

      // Add calls
      dedupedCalls.forEach((call: DialpadCall) => {
        communications.push({
          id: call.id,
          type: 'call',
          direction: call.direction,
          created_at: call.created_at,
          call_id: call.call_id,
          duration: call.duration,
          transcript: call.transcript,
          summary: call.summary,
          external_number: call.external_number,
        })
      })

      // Add SMS
      dedupedSms.forEach((sms: DialpadSms) => {
        communications.push({
          id: sms.id,
          type: 'sms',
          direction: sms.direction,
          created_at: sms.created_at,
          message_id: sms.message_id,
          content: sms.content,
          external_number: sms.external_number,
        })
      })

      // Add Emails (all emails including leads)
      dedupedEmails.forEach((email: DialpadEmail) => {
        communications.push({
          id: email.id,
          type: 'email',
          direction: email.direction,
          created_at: email.created_at,
          message_id: email.message_id,
          subject: email.subject,
          from_email: email.from_email,
          to_email: email.to_email,
          body: email.body,
          external_number: email.direction === 'inbound' ? email.from_email : email.to_email,
        })
      })

      // Sort by date descending
      communications.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      setItems(communications)
      console.log(`[CommunicationsLog] Loaded ${communications.length} items`)
    } catch (error) {
      console.error('Error fetching communications:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch communications')
    } finally {
      setIsLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    fetchCommunications()

    // Subscribe to realtime updates
    const channels = [
      supabase
        .channel('calls_log_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_calls' }, () => fetchCommunications())
        .subscribe(),
      supabase
        .channel('sms_log_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_sms' }, () => fetchCommunications())
        .subscribe(),
      supabase
        .channel('emails_log_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dialpad_emails' }, () => fetchCommunications())
        .subscribe(),
    ]

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel))
    }
  }, [fetchCommunications])

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true
    if (filter === 'calls') return item.type === 'call'
    if (filter === 'sms') return item.type === 'sms'
    if (filter === 'emails') return item.type === 'email'
    return true
  })

  const handleFetchSummary = async () => {
    if (!selectedItem || selectedItem.type !== 'call' || !selectedItem.call_id) return

    setIsFetchingSummary(true)
    try {
      const response = await fetch(
        'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/get-transcript-summary',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call_id: selectedItem.call_id }),
        }
      )

      const data = await response.json()

      if (data.success && (data.transcript || data.summary)) {
        // Update the selected item with the new data
        setSelectedItem(prev => prev ? {
          ...prev,
          transcript: data.transcript || prev.transcript,
          summary: data.summary || prev.summary,
        } : null)

        // Also update the items list
        setItems(prev => prev.map(item => 
          item.id === selectedItem.id 
            ? { ...item, transcript: data.transcript || item.transcript, summary: data.summary || item.summary }
            : item
        ))
      } else if (data.message) {
        alert(data.message)
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
      alert('Failed to fetch summary. Please try again.')
    } finally {
      setIsFetchingSummary(false)
    }
  }

  const getTypeIcon = (type: 'call' | 'sms' | 'email') => {
    switch (type) {
      case 'call':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        )
      case 'sms':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
      case 'email':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )
    }
  }

  const getTypeColor = (type: 'call' | 'sms' | 'email') => {
    switch (type) {
      case 'call': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
      case 'sms': return 'bg-violet-500/20 text-violet-400 border-violet-500/30'
      case 'email': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    }
  }

  // Format phone number for display (compact version)
  const formatPhoneNumber = (number: string | null | undefined, full: boolean = false) => {
    if (!number) return 'Unknown'
    // Remove any non-digit characters except +
    const cleaned = number.replace(/[^\d+]/g, '')
    if (cleaned.length === 10) {
      return full ? `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}` : `${cleaned.slice(0,3)}-${cleaned.slice(3,6)}-${cleaned.slice(6)}`
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return full ? `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}` : `${cleaned.slice(1,4)}-${cleaned.slice(4,7)}-${cleaned.slice(7)}`
    }
    // For emails or long numbers, truncate if not full
    if (!full && number.length > 20) {
      return number.substring(0, 17) + '...'
    }
    return number
  }

  const toggleContactExpand = (itemId: string) => {
    setExpandedContacts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  // Get display text for the contact column
  const getContactDisplay = (item: CommunicationItem, full: boolean = false) => {
    if (item.type === 'email') {
      const email = item.direction === 'inbound' ? item.from_email : item.to_email
      if (!full && email && email.length > 20) {
        return email.substring(0, 17) + '...'
      }
      return email || 'Unknown'
    }
    return formatPhoneNumber(item.external_number, full)
  }

  // Format duration - Handle both old (milliseconds) and new (seconds) values
  // Get preview text for the content column
  const getContentPreview = (item: CommunicationItem) => {
    if (item.type === 'call') {
      if (item.summary) {
        // Show first bullet point
        const firstPoint = item.summary.split(/[\n•]/).filter(s => s.trim())[0]
        return firstPoint?.trim() || 'Summary available'
      }
      const durationStr = formatDuration(item.duration)
      return durationStr ? `${durationStr} call` : 'No summary yet'
    }
    if (item.type === 'sms') {
      return item.content?.substring(0, 50) + (item.content && item.content.length > 50 ? '...' : '') || 'No content'
    }
    if (item.type === 'email') {
      return item.subject || 'No subject'
    }
    return '-'
  }

  return (
    <div className="mt-8 glass-card rounded-2xl overflow-hidden">
      {/* Header - More Compact */}
      <div className="p-4 border-b border-white/10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Communications Log</h2>
                <p className="text-xs text-[var(--color-text-muted)]">Click any item to view details</p>
              </div>
            </div>
          </div>

          {/* Date Filter and Type Filter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Date Quick Filters */}
            <div className="flex items-center gap-1.5">
              {[
                { label: 'Today', date: new Date() },
                { label: 'Yesterday', date: addDays(new Date(), -1) },
                { label: 'Tomorrow', date: addDays(new Date(), 1) },
              ].map(({ label, date }) => (
                <button
                  key={label}
                  onClick={() => {
                    if (selectedDate && isSameDay(date, selectedDate)) {
                      setSelectedDate(null)
                    } else {
                      setSelectedDate(date)
                    }
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    selectedDate && isSameDay(date, selectedDate)
                      ? 'bg-cyan-500 text-white'
                      : 'bg-[var(--color-surface-light)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-lighter)]'
                  }`}
                >
                  {label}
                </button>
              ))}
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Type Filter Pills */}
            <div className="flex items-center gap-1.5 p-0.5 bg-[var(--color-surface)] rounded-lg">
              {(['all', 'calls', 'sms', 'emails'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    filter === f
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                      : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'calls' ? 'Calls' : f === 'sms' ? 'SMS' : 'Emails'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 mx-6 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-red-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Table - More Compact with Max Height */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[var(--color-surface)] z-10">
            <tr className="border-b border-white/10">
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-2">Type</th>
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-2">Contact</th>
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-2">Direction</th>
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-2">Content / Summary</th>
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-2">Date</th>
              <th className="text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              // Loading skeleton
              [...Array(5)].map((_, i) => (
                <tr key={i} className="hover:bg-white/5">
                  <td className="px-3 py-2"><div className="shimmer h-5 w-14 rounded" /></td>
                  <td className="px-3 py-2"><div className="shimmer h-5 w-28 rounded" /></td>
                  <td className="px-3 py-2"><div className="shimmer h-5 w-16 rounded" /></td>
                  <td className="px-3 py-2"><div className="shimmer h-5 w-40 rounded" /></td>
                  <td className="px-3 py-2"><div className="shimmer h-5 w-20 rounded" /></td>
                  <td className="px-3 py-2"><div className="shimmer h-5 w-14 rounded" /></td>
                </tr>
              ))
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--color-text-muted)] text-sm">
                  No communications found
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => setSelectedItem(item)}
                >
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${getTypeColor(item.type)}`}>
                      {getTypeIcon(item.type)}
                      <span className="hidden sm:inline">{item.type}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[120px]">
                    <div className="flex items-center gap-1">
                      <span className="text-white text-xs font-medium truncate">
                        {getContactDisplay(item, expandedContacts.has(item.id))}
                      </span>
                      {(getContactDisplay(item, true).length > 15 || (item.type === 'email' && getContactDisplay(item, true).length > 20)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleContactExpand(item.id)
                          }}
                          className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-white transition-colors"
                          title={expandedContacts.has(item.id) ? 'Collapse' : 'Expand'}
                        >
                          {expandedContacts.has(item.id) ? (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                      item.direction === 'outbound' 
                        ? 'bg-orange-500/20 text-orange-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {item.direction === 'outbound' ? (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      )}
                      {item.direction === 'outbound' ? 'Sent' : 'Recv'}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <p className="text-xs text-gray-300 truncate">
                      {getContentPreview(item)}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {new Date(item.created_at).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedItem(item)
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-white/5 hover:bg-white/10 text-gray-300 rounded transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="hidden sm:inline">View</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Stats Footer - More Compact */}
      <div className="p-3 border-t border-white/10 bg-[var(--color-surface)]/50">
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>
            Showing {filteredItems.length} of {items.length} communications
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              {items.filter(i => i.type === 'call').length} calls
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
              {items.filter(i => i.type === 'sms').length} SMS
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              {items.filter(i => i.type === 'email').length} emails
            </span>
          </div>
        </div>
      </div>

      {/* Modal */}
      {selectedItem && (
        <TranscriptModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onFetchSummary={handleFetchSummary}
          isLoading={isFetchingSummary}
        />
      )}
    </div>
  )
}
