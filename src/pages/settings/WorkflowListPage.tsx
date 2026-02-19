/**
 * WorkflowListPage - List and manage automated workflows.
 * A no-code automation builder for creating trigger->action sequences.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { getErrorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Badge, Modal, Switch } from '../../components/ui'

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

const DEFAULT_AUTOMATION_SETTINGS: Record<AutomationType, AutomationSetting> = {
  marketing_sms: { enabled: true, config: {} },
  marketing_email: { enabled: true, config: {} },
  booking_completion: { enabled: true, config: { subject: '', body: '' } },
  booking_reminder: { enabled: true, config: { lead_hours: 24, subject: '', body: '' } },
  quote_email: { enabled: true, config: {} },
  payment_sms: { enabled: true, config: { template_id: '' } },
  review_sms: { enabled: true, config: { template_id: '' } },
  daily_summary: { enabled: true, config: { recipient_email: '', timezone: 'Australia/Sydney' } },
}

const CORE_AUTOMATIONS: Array<{
  key: AutomationType
  name: string
  description: string
  settingsAnchor: string
}> = [
  {
    key: 'marketing_sms',
    name: 'Marketing Loop (SMS)',
    description: '7-step SMS nurture journey for Marketing Loop leads.',
    settingsAnchor: 'automation-marketing-loop',
  },
  {
    key: 'marketing_email',
    name: 'Marketing Loop (Email)',
    description: '7-step email journey for Marketing Loop leads.',
    settingsAnchor: 'automation-marketing-loop',
  },
  {
    key: 'quote_email',
    name: 'Quote Email',
    description: 'Automatic email when a lead moves to Quote Sent.',
    settingsAnchor: 'automation-quote-email',
  },
  {
    key: 'booking_completion',
    name: 'Booking Completion Email',
    description: 'Send a completion email after a job is finished.',
    settingsAnchor: 'automation-booking-emails',
  },
  {
    key: 'booking_reminder',
    name: 'Booking Reminder Email',
    description: 'Send reminders before scheduled bookings.',
    settingsAnchor: 'automation-booking-emails',
  },
  {
    key: 'payment_sms',
    name: 'Payment Reminder SMS',
    description: 'Text customers to complete payment after a job.',
    settingsAnchor: 'automation-payment-sms',
  },
  {
    key: 'review_sms',
    name: 'Review Request SMS',
    description: 'Request a review after a completed job.',
    settingsAnchor: 'automation-review-sms',
  },
  {
    key: 'daily_summary',
    name: 'Daily Summary Email',
    description: 'End-of-day performance summary.',
    settingsAnchor: 'automation-daily-summary',
  },
]

type TriggerType = 'lead_status_change' | 'time_based' | 'event_based' | 'manual' | 'scheduled'

interface Workflow {
  id: string
  name: string
  description: string | null
  enabled: boolean
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface WorkflowTemplate {
  id: string
  name: string
  description: string | null
  category: string | null
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  steps: Array<{ action_type: string; action_config: Record<string, unknown> }>
}

interface WorkflowRun {
  workflow_id: string
  status: string
  started_at: string
}

const TRIGGER_LABELS: Record<TriggerType, { label: string; icon: string; color: string }> = {
  lead_status_change: { label: 'Status Change', icon: '🔄', color: 'info' },
  time_based: { label: 'Time-Based', icon: '⏰', color: 'warning' },
  event_based: { label: 'Event', icon: '⚡', color: 'success' },
  manual: { label: 'Manual', icon: '🖱️', color: 'info' },
  scheduled: { label: 'Scheduled', icon: '📆', color: 'warning' },
}
function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getTriggerDescription(workflow: Workflow): string {
  const { trigger_type, trigger_config } = workflow

  if (trigger_type === 'lead_status_change') {
    const toStatus = trigger_config.to_status as string[] | undefined
    if (toStatus?.length) {
      return `When lead moves to "${toStatus.join('" or "')}"`
    }
    return 'When lead status changes'
  }

  if (trigger_type === 'time_based') {
    const offsetRaw =
      (trigger_config.offset_value as number | undefined) ??
      (trigger_config.offset_days as number | undefined) ??
      0
    const offsetUnit = (trigger_config.offset_unit as string | undefined) || 'days'
    const relativeTo = trigger_config.relative_to as string | undefined
    if (offsetRaw !== undefined) {
      const direction = offsetRaw < 0 ? 'before' : 'after'
      const value = Math.abs(offsetRaw)
      return `${value} ${offsetUnit} ${direction} ${relativeTo || 'booking'}`
    }
    return 'Time-based trigger'
  }

  if (trigger_type === 'event_based') {
    const event = trigger_config.event as string | undefined
    if (event) {
      const eventLabels: Record<string, string> = {
        lead_created: 'When new lead is created',
        booking_created: 'When booking is created',
        booking_completed: 'When booking is completed',
        cleaner_assigned: 'When cleaner is assigned',
        booking_paid: 'When booking is paid',
      }
      return eventLabels[event] || `When ${event.replace(/_/g, ' ')}`
    }
    return 'Event-based trigger'
  }

  if (trigger_type === 'manual') {
    const entity = (trigger_config.entity_type as string | undefined) || 'lead'
    return `Manual run from ${entity}`
  }

  if (trigger_type === 'scheduled') {
    const time = (trigger_config.time as string | undefined) || '18:00'
    const tz = (trigger_config.timezone as string | undefined) || 'local time'
    return `Daily at ${time} (${tz})`
  }

  return 'Unknown trigger'
}

export default function WorkflowListPage() {
  const { currentOrg, hasRole } = useAuth()
  const navigate = useNavigate()

  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [recentRuns, setRecentRuns] = useState<Record<string, WorkflowRun>>({})
  const [automationSettings, setAutomationSettings] = useState<Record<AutomationType, AutomationSetting>>(DEFAULT_AUTOMATION_SETTINGS)
  const [automationError, setAutomationError] = useState<string | null>(null)
  const [automationSaving, setAutomationSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const orgId = currentOrg?.id
  const canManage = hasRole('admin')

  const loadWorkflows = useCallback(async () => {
    if (!orgId) return

    setLoading(true)
    setError(null)
    setAutomationError(null)

    try {
      const [workflowsRes, templatesRes, runsRes, automationRes] = await Promise.all([
        supabase
          .from('workflows')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('workflow_templates')
          .select('*')
          .or(`is_global.eq.true,org_id.eq.${orgId}`)
          .order('name'),
        supabase
          .from('workflow_runs')
          .select('workflow_id, status, started_at')
          .eq('org_id', orgId)
          .order('started_at', { ascending: false })
          .limit(100),
        supabase
          .from('organization_automation_settings')
          .select('automation_type, enabled, config')
          .eq('org_id', orgId),
      ])

      if (workflowsRes.error) throw workflowsRes.error
      if (templatesRes.error) throw templatesRes.error

      setWorkflows(workflowsRes.data || [])
      setTemplates(templatesRes.data || [])

      if (automationRes.error) {
        setAutomationError(automationRes.error.message)
      } else {
        const merged = { ...DEFAULT_AUTOMATION_SETTINGS }
        ;(automationRes.data || []).forEach((row: any) => {
          merged[row.automation_type as AutomationType] = {
            enabled: row.enabled ?? true,
            config: row.config ?? {},
          }
        })
        setAutomationSettings(merged)
      }

      // Group runs by workflow_id, keeping the most recent
      const runsByWorkflow: Record<string, WorkflowRun> = {}
      for (const run of runsRes.data || []) {
        if (!runsByWorkflow[run.workflow_id]) {
          runsByWorkflow[run.workflow_id] = run
        }
      }
      setRecentRuns(runsByWorkflow)
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to load workflows')
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  const toggleEnabled = useCallback(
    async (workflow: Workflow, enabled: boolean) => {
      if (!orgId) return

      // Optimistic update
      setWorkflows((prev) =>
        prev.map((w) => (w.id === workflow.id ? { ...w, enabled } : w))
      )

      const { error: updateError } = await supabase
        .from('workflows')
        .update({ enabled })
        .eq('id', workflow.id)

      if (updateError) {
        // Revert on error
        setWorkflows((prev) =>
          prev.map((w) => (w.id === workflow.id ? { ...w, enabled: !enabled } : w))
        )
        setError(updateError.message)
      }
    },
    [orgId]
  )

  const updateAutomationSetting = useCallback(
    async (type: AutomationType, enabled: boolean) => {
      if (!orgId) return
      setAutomationSaving(true)
      setAutomationError(null)

      const current = automationSettings[type] || DEFAULT_AUTOMATION_SETTINGS[type]
      const next = { ...current, enabled }

      setAutomationSettings((prev) => ({ ...prev, [type]: next }))

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
        setAutomationError(upsertError.message)
        setAutomationSettings((prev) => ({ ...prev, [type]: current }))
      }

      setAutomationSaving(false)
    },
    [automationSettings, orgId]
  )

  const createFromTemplate = useCallback(
    async (template: WorkflowTemplate) => {
      if (!orgId) return

      setCreatingFromTemplate(true)

      try {
        // Check for duplicate name
        const baseName = template.name
        let name = baseName
        let counter = 1
        const existingNames = workflows.map((w) => w.name.toLowerCase())

        while (existingNames.includes(name.toLowerCase())) {
          counter++
          name = `${baseName} (${counter})`
        }

        // Create workflow
        const { data: newWorkflow, error: createError } = await supabase
          .from('workflows')
          .insert({
            org_id: orgId,
            name,
            description: template.description,
            trigger_type: template.trigger_type,
            trigger_config: template.trigger_config,
            enabled: false,
          })
          .select()
          .single()

        if (createError) throw createError

        // Create steps
        const steps = template.steps.map((step, index) => ({
          workflow_id: newWorkflow.id,
          step_order: index + 1,
          action_type: step.action_type,
          action_config: step.action_config,
        }))

        if (steps.length > 0) {
          const { error: stepsError } = await supabase
            .from('workflow_steps')
            .insert(steps)

          if (stepsError) throw stepsError
        }

        setShowTemplateModal(false)
        navigate(`/app/settings/workflows/${newWorkflow.id}`)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create workflow'
        setError(message)
      } finally {
        setCreatingFromTemplate(false)
      }
    },
    [orgId, workflows, navigate]
  )

  const deleteWorkflow = useCallback(
    async (workflowId: string) => {
      if (!orgId) return

      setDeletingId(workflowId)

      try {
        const { error: deleteError } = await supabase
          .from('workflows')
          .delete()
          .eq('id', workflowId)

        if (deleteError) throw deleteError

        setWorkflows((prev) => prev.filter((w) => w.id !== workflowId))
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete workflow'
        setError(message)
      } finally {
        setDeletingId(null)
      }
    },
    [orgId]
  )

  if (!canManage) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">
          You need admin access to manage workflows.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-title text-white">Workflows</h1>
          <p className="text-caption mt-1">
            Custom, multi-step automations. Core automations live in Automation Settings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowTemplateModal(true)}>
            Start from Template
          </Button>
          <Button variant="primary" onClick={() => navigate('/app/settings/workflows/new')}>
            Create Workflow
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <GlassCard className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-heading text-white">Core Automations</h2>
            <p className="text-caption">Managed from Automation Settings. Toggles sync both places.</p>
          </div>
          <Badge variant={automationSaving ? 'warning' : 'info'}>
            {automationSaving ? 'Saving...' : 'Settings-backed'}
          </Badge>
        </div>

        {automationError && (
          <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
            <p className="text-sm text-red-400">{automationError}</p>
          </div>
        )}

        <div className="space-y-3">
          {CORE_AUTOMATIONS.map((automation) => (
            <div key={automation.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-white font-medium">{automation.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{automation.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/app/automations#${automation.settingsAnchor}`)}
                >
                  Configure
                </Button>
                <Switch
                  checked={automationSettings[automation.key]?.enabled ?? true}
                  onChange={(checked) => updateAutomationSetting(automation.key, checked)}
                  disabled={automationSaving}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">
          Disabling a core automation here disables it everywhere. Detailed templates live in Automation Settings.
        </p>
      </GlassCard>

      {/* Loading */}
      {loading ? (
        <GlassCard className="p-8 text-center">
          <div className="w-8 h-8 mx-auto border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-caption mt-4">Loading workflows...</p>
        </GlassCard>
      ) : workflows.length === 0 ? (
        /* Empty state */
        <GlassCard className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-accent-muted)] flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-[var(--color-accent)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              />
            </svg>
          </div>
          <h2 className="text-heading text-white mb-2">No workflows yet</h2>
          <p className="text-caption mb-6 max-w-md mx-auto">
            Workflows automate repetitive tasks like sending follow-up messages, reminders, and
            notifications. Start from a template or create your own.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => setShowTemplateModal(true)}>
              Browse Templates
            </Button>
            <Button variant="primary" onClick={() => navigate('/app/settings/workflows/new')}>
              Create from Scratch
            </Button>
          </div>
        </GlassCard>
      ) : (
        /* Workflow list */
        <div className="space-y-3">
          {workflows.map((workflow) => {
            const triggerInfo = TRIGGER_LABELS[workflow.trigger_type]
            const recentRun = recentRuns[workflow.id]

            return (
              <GlassCard
                key={workflow.id}
                className="p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/app/settings/workflows/${workflow.id}`}
                        className="text-white font-medium hover:text-[var(--color-accent)] transition-colors truncate"
                      >
                        {workflow.name}
                      </Link>
                      <Badge
                        variant={workflow.enabled ? 'success' : 'default'}
                                              >
                        {workflow.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-1">
                        <span>{triggerInfo.icon}</span>
                        <span>{triggerInfo.label}</span>
                      </span>
                      <span className="opacity-50">•</span>
                      <span>{getTriggerDescription(workflow)}</span>
                    </div>

                    {workflow.description && (
                      <p className="text-caption mt-2 line-clamp-2">{workflow.description}</p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
                      <span>Created {formatDate(workflow.created_at)}</span>
                      {recentRun && (
                        <>
                          <span className="opacity-50">•</span>
                          <span>
                            Last run: {formatDate(recentRun.started_at)} (
                            <span
                              className={
                                recentRun.status === 'completed'
                                  ? 'text-emerald-400'
                                  : recentRun.status === 'active'
                                  ? 'text-amber-400'
                                  : 'text-red-400'
                              }
                            >
                              {recentRun.status}
                            </span>
                            )
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={workflow.enabled}
                      onChange={(checked) => toggleEnabled(workflow, checked)}
                    />
                    <Button
                                            variant="ghost"
                      onClick={() => navigate(`/app/settings/workflows/${workflow.id}`)}
                    >
                      Edit
                    </Button>
                    <Button
                                            variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => deleteWorkflow(workflow.id)}
                      loading={deletingId === workflow.id}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Template Modal */}
      <Modal
        open={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title="Start from Template"
        description="Choose a pre-built workflow to customize for your needs."
        size="lg"
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {templates.map((template) => {
            const triggerInfo = TRIGGER_LABELS[template.trigger_type]

            return (
              <div
                key={template.id}
                className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-[var(--color-accent)]/50 transition-colors cursor-pointer"
                onClick={() => createFromTemplate(template)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{template.name}</span>
                      <Badge variant={triggerInfo.color as 'info' | 'warning' | 'success'}>
                        {triggerInfo.icon} {triggerInfo.label}
                      </Badge>
                    </div>
                    {template.description && (
                      <p className="text-caption text-sm">{template.description}</p>
                    )}
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                      {template.steps.length} step{template.steps.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                                        variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      createFromTemplate(template)
                    }}
                    loading={creatingFromTemplate}
                  >
                    Use
                  </Button>
                </div>
              </div>
            )
          })}

          {templates.length === 0 && (
            <p className="text-caption text-center py-8">No templates available.</p>
          )}
        </div>
      </Modal>
    </div>
  )
}



