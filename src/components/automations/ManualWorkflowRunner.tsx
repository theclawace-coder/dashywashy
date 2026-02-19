import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Input, Modal, Badge } from '../ui'

type WorkflowOption = {
  id: string
  name: string
  enabled: boolean
  trigger_type: string
  trigger_config: Record<string, unknown>
}

type EntityOption = {
  id: string
  label: string
  sublabel?: string
}

type ManualWorkflowRunnerProps = {
  open: boolean
  onClose: () => void
  orgId: string
  entityType?: 'lead' | 'booking'
  entityId?: string
  entityLabel?: string
  workflowId?: string
  workflowName?: string
}

export default function ManualWorkflowRunner({
  open,
  onClose,
  orgId,
  entityType,
  entityId,
  entityLabel,
  workflowId,
  workflowName,
}: ManualWorkflowRunnerProps) {
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(workflowId || '')
  const [selectedEntityType, setSelectedEntityType] = useState<'lead' | 'booking'>(entityType || 'lead')
  const [entities, setEntities] = useState<EntityOption[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState(entityId || '')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) return
    setNotice(null)
    setSelectedWorkflowId(workflowId || '')
    setSelectedEntityType(entityType || 'lead')
    setSelectedEntityId(entityId || '')
  }, [open, workflowId, entityType, entityId])

  useEffect(() => {
    if (!open || !orgId || workflowId) return
    let active = true
    setLoadingWorkflows(true)
    const loadWorkflows = async () => {
      try {
        const { data, error } = await supabase
          .from('workflows')
          .select('id, name, enabled, trigger_type, trigger_config')
          .eq('org_id', orgId)
          .eq('trigger_type', 'manual')
          .order('name')
        if (!active) return
        if (error) {
          setNotice(error.message)
          return
        }
        setWorkflows((data || []) as any)
      } finally {
        if (active) setLoadingWorkflows(false)
      }
    }
    void loadWorkflows()

    return () => {
      active = false
    }
  }, [open, orgId, workflowId])

  useEffect(() => {
    if (!open || !orgId || entityId) return
    let active = true
    setEntities([])

    const loadEntities = async () => {
      try {
        if (selectedEntityType === 'lead') {
          const { data } = await supabase
            .from('extracted_leads')
            .select('id, name, email, phone_number')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(50)

          if (!active) return
          const mapped = (data || []).map((lead: any) => ({
            id: lead.id,
            label: lead.name || lead.email || lead.phone_number || 'Unnamed lead',
            sublabel: lead.email || lead.phone_number || '',
          }))
          setEntities(mapped)
          return
        }

        const { data } = await supabase
          .from('booking_occurrences')
          .select('id, start_at, series:booking_series(title, lead:extracted_leads(name))')
          .eq('org_id', orgId)
          .order('start_at', { ascending: false })
          .limit(50)

        if (!active) return
        const mapped = (data || []).map((occ: any) => ({
          id: occ.id,
          label: occ.series?.title || occ.series?.lead?.name || 'Booking',
          sublabel: occ.start_at ? new Date(occ.start_at).toLocaleString() : '',
        }))
        setEntities(mapped)
      } catch (err) {
        if (!active) return
        setNotice(err instanceof Error ? err.message : 'Failed to load entities')
      }
    }

    loadEntities()

    return () => {
      active = false
    }
  }, [open, orgId, selectedEntityType, entityId])

  const filteredEntities = useMemo(() => {
    if (!search.trim()) return entities
    const needle = search.trim().toLowerCase()
    return entities.filter((entity) =>
      [entity.label, entity.sublabel].filter(Boolean).join(' ').toLowerCase().includes(needle)
    )
  }, [entities, search])

  const availableWorkflows = useMemo(() => {
    if (workflowId) return []
    return workflows.filter((workflow) => {
      const entity = (workflow.trigger_config?.entity_type as string | undefined) || 'lead'
      return entity === selectedEntityType
    })
  }, [workflows, workflowId, selectedEntityType])

  const selectedWorkflow = useMemo(() => {
    if (workflowId) {
      return {
        id: workflowId,
        name: workflowName || 'Selected workflow',
        enabled: true,
        trigger_type: 'manual',
        trigger_config: { entity_type: selectedEntityType },
      } as WorkflowOption
    }
    return workflows.find((workflow) => workflow.id === selectedWorkflowId) || null
  }, [workflowId, workflowName, workflows, selectedWorkflowId, selectedEntityType])

  const handleRun = async () => {
    if (!selectedWorkflow) {
      setNotice('Select a workflow to run.')
      return
    }
    const targetEntityId = entityId || selectedEntityId
    if (!targetEntityId) {
      setNotice('Select a target to run the workflow.')
      return
    }
    if (!selectedWorkflow.enabled) {
      setNotice('This workflow is disabled. Enable it before running.')
      return
    }

    setRunning(true)
    setNotice(null)

    try {
      const { data: existing } = await supabase
        .from('workflow_runs')
        .select('id')
        .eq('workflow_id', selectedWorkflow.id)
        .eq('entity_id', targetEntityId)
        .in('status', ['active', 'paused'])
        .maybeSingle()

      if (existing) {
        setNotice('An active run already exists for this target.')
        return
      }

      const { error } = await supabase.from('workflow_runs').insert({
        org_id: orgId,
        workflow_id: selectedWorkflow.id,
        entity_type: selectedEntityType,
        entity_id: targetEntityId,
        status: 'active',
        current_step: 1,
        next_execute_at: new Date().toISOString(),
        metadata: {
          trigger_event: 'manual',
          source: 'ui',
        },
      })

      if (error) throw error

      setNotice('Workflow run queued. It will execute shortly.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to start workflow run')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run Automation"
      description="Start a manual workflow for a lead or booking."
      size="lg"
    >
      <div className="space-y-4">
        {!workflowId && (
          <div>
            <label className="text-micro block mb-1.5">WORKFLOW</label>
            {loadingWorkflows ? (
              <div className="text-xs text-[var(--color-text-muted)]">Loading workflows...</div>
            ) : availableWorkflows.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)]">No manual workflows found.</div>
            ) : (
              <div className="space-y-2">
                {availableWorkflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      selectedWorkflowId === workflow.id
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-white'
                        : 'border-white/10 bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{workflow.name}</span>
                      {!workflow.enabled && <Badge variant="warning">Disabled</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!entityId && (
          <div className="space-y-3">
            <div>
              <label className="text-micro block mb-1.5">TARGET TYPE</label>
              <div className="flex gap-2">
                {(['lead', 'booking'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedEntityType(type)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      selectedEntityType === type
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-white/10 text-[var(--color-text-secondary)] hover:bg-white/20'
                    }`}
                  >
                    {type === 'lead' ? 'Lead' : 'Booking / Job'}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="SEARCH"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={selectedEntityType === 'lead' ? 'Search by name, email, phone' : 'Search bookings'}
            />

            <div className="max-h-56 overflow-y-auto space-y-2">
              {filteredEntities.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => setSelectedEntityId(entity.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    selectedEntityId === entity.id
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-white'
                      : 'border-white/10 bg-white/5 text-[var(--color-text-secondary)] hover:bg-white/10'
                  }`}
                >
                  <div className="text-sm font-medium">{entity.label}</div>
                  {entity.sublabel && <div className="text-xs text-[var(--color-text-muted)]">{entity.sublabel}</div>}
                </button>
              ))}
              {filteredEntities.length === 0 && (
                <div className="text-xs text-[var(--color-text-muted)]">No results.</div>
              )}
            </div>
          </div>
        )}

        {entityId && entityLabel && (
          <div className="p-3 rounded-lg border border-white/10 bg-white/5">
            <p className="text-xs text-[var(--color-text-muted)]">Target</p>
            <p className="text-sm text-white">{entityLabel}</p>
          </div>
        )}

        {notice && (
          <div className="p-3 rounded-lg border border-white/10 bg-white/5 text-sm text-[var(--color-text-secondary)]">
            {notice}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handleRun} loading={running}>
            Run Now
          </Button>
        </div>
      </div>
    </Modal>
  )
}

