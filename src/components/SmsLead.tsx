import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'
import { playSaveSound } from '../lib/sounds'

type SmsTemplate = {
  id?: string
  slug?: string | null
  title: string
  body: string
  is_default?: boolean
  created_at?: string
}

type SmsLeadProps = {
  leadId: string
  leadName?: string | null
  phoneNumber?: string | null
  onSent?: (payload: { sentAt: string; message: string }) => void
  prefillBody?: string
}

const DEFAULT_SMS_TEMPLATES: SmsTemplate[] = [
  {
    slug: 'missed-call-quick',
    title: 'Missed call – quick follow-up',
    body: 'Hi {{name}}, sorry we missed you. This is Sydney Premium Cleaning. Want us to get your clean booked? Reply YES and we will confirm times.',
  },
  {
    slug: 'missed-call-offer',
    title: 'Missed call + incentive',
    body: 'Hi {{name}}, apologies for missing your call. We can prioritise you today with a $25 booking credit. Want me to lock in a slot?',
  },
  {
    slug: 'quote-and-times',
    title: 'Quote + times',
    body: 'Hey {{name}}, thanks for reaching out to Sydney Premium Cleaning. I can share pricing and the earliest times we have today. Which suburb are you in?',
  },
  {
    slug: 'next-steps',
    title: 'Next steps to book',
    body: 'Hi {{name}}, we can get you scheduled in 2 steps: (1) confirm address + job type, (2) pick a time. Reply here and I will handle it.',
  },
  {
    slug: 'premium-upgrade',
    title: 'Premium upgrade',
    body: 'Hi {{name}}, we can send our premium team today with oven + window extras included. Interested? I can reserve it for you now.',
  },
  {
    slug: 'thank-you-followup',
    title: 'Thank you & follow-up',
    body: 'Thanks for contacting Sydney Premium Cleaning, {{name}}. I want to make sure we answer everything. What’s the best time to call you back?',
  },
]

function personalize(body: string, leadName?: string | null) {
  if (!body) return ''
  return body.replace(/{{\s*name\s*}}/gi, leadName?.trim() || 'there')
}

