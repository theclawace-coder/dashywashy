/**
 * WorkflowBuilderPage - Visual no-code workflow builder.
 * Create and edit automated workflows with triggers and action steps.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { GlassCard, Button, Input, Badge, Modal, Switch } from '../../components/ui'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type TriggerType = 'lead_status_change' | 'time_based' | 'event_based'
type ActionType = 'send_sms' | 'send_email' | 'make_call' | 'update_status' | 'wait'

interface TriggerConfig {
  to_status?: string[]
  from_status?: string[]
  entity_type?: 'booking' | 'quote'
  relative_to?: string
  offset_days?: number
  event?: string
}

interface ActionConfig {
  message?: string
  subject?: string
  body?: string
  new_status?: string
  delay_value?: number
  delay_unit?: 'minutes' | 'hours' | 'days'
}

interface WorkflowStep {
  id?: string
  step_order: number
  action_type: ActionType
  action_config: ActionConfig
}

interface Workflow {
  id?: string
  name: string
  description: string
  enabled: boolean
  trigger_type: TriggerType
  trigger_config: TriggerConfig
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const TRIGGER_OPTIONS: Array<{
  type: TriggerType
  icon: string
  title: string
  description: string
}> = [
  {
    type: 'lead_status_change',
    icon: '🔄',
    title: 'Lead Status Change',
    description: 'When a lead moves to a specific status',
  },
  {
    type: 'time_based',
    icon: '⏰',
    title: 'Time-Based',
    description: 'X days before or after a booking',
  },
  {
    type: 'event_based',
    icon: '⚡',
    title: 'Event',
    description: 'When something happens (quote sent, payment received)',
  },
]

const ACTION_OPTIONS: Array<{
  type: ActionType
  icon: string
  title: string
  description: string
}> = [
  { type: 'send_sms', icon: '💬', title: 'Send SMS', description: 'Send a text message' },
  { type: 'send_email', icon: '📧', title: 'Send Email', description: 'Send an email' },
  { type: 'make_call', icon: '📞', title: 'Make Call', description: 'Initiate a phone call' },
  { type: 'update_status', icon: '🏷️', title: 'Update Status', description: 'Change lead status' },
  { type: 'wait', icon: '⏳', title: 'Wait', description: 'Pause before next action' },
]

const LEAD_STATUSES = [
  'New Lead',
  'Contacted',
  'Quote Sent',
  'Follow Up',
  'Marketing Loop',
  'Negotiating',
  'Booked',
  'Completed',
  'Lost',
  'Not Interested',
]

const EVENTS = [
  { value: 'lead_created', label: 'New lead is created' },
  { value: 'quote_sent', label: 'Quote is sent' },
  { value: 'quote_accepted', label: 'Quote is accepted' },
  { value: 'booking_created', label: 'Booking is created' },
  { value: 'booking_completed', label: 'Booking is completed' },
  { value: 'payment_received', label: 'Payment is received' },
]

const PLACEHOLDERS = [
  { key: '{{name}}', label: 'Name' },
  { key: '{{first_name}}', label: 'First Name' },
  { key: '{{business_name}}', label: 'Business Name' },
  { key: '{{booking_date}}', label: 'Booking Date' },
  { key: '{{booking_time}}', label: 'Booking Time' },
  { key: '{{quote_total}}', label: 'Quote Total' },
  { key: '{{payment_link}}', label: 'Payment Link' },
]

// -----------------------------------------------------------------------------
// Subcomponents
// -----------------------------------------------------------------------------

function TriggerConfigPanel({
  triggerType,
  config,
  onChange,
}: {
  triggerType: TriggerType
  config: TriggerConfig
  onChange: (config: TriggerConfig) => void
}) {
  if (triggerType === 'lead_status_change') {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-micro block mb-1.5">WHEN LEAD MOVES TO</label>
          <div className="flex flex-wrap gap-2">
            {LEAD_STATUSES.map((status) => {
              const isSelected = config.to_status?.includes(status)
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    const current = config.to_status || []
                    const next = isSelected
                      ? current.filter((s) => s !== status)
                      : [...current, status]
                    onChange({ ...config, to_status: next })
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-white/10 text-[var(--color-text-secondary)] hover:bg-white/20'
                  }`}
                >
                  {status}
                </button>
              )
            })}
          </div>
          {(!config.to_status || config.to_status.length === 0) && (
            <p className="text-xs text-amber-400 mt-2">Select at least one status</p>
          )}
        </div>
      </div>
    )
  }

  if (triggerType === 'time_based') {
    return (
      <div className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-micro block mb-1.5">DAYS</label>
            <input
              type="number"
              className="input w-full"
              value={Math.abs(config.offset_days || 0)}
              onChange={(e) =>
                onChange({
                  ...config,
                  offset_days:
                    (config.offset_days || 0) < 0
                      ? -Math.abs(Number(e.target.value))
                      : Math.abs(Number(e.target.value)),
                })
              }
              min={0}
            />
          </div>
          <div>
            <label className="text-micro block mb-1.5">TIMING</label>
            <select
              className="input w-full"
              value={(config.offset_days || 0) < 0 ? 'before' : 'after'}
              onChange={(e) =>
                onChange({
                  ...config,
                  offset_days:
                    e.target.value === 'before'
                      ? -Math.abs(config.offset_days || 0)
                      : Math.abs(config.offset_days || 0),
                })
              }
            >
              <option value="before">Before</option>
              <option value="after">After</option>
            </select>
          </div>
          <div>
            <label className="text-micro block mb-1.5">RELATIVE TO</label>
            <select
              className="input w-full"
              value={config.relative_to || 'start_at'}
              onChange={(e) => onChange({ ...config, relative_to: e.target.value })}
            >
              <option value="start_at">Booking Start</option>
              <option value="end_at">Booking End</option>
              <option value="created_at">Booking Created</option>
            </select>
          </div>
        </div>
        <p className="text-caption">
          Example: "2 days before Booking Start" will trigger the workflow 48 hours prior.
        </p>
      </div>
    )
  }

  if (triggerType === 'event_based') {
    return (
      <div>
        <label className="text-micro block mb-1.5">WHEN THIS HAPPENS</label>
        <div className="space-y-2">
          {EVENTS.map((event) => (
            <button
              key={event.value}
              type="button"
              onClick={() => onChange({ ...config, event: event.value })}
              className={`w-full px-4 py-3 rounded-lg text-left text-sm transition-colors ${
                config.event === event.value
                  ? 'bg-[var(--color-accent-muted)] border-2 border-[var(--color-accent)] text-white'
                  : 'bg-white/5 border border-white/10 text-[var(--color-text-secondary)] hover:bg-white/10'
              }`}
            >
              {event.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}

function ActionStepCard({
  step,
  index,
  totalSteps,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  step: WorkflowStep
  index: number
  totalSteps: number
  onEdit: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const actionInfo = ACTION_OPTIONS.find((a) => a.type === step.action_type)

  const getPreview = () => {
    const { action_type, action_config } = step
    if (action_type === 'send_sms' && action_config.message) {
      const msg = action_config.message
      return msg.length > 60 ? msg.slice(0, 60) + '...' : msg
    }
    if (action_type === 'send_email') {
      return action_config.subject || 'No subject set'
    }
    if (action_type === 'update_status') {
      return `Change to "${action_config.new_status || 'Not set'}"`
    }
    if (action_type === 'wait') {
      const val = action_config.delay_value || 0
      const unit = action_config.delay_unit || 'days'
      return `${val} ${unit}`
    }
    return actionInfo?.description || ''
  }

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-white/5 border border-white/10 group">
      {/* Step number */}
      <div className="w-8 h-8 rounded-full bg-[var(--color-accent-muted)] flex items-center justify-center shrink-0">
        <span className="text-sm font-medium text-[var(--color-accent)]">{index + 1}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{actionInfo?.icon}</span>
          <span className="text-white font-medium">{actionInfo?.title}</span>
        </div>
        <p className="text-caption text-sm mt-1 truncate">{getPreview()}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === totalSteps - 1}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded hover:bg-white/10"
          title="Edit"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

