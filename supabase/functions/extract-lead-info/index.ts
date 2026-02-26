import { resolveOrgFromRequest, corsHeaders, jsonResponse, jsonError } from '../_shared/org-resolver.ts'

const decodeEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')

const stripHtml = (value: string) =>
  decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/

const normalizePhoneToE164 = (input?: string | null): string | null => {
  if (!input || typeof input !== 'string') return null
  let compact = input.trim().replace(/[^\d+]/g, '')
  if (!compact) return null

  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`

  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '')
    if (!digits) return null
    const fixedDigits = digits.startsWith('610') ? `61${digits.slice(3)}` : digits
    if (fixedDigits.length < 8 || fixedDigits.length > 15) return null
    return `+${fixedDigits}`
  }

  const digitsOnly = compact.replace(/\D/g, '')
  if (!digitsOnly) return null

  if (digitsOnly.startsWith('61')) {
    if (digitsOnly.length < 8 || digitsOnly.length > 15) return null
    return `+${digitsOnly}`
  }

  if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
    return `+61${digitsOnly.slice(1)}`
  }

  if (digitsOnly.startsWith('4') && digitsOnly.length === 9) {
    return `+61${digitsOnly}`
  }

  return null
}

const extractNameFromSubject = (subject?: string | null) => {
  if (!subject) return null
  const normalized = decodeEntities(subject).trim()
  const match = normalized.match(/^New message from\s+["']([^"']+)["']$/i)
  return match?.[1]?.trim() || null
}

const extractEmailFromText = (text?: string | null) => {
  if (!text) return null
  const match = text.match(EMAIL_REGEX)
  return match?.[0]?.trim() || null
}

const extractPhoneFromText = (text?: string | null) => {
  if (!text) return null
  const match = text.match(PHONE_REGEX)
  return normalizePhoneToE164(match?.[1] || null)
}

const isMetadataLine = (line: string) =>
  /^(date|time|page url|user agent|remote ip|powered by|submitted from|source)\s*:/i.test(line)

const looksLikeBusinessName = (value?: string | null) => {
  if (!value) return false
  return /\b(cleaning|services?|pty|ltd|inc|llc|company|group|support|admin|team)\b/i.test(value)
}

const shouldUseFromEmailFallback = (email?: string | null) => {
  if (!email) return false
  const lower = email.trim().toLowerCase()
  if (!lower) return false
  if (lower.startsWith('email@')) return false
  if (lower.startsWith('noreply@')) return false
  if (lower.startsWith('no-reply@')) return false
  if (lower.startsWith('donotreply@')) return false
  if (lower.startsWith('mailer@')) return false
  if (lower.startsWith('postmaster@')) return false
  return true
}

const pickBestName = (existing?: string | null, parsed?: string | null) => {
  if (!parsed) return existing || null
  if (!existing) return parsed
  if (looksLikeBusinessName(existing) && !looksLikeBusinessName(parsed)) return parsed
  return existing
}

const pickBestEmail = (existing?: string | null, parsed?: string | null) => {
  if (!parsed) return existing || null
  if (!existing) return parsed
  if (!shouldUseFromEmailFallback(existing)) return parsed
  return existing
}

const pickBestPhone = (existing?: string | null, parsed?: string | null) => {
  const existingNormalized = normalizePhoneToE164(existing)
  const parsedNormalized = normalizePhoneToE164(parsed)
  if (!parsedNormalized) return existingNormalized || null
  if (!existingNormalized) return parsedNormalized
  return existingNormalized
}

const LEAD_LABELS = {
  name: [/^name$/i, /^full\s*name$/i, /^lead\s*name$/i, /^first\s*name$/i, /^last\s*name$/i],
  phone: [/^phone$/i, /^phone\s*number$/i, /^mobile$/i, /^contact\s*number$/i, /^lead\s*number$/i],
  email: [/^email$/i, /^email\s*address$/i, /^contact\s*email$/i, /^lead\s*email$/i],
  notes: [/^notes?$/i, /^message$/i, /^comments?$/i, /^details?$/i, /^lead\s*notes?$/i],
}

type LeadFields = {
  name: string | null
  phone_number: string | null
  email: string | null
  region_notes: string | null
}

const looksLikeLabel = (value: string) => {
  const key = value.toLowerCase().replace(/\s+/g, ' ').trim()
  const allPatterns = [
    ...LEAD_LABELS.name,
    ...LEAD_LABELS.phone,
    ...LEAD_LABELS.email,
    ...LEAD_LABELS.notes,
  ]
  return allPatterns.some((pattern) => pattern.test(key))
}

const parseKeyValueLines = (lines: string[]) => {
  const fields: LeadFields = {
    name: null,
    phone_number: null,
    email: null,
    region_notes: null,
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue

    const splitIndex = line.indexOf(':')
    if (splitIndex === -1) continue
    const rawLabel = line.slice(0, splitIndex).trim()
    const rawValue = line.slice(splitIndex + 1).trim()

    const labelKey = rawLabel.toLowerCase().replace(/\s+/g, ' ').trim()
    const getValue = () => {
      if (rawValue) return rawValue
      let collected = ''
      let cursor = i + 1
      while (cursor < lines.length) {
        const nextLine = lines[cursor].trim()
        if (!nextLine) break
        if (nextLine.includes(':')) {
          const nextLabel = nextLine.split(':')[0].trim()
          if (looksLikeLabel(nextLabel)) break
        }
        collected = collected ? `${collected} ${nextLine}` : nextLine
        cursor += 1
      }
      return collected
    }

    const value = getValue()
    if (!value) continue

    if (!fields.name && LEAD_LABELS.name.some((pattern) => pattern.test(labelKey))) {
      fields.name = value
    } else if (!fields.phone_number && LEAD_LABELS.phone.some((pattern) => pattern.test(labelKey))) {
      fields.phone_number = value
    } else if (!fields.email && LEAD_LABELS.email.some((pattern) => pattern.test(labelKey))) {
      fields.email = value
    } else if (!fields.region_notes && LEAD_LABELS.notes.some((pattern) => pattern.test(labelKey))) {
      fields.region_notes = value
    }
  }

  return fields
}

const parseKeyValuePairsFromText = (text: string) => {
  const fields: LeadFields = {
    name: null,
    phone_number: null,
    email: null,
    region_notes: null,
  }

  const labelAlternatives = [
    'name',
    'full\\s*name',
    'lead\\s*name',
    'phone',
    'phone\\s*number',
    'mobile',
    'contact\\s*number',
    'lead\\s*number',
    'email',
    'email\\s*address',
    'contact\\s*email',
    'lead\\s*email',
    'notes?',
    'message',
    'comments?',
    'details?',
    'lead\\s*notes?',
    'region',
  ]

  const pairRegex = new RegExp(
    `(?:^|\\s)(${labelAlternatives.join('|')})\\s*:\\s*([^:]+?)(?=\\s+(?:${labelAlternatives.join('|')})\\s*:|$)`,
    'gi'
  )

  let match: RegExpExecArray | null
  while ((match = pairRegex.exec(text))) {
    const label = match[1].toLowerCase().replace(/\s+/g, ' ').trim()
    const value = match[2].trim()
    if (!value) continue

    if (!fields.name && LEAD_LABELS.name.some((pattern) => pattern.test(label))) {
      fields.name = value
    } else if (!fields.phone_number && LEAD_LABELS.phone.some((pattern) => pattern.test(label))) {
      fields.phone_number = value
    } else if (!fields.email && LEAD_LABELS.email.some((pattern) => pattern.test(label))) {
      fields.email = value
    } else if (!fields.region_notes && (LEAD_LABELS.notes.some((pattern) => pattern.test(label)) || label === 'region')) {
      fields.region_notes = value
    }
  }

  return fields
}

const parseUnlabeledLeadBlock = (lines: string[]) => {
  const fields: LeadFields = {
    name: null,
    phone_number: null,
    email: null,
    region_notes: null,
  }

  const leadBlock: string[] = []
  for (const line of lines) {
    if (!line) continue
    if (line === '---' || isMetadataLine(line)) break
    leadBlock.push(line)
  }

  if (leadBlock.length === 0) return fields
  if (leadBlock.some((line) => line.includes(':'))) return fields

  const phoneIdx = leadBlock.findIndex((line) => PHONE_REGEX.test(line))
  const emailIdx = leadBlock.findIndex((line) => EMAIL_REGEX.test(line))

  if (phoneIdx >= 0) {
    fields.phone_number = extractPhoneFromText(leadBlock[phoneIdx])
  }
  if (emailIdx >= 0) {
    fields.email = extractEmailFromText(leadBlock[emailIdx])
  }

  const contactCutoffCandidates = [phoneIdx, emailIdx].filter((idx) => idx >= 0)
  const contactCutoff = contactCutoffCandidates.length > 0
    ? Math.min(...contactCutoffCandidates)
    : leadBlock.length

  const nameParts = leadBlock
    .slice(0, contactCutoff)
    .map((line) => line.trim())
    .filter((line) => line && !PHONE_REGEX.test(line) && !EMAIL_REGEX.test(line))
    .slice(0, 2)

  if (nameParts.length > 0) {
    fields.name = nameParts.join(' ')
  }

  const usedIndexes = new Set<number>([phoneIdx, emailIdx].filter((idx) => idx >= 0))
  const notes = leadBlock
    .filter((line, idx) => !usedIndexes.has(idx))
    .slice(contactCutoff + (nameParts.length > 0 ? 0 : 1))
    .join(' ')
    .trim()

  if (notes) {
    fields.region_notes = notes
  }

  return fields
}

const parseLeadFromEmail = (subject: string | null, fromEmail: string | null, body: string | null): LeadFields => {
  const text = body ? stripHtml(body) : ''
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const keyValues = parseKeyValuePairsFromText(text)
  const lineValues = parseKeyValueLines(lines)
  const unlabeledValues = parseUnlabeledLeadBlock(lines)
  const subjectName = extractNameFromSubject(subject)
  const combined = {
    name: keyValues.name || lineValues.name || unlabeledValues.name,
    phone_number: keyValues.phone_number || lineValues.phone_number || unlabeledValues.phone_number,
    email: keyValues.email || lineValues.email || unlabeledValues.email,
    region_notes: keyValues.region_notes || lineValues.region_notes || unlabeledValues.region_notes,
  }

  return {
    name: combined.name || (!looksLikeBusinessName(subjectName) ? subjectName : null) || null,
    phone_number: normalizePhoneToE164(combined.phone_number) || extractPhoneFromText(text),
    email: combined.email || extractEmailFromText(text) || (shouldUseFromEmailFallback(fromEmail) ? fromEmail?.trim() || null : null),
    region_notes: combined.region_notes || null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  try {
  const { orgId, supabaseAdmin } = await resolveOrgFromRequest(req)
  const supabase = supabaseAdmin

  let payload: { email_id?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const emailId = payload?.email_id
  if (!emailId) {
    return jsonError('email_id is required', 400)
  }

  {
    const { data: emailRow, error: emailError } = await supabase
      .from('dialpad_emails')
      .select('id, subject, from_email, body')
      .eq('id', emailId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (emailError) {
      return jsonResponse({ success: false, error: emailError.message }, 500)
    }

    if (!emailRow) {
      return jsonResponse({ success: false, error: 'Email not found' }, 404)
    }

    const parsed = parseLeadFromEmail(emailRow.subject, emailRow.from_email, emailRow.body)
    const extractedAt = new Date().toISOString()

    const { data: existingLead, error: existingError } = await supabase
      .from('extracted_leads')
      .select('id, name, phone_number, email, region_notes')
      .eq('email_id', emailId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (existingError) {
      return jsonResponse({ success: false, error: existingError.message }, 500)
    }

    const payloadToPersist = {
      email_id: emailId,
      name: pickBestName(existingLead?.name, parsed.name),
      phone_number: pickBestPhone(existingLead?.phone_number, parsed.phone_number),
      email: pickBestEmail(existingLead?.email, parsed.email),
      region_notes: existingLead?.region_notes || parsed.region_notes,
      extracted_at: extractedAt,
      org_id: orgId,
    }

    if (existingLead?.id) {
      const { error: updateError } = await supabase
        .from('extracted_leads')
        .update(payloadToPersist)
        .eq('id', existingLead.id)

      if (updateError) {
        return jsonResponse({ success: false, error: updateError.message }, 500)
      }
    } else {
      const { error: insertError } = await supabase.from('extracted_leads').insert(payloadToPersist)
      if (insertError) {
        return jsonResponse({ success: false, error: insertError.message }, 500)
      }
    }

    return jsonResponse({
      success: true,
      ...payloadToPersist,
    })
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    const status = message === 'Unauthorized' ? 401 : 500
    return jsonError(message, status)
  }
})