export default function SmsLead({
  leadId,
  leadName,
  phoneNumber,
  onSent,
  prefillBody,
}: SmsLeadProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendingError, setSendingError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [customTitle, setCustomTitle] = useState(prefillBody ? 'Payment link' : 'Custom follow-up')
  const [customBody, setCustomBody] = useState(prefillBody || '')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 360,
  })

  const selectedTemplate = useMemo(() => {
    if (selectedTemplateId === 'custom') return null
    return templates.find((t) => t.id === selectedTemplateId || t.slug === selectedTemplateId) || null
  }, [selectedTemplateId, templates])

  const resolvedBody = useMemo(() => {
    const raw = selectedTemplate ? selectedTemplate.body : customBody
    return personalize(raw, leadName)
  }, [customBody, leadName, selectedTemplate])

  const ensureDefaultTemplates = useCallback(async () => {
    const nowIso = new Date().toISOString()
    await supabase
      .from('sms_templates')
      .upsert(
        DEFAULT_SMS_TEMPLATES.map((tpl) => ({
          ...tpl,
          is_default: true,
          updated_at: nowIso,
        })),
        { onConflict: 'slug' }
      )
  }, [])

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    setSendingError(null)
    try {
      await ensureDefaultTemplates()
      const { data, error } = await supabase
        .from('sms_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      const list = (data || []) as SmsTemplate[]
      setTemplates(list)
      if (list.length > 0) {
        const first = list[0]
        const firstId = first.id || first.slug || null
        setSelectedTemplateId((current) => current || firstId)
      }
    } catch (err) {
      console.error('Error loading SMS templates', err)
      setSendingError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setLoadingTemplates(false)
    }
  }, [ensureDefaultTemplates])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    if (prefillBody) {
      setCustomBody(prefillBody)
      setSelectedTemplateId('custom')
      setCustomTitle((current) => (current === 'Custom follow-up' ? 'Payment link' : current))
    }
  }, [prefillBody])

  // Close when clicking outside the dropdown
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (!dropdownRef.current && !portalRef.current) return
      if (
        (!dropdownRef.current?.contains(e.target as Node) || !dropdownRef.current) &&
        !portalRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Position dropdown via portal to avoid clipping by parent overflow
  const updateDropdownPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = 360
    const margin = 8
    const viewportWidth = window.innerWidth
    let left = rect.right - width
    if (left < margin) left = margin
    if (left + width > viewportWidth - margin) left = viewportWidth - margin - width
    const top = rect.bottom + margin
    setDropdownStyle({ top, left, width })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    updateDropdownPosition()
    const handleResize = () => updateDropdownPosition()
    const handleScroll = () => updateDropdownPosition()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen, updateDropdownPosition])

  const handleSend = async () => {
    if (!phoneNumber) {
      setSendingError('No phone number available for this lead.')
      return
    }
    if (!resolvedBody.trim()) {
      setSendingError('Please choose a template or enter a message.')
      return
    }

    setIsSending(true)
    setSendingError(null)
    setSendSuccess(null)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/internal-send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          message: resolvedBody.trim(),
        }),
      })

      const data = await response.json()
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to send SMS (status ${response.status})`)
      }

      const sentAtIso = new Date().toISOString()
      const { data: updated, error: updateError } = await supabase
        .from('extracted_leads')
        .update({ last_text_date: sentAtIso, last_text_body: resolvedBody.trim() })
        .eq('id', leadId)
        .select('id,last_text_date,last_text_body')
        .maybeSingle()

      if (updateError) {
        console.error('Failed to update last_text_date', updateError)
        setSendingError(
          `SMS sent, but failed to save to Supabase: ${updateError.message || JSON.stringify(updateError)}`
        )
      }

      const appliedDate = updated?.last_text_date ?? sentAtIso
      const appliedBody = updated?.last_text_body || resolvedBody.trim()

      onSent?.({ sentAt: appliedDate, message: appliedBody })
      setSendSuccess('SMS sent successfully')
    } catch (err: any) {
      console.error('Error sending SMS', err)
      setSendingError(err instanceof Error ? err.message : 'Failed to send SMS')
    } finally {
      setIsSending(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!customBody.trim()) {
      setSendingError('Enter a custom message before saving.')
      return
    }
    setSavingTemplate(true)
    setSendingError(null)
    try {
      const slugBase = customTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const slug = `${slugBase || 'custom-template'}-${Math.random().toString(36).slice(2, 6)}`
      const nowIso = new Date().toISOString()
      const { data, error } = await supabase
        .from('sms_templates')
        .insert({
          title: customTitle.trim() || 'Custom follow-up',
          body: customBody.trim(),
          slug,
          is_default: false,
          updated_at: nowIso,
        })
        .select('*')
        .single()

      if (error) {
        throw error
      }

      setTemplates((prev) => [...prev, data as SmsTemplate])
      setSelectedTemplateId((data as SmsTemplate).id || slug)
      setSendSuccess('Template saved')
      playSaveSound()
    } catch (err) {
      console.error('Error saving template', err)
      setSendingError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSavingTemplate(false)
    }
  }

  const templateList = useMemo(() => {
    if (loadingTemplates) {
      return (
        <div className="space-y-2">
          {[...Array(3)].map((_, idx) => (
            <div key={idx} className="h-10 shimmer rounded-lg" />
          ))}
        </div>
      )
    }

    if (!templates.length) {
      return <p className="text-sm text-[var(--color-text-muted)]">No templates found.</p>
    }

    return (
      <div className="space-y-2">
        {templates.map((template) => {
          const templateId = template.id || template.slug || ''
          const isSelected = selectedTemplateId === templateId
          return (
            <label
              key={templateId}
              className={`block border border-white/10 rounded-lg p-3 cursor-pointer transition-colors ${
                isSelected ? 'bg-white/10 border-emerald-400/50' : 'hover:bg-white/5'
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="sms-template"
                  value={templateId}
                  checked={isSelected}
                  onChange={() => setSelectedTemplateId(templateId)}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{template.title}</p>
                    {template.is_default && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200">Default</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)]">{personalize(template.body, leadName)}</p>
                </div>
              </div>
            </label>
          )
        })}
      </div>
    )
  }, [leadName, loadingTemplates, selectedTemplateId, templates])

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-60"
        disabled={!phoneNumber}
        title={phoneNumber ? 'Send SMS' : 'No phone number for this lead'}
        ref={triggerRef}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-6 4h4" />
        </svg>
        SMS Lead
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={portalRef}
            className="fixed z-50 bg-[var(--color-surface)] border border-white/10 rounded-2xl shadow-2xl"
            style={{ top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width, maxWidth: '94vw' }}
          >
            <div className="p-2.5 border-b border-white/10 flex items-center justify-between">
            <div>
              <h4 className="text-sm text-white font-semibold">SMS Templates</h4>
              <p className="text-[11px] text-[var(--color-text-muted)]">Sent via secure SMS gateway</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

            {(sendingError || sendSuccess) && (
              <div className="px-3 pt-3 space-y-2">
                {sendingError && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">{sendingError}</div>
                )}
                {sendSuccess && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200">{sendSuccess}</div>
                )}
              </div>
            )}

            <div className="p-3 space-y-3 max-h-[380px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-muted)]">To: {phoneNumber || 'No phone'}</span>
                <span className="text-[11px] text-[var(--color-text-muted)]">{leadName || 'Lead'}</span>
              </div>

              {templateList}

              <div className="border border-white/10 rounded-lg p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sms-template"
                    id="custom-template"
                    value="custom"
                    checked={selectedTemplateId === 'custom'}
                    onChange={() => setSelectedTemplateId('custom')}
                  />
                  <label htmlFor="custom-template" className="text-sm text-white font-medium">
                    Custom message
                  </label>
                </div>

                <input
                  type="text"
                  className="w-full bg-[var(--color-surface-light)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Template title"
                />
                <textarea
                  className="w-full bg-[var(--color-surface-light)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  rows={3}
                  value={customBody}
                  onChange={(e) => {
                    setCustomBody(e.target.value)
                    setSelectedTemplateId('custom')
                  }}
                  placeholder="Type your message. Use {{name}} to insert the lead name."
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate || !customBody.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-60"
                  >
                    {savingTemplate ? (
                      <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                    Save template
                  </button>
                  <span className="text-[11px] text-[var(--color-text-muted)]">Saved in Supabase</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm text-white font-semibold">Preview</h4>
                  <span className="text-[11px] text-[var(--color-text-muted)]">Name merges automatically</span>
                </div>
                <div className="p-2.5 bg-[var(--color-surface-light)] border border-white/10 rounded-lg min-h-[96px] text-sm text-white whitespace-pre-wrap">
                  {resolvedBody || <span className="text-[var(--color-text-muted)]">Select a template or write a custom message.</span>}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-text-muted)]">Sent via secure SMS gateway</span>
                <button
                  onClick={handleSend}
                  disabled={isSending || !phoneNumber}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-60"
                >
                  {isSending ? (
                    <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  Send SMS
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