function ActionConfigModal({
  open,
  step,
  onClose,
  onSave,
}: {
  open: boolean
  step: WorkflowStep | null
  onClose: () => void
  onSave: (step: WorkflowStep) => void
}) {
  const [actionType, setActionType] = useState<ActionType>('send_sms')
  const [config, setConfig] = useState<ActionConfig>({})

  useEffect(() => {
    if (step) {
      setActionType(step.action_type)
      setConfig(step.action_config)
    } else {
      setActionType('send_sms')
      setConfig({})
    }
  }, [step, open])

  const insertPlaceholder = (placeholder: string) => {
    if (actionType === 'send_sms') {
      setConfig((prev) => ({ ...prev, message: (prev.message || '') + placeholder }))
    } else if (actionType === 'send_email') {
      setConfig((prev) => ({ ...prev, body: (prev.body || '') + placeholder }))
    }
  }

  const handleSave = () => {
    onSave({
      ...step,
      step_order: step?.step_order || 1,
      action_type: actionType,
      action_config: config,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step?.id ? 'Edit Action' : 'Add Action'}
      size="lg"
    >
      <div className="space-y-4">
        {/* Action type selector */}
        <div>
          <label className="text-micro block mb-2">ACTION TYPE</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACTION_OPTIONS.map((action) => (
              <button
                key={action.type}
                type="button"
                onClick={() => {
                  setActionType(action.type)
                  setConfig({})
                }}
                className={`p-3 rounded-lg text-left transition-colors ${
                  actionType === action.type
                    ? 'bg-[var(--color-accent-muted)] border-2 border-[var(--color-accent)]'
                    : 'bg-white/5 border border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="text-xl block mb-1">{action.icon}</span>
                <span className="text-sm font-medium text-white block">{action.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action-specific config */}
        <div className="pt-4 border-t border-white/10">
          {actionType === 'send_sms' && (
            <div className="space-y-3">
              <div>
                <label className="text-micro block mb-1.5">MESSAGE</label>
                <textarea
                  className="input w-full"
                  rows={4}
                  value={config.message || ''}
                  onChange={(e) => setConfig({ ...config, message: e.target.value })}
                  placeholder="Hi {{name}}, thanks for reaching out..."
                />
              </div>
              <div>
                <label className="text-micro block mb-1.5">INSERT PLACEHOLDER</label>
                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      className="px-2 py-1 rounded bg-white/10 text-xs text-[var(--color-accent)] hover:bg-white/20"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {actionType === 'send_email' && (
            <div className="space-y-3">
              <Input
                label="SUBJECT"
                value={config.subject || ''}
                onChange={(e) => setConfig({ ...config, subject: e.target.value })}
                placeholder="Your quote from {{business_name}}"
              />
              <div>
                <label className="text-micro block mb-1.5">BODY</label>
                <textarea
                  className="input w-full"
                  rows={6}
                  value={config.body || ''}
                  onChange={(e) => setConfig({ ...config, body: e.target.value })}
                  placeholder="Hi {{name}},&#10;&#10;Thanks for your interest..."
                />
              </div>
              <div>
                <label className="text-micro block mb-1.5">INSERT PLACEHOLDER</label>
                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      className="px-2 py-1 rounded bg-white/10 text-xs text-[var(--color-accent)] hover:bg-white/20"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {actionType === 'make_call' && (
            <div className="p-4 rounded-lg bg-white/5 text-center">
              <p className="text-caption">
                This action will initiate a call to the lead's phone number via Dialpad.
              </p>
            </div>
          )}

          {actionType === 'update_status' && (
            <div>
              <label className="text-micro block mb-1.5">NEW STATUS</label>
              <select
                className="input w-full"
                value={config.new_status || ''}
                onChange={(e) => setConfig({ ...config, new_status: e.target.value })}
              >
                <option value="">Select a status...</option>
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionType === 'wait' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-micro block mb-1.5">WAIT FOR</label>
                <input
                  type="number"
                  className="input w-full"
                  value={config.delay_value || 1}
                  onChange={(e) =>
                    setConfig({ ...config, delay_value: Number(e.target.value) })
                  }
                  min={1}
                />
              </div>
              <div>
                <label className="text-micro block mb-1.5">UNIT</label>
                <select
                  className="input w-full"
                  value={config.delay_unit || 'days'}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      delay_unit: e.target.value as 'minutes' | 'hours' | 'days',
                    })
                  }
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {step?.id ? 'Save Changes' : 'Add Action'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function WorkflowPreview({
  workflow,
  steps,
}: {
  workflow: Workflow
  steps: WorkflowStep[]
}) {
  const getTriggerText = () => {
    const { trigger_type, trigger_config } = workflow

    if (trigger_type === 'lead_status_change') {
      const statuses = trigger_config.to_status || []
      if (statuses.length === 0) return 'When a lead status changes'
      return `When a lead moves to "${statuses.join('" or "')}"`
    }

    if (trigger_type === 'time_based') {
      const days = Math.abs(trigger_config.offset_days || 0)
      const direction = (trigger_config.offset_days || 0) < 0 ? 'before' : 'after'
      return `${days} day${days !== 1 ? 's' : ''} ${direction} booking`
    }

    if (trigger_type === 'event_based') {
      const event = EVENTS.find((e) => e.value === trigger_config.event)
      return event ? `When ${event.label.toLowerCase()}` : 'When an event occurs'
    }

    return 'Unknown trigger'
  }

  const getActionText = (step: WorkflowStep) => {
    const { action_type, action_config } = step
    const actionInfo = ACTION_OPTIONS.find((a) => a.type === action_type)

    if (action_type === 'wait') {
      return `wait ${action_config.delay_value || 1} ${action_config.delay_unit || 'days'}`
    }

    return actionInfo?.title.toLowerCase() || action_type
  }

  return (
    <GlassCard className="p-4 bg-white/5">
      <h3 className="text-heading mb-3 flex items-center gap-2">
        <span>📋</span> Preview
      </h3>
      <p className="text-caption">
        <span className="text-[var(--color-accent)]">{getTriggerText()}</span>
        {steps.length > 0 && (
          <>
            , then{' '}
            {steps.map((step, i) => (
              <span key={step.step_order}>
                {i > 0 && (i === steps.length - 1 ? ', then ' : ', ')}
                <span className="text-white">{getActionText(step)}</span>
              </span>
            ))}
          </>
        )}
        .
      </p>
    </GlassCard>
  )
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function WorkflowBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentOrg, hasRole } = useAuth()

  const isNew = !id || id === 'new'

  const [workflow, setWorkflow] = useState<Workflow>({
    name: '',
    description: '',
    enabled: false,
    trigger_type: 'lead_status_change',
    trigger_config: {},
  })
  const [steps, setSteps] = useState<WorkflowStep[]>([])

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null)
  const [showActionModal, setShowActionModal] = useState(false)

  const orgId = currentOrg?.id
  const canManage = hasRole('admin')

  // Load existing workflow
  useEffect(() => {
    if (isNew || !orgId) return

    const loadWorkflow = async () => {
      setLoading(true)
      setError(null)

      try {
        const [workflowRes, stepsRes] = await Promise.all([
          supabase.from('workflows').select('*').eq('id', id).single(),
          supabase
            .from('workflow_steps')
            .select('*')
            .eq('workflow_id', id)
            .order('step_order'),
        ])

        if (workflowRes.error) throw workflowRes.error
        if (stepsRes.error) throw stepsRes.error

        setWorkflow(workflowRes.data)
        setSteps(stepsRes.data || [])
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load workflow'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    loadWorkflow()
  }, [id, isNew, orgId])

  // Save workflow
  const handleSave = useCallback(async () => {
    if (!orgId) return

    // Validation
    if (!workflow.name.trim()) {
      setError('Please enter a workflow name')
      return
    }

    if (
      workflow.trigger_type === 'lead_status_change' &&
      (!workflow.trigger_config.to_status || workflow.trigger_config.to_status.length === 0)
    ) {
      setError('Please select at least one status for the trigger')
      return
    }

    if (workflow.trigger_type === 'event_based' && !workflow.trigger_config.event) {
      setError('Please select an event for the trigger')
      return
    }

    if (steps.length === 0) {
      setError('Please add at least one action')
      return
    }

    setSaving(true)
    setError(null)

    try {
      let workflowId = workflow.id

      if (isNew) {
        // Create new workflow
        const { data: newWorkflow, error: createError } = await supabase
          .from('workflows')
          .insert({
            org_id: orgId,
            name: workflow.name.trim(),
            description: workflow.description.trim() || null,
            enabled: workflow.enabled,
            trigger_type: workflow.trigger_type,
            trigger_config: workflow.trigger_config,
          })
          .select()
          .single()

        if (createError) throw createError
        workflowId = newWorkflow.id
      } else {
        // Update existing workflow
        const { error: updateError } = await supabase
          .from('workflows')
          .update({
            name: workflow.name.trim(),
            description: workflow.description.trim() || null,
            enabled: workflow.enabled,
            trigger_type: workflow.trigger_type,
            trigger_config: workflow.trigger_config,
          })
          .eq('id', workflowId)

        if (updateError) throw updateError

        // Delete existing steps
        await supabase.from('workflow_steps').delete().eq('workflow_id', workflowId)
      }

      // Insert steps
      if (steps.length > 0) {
        const stepsToInsert = steps.map((step, index) => ({
          workflow_id: workflowId,
          step_order: index + 1,
          action_type: step.action_type,
          action_config: step.action_config,
        }))

        const { error: stepsError } = await supabase
          .from('workflow_steps')
          .insert(stepsToInsert)

        if (stepsError) throw stepsError
      }

      navigate('/settings/workflows')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save workflow'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [orgId, workflow, steps, isNew, navigate])

  // Step management
  const addStep = useCallback((newStep: WorkflowStep) => {
    setSteps((prev) => [
      ...prev,
      { ...newStep, step_order: prev.length + 1 },
    ])
  }, [])

  const updateStep = useCallback((updatedStep: WorkflowStep) => {
    setSteps((prev) =>
      prev.map((s) => (s.step_order === updatedStep.step_order ? updatedStep : s))
    )
  }, [])

  const deleteStep = useCallback((stepOrder: number) => {
    setSteps((prev) =>
      prev
        .filter((s) => s.step_order !== stepOrder)
        .map((s, i) => ({ ...s, step_order: i + 1 }))
    )
  }, [])

  const moveStep = useCallback((fromIndex: number, toIndex: number) => {
    setSteps((prev) => {
      const newSteps = [...prev]
      const [removed] = newSteps.splice(fromIndex, 1)
      newSteps.splice(toIndex, 0, removed)
      return newSteps.map((s, i) => ({ ...s, step_order: i + 1 }))
    })
  }, [])

  const handleSaveStep = useCallback(
    (step: WorkflowStep) => {
      if (editingStep) {
        updateStep(step)
      } else {
        addStep(step)
      }
      setEditingStep(null)
    },
    [editingStep, addStep, updateStep]
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

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <div className="w-8 h-8 mx-auto border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-caption mt-4">Loading workflow...</p>
      </div>
    )
  }

  const triggerInfo = TRIGGER_OPTIONS.find((t) => t.type === workflow.trigger_type)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate('/settings/workflows')}
            className="!px-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Button>
          <div>
            <Input
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
              placeholder="Workflow name..."
              className="!text-lg !font-semibold !border-none !bg-transparent !px-0 focus:!ring-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Enabled</span>
            <Switch
              checked={workflow.enabled}
              onChange={(enabled) => setWorkflow({ ...workflow, enabled })}
            />
          </div>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {isNew ? 'Create Workflow' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Description */}
      <Input
        label="DESCRIPTION (OPTIONAL)"
        value={workflow.description}
        onChange={(e) => setWorkflow({ ...workflow, description: e.target.value })}
        placeholder="What does this workflow do?"
      />

      {/* Main content grid */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Trigger (left column) */}
        <div className="lg:col-span-2">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-heading flex items-center gap-2">
                <span>🎯</span> Trigger
              </h2>
              <Button size="sm" variant="ghost" onClick={() => setShowTriggerModal(true)}>
                Change
              </Button>
            </div>

            <div className="p-4 rounded-lg bg-white/5 border border-white/10 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{triggerInfo?.icon}</span>
                <span className="text-white font-medium">{triggerInfo?.title}</span>
              </div>
              <p className="text-caption text-sm">{triggerInfo?.description}</p>
            </div>

            <TriggerConfigPanel
              triggerType={workflow.trigger_type}
              config={workflow.trigger_config}
              onChange={(trigger_config) => setWorkflow({ ...workflow, trigger_config })}
            />
          </GlassCard>
        </div>

        {/* Actions (right column) */}
        <div className="lg:col-span-3">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-heading flex items-center gap-2">
                <span>⚡</span> Actions
              </h2>
              <Badge variant="info">{steps.length} step{steps.length !== 1 ? 's' : ''}</Badge>
            </div>

            {steps.length === 0 ? (
              <div className="p-8 rounded-lg border-2 border-dashed border-white/20 text-center">
                <p className="text-caption mb-4">No actions yet. Add your first action.</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingStep(null)
                    setShowActionModal(true)
                  }}
                >
                  + Add Action
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <ActionStepCard
                    key={step.step_order}
                    step={step}
                    index={index}
                    totalSteps={steps.length}
                    onEdit={() => {
                      setEditingStep(step)
                      setShowActionModal(true)
                    }}
                    onDelete={() => deleteStep(step.step_order)}
                    onMoveUp={() => moveStep(index, index - 1)}
                    onMoveDown={() => moveStep(index, index + 1)}
                  />
                ))}

                <Button
                  variant="ghost"
                  className="w-full !border !border-dashed !border-white/20 mt-3"
                  onClick={() => {
                    setEditingStep(null)
                    setShowActionModal(true)
                  }}
                >
                  + Add Action
                </Button>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Preview */}
      <WorkflowPreview workflow={workflow} steps={steps} />

      {/* Trigger Selection Modal */}
      <Modal
        open={showTriggerModal}
        onClose={() => setShowTriggerModal(false)}
        title="Select Trigger"
        description="Choose when this workflow should start."
      >
        <div className="space-y-2">
          {TRIGGER_OPTIONS.map((trigger) => (
            <button
              key={trigger.type}
              type="button"
              onClick={() => {
                setWorkflow({
                  ...workflow,
                  trigger_type: trigger.type,
                  trigger_config: {},
                })
                setShowTriggerModal(false)
              }}
              className={`w-full p-4 rounded-lg text-left transition-colors ${
                workflow.trigger_type === trigger.type
                  ? 'bg-[var(--color-accent-muted)] border-2 border-[var(--color-accent)]'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{trigger.icon}</span>
                <div>
                  <span className="text-white font-medium block">{trigger.title}</span>
                  <span className="text-caption text-sm">{trigger.description}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Action Config Modal */}
      <ActionConfigModal
        open={showActionModal}
        step={editingStep}
        onClose={() => {
          setShowActionModal(false)
          setEditingStep(null)
        }}
        onSave={handleSaveStep}
      />
    </div>
  )
}
