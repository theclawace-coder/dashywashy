import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Input } from '../ui'

export type RunsPreset = 'all' | 'marketing_loop'

type RunStatus = 'active' | 'completed' | 'cancelled' | 'paused' | 'failed'

type WorkflowRef = {
  id: string
  name: string
  system_key?: string | null
}

type WorkflowRunRecord = {
  id: string
  workflow_id: string
  entity_type: string
  entity_id: string
  status: RunStatus
  current_step: number
  next_execute_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  last_error?: string | null
  metadata?: Record<string, unknown> | null
  workflow?: WorkflowRef | null
}

type StepLogRecord = {
  id: string
  run_id: string
  step_order: number
  action_type: string
  status: 'pending' | 'executing' | 'success' | 'failed' | 'skipped'
  started_at?: string | null
  completed_at?: string | null
  error?: string | null
}

type AutomationRunsPanelProps = {
  orgId?: string
  preset: RunsPreset
  onPresetChange: (preset: RunsPreset) => void
  onOpenWorkflow: (workflowId: string) => void
}

const STATUS_OPTIONS: Array<{ value: 'all' | RunStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const MARKETING_SYSTEM_KEYS = new Set(['marketing_sms', 'marketing_email'])

function badgeForStatus(status: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'active') return 'success'
  if (status === 'paused') return 'warning'
  if (status === 'completed') return 'info'
  if (status === 'failed') return 'error'
  return 'default'
}

