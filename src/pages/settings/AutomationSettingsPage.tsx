/**
 * AutomationSettingsPage - Manage org-level automations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Input, Badge, Modal, Switch } from '../../components/ui'

type AutomationType =
  | 'marketing_sms'
  | 'marketing_email'
  | 'booking_completion'
  | 'booking_reminder'
  | 'quote_email'
  | 'payment_sms'
  | 'review_sms'
  | 'daily_summary'

type AutomationSetting = {
  enabled: boolean
  config: Record<string, any>
}

type SmsTemplate = {
  id: string
  title: string
  body: string
  tone?: string | null
  step?: number | null
  variant?: number | null
  is_default?: boolean | null
}

type EmailTemplate = {
  id: string
  title: string
  subject: string
  body: string
  step?: number | null
  variant?: number | null
  is_default?: boolean | null
}

type TemplateEditorKind = 'marketing_sms' | 'marketing_email' | 'payment_sms' | 'review_sms'

type TemplateEditorState = {
  kind: TemplateEditorKind
  templateId: string
  title: string
  subject?: string
  body: string
}

const DEFAULT_SETTINGS: Record<AutomationType, AutomationSetting> = {
  marketing_sms: { enabled: true, config: {} },
  marketing_email: { enabled: true, config: {} },
  booking_completion: { enabled: true, config: { subject: '', body: '' } },
  booking_reminder: { enabled: true, config: { lead_hours: 24, subject: '', body: '' } },
  quote_email: { enabled: true, config: {} },
  payment_sms: { enabled: true, config: { template_id: '' } },
  review_sms: { enabled: true, config: { template_id: '' } },
  daily_summary: { enabled: true, config: { recipient_email: '', timezone: 'Australia/Sydney' } },
}

const PLACEHOLDER_BADGES = {
  name: '{{name}}',
  company: '{{company}}',
  amount: '{{amount}}',
  paymentLink: '{{payment_link}}',
  reviewLink: '{{review_link}}',
}

function formatTimestamp(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AutomationSettingsPage() {
  const { currentOrg, hasRole } = useAuth()
  const [settings, setSettings] = useState<Record<AutomationType, AutomationSetting>>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [marketingSmsTemplates, setMarketingSmsTemplates] = useState<SmsTemplate[]>([])
  const [marketingEmailTemplates, setMarketingEmailTemplates] = useState<EmailTemplate[]>([])
  const [paymentTemplates, setPaymentTemplates] = useState<SmsTemplate[]>([])
  const [reviewTemplates, setReviewTemplates] = useState<SmsTemplate[]>([])
  const [templateEditor, setTemplateEditor] = useState<TemplateEditorState | null>(null)

  const [completionSubject, setCompletionSubject] = useState('')
  const [completionBody, setCompletionBody] = useState('')
  const [reminderLeadHours, setReminderLeadHours] = useState(24)
  const [reminderSubject, setReminderSubject] = useState('')
  const [reminderBody, setReminderBody] = useState('')
  const [dailyRecipient, setDailyRecipient] = useState('')
  const [dailyTimezone, setDailyTimezone] = useState('Australia/Sydney')

  const [lastTriggered, setLastTriggered] = useState<Record<AutomationType, string | null>>({
    marketing_sms: null,
    marketing_email: null,
    booking_completion: null,
    booking_reminder: null,
    quote_email: null,
    payment_sms: null,
    review_sms: null,
    daily_summary: null,
  })

  const orgId = currentOrg?.id

  const canManage = useMemo(() => hasRole('admin'), [hasRole])
  const paymentDefaultTemplate = useMemo(
    () => paymentTemplates.find((t) => t.is_default) || paymentTemplates[0] || null,
    [paymentTemplates]
  )
  const reviewDefaultTemplate = useMemo(
    () => reviewTemplates.find((t) => t.is_default) || reviewTemplates[0] || null,
    [reviewTemplates]
  )

  const loadLastTriggered = useCallback(async () => {
    if (!orgId) return

    const safeFetch = async (table: string, column = 'sent_at') => {
      const { data } = await supabase
        .from(table)
        .select(`${column}`)
        .eq('org_id', orgId)
        .order(column, { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data as any)?.[column] as string | null | undefined
    }

    const [smsLog, emailLog, completionLog, reminderLog, paymentLog, reviewLog, dailyLog] = await Promise.all([
      safeFetch('marketing_sms_logs'),
      safeFetch('marketing_email_logs'),
      safeFetch('booking_occurrence_completion_emails'),
      safeFetch('booking_occurrence_reminders'),
      safeFetch('payment_sms_logs'),
      safeFetch('review_sms_logs'),
      safeFetch('daily_summary_logs'),
    ])

    setLastTriggered({
      marketing_sms: smsLog || null,
      marketing_email: emailLog || null,
      booking_completion: completionLog || null,
      booking_reminder: reminderLog || null,
      quote_email: null,
      payment_sms: paymentLog || null,
      review_sms: reviewLog || null,
      daily_summary: dailyLog || null,
    })
  }, [orgId])

  const loadSettings = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)

    try {
      const [{ data: rows, error: settingsError }, marketingSmsRes, marketingEmailRes, paymentRes, reviewRes] = await Promise.all([
        supabase
          .from('organization_automation_settings')
          .select('automation_type, enabled, config')
          .eq('org_id', orgId),
        supabase
          .from('marketing_sms_templates')
          .select('id, title, body, step, variant, is_default')
          .eq('org_id', orgId)
          .order('step', { ascending: true }),
        supabase
          .from('marketing_email_templates')
          .select('id, title, subject, body, step, variant, is_default')
          .eq('org_id', orgId)
          .order('step', { ascending: true }),
        supabase
          .from('payment_sms_templates')
          .select('id, title, body, tone, is_default')
          .eq('org_id', orgId)
          .order('is_default', { ascending: false }),
        supabase
          .from('review_sms_templates')
          .select('id, title, body, tone, is_default')
          .eq('org_id', orgId)
          .order('is_default', { ascending: false }),
      ])

      if (settingsError) throw settingsError

      const merged = { ...DEFAULT_SETTINGS }
      ;(rows || []).forEach((row: any) => {
        merged[row.automation_type as AutomationType] = {
          enabled: row.enabled ?? true,
          config: row.config ?? {},
        }
      })

      setSettings(merged)

      if (marketingSmsRes.error) throw marketingSmsRes.error
      if (marketingEmailRes.error) throw marketingEmailRes.error
      if (paymentRes.error) throw paymentRes.error
      if (reviewRes.error) throw reviewRes.error

      setMarketingSmsTemplates(marketingSmsRes.data || [])
      setMarketingEmailTemplates(marketingEmailRes.data || [])
      setPaymentTemplates(paymentRes.data || [])
      setReviewTemplates(reviewRes.data || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load automation settings.')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    loadSettings()
    loadLastTriggered()
  }, [loadLastTriggered, loadSettings, orgId])

  useEffect(() => {
    setCompletionSubject(settings.booking_completion.config.subject || '')
    setCompletionBody(settings.booking_completion.config.body || '')
    setReminderLeadHours(settings.booking_reminder.config.lead_hours ?? 24)
    setReminderSubject(settings.booking_reminder.config.subject || '')
    setReminderBody(settings.booking_reminder.config.body || '')
    setDailyRecipient(settings.daily_summary.config.recipient_email || '')
    setDailyTimezone(settings.daily_summary.config.timezone || 'Australia/Sydney')
  }, [
    settings.booking_completion.config.body,
    settings.booking_completion.config.subject,
    settings.booking_reminder.config.body,
    settings.booking_reminder.config.lead_hours,
    settings.booking_reminder.config.subject,
    settings.daily_summary.config.recipient_email,
    settings.daily_summary.config.timezone,
  ])

  const updateSetting = useCallback(
    async (type: AutomationType, updates: Partial<AutomationSetting>) => {
      if (!orgId) return
      setSaving(true)
      setError(null)
      setSuccess(false)

      const current = settings[type]
      const next: AutomationSetting = {
        enabled: updates.enabled ?? current.enabled,
        config: { ...current.config, ...(updates.config ?? {}) },
      }

      setSettings((prev) => ({ ...prev, [type]: next }))

      const { error: upsertError } = await supabase
        .from('organization_automation_settings')
        .upsert(
          {
            org_id: orgId,
            automation_type: type,
            enabled: next.enabled,
            config: next.config,
          },
          { onConflict: 'org_id,automation_type' }
        )

      if (upsertError) {
        setError(upsertError.message)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2500)
      }

      setSaving(false)
    },
    [orgId, settings]
  )

  const saveBookingEmails = useCallback(async () => {
    await updateSetting('booking_completion', {
      config: {
        subject: completionSubject,
        body: completionBody,
      },
    })
    await updateSetting('booking_reminder', {
      config: {
        lead_hours: reminderLeadHours,
        subject: reminderSubject,
        body: reminderBody,
      },
    })
  }, [
    completionBody,
    completionSubject,
    reminderBody,
    reminderLeadHours,
    reminderSubject,
    updateSetting,
  ])

  const saveDailySummary = useCallback(async () => {
    await updateSetting('daily_summary', {
      config: {
        recipient_email: dailyRecipient,
        timezone: dailyTimezone,
      },
    })
  }, [dailyRecipient, dailyTimezone, updateSetting])

  const selectDefaultTemplate = useCallback(
    async (type: 'payment_sms' | 'review_sms', templateId: string) => {
      if (!orgId) return
      setSaving(true)
      setError(null)

      const table = type === 'payment_sms' ? 'payment_sms_templates' : 'review_sms_templates'
      await supabase.from(table).update({ is_default: false }).eq('org_id', orgId)
      const { error: updateError } = await supabase.from(table).update({ is_default: true }).eq('id', templateId)

      if (updateError) {
        setError(updateError.message)
      } else {
        const data = type === 'payment_sms' ? paymentTemplates : reviewTemplates
        const updated = data.map((t) => ({ ...t, is_default: t.id === templateId }))
        type === 'payment_sms' ? setPaymentTemplates(updated) : setReviewTemplates(updated)
      }

      setSaving(false)
    },
    [orgId, paymentTemplates, reviewTemplates]
  )

  const openTemplateEditor = useCallback((kind: TemplateEditorKind, template: any) => {
    setTemplateEditor({
      kind,
      templateId: template.id,
      title: template.title || '',
      subject: template.subject,
      body: template.body || '',
    })
  }, [])

  const saveTemplate = useCallback(async () => {
    if (!templateEditor) return
    setSaving(true)
    setError(null)

    const { kind, templateId, title, subject, body } = templateEditor
    let updateError: any = null

    if (kind === 'marketing_sms') {
      const { error } = await supabase.from('marketing_sms_templates').update({ title, body }).eq('id', templateId)
      updateError = error
      if (!error) {
        setMarketingSmsTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, title, body } : t)))
      }
    }

    if (kind === 'marketing_email') {
      const { error } = await supabase
        .from('marketing_email_templates')
        .update({ title, subject: subject || '', body })
        .eq('id', templateId)
      updateError = error
      if (!error) {
        setMarketingEmailTemplates((prev) =>
          prev.map((t) => (t.id === templateId ? { ...t, title, subject: subject || '', body } : t))
        )
      }
    }

    if (kind === 'payment_sms') {
      const { error } = await supabase.from('payment_sms_templates').update({ title, body }).eq('id', templateId)
      updateError = error
      if (!error) {
        setPaymentTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, title, body } : t)))
      }
    }

    if (kind === 'review_sms') {
      const { error } = await supabase.from('review_sms_templates').update({ title, body }).eq('id', templateId)
      updateError = error
      if (!error) {
        setReviewTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, title, body } : t)))
      }
    }

    if (updateError) {
      setError(updateError.message || 'Failed to update template.')
    } else {
      setTemplateEditor(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    }

    setSaving(false)
  }, [templateEditor])

  if (!canManage) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">You need admin or owner access to view automation settings.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-title text-white">Automation Settings</h1>
          <p className="text-caption mt-1">Control every automated message, reminder, and sequence.</p>
        </div>
        <Badge variant="info">Org: {currentOrg?.business_name || currentOrg?.name || 'Unknown'}</Badge>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-sm text-emerald-400">Settings saved successfully.</p>
        </div>
      )}

      {loading ? (
        <GlassCard className="p-6">
          <p className="text-caption">Loading automation settings...</p>
        </GlassCard>
      ) : (
        <>
          <GlassCard className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-heading text-white">Marketing Loop</h2>
                <p className="text-caption">Nurture leads with SMS and email journeys.</p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                Last run: {formatTimestamp(lastTriggered.marketing_sms || lastTriggered.marketing_email)}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">SMS Journey</p>
                  <p className="text-xs text-[var(--color-text-muted)]">7-step nurture over ~2 months.</p>
                </div>
                <Switch
                  checked={settings.marketing_sms.enabled}
                  onChange={(checked) => updateSetting('marketing_sms', { enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">Email Journey</p>
                  <p className="text-xs text-[var(--color-text-muted)]">7-step email sequence over ~4 months.</p>
                </div>
                <Switch
                  checked={settings.marketing_email.enabled}
                  onChange={(checked) => updateSetting('marketing_email', { enabled: checked })}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-white font-medium">SMS Templates</p>
                  <Badge variant="info">{marketingSmsTemplates.length} steps</Badge>
                </div>
                <div className="space-y-2">
                  {marketingSmsTemplates.map((template) => (
                    <div key={template.id} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)]">Step {template.step}</p>
                        <p className="text-sm text-white">{template.title}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openTemplateEditor('marketing_sms', template)}>
                        Edit
                      </Button>
                    </div>
                  ))}
                  {marketingSmsTemplates.length === 0 && (
                    <p className="text-xs text-[var(--color-text-muted)]">No SMS templates found.</p>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-white font-medium">Email Templates</p>
                  <Badge variant="info">{marketingEmailTemplates.length} steps</Badge>
                </div>
                <div className="space-y-2">
                  {marketingEmailTemplates.map((template) => (
                    <div key={template.id} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)]">Step {template.step}</p>
                        <p className="text-sm text-white">{template.title}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openTemplateEditor('marketing_email', template)}>
                        Edit
                      </Button>
                    </div>
                  ))}
                  {marketingEmailTemplates.length === 0 && (
                    <p className="text-xs text-[var(--color-text-muted)]">No email templates found.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{PLACEHOLDER_BADGES.name}</Badge>
              <Badge variant="info">{PLACEHOLDER_BADGES.company}</Badge>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-heading text-white">Quote Email</h2>
                <p className="text-caption">Automatic email when a lead is moved to Quote Sent.</p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">Last run: {formatTimestamp(lastTriggered.quote_email)}</div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">Enable quote emails</p>
              <Switch
                checked={settings.quote_email.enabled}
                onChange={(checked) => updateSetting('quote_email', { enabled: checked })}
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">Uses your Resend integration settings.</p>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-heading text-white">Booking Emails</h2>
                <p className="text-caption">Completion confirmations and reminder emails.</p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                Last run: {formatTimestamp(lastTriggered.booking_completion || lastTriggered.booking_reminder)}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white font-medium">Completion Email</p>
                  <Switch
                    checked={settings.booking_completion.enabled}
                    onChange={(checked) => updateSetting('booking_completion', { enabled: checked })}
                  />
                </div>
                <Input
                  label="SUBJECT"
                  value={completionSubject}
                  onChange={(e) => setCompletionSubject(e.target.value)}
                  placeholder="Job completed - thank you"
                />
                <div>
                  <label className="text-micro block mb-1.5">BODY</label>
                  <textarea
                    value={completionBody}
                    onChange={(e) => setCompletionBody(e.target.value)}
                    rows={5}
                    className="input w-full"
                    placeholder="Hi {{name}}, thanks for choosing us..."
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white font-medium">Reminder Email</p>
                  <Switch
                    checked={settings.booking_reminder.enabled}
                    onChange={(checked) => updateSetting('booking_reminder', { enabled: checked })}
                  />
                </div>
                <Input
                  label="LEAD TIME (HOURS)"
                  type="number"
                  min={1}
                  value={reminderLeadHours}
                  onChange={(e) => setReminderLeadHours(Number(e.target.value))}
                />
                <Input
                  label="SUBJECT"
                  value={reminderSubject}
                  onChange={(e) => setReminderSubject(e.target.value)}
                  placeholder="Your clean is coming up"
                />
                <div>
                  <label className="text-micro block mb-1.5">BODY</label>
                  <textarea
                    value={reminderBody}
                    onChange={(e) => setReminderBody(e.target.value)}
                    rows={5}
                    className="input w-full"
                    placeholder="Hi {{name}}, just a reminder..."
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={saveBookingEmails}>
                Save booking email templates
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{PLACEHOLDER_BADGES.name}</Badge>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-heading text-white">Payment Reminders (SMS)</h2>
                <p className="text-caption">Remind customers to complete payment.</p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">Last run: {formatTimestamp(lastTriggered.payment_sms)}</div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">Enable payment SMS</p>
              <Switch
                checked={settings.payment_sms.enabled}
                onChange={(checked) => updateSetting('payment_sms', { enabled: checked })}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-micro block mb-1.5">DEFAULT TEMPLATE</label>
                <select
                  className="input w-full"
                  value={paymentDefaultTemplate?.id || ''}
                  onChange={(e) => selectDefaultTemplate('payment_sms', e.target.value)}
                >
                  {paymentTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                {paymentDefaultTemplate && (
                  <Button
                    variant="ghost"
                    onClick={() => openTemplateEditor('payment_sms', paymentDefaultTemplate)}
                  >
                    Edit template
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{PLACEHOLDER_BADGES.name}</Badge>
              <Badge variant="info">{PLACEHOLDER_BADGES.amount}</Badge>
              <Badge variant="info">{PLACEHOLDER_BADGES.paymentLink}</Badge>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-heading text-white">Review Requests (SMS)</h2>
                <p className="text-caption">Ask happy customers for a review.</p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">Last run: {formatTimestamp(lastTriggered.review_sms)}</div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">Enable review SMS</p>
              <Switch
                checked={settings.review_sms.enabled}
                onChange={(checked) => updateSetting('review_sms', { enabled: checked })}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-micro block mb-1.5">DEFAULT TEMPLATE</label>
                <select
                  className="input w-full"
                  value={reviewDefaultTemplate?.id || ''}
                  onChange={(e) => selectDefaultTemplate('review_sms', e.target.value)}
                >
                  {reviewTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                {reviewDefaultTemplate && (
                  <Button
                    variant="ghost"
                    onClick={() => openTemplateEditor('review_sms', reviewDefaultTemplate)}
                  >
                    Edit template
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{PLACEHOLDER_BADGES.name}</Badge>
              <Badge variant="info">{PLACEHOLDER_BADGES.reviewLink}</Badge>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-heading text-white">Daily Summary Email</h2>
                <p className="text-caption">End-of-day performance snapshot.</p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">Last run: {formatTimestamp(lastTriggered.daily_summary)}</div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--color-text-secondary)]">Enable daily summary</p>
              <Switch
                checked={settings.daily_summary.enabled}
                onChange={(checked) => updateSetting('daily_summary', { enabled: checked })}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="RECIPIENT EMAIL"
                value={dailyRecipient}
                onChange={(e) => setDailyRecipient(e.target.value)}
                placeholder="owner@company.com"
              />
              <div>
                <label className="text-micro block mb-1.5">TIMEZONE</label>
                <select
                  className="input w-full"
                  value={dailyTimezone}
                  onChange={(e) => setDailyTimezone(e.target.value)}
                >
                  <option value="Australia/Sydney">Australia/Sydney</option>
                  <option value="Australia/Melbourne">Australia/Melbourne</option>
                  <option value="Australia/Brisbane">Australia/Brisbane</option>
                  <option value="Australia/Perth">Australia/Perth</option>
                  <option value="Australia/Adelaide">Australia/Adelaide</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Summary includes: sales count, revenue, projected profit, repeat clients, calls, leads, quotes, and completed cleans.</p>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={saveDailySummary}>
                Save daily summary
              </Button>
            </div>
          </GlassCard>

          <div className="flex items-center justify-end gap-3">
            <Badge variant={saving ? 'warning' : 'success'}>{saving ? 'Saving...' : 'All changes saved'}</Badge>
          </div>
        </>
      )}

      <Modal
        open={!!templateEditor}
        onClose={() => setTemplateEditor(null)}
        title="Edit Template"
        description="Update the title and message body. Placeholders will be preserved."
        size="lg"
      >
        {templateEditor && (
          <div className="space-y-4">
            <Input
              label="TITLE"
              value={templateEditor.title}
              onChange={(e) => setTemplateEditor({ ...templateEditor, title: e.target.value })}
            />
            {templateEditor.kind === 'marketing_email' && (
              <Input
                label="SUBJECT"
                value={templateEditor.subject || ''}
                onChange={(e) => setTemplateEditor({ ...templateEditor, subject: e.target.value })}
              />
            )}
            <div>
              <label className="text-micro block mb-1.5">BODY</label>
              <textarea
                rows={8}
                className="input w-full"
                value={templateEditor.body}
                onChange={(e) => setTemplateEditor({ ...templateEditor, body: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTemplateEditor(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={saveTemplate}>
                Save template
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
