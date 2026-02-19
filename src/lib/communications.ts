import type { DialpadCall, DialpadEmail, DialpadSms } from './supabase'

export type CommunicationItem = {
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

export function normalizePhone(value?: string | null): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits.length ? digits : null
}

export function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase() || ''
  return normalized.length ? normalized : null
}

export function formatDuration(duration?: number) {
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

export function dedupeCalls(calls: DialpadCall[]) {
  const seenCallIds = new Set<string>()
  const dedupedByCallId = calls.filter((call) => {
    if (call.call_id) {
      if (seenCallIds.has(call.call_id)) return false
      seenCallIds.add(call.call_id)
    }
    return true
  })

  const seenCallSignatures = new Set<string>()
  return dedupedByCallId.filter((call) => {
    const timestamp = new Date(call.created_at).getTime()
    const roundedTimestamp = Math.floor(timestamp / 1000)
    const signature = `${call.external_number || ''}|${roundedTimestamp}|${call.direction}|${call.duration ?? ''}`

    if (seenCallSignatures.has(signature)) return false
    seenCallSignatures.add(signature)
    return true
  })
}

export function dedupeSms(sms: DialpadSms[]) {
  const seenSmsIds = new Set<string>()
  return sms.filter((msg) => {
    if (msg.message_id) {
      if (seenSmsIds.has(msg.message_id)) return false
      seenSmsIds.add(msg.message_id)
    }
    return true
  })
}

export function dedupeEmails(emails: DialpadEmail[]) {
  const seenEmailIds = new Set<string>()
  const dedupedByMessageId = emails.filter((email) => {
    if (email.message_id) {
      if (seenEmailIds.has(email.message_id)) return false
      seenEmailIds.add(email.message_id)
    }
    return true
  })

  const seenEmailSignatures = new Set<string>()
  return dedupedByMessageId.filter((email) => {
    const timestamp = new Date(email.created_at).getTime()
    const roundedTimestamp = Math.floor(timestamp / 1000)
    const signature = `${email.subject || ''}|${email.from_email || ''}|${email.to_email || ''}|${roundedTimestamp}|${email.direction}`

    if (seenEmailSignatures.has(signature)) return false
    seenEmailSignatures.add(signature)
    return true
  })
}

export function mapCallsToItems(calls: DialpadCall[]): CommunicationItem[] {
  return calls.map((call) => ({
    id: call.id,
    type: 'call',
    direction: call.direction,
    created_at: call.created_at,
    call_id: call.call_id,
    duration: call.duration,
    transcript: call.transcript,
    summary: call.summary,
    external_number: call.external_number,
  }))
}

export function mapSmsToItems(sms: DialpadSms[]): CommunicationItem[] {
  return sms.map((msg) => ({
    id: msg.id,
    type: 'sms',
    direction: msg.direction,
    created_at: msg.created_at,
    message_id: msg.message_id,
    content: msg.content,
    external_number: msg.external_number,
  }))
}

export function mapEmailsToItems(emails: DialpadEmail[]): CommunicationItem[] {
  return emails.map((email) => ({
    id: email.id,
    type: 'email',
    direction: email.direction,
    created_at: email.created_at,
    message_id: email.message_id,
    subject: email.subject,
    from_email: email.from_email,
    to_email: email.to_email,
    body: email.body,
  }))
}

export function sortByCreatedAtDesc<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
