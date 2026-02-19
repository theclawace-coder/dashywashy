import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { getErrorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Input, Modal, Switch } from '../../components/ui'
import AutomationSidebar from '../../components/automations/AutomationSidebar'
import AutomationCanvas from '../../components/automations/AutomationCanvas'
import AutomationRunsPanel, { type RunsPreset } from '../../components/automations/AutomationRunsPanel'
import PlaceholderPalette from '../../components/automations/PlaceholderPalette'
import AiTemplateAssistant from '../../components/automations/AiTemplateAssistant'
import ManualWorkflowRunner from '../../components/automations/ManualWorkflowRunner'
import type { ActionType, TriggerType, WorkflowRecord, WorkflowStep } from '../../components/automations/types'

const ACTION_OPTIONS: Array<{ type: ActionType; label: string; icon: string; description: string }> = [
  { type: 'send_sms', label: 'Send SMS', icon: '??', description: 'Text a lead or cleaner' },
  { type: 'send_email', label: 'Send Email', icon: '??', description: 'Send a personalized email' },
  { type: 'wait', label: 'Wait', icon: '?', description: 'Pause before next step' },
  { type: 'update_status', label: 'Update Status', icon: '???', description: 'Change lead status' },
  { type: 'make_call', label: 'Make Call', icon: '??', description: 'Trigger a call' },
]

const TRIGGER_OPTIONS: Array<{ type: TriggerType; label: string; icon: string; description: string }> = [
  { type: 'lead_status_change', label: 'Lead Status', icon: '??', description: 'When a lead changes status' },
  { type: 'event_based', label: 'Event', icon: '?', description: 'When something happens in the system' },
  { type: 'time_based', label: 'Time Based', icon: '?', description: 'Before/after a booking time' },
  { type: 'scheduled', label: 'Scheduled', icon: '???', description: 'Daily at a time' },
  { type: 'manual', label: 'Manual', icon: '???', description: 'Run on demand' },
]

const EVENTS = [
  { value: 'lead_created', label: 'Lead created' },
  { value: 'booking_created', label: 'Booking created' },
  { value: 'booking_completed', label: 'Booking completed' },
  { value: 'cleaner_assigned', label: 'Cleaner assigned' },
  { value: 'booking_paid', label: 'Booking paid' },
]

const LEAD_STATUSES = [
  'Unanswered',
  'Marketing Loop',
  'Follow Up',
  'Quote Sent',
  'Job Won',
  'Jobs Completed',
  'Not interested',
]

const DEFAULT_TZ = 'Australia/Sydney'

function normalizeSteps(steps: WorkflowStep[]) {
  return steps
    .slice()
    .sort((a, b) => a.step_order - b.step_order)
    .map((step, index) => ({ ...step, step_order: index + 1 }))
}

function getActionPreview(step: WorkflowStep) {
  const config = step.action_config || {}
  if (step.action_type === 'send_sms') {
    const msg = (config.message as string) || 'SMS message'
    return msg.length > 60 ? msg.slice(0, 60) + '…' : msg
  }
  if (step.action_type === 'send_email') {
    return (config.subject as string) || 'Email'
  }
  if (step.action_type === 'wait') {
    const value = (config.delay_value as number) || 0
    const unit = (config.delay_unit as string) || 'days'
    return `${value} ${unit}`
  }
  if (step.action_type === 'update_status') {
    return `Set status to ${(config.new_status as string) || '—'}`
  }
  return 'Action'
}

function getTriggerSummary(workflow: WorkflowRecord) {
  const cfg = workflow.trigger_config || {}
  if (workflow.trigger_type === 'lead_status_change') {
    const statuses = (cfg.to_status as string[] | undefined) || []
    return statuses.length ? `Status = ${statuses.join(', ')}` : 'Lead status change'
  }
  if (workflow.trigger_type === 'event_based') {
    const event = EVENTS.find((e) => e.value === cfg.event)
    return event ? event.label : 'Event'
  }
  if (workflow.trigger_type === 'time_based') {
    const rawValue = (cfg.offset_value as number | undefined) ?? (cfg.offset_days as number | undefined) ?? 0
    const unit = (cfg.offset_unit as string | undefined) || 'days'
    const direction = rawValue < 0 ? 'before' : 'after'
    const relativeTo = (cfg.relative_to as string | undefined) || 'start_at'
    return `${Math.abs(rawValue)} ${unit} ${direction} ${relativeTo}`
  }
  if (workflow.trigger_type === 'scheduled') {
    const time = (cfg.time as string | undefined) || '18:00'
    const tz = (cfg.timezone as string | undefined) || DEFAULT_TZ
    return `Daily ${time} (${tz})`
  }
  if (workflow.trigger_type === 'manual') {
    const entity = (cfg.entity_type as string | undefined) || 'lead'
    return `Manual run from ${entity}`
  }
  return 'Trigger'
}

