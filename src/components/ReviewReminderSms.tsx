import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'

type ReviewSmsTemplate = {
  id?: string
  slug?: string | null
  title: string
  tone?: string | null
  body: string
  is_default?: boolean
  created_at?: string
}

type ReviewReminderSmsProps = {
  occurrenceId: string
  leadName?: string | null
  phoneNumber?: string | null
  reviewLink?: string
  onSent?: (payload: { sentAt: string; message: string }) => void
}

const googleReviewUrl =
  import.meta.env.VITE_GOOGLE_REVIEW_URL ||
  'https://g.page/r/CleaningReview'

function fillTemplate(
  body: string,
  leadName?: string | null,
  reviewLink?: string
) {
  return body
    .replace(/{{\s*name\s*}}/gi, leadName?.trim() || 'there')
    .replace(/{{\s*review_link\s*}}/gi, reviewLink || googleReviewUrl)
}

export default function ReviewReminderSms({
  occurrenceId,
  leadName,
  phoneNumber,
  reviewLink,
  onSent,
}: ReviewReminderSmsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendingError, setSendingError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ReviewSmsTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 360,
  })

  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId || t.slug === selectedTemplateId) || templates[0] || null
  }, [selectedTemplateId, templates])

  const resolvedBody = useMemo(() => {
    if (!selectedTemplate) return ''
    return fillTemplate(selectedTemplate.body, leadName, reviewLink)
  }, [selectedTemplate, leadName, reviewLink])

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    setSendingError(null)
    try {
      const { data, error } = await supabase
        .from('review_sms_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      const list = (data || []) as ReviewSmsTemplate[]
      setTemplates(list)
      if (list.length > 0 && !selectedTemplateId) {
        const first = list[0]
        const firstId = first.id || first.slug || null
        setSelectedTemplateId(firstId)
      }
    } catch (err) {
      console.error('Error loading review SMS templates', err)
      setSendingError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setLoadingTemplates(false)
    }
  }, [selectedTemplateId])

  useEffect(() => {
    if (isOpen) {
      loadTemplates()
    }
  }, [isOpen, loadTemplates])

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
      setSendingError('No phone number available for this customer.')
      return
    }
    if (!resolvedBody.trim()) {
      setSendingError('Please select a template.')
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

      const sentAt = new Date().toISOString()
      const { error: logError } = await supabase
        .from('review_sms_logs')
        .insert({
          occurrence_id: occurrenceId,
          template_id: selectedTemplate?.id || null,
          body: resolvedBody.trim(),
          tone: selectedTemplate?.tone || null,
          sent_at: sentAt,
        })

      if (logError) {
        console.error('Failed to log SMS', logError)
        setSendingError(`SMS sent, but failed to save log: ${logError.message}`)
      }

      onSent?.({ sentAt, message: resolvedBody.trim() })
      setSendSuccess('Review reminder sent successfully')
      setTimeout(() => setIsOpen(false), 1500)
    } catch (err: any) {
      console.error('Error sending SMS', err)
      setSendingError(err instanceof Error ? err.message : 'Failed to send SMS')
    } finally {
      setIsSending(false)
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
                  name="review-sms-template"
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
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {fillTemplate(template.body, leadName, reviewLink)}
                  </p>
                </div>
              </div>
            </label>
          )
        })}
      </div>
    )
  }, [leadName, loadingTemplates, selectedTemplateId, templates, reviewLink])

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-60"
        disabled={!phoneNumber}
        title={phoneNumber ? 'Send Review Reminder' : 'No phone number for this customer'}
        ref={triggerRef}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
        Review Reminder
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
                <h4 className="text-sm text-white font-semibold">Review Reminder Templates</h4>
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
                <span className="text-[11px] text-[var(--color-text-muted)]">{leadName || 'Customer'}</span>
              </div>

              {templateList}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm text-white font-semibold">Preview</h4>
                  <span className="text-[11px] text-[var(--color-text-muted)]">Variables merge automatically</span>
                </div>
                <div className="p-2.5 bg-[var(--color-surface-light)] border border-white/10 rounded-lg min-h-[96px] text-sm text-white whitespace-pre-wrap">
                  {resolvedBody || <span className="text-[var(--color-text-muted)]">Select a template.</span>}
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