function formatStamp(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function AutomationRunsPanel({
  orgId,
  preset,
  onPresetChange,
  onOpenWorkflow,
}: AutomationRunsPanelProps) {
  const [runs, setRuns] = useState<WorkflowRunRecord[]>([])
  const [runsLoading, setRunsLoading] = useState(true)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [runLogsByRunId, setRunLogsByRunId] = useState<Record<string, StepLogRecord[]>>({})
  const [logsLoading, setLogsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RunStatus>('all')
  const [workflowFilter, setWorkflowFilter] = useState<string>('all')

  const loadRuns = useCallback(async () => {
    if (!orgId) {
      setRuns([])
      setRunsLoading(false)
      return
    }

    setRunsLoading(true)
    setRunsError(null)

    try {
      const { data, error } = await supabase
        .from('workflow_runs')
        .select(
          'id, workflow_id, entity_type, entity_id, status, current_step, next_execute_at, started_at, completed_at, cancelled_at, last_error, metadata, workflow:workflows(id, name, system_key)'
        )
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(300)

      if (error) throw error
      const normalizedRuns = ((data || []) as any[]).map((row) => ({
        ...row,
        workflow: Array.isArray(row.workflow) ? row.workflow[0] || null : row.workflow || null,
      })) as WorkflowRunRecord[]
      setRuns(normalizedRuns)
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : 'Failed to load automation runs')
    } finally {
      setRunsLoading(false)
    }
  }, [orgId])

  const loadRunLogs = useCallback(
    async (runId: string) => {
      if (!orgId) return
      setLogsLoading(true)
      try {
        const { data, error } = await supabase
          .from('workflow_step_logs')
          .select('id, run_id, step_order, action_type, status, started_at, completed_at, error')
          .eq('org_id', orgId)
          .eq('run_id', runId)
          .order('step_order', { ascending: true })
          .order('created_at', { ascending: true })

        if (error) throw error
        setRunLogsByRunId((prev) => ({ ...prev, [runId]: (data || []) as StepLogRecord[] }))
      } finally {
        setLogsLoading(false)
      }
    },
    [orgId]
  )

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  useEffect(() => {
    if (!orgId) return
    const intervalId = window.setInterval(() => {
      loadRuns()
    }, 12000)
    return () => window.clearInterval(intervalId)
  }, [loadRuns, orgId])

  useEffect(() => {
    if (!selectedRunId) return
    loadRunLogs(selectedRunId)
  }, [loadRunLogs, selectedRunId])

  const workflowOptions = useMemo(() => {
    const map = new Map<string, string>()
    runs.forEach((run) => {
      if (run.workflow_id && run.workflow?.name) {
        map.set(run.workflow_id, run.workflow.name)
      }
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [runs])

  const filteredRuns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return runs.filter((run) => {
      if (preset === 'marketing_loop' && !MARKETING_SYSTEM_KEYS.has(run.workflow?.system_key || '')) {
        return false
      }
      if (statusFilter !== 'all' && run.status !== statusFilter) return false
      if (workflowFilter !== 'all' && run.workflow_id !== workflowFilter) return false
      if (!normalizedSearch) return true
      const haystack = [
        run.workflow?.name || '',
        run.workflow?.system_key || '',
        run.entity_type || '',
        run.entity_id || '',
        run.last_error || '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [preset, runs, search, statusFilter, workflowFilter])

  useEffect(() => {
    if (filteredRuns.length === 0) {
      setSelectedRunId(null)
      return
    }
    if (!selectedRunId || !filteredRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(filteredRuns[0].id)
    }
  }, [filteredRuns, selectedRunId])

  const selectedRun = useMemo(
    () => filteredRuns.find((run) => run.id === selectedRunId) || null,
    [filteredRuns, selectedRunId]
  )

  const selectedRunLogs = selectedRun ? runLogsByRunId[selectedRun.id] || [] : []

  const summary = useMemo(() => {
    const active = filteredRuns.filter((run) => run.status === 'active').length
    const failed = filteredRuns.filter((run) => run.status === 'failed').length
    return {
      total: filteredRuns.length,
      active,
      failed,
    }
  }, [filteredRuns])

  return (
    <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)] gap-4 min-h-0">
      <div className="rounded-2xl border border-white/10 bg-[var(--color-surface)] p-4 min-h-[480px] flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Badge variant="info">{summary.total} Runs</Badge>
            <Badge variant="success">{summary.active} Active</Badge>
            <Badge variant={summary.failed > 0 ? 'error' : 'default'}>{summary.failed} Failed</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={preset === 'all' ? 'secondary' : 'ghost'}
              onClick={() => onPresetChange('all')}
            >
              All Runs
            </Button>
            <Button
              size="sm"
              variant={preset === 'marketing_loop' ? 'secondary' : 'ghost'}
              onClick={() => onPresetChange('marketing_loop')}
            >
              Marketing Loop
            </Button>
            <Button size="sm" variant="ghost" onClick={loadRuns}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          <Input
            label="SEARCH"
            placeholder="Workflow, entity ID, error"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div>
            <label className="text-micro block mb-1.5">STATUS</label>
            <select
              className="input w-full"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | RunStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-micro block mb-1.5">WORKFLOW</label>
            <select
              className="input w-full"
              value={workflowFilter}
              onChange={(event) => setWorkflowFilter(event.target.value)}
            >
              <option value="all">All workflows</option>
              {workflowOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {runsError && (
          <div className="mb-3 p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
            <p className="text-sm text-red-400">{runsError}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {runsLoading && runs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[var(--color-text-muted)]">Loading runs...</div>
          ) : filteredRuns.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[var(--color-text-muted)]">
              No runs match this filter.
            </div>
          ) : (
            filteredRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selectedRunId === run.id
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-white font-medium truncate">
                    {run.workflow?.name || 'Unknown workflow'}
                  </p>
                  <Badge variant={badgeForStatus(run.status)}>{run.status}</Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {run.entity_type}:{' '}
                  <span className="font-mono">
                    {run.entity_id}
                  </span>
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Step {run.current_step} • Next: {formatStamp(run.next_execute_at)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[var(--color-surface)] p-4 min-h-[480px] overflow-y-auto">
        {!selectedRun ? (
          <div className="h-full flex items-center justify-center text-[var(--color-text-muted)]">
            Select a run to inspect execution logs.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-heading text-white">Run Detail</h2>
                <p className="text-xs text-[var(--color-text-muted)]">{selectedRun.id}</p>
              </div>
              <Badge variant={badgeForStatus(selectedRun.status)}>{selectedRun.status}</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-[11px] text-[var(--color-text-muted)]">Workflow</p>
                <p className="text-white">{selectedRun.workflow?.name || 'Unknown'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-[11px] text-[var(--color-text-muted)]">Entity</p>
                <p className="text-white">
                  {selectedRun.entity_type}:{' '}
                  <span className="font-mono text-xs">{selectedRun.entity_id}</span>
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-[11px] text-[var(--color-text-muted)]">Started</p>
                <p className="text-white">{formatStamp(selectedRun.started_at)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-[11px] text-[var(--color-text-muted)]">Next Execute</p>
                <p className="text-white">{formatStamp(selectedRun.next_execute_at)}</p>
              </div>
            </div>

            {selectedRun.last_error && (
              <div className="p-3 rounded-lg bg-[var(--color-error-muted)] border border-red-500/20">
                <p className="text-sm text-red-400">{selectedRun.last_error}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Step Logs
              </h3>
              {selectedRun.workflow_id && (
                <Button size="sm" variant="ghost" onClick={() => onOpenWorkflow(selectedRun.workflow_id)}>
                  Open Workflow
                </Button>
              )}
            </div>

            {logsLoading ? (
              <div className="text-sm text-[var(--color-text-muted)]">Loading logs...</div>
            ) : selectedRunLogs.length === 0 ? (
              <div className="text-sm text-[var(--color-text-muted)]">No step logs recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {selectedRunLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white">
                        Step {log.step_order} • {log.action_type}
                      </p>
                      <Badge variant={badgeForStatus(log.status)}>{log.status}</Badge>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      Start: {formatStamp(log.started_at)} • End: {formatStamp(log.completed_at)}
                    </p>
                    {log.error && <p className="text-xs text-red-400 mt-1">{log.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