function defaultActionConfig(actionType: ActionType) {
  switch (actionType) {
    case 'send_sms':
      return { message: '', recipient: 'lead' }
    case 'send_email':
      return { subject: '', body: '', recipient: 'lead' }
    case 'wait':
      return { delay_value: 1, delay_unit: 'days' }
    case 'update_status':
      return { new_status: '' }
    case 'make_call':
      return {}
    default:
      return {}
  }
}

export default function AutomationsPage() {
  const { currentOrg, hasRole } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string>('trigger')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [showSidebar, setShowSidebar] = useState(true)
  const [showAddStepModal, setShowAddStepModal] = useState(false)
  const [showRunOnce, setShowRunOnce] = useState(false)
  const [activeField, setActiveField] = useState<string | null>(null)
  const [activeRunCount, setActiveRunCount] = useState(0)

  const orgId = currentOrg?.id
  const canManage = hasRole('admin')

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w.id === selectedWorkflowId) || null,
    [workflows, selectedWorkflowId]
  )

  const selectedStep = useMemo(() => {
    if (!selectedWorkflow || selectedNodeId === 'trigger') return null
    return selectedWorkflow.steps.find((step) => step.id === selectedNodeId) || null
  }, [selectedWorkflow, selectedNodeId])

  const isDirty = selectedWorkflowId ? dirtyIds.has(selectedWorkflowId) : false
  const viewParam = searchParams.get('view')
  const presetParam = searchParams.get('preset')
  const isRunsView = viewParam === 'runs'
  const runsPreset: RunsPreset = presetParam === 'marketing_loop' ? 'marketing_loop' : 'all'

  const setAutomationView = useCallback(
    (view: 'builder' | 'runs', preset: RunsPreset = 'all') => {
      const next = new URLSearchParams(searchParams)
      if (view === 'runs') {
        next.set('view', 'runs')
        if (preset === 'marketing_loop') {
          next.set('preset', 'marketing_loop')
        } else {
          next.delete('preset')
        }
      } else {
        next.delete('view')
        next.delete('preset')
      }
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const loadWorkflows = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('workflows')
        .select('id, name, description, enabled, trigger_type, trigger_config, system_key, created_at, updated_at, steps:workflow_steps(id, step_order, action_type, action_config)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError

      const normalized = (data || []).map((workflow: any) => ({
        ...workflow,
        trigger_config: workflow.trigger_config || {},
        steps: normalizeSteps((workflow.steps || []) as WorkflowStep[]),
      })) as WorkflowRecord[]

      setWorkflows(normalized)

      if (!selectedWorkflowId && normalized.length > 0) {
        setSelectedWorkflowId(normalized[0].id)
        setSelectedNodeId('trigger')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load workflows'))
    } finally {
      setLoading(false)
    }
  }, [orgId, selectedWorkflowId])

  useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  const loadActiveRunCount = useCallback(async () => {
    if (!orgId || !selectedWorkflowId) {
      setActiveRunCount(0)
      return
    }

    const { count, error: countError } = await supabase
      .from('workflow_runs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('workflow_id', selectedWorkflowId)
      .in('status', ['active', 'paused'])

    if (countError) return
    setActiveRunCount(count || 0)
  }, [orgId, selectedWorkflowId])

  useEffect(() => {
    loadActiveRunCount()
    const intervalId = window.setInterval(loadActiveRunCount, 12000)
    return () => window.clearInterval(intervalId)
  }, [loadActiveRunCount])

  const markDirty = (id: string) => {
    setDirtyIds((prev) => new Set(prev).add(id))
  }

  const markClean = (id: string) => {
    setDirtyIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const updateWorkflow = (updates: Partial<WorkflowRecord>) => {
    if (!selectedWorkflowId) return
    setWorkflows((prev) =>
      prev.map((workflow) => (workflow.id === selectedWorkflowId ? { ...workflow, ...updates } : workflow))
    )
    markDirty(selectedWorkflowId)
  }

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    if (!selectedWorkflowId) return
    setWorkflows((prev) =>
      prev.map((workflow) => {
        if (workflow.id !== selectedWorkflowId) return workflow
        const updatedSteps = workflow.steps.map((step) =>
          step.id === stepId ? { ...step, ...updates } : step
        )
        return { ...workflow, steps: normalizeSteps(updatedSteps) }
      })
    )
    markDirty(selectedWorkflowId)
  }

  const addStep = (actionType: ActionType) => {
    if (!selectedWorkflowId) return
    setWorkflows((prev) =>
      prev.map((workflow) => {
        if (workflow.id !== selectedWorkflowId) return workflow
        const nextSteps = normalizeSteps([
          ...workflow.steps,
          {
            id: `temp-${Date.now()}`,
            step_order: workflow.steps.length + 1,
            action_type: actionType,
            action_config: defaultActionConfig(actionType),
          },
        ])
        return { ...workflow, steps: nextSteps }
      })
    )
    markDirty(selectedWorkflowId)
    setShowAddStepModal(false)
  }

  const deleteStep = (stepId: string) => {
    if (!selectedWorkflowId) return
    setWorkflows((prev) =>
      prev.map((workflow) => {
        if (workflow.id !== selectedWorkflowId) return workflow
        const nextSteps = normalizeSteps(workflow.steps.filter((step) => step.id !== stepId))
        return { ...workflow, steps: nextSteps }
      })
    )
    markDirty(selectedWorkflowId)
    setSelectedNodeId('trigger')
  }

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    if (!selectedWorkflowId) return
    setWorkflows((prev) =>
      prev.map((workflow) => {
        if (workflow.id !== selectedWorkflowId) return workflow
        const index = workflow.steps.findIndex((step) => step.id === stepId)
        if (index < 0) return workflow
        const newIndex = direction === 'up' ? index - 1 : index + 1
        if (newIndex < 0 || newIndex >= workflow.steps.length) return workflow
        const reordered = [...workflow.steps]
        const [removed] = reordered.splice(index, 1)
        reordered.splice(newIndex, 0, removed)
        return { ...workflow, steps: normalizeSteps(reordered) }
      })
    )
    markDirty(selectedWorkflowId)
  }

  const saveWorkflow = async () => {
    if (!selectedWorkflow || !orgId) return
    setSaving(true)
    setError(null)
    try {
      if (!selectedWorkflow.name.trim()) {
        throw new Error('Automation needs a name.')
      }

      const { error: updateError } = await supabase
        .from('workflows')
        .update({
          name: selectedWorkflow.name.trim(),
          description: selectedWorkflow.description?.trim() || null,
          enabled: selectedWorkflow.enabled,
          trigger_type: selectedWorkflow.trigger_type,
          trigger_config: selectedWorkflow.trigger_config,
        })
        .eq('id', selectedWorkflow.id)

      if (updateError) throw updateError

      await supabase.from('workflow_steps').delete().eq('workflow_id', selectedWorkflow.id)

      if (selectedWorkflow.steps.length > 0) {
        const stepsToInsert = selectedWorkflow.steps.map((step, index) => ({
          workflow_id: selectedWorkflow.id,
          step_order: index + 1,
          action_type: step.action_type,
          action_config: step.action_config,
        }))
        const { error: insertError } = await supabase.from('workflow_steps').insert(stepsToInsert)
        if (insertError) throw insertError
      }

      markClean(selectedWorkflow.id)
      await loadWorkflows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workflow')
    } finally {
      setSaving(false)
    }
  }

  const createWorkflow = async () => {
    if (!orgId) return
    setError(null)
    try {
      const baseName = 'New automation'
      const existingNames = workflows.map((w) => w.name.toLowerCase())
      let name = baseName
      let counter = 1
      while (existingNames.includes(name.toLowerCase())) {
        counter += 1
        name = `${baseName} ${counter}`
      }

      const { data, error: createError } = await supabase
        .from('workflows')
        .insert({
          org_id: orgId,
          name,
          description: null,
          enabled: false,
          trigger_type: 'manual',
          trigger_config: { entity_type: 'lead' },
        })
        .select('id, name, description, enabled, trigger_type, trigger_config, system_key, created_at, updated_at')
        .single()

      if (createError) throw createError

      const newWorkflow: WorkflowRecord = {
        ...(data as any),
        steps: [],
      }
      setWorkflows((prev) => [...prev, newWorkflow])
      setSelectedWorkflowId(newWorkflow.id)
      setSelectedNodeId('trigger')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow')
    }
  }

  const deleteWorkflow = async (id: string) => {
    const workflow = workflows.find((w) => w.id === id)
    if (!workflow || workflow.system_key) return
    if (!window.confirm(`Delete ${workflow.name}?`)) return

    try {
      await supabase.from('workflows').delete().eq('id', id)
      setWorkflows((prev) => prev.filter((w) => w.id !== id))
      if (selectedWorkflowId === id) {
        setSelectedWorkflowId(workflows[0]?.id || null)
        setSelectedNodeId('trigger')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workflow')
    }
  }

  const handleInsertPlaceholder = (placeholder: string) => {
    if (!selectedStep) return
    if (selectedStep.action_type === 'send_sms') {
      const message = (selectedStep.action_config.message as string) || ''
      updateStep(selectedStep.id!, { action_config: { ...selectedStep.action_config, message: message + placeholder } })
      return
    }
    if (selectedStep.action_type === 'send_email') {
      const config = selectedStep.action_config
      const subject = (config.subject as string) || ''
      const body = (config.body as string) || ''
      if (activeField === 'email_subject') {
        updateStep(selectedStep.id!, { action_config: { ...config, subject: subject + placeholder } })
      } else {
        updateStep(selectedStep.id!, { action_config: { ...config, body: body + placeholder } })
      }
    }
  }

  if (!canManage) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--color-text-secondary)]">You need admin access to manage automations.</p>
      </div>
    )
  }

  const canvasNodes = selectedWorkflow
    ? [
        {
          id: 'trigger',
          title: 'Trigger',
          subtitle: getTriggerSummary(selectedWorkflow),
          icon: '?',
          kind: 'trigger' as const,
        },
        ...selectedWorkflow.steps.map((step) => ({
          id: step.id || String(step.step_order),
          title: ACTION_OPTIONS.find((a) => a.type === step.action_type)?.label || 'Action',
          subtitle: getActionPreview(step),
          icon: ACTION_OPTIONS.find((a) => a.type === step.action_type)?.icon || '?',
          kind: 'action' as const,
        })),
      ]
    : []

  const isRunning = activeRunCount > 0
  const layoutClasses = showSidebar
    ? 'grid-cols-1 lg:grid-cols-[260px_minmax(0,1.35fr)_minmax(280px,1fr)] xl:grid-cols-[280px_minmax(0,1.6fr)_340px]'
    : 'grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_360px]'

  return (
    <div className="h-[calc(100vh-110px)] flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!isRunsView && (
            <button
              type="button"
              onClick={() => setShowSidebar((s) => !s)}
              className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-white"
            >
              {showSidebar ? 'Hide List' : 'Show List'}
            </button>
          )}
          <div>
            <h1 className="text-title text-white">Automations</h1>
            <p className="text-xs text-[var(--color-text-muted)]">Make-style canvas for multi-step workflows.</p>
          </div>
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setAutomationView('builder')}
              className={`px-3 py-1.5 rounded-md text-xs ${
                !isRunsView ? 'bg-white/15 text-white' : 'text-[var(--color-text-secondary)] hover:text-white'
              }`}
            >
              Builder
            </button>
            <button
              type="button"
              onClick={() => setAutomationView('runs', runsPreset)}
              className={`px-3 py-1.5 rounded-md text-xs ${
                isRunsView ? 'bg-white/15 text-white' : 'text-[var(--color-text-secondary)] hover:text-white'
              }`}
            >
              Runs
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isRunsView ? (
            <>
              <Badge variant={runsPreset === 'marketing_loop' ? 'info' : 'default'}>
                {runsPreset === 'marketing_loop' ? 'Marketing Loop Preset' : 'All Runs'}
              </Badge>
              <Button
                variant="secondary"
                onClick={() =>
                  setAutomationView('runs', runsPreset === 'marketing_loop' ? 'all' : 'marketing_loop')
                }
              >
                {runsPreset === 'marketing_loop' ? 'Show all runs' : 'Marketing loop filter'}
              </Button>
            </>
          ) : (
            <>
              <Badge variant={isDirty ? 'warning' : 'success'}>{isDirty ? 'Unsaved' : 'Saved'}</Badge>
              <Badge variant={isRunning ? 'info' : 'default'}>{isRunning ? `${activeRunCount} Running` : 'Idle'}</Badge>
              <Button variant="secondary" onClick={() => navigate('/app/settings/workflows')}>
                Advanced list
              </Button>
              <Button variant="primary" onClick={saveWorkflow} loading={saving}>
                Save
              </Button>
              <Button
                variant="ghost"
                disabled={!selectedWorkflow || selectedWorkflow.trigger_type !== 'manual'}
                onClick={() => setShowRunOnce(true)}
              >
                Run once
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isRunsView ? (
        <AutomationRunsPanel
          orgId={orgId}
          preset={runsPreset}
          onPresetChange={(preset) => setAutomationView('runs', preset)}
          onOpenWorkflow={(workflowId) => {
            setSelectedWorkflowId(workflowId)
            setSelectedNodeId('trigger')
            setShowSidebar(true)
            setAutomationView('builder')
          }}
        />
      ) : (
      <div className={`flex-1 grid ${layoutClasses} gap-4`}>
        {showSidebar && (
          <div className="h-full rounded-2xl border border-white/10 bg-[var(--color-surface)] p-4">
            <AutomationSidebar
              workflows={workflows}
              selectedId={selectedWorkflowId}
              onSelect={(id) => {
                setSelectedWorkflowId(id)
                setSelectedNodeId('trigger')
              }}
              onCreate={createWorkflow}
              onDelete={deleteWorkflow}
            />
          </div>
        )}

        <div className="flex-1 min-h-[480px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-[var(--color-text-muted)]">Loading workflows…</div>
          ) : !selectedWorkflow ? (
            <div className="h-full flex items-center justify-center text-[var(--color-text-muted)]">Select an automation.</div>
          ) : (
            <AutomationCanvas
              nodes={canvasNodes}
              selectedId={selectedNodeId}
              isRunning={isRunning}
              activeRunCount={activeRunCount}
              onSelect={(id) => setSelectedNodeId(id)}
              onAddStep={() => setShowAddStepModal(true)}
            />
          )}
        </div>

        <div className="h-full rounded-2xl border border-white/10 bg-[var(--color-surface)] p-4 overflow-y-auto">
          {!selectedWorkflow ? (
            <div className="text-sm text-[var(--color-text-muted)]">Select a workflow to edit.</div>
          ) : selectedNodeId === 'trigger' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-heading text-white">Trigger</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">Choose when this automation starts.</p>
                </div>
                <Switch checked={selectedWorkflow.enabled} onChange={(enabled) => updateWorkflow({ enabled })} />
              </div>

              <Input
                label="AUTOMATION NAME"
                value={selectedWorkflow.name}
                onChange={(e) => updateWorkflow({ name: e.target.value })}
              />

              <Input
                label="DESCRIPTION"
                value={selectedWorkflow.description || ''}
                onChange={(e) => updateWorkflow({ description: e.target.value })}
              />

              <div className="space-y-2">
                <label className="text-micro block">TRIGGER TYPE</label>
                <div className="grid grid-cols-1 gap-2">
                  {TRIGGER_OPTIONS.map((trigger) => (
                    <button
                      key={trigger.type}
                      type="button"
                      onClick={() => updateWorkflow({ trigger_type: trigger.type, trigger_config: {} })}
                      className={`px-3 py-2 rounded-lg text-left border transition-colors ${
                        selectedWorkflow.trigger_type === trigger.type
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-white'
                          : 'border-white/10 bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{trigger.icon}</span>
                        <div>
                          <p className="text-sm font-medium">{trigger.label}</p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">{trigger.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedWorkflow.trigger_type === 'lead_status_change' && (
                <div className="space-y-2">
                  <label className="text-micro block">LEAD STATUS</label>
                  <div className="flex flex-wrap gap-2">
                    {LEAD_STATUSES.map((status) => {
                      const selected = ((selectedWorkflow.trigger_config.to_status as string[]) || []).includes(status)
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => {
                            const current = (selectedWorkflow.trigger_config.to_status as string[]) || []
                            const next = selected ? current.filter((s) => s !== status) : [...current, status]
                            updateWorkflow({ trigger_config: { ...selectedWorkflow.trigger_config, to_status: next } })
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs ${
                            selected
                              ? 'bg-[var(--color-accent)] text-white'
                              : 'bg-white/10 text-[var(--color-text-secondary)] hover:bg-white/20'
                          }`}
                        >
                          {status}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Cancel runs when lead leaves status</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(selectedWorkflow.trigger_config.cancel_on_status_change)}
                      onChange={(e) =>
                        updateWorkflow({
                          trigger_config: { ...selectedWorkflow.trigger_config, cancel_on_status_change: e.target.checked },
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {selectedWorkflow.trigger_type === 'event_based' && (
                <div className="space-y-2">
                  <label className="text-micro block">EVENT</label>
                  <div className="grid grid-cols-1 gap-2">
                    {EVENTS.map((event) => (
                      <button
                        key={event.value}
                        type="button"
                        onClick={() => updateWorkflow({ trigger_config: { ...selectedWorkflow.trigger_config, event: event.value } })}
                        className={`px-3 py-2 rounded-lg text-left border transition-colors ${
                          selectedWorkflow.trigger_config.event === event.value
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-white'
                            : 'border-white/10 bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
                        }`}
                      >
                        {event.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedWorkflow.trigger_type === 'time_based' && (
                <div className="space-y-2">
                  <label className="text-micro block">TIMING</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="OFFSET"
                      type="number"
                      value={Math.abs((selectedWorkflow.trigger_config.offset_value as number) || (selectedWorkflow.trigger_config.offset_days as number) || 0)}
                      onChange={(e) => {
                        const raw = Number(e.target.value)
                        const isBefore = ((selectedWorkflow.trigger_config.offset_value as number) || 0) < 0
                        updateWorkflow({
                          trigger_config: {
                            ...selectedWorkflow.trigger_config,
                            offset_value: isBefore ? -Math.abs(raw) : Math.abs(raw),
                          },
                        })
                      }}
                    />
                    <div>
                      <label className="text-micro block mb-1.5">UNIT</label>
                      <select
                        className="input w-full"
                        value={(selectedWorkflow.trigger_config.offset_unit as string) || 'days'}
                        onChange={(e) =>
                          updateWorkflow({
                            trigger_config: { ...selectedWorkflow.trigger_config, offset_unit: e.target.value },
                          })
                        }
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-micro block mb-1.5">BEFORE / AFTER</label>
                      <select
                        className="input w-full"
                        value={((selectedWorkflow.trigger_config.offset_value as number) || 0) < 0 ? 'before' : 'after'}
                        onChange={(e) => {
                          const raw = Math.abs((selectedWorkflow.trigger_config.offset_value as number) || 0)
                          updateWorkflow({
                            trigger_config: {
                              ...selectedWorkflow.trigger_config,
                              offset_value: e.target.value === 'before' ? -raw : raw,
                            },
                          })
                        }}
                      >
                        <option value="before">Before</option>
                        <option value="after">After</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-micro block mb-1.5">RELATIVE TO</label>
                      <select
                        className="input w-full"
                        value={(selectedWorkflow.trigger_config.relative_to as string) || 'start_at'}
                        onChange={(e) =>
                          updateWorkflow({
                            trigger_config: { ...selectedWorkflow.trigger_config, relative_to: e.target.value },
                          })
                        }
                      >
                        <option value="start_at">Booking start</option>
                        <option value="end_at">Booking end</option>
                        <option value="created_at">Booking created</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {selectedWorkflow.trigger_type === 'scheduled' && (
                <div className="space-y-2">
                  <Input
                    label="TIME"
                    type="time"
                    value={(selectedWorkflow.trigger_config.time as string) || '18:00'}
                    onChange={(e) => updateWorkflow({ trigger_config: { ...selectedWorkflow.trigger_config, time: e.target.value } })}
                  />
                  <Input
                    label="TIMEZONE"
                    value={(selectedWorkflow.trigger_config.timezone as string) || currentOrg?.timezone || DEFAULT_TZ}
                    onChange={(e) =>
                      updateWorkflow({ trigger_config: { ...selectedWorkflow.trigger_config, timezone: e.target.value } })
                    }
                  />
                </div>
              )}

              {selectedWorkflow.trigger_type === 'manual' && (
                <div className="space-y-2">
                  <label className="text-micro block">ENTITY</label>
                  <select
                    className="input w-full"
                    value={(selectedWorkflow.trigger_config.entity_type as string) || 'lead'}
                    onChange={(e) =>
                      updateWorkflow({
                        trigger_config: { ...selectedWorkflow.trigger_config, entity_type: e.target.value },
                      })
                    }
                  >
                    <option value="lead">Lead</option>
                    <option value="booking">Booking / Job</option>
                  </select>
                </div>
              )}
            </div>
          ) : !selectedStep ? (
            <div className="text-sm text-[var(--color-text-muted)]">Select a node to edit.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-heading text-white">Action</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">Configure what happens next.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => moveStep(selectedStep.id!, 'up')}>
                    ?
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => moveStep(selectedStep.id!, 'down')}>
                    ?
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteStep(selectedStep.id!)}>
                    Delete
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-micro block">ACTION TYPE</label>
                <div className="grid grid-cols-1 gap-2">
                  {ACTION_OPTIONS.map((action) => (
                    <button
                      key={action.type}
                      type="button"
                      onClick={() =>
                        updateStep(selectedStep.id!, {
                          action_type: action.type,
                          action_config: defaultActionConfig(action.type),
                        })
                      }
                      className={`px-3 py-2 rounded-lg text-left border transition-colors ${
                        selectedStep.action_type === action.type
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-white'
                          : 'border-white/10 bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{action.icon}</span>
                        <div>
                          <p className="text-sm font-medium">{action.label}</p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">{action.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedStep.action_type === 'send_sms' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-micro block mb-1.5">RECIPIENT</label>
                    <select
                      className="input w-full"
                      value={(selectedStep.action_config.recipient as string) || 'lead'}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, {
                          action_config: { ...selectedStep.action_config, recipient: e.target.value },
                        })
                      }
                    >
                      <option value="lead">Lead</option>
                      <option value="cleaner">Cleaner</option>
                      <option value="org">Org</option>
                    </select>
                  </div>
                  <Input
                    label="OVERRIDE PHONE (OPTIONAL)"
                    value={(selectedStep.action_config.to as string) || ''}
                    onChange={(e) =>
                      updateStep(selectedStep.id!, { action_config: { ...selectedStep.action_config, to: e.target.value } })
                    }
                    placeholder="+614..."
                  />
                  <div>
                    <label className="text-micro block mb-1.5">MESSAGE</label>
                    <textarea
                      className="input w-full"
                      rows={6}
                      value={(selectedStep.action_config.message as string) || ''}
                      onFocus={() => setActiveField('sms_message')}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, { action_config: { ...selectedStep.action_config, message: e.target.value } })
                      }
                      placeholder="Hi {{lead_name}}, thanks for booking..."
                    />
                  </div>
                  <AiTemplateAssistant
                    channel="sms"
                    placeholders={['{{lead_name}}', '{{booking_date}}', '{{payment_link}}']}
                    onApply={(result) =>
                      updateStep(selectedStep.id!, { action_config: { ...selectedStep.action_config, message: result.body } })
                    }
                  />
                </div>
              )}

              {selectedStep.action_type === 'send_email' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-micro block mb-1.5">RECIPIENT</label>
                    <select
                      className="input w-full"
                      value={(selectedStep.action_config.recipient as string) || 'lead'}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, {
                          action_config: { ...selectedStep.action_config, recipient: e.target.value },
                        })
                      }
                    >
                      <option value="lead">Lead</option>
                      <option value="org">Org</option>
                    </select>
                  </div>
                  <Input
                    label="OVERRIDE EMAIL (OPTIONAL)"
                    value={(selectedStep.action_config.to as string) || ''}
                    onChange={(e) =>
                      updateStep(selectedStep.id!, { action_config: { ...selectedStep.action_config, to: e.target.value } })
                    }
                    placeholder="customer@email.com"
                  />
                  <Input
                    label="SUBJECT"
                    value={(selectedStep.action_config.subject as string) || ''}
                    onFocus={() => setActiveField('email_subject')}
                    onChange={(e) =>
                      updateStep(selectedStep.id!, { action_config: { ...selectedStep.action_config, subject: e.target.value } })
                    }
                  />
                  <div>
                    <label className="text-micro block mb-1.5">BODY</label>
                    <textarea
                      className="input w-full"
                      rows={8}
                      value={(selectedStep.action_config.body as string) || ''}
                      onFocus={() => setActiveField('email_body')}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, { action_config: { ...selectedStep.action_config, body: e.target.value } })
                      }
                      placeholder="Hi {{lead_name}},\n\nThanks for choosing us..."
                    />
                  </div>
                  <AiTemplateAssistant
                    channel="email"
                    placeholders={['{{lead_name}}', '{{quote_total}}', '{{quote_share_link}}']}
                    onApply={(result) =>
                      updateStep(selectedStep.id!, {
                        action_config: { ...selectedStep.action_config, subject: result.subject || '', body: result.body },
                      })
                    }
                  />
                </div>
              )}

              {selectedStep.action_type === 'wait' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="DELAY"
                    type="number"
                    value={(selectedStep.action_config.delay_value as number) || 0}
                    onChange={(e) =>
                      updateStep(selectedStep.id!, {
                        action_config: { ...selectedStep.action_config, delay_value: Number(e.target.value) },
                      })
                    }
                  />
                  <div>
                    <label className="text-micro block mb-1.5">UNIT</label>
                    <select
                      className="input w-full"
                      value={(selectedStep.action_config.delay_unit as string) || 'days'}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, {
                          action_config: { ...selectedStep.action_config, delay_unit: e.target.value },
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

              {selectedStep.action_type === 'update_status' && (
                <div>
                  <label className="text-micro block mb-1.5">NEW STATUS</label>
                  <select
                    className="input w-full"
                    value={(selectedStep.action_config.new_status as string) || ''}
                    onChange={(e) =>
                      updateStep(selectedStep.id!, {
                        action_config: { ...selectedStep.action_config, new_status: e.target.value },
                      })
                    }
                  >
                    <option value="">Select status</option>
                    {LEAD_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 border-t border-white/10">
                <details>
                  <summary className="text-xs text-[var(--color-text-muted)] cursor-pointer">Conditions (optional)</summary>
                  <div className="mt-2 space-y-2">
                    <Input
                      label="ONLY IF PAYMENT STATUS"
                      value={(selectedStep.action_config.only_if as any)?.payment_status || ''}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, {
                          action_config: {
                            ...selectedStep.action_config,
                            only_if: { ...(selectedStep.action_config.only_if as any), payment_status: e.target.value },
                          },
                        })
                      }
                      placeholder="paid"
                    />
                    <Input
                      label="ONLY IF PAYMENT STATUS NOT"
                      value={(selectedStep.action_config.only_if as any)?.payment_status_not || ''}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, {
                          action_config: {
                            ...selectedStep.action_config,
                            only_if: { ...(selectedStep.action_config.only_if as any), payment_status_not: e.target.value },
                          },
                        })
                      }
                      placeholder="paid"
                    />
                    <Input
                      label="ONLY IF LEAD STATUS"
                      value={(selectedStep.action_config.only_if as any)?.lead_status || ''}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, {
                          action_config: {
                            ...selectedStep.action_config,
                            only_if: { ...(selectedStep.action_config.only_if as any), lead_status: e.target.value },
                          },
                        })
                      }
                    />
                    <Input
                      label="ONLY IF BOOKING STATUS"
                      value={(selectedStep.action_config.only_if as any)?.booking_status || ''}
                      onChange={(e) =>
                        updateStep(selectedStep.id!, {
                          action_config: {
                            ...selectedStep.action_config,
                            only_if: { ...(selectedStep.action_config.only_if as any), booking_status: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                </details>
              </div>

              <div className="pt-2 border-t border-white/10">
                <h3 className="text-xs uppercase text-[var(--color-text-muted)] mb-2">Placeholders</h3>
                <PlaceholderPalette onInsert={handleInsertPlaceholder} />
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {!isRunsView && (
      <Modal
        open={showAddStepModal}
        onClose={() => setShowAddStepModal(false)}
        title="Add Action"
        description="Choose what happens next."
      >
        <div className="space-y-2">
          {ACTION_OPTIONS.map((action) => (
            <button
              key={action.type}
              type="button"
              onClick={() => addStep(action.type)}
              className="w-full px-3 py-3 rounded-lg text-left border border-white/10 hover:bg-white/10"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{action.icon}</span>
                <div>
                  <p className="text-sm text-white font-medium">{action.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{action.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
      )}

      {!isRunsView && selectedWorkflow && selectedWorkflow.trigger_type === 'manual' && orgId && (
        <ManualWorkflowRunner
          open={showRunOnce}
          onClose={() => setShowRunOnce(false)}
          orgId={orgId}
          entityType={(selectedWorkflow.trigger_config.entity_type as 'lead' | 'booking') || 'lead'}
          workflowId={selectedWorkflow.id}
          workflowName={selectedWorkflow.name}
        />
      )}
    </div>
  )
}

