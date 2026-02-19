import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Badge } from './ui'

type Lead = {
  id: string
  name?: string | null
  email?: string | null
  phone_number?: string | null
  status?: string | null
}

type WorkflowMeta = {
  id: string
  name: string
  system_key: string | null
}

type WorkflowRun = {
  id: string
  workflow_id: string
  entity_id: string
  status: string
  current_step: number
  next_execute_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  last_error?: string | null
}

type StepLog = {
  run_id: string
  step_order: number
  completed_at?: string | null
  status?: string | null
}

type LeadWithRuns = Lead & {
  sms_run?: WorkflowRun | null
  email_run?: WorkflowRun | null
  last_sms?: StepLog | null
  last_email?: StepLog | null
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return '—'
  }
}

function getStatusLight(run: WorkflowRun | null | undefined, totalSteps: number): 'green' | 'orange' | 'red' {
  if (!run) return 'red'
  if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') return 'red'
  if (run.status === 'paused') return 'red'
  if (totalSteps > 0 && run.current_step >= totalSteps - 1) return 'orange'
  return 'green'
}

function pickPrimaryRun(runs: WorkflowRun[]): WorkflowRun | null {
  if (runs.length === 0) return null
  const active = runs.find((run) => run.status === 'active' || run.status === 'paused')
  if (active) return active
  return runs[0]
}

export default function MarketingLoop() {
  const { currentOrg } = useAuth()
  const [leads, setLeads] = useState<LeadWithRuns[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workflowMeta, setWorkflowMeta] = useState<{ sms?: WorkflowMeta | null; email?: WorkflowMeta | null }>({})
  const [stepCounts, setStepCounts] = useState<Record<string, number>>({})

  const fetchLeads = async () => {
    try {
      setIsLoading(true)
      setError(null)

      if (!currentOrg) {
        setLeads([])
        setIsLoading(false)
        return
      }

      const { data: leadsData, error: leadsError } = await supabase
        .from('extracted_leads')
        .select('id, name, email, phone_number, status')
        .eq('org_id', currentOrg.id)
        .eq('status', 'Marketing Loop')
        .order('created_at', { ascending: false })

      if (leadsError) throw leadsError

      if (!leadsData || leadsData.length === 0) {
        setLeads([])
        setIsLoading(false)
        return
      }

      const leadIds = leadsData.map((lead) => lead.id)

      const { data: workflows } = await supabase
        .from('workflows')
        .select('id, name, system_key')
        .eq('org_id', currentOrg.id)
        .in('system_key', ['marketing_sms', 'marketing_email'])

      const smsWorkflow = workflows?.find((w: any) => w.system_key === 'marketing_sms') || null
      const emailWorkflow = workflows?.find((w: any) => w.system_key === 'marketing_email') || null

      setWorkflowMeta({ sms: smsWorkflow, email: emailWorkflow })

      const workflowIds = [smsWorkflow?.id, emailWorkflow?.id].filter(Boolean) as string[]
      if (workflowIds.length === 0) {
        setLeads(leadsData as any)
        setIsLoading(false)
        return
      }

      const { data: runs } = await supabase
        .from('workflow_runs')
        .select('id, workflow_id, entity_id, status, current_step, next_execute_at, started_at, completed_at, cancelled_at, last_error')
        .eq('org_id', currentOrg.id)
        .eq('entity_type', 'lead')
        .in('workflow_id', workflowIds)
        .in('entity_id', leadIds)
        .order('started_at', { ascending: false })

      const runIds = (runs || []).map((run: any) => run.id)

      const [logsRes, stepRes] = await Promise.all([
        runIds.length
          ? supabase
              .from('workflow_step_logs')
              .select('run_id, step_order, completed_at, status')
              .in('run_id', runIds)
              .eq('status', 'success')
              .order('completed_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        workflowIds.length
          ? supabase
              .from('workflow_steps')
              .select('workflow_id, id')
              .in('workflow_id', workflowIds)
          : Promise.resolve({ data: [] }),
      ])

      const logs = (logsRes as any)?.data || []
      const steps = (stepRes as any)?.data || []

      const counts: Record<string, number> = {}
      steps.forEach((step: any) => {
        counts[step.workflow_id] = (counts[step.workflow_id] || 0) + 1
      })
      setStepCounts(counts)

      const logsByRun = new Map<string, StepLog>()
      logs.forEach((log: any) => {
        if (!logsByRun.has(log.run_id)) {
          logsByRun.set(log.run_id, log)
        }
      })

      const runsByLead: Record<string, { sms: WorkflowRun[]; email: WorkflowRun[] }> = {}
      ;(runs || []).forEach((run: any) => {
        if (!runsByLead[run.entity_id]) {
          runsByLead[run.entity_id] = { sms: [], email: [] }
        }
        if (run.workflow_id === smsWorkflow?.id) {
          runsByLead[run.entity_id].sms.push(run)
        }
        if (run.workflow_id === emailWorkflow?.id) {
          runsByLead[run.entity_id].email.push(run)
        }
      })

      const combined: LeadWithRuns[] = (leadsData as any).map((lead: any) => {
        const leadRuns = runsByLead[lead.id] || { sms: [], email: [] }
        const smsRun = pickPrimaryRun(leadRuns.sms)
        const emailRun = pickPrimaryRun(leadRuns.email)
        return {
          ...lead,
          sms_run: smsRun,
          email_run: emailRun,
          last_sms: smsRun ? logsByRun.get(smsRun.id) || null : null,
          last_email: emailRun ? logsByRun.get(emailRun.id) || null : null,
        }
      })

      setLeads(combined)
    } catch (err) {
      console.error('Error fetching marketing loop leads:', err)
      setError(err instanceof Error ? err.message : 'Failed to load leads')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!currentOrg) return

    fetchLeads()

    const channel = supabase
      .channel('marketing_loop_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extracted_leads', filter: 'org_id=eq.' + currentOrg.id }, () => fetchLeads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs', filter: 'org_id=eq.' + currentOrg.id }, () => fetchLeads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_step_logs', filter: 'org_id=eq.' + currentOrg.id }, () => fetchLeads())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentOrg])

  const stats = useMemo(() => {
    const activeCount = leads.filter((lead) => lead.sms_run?.status === 'active' || lead.email_run?.status === 'active').length
    const completedCount = leads.filter(
      (lead) => lead.sms_run?.status === 'completed' && lead.email_run?.status === 'completed'
    ).length
    return {
      total: leads.length,
      active: activeCount,
      completed: completedCount,
    }
  }, [leads])

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Marketing Loop</h1>
          <p className="text-sm text-white/60">Read-only view of Marketing Loop workflows running on leads.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">{error}</div>
        )}

        {!workflowMeta.sms && !workflowMeta.email && (
          <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
            No Marketing Loop workflows found. Run the migration script or create workflows with system keys
            <span className="font-semibold"> marketing_sms</span> and <span className="font-semibold">marketing_email</span>.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-white/60 mb-1">Total Leads</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-white/60 mb-1">Active Runs</div>
            <div className="text-2xl font-bold text-white">{stats.active}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-sm text-white/60 mb-1">Completed</div>
            <div className="text-2xl font-bold text-white">{stats.completed}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-white/60">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-white/60">No leads in Marketing Loop</div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => {
              const smsSteps = stepCounts[workflowMeta.sms?.id || ''] || 0
              const emailSteps = stepCounts[workflowMeta.email?.id || ''] || 0
              const smsLight = getStatusLight(lead.sms_run, smsSteps)
              const emailLight = getStatusLight(lead.email_run, emailSteps)

              return (
                <div key={lead.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-white">{lead.name || 'No name'}</h3>
                        <div className="flex items-center gap-1">
                          <span
                            className={`w-2 h-2 rounded-full ${smsLight === 'green' ? 'bg-green-400' : smsLight === 'orange' ? 'bg-orange-400' : 'bg-red-400'}`}
                            title={`SMS: ${smsLight}`}
                          />
                          <span
                            className={`w-2 h-2 rounded-full ${emailLight === 'green' ? 'bg-green-400' : emailLight === 'orange' ? 'bg-orange-400' : 'bg-red-400'}`}
                            title={`Email: ${emailLight}`}
                          />
                        </div>
                      </div>
                      <div className="text-sm text-white/60 space-y-1">
                        {lead.phone_number && <div>?? {lead.phone_number}</div>}
                        {lead.email && <div>?? {lead.email}</div>}
                      </div>
                    </div>

                    <div className="flex-1 min-w-[200px]">
                      <div className="text-xs text-white/40 mb-1">SMS Workflow</div>
                      {lead.sms_run ? (
                        <div className="space-y-1 text-sm">
                          <div className="text-white">
                            Step {lead.sms_run.current_step}/{smsSteps || '-'} ·{' '}
                            <span className={lead.sms_run.status === 'active' ? 'text-green-400' : 'text-white/60'}>
                              {lead.sms_run.status}
                            </span>
                          </div>
                          <div className="text-white/60">Next: {formatDate(lead.sms_run.next_execute_at)}</div>
                          <div className="text-white/60">
                            Last: {lead.last_sms ? `Step ${lead.last_sms.step_order} at ${formatDate(lead.last_sms.completed_at)}` : 'Never'}
                          </div>
                          {lead.sms_run.last_error && (
                            <div className="text-red-400 text-xs">Error: {lead.sms_run.last_error}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-white/40 text-sm">No SMS run</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-[200px]">
                      <div className="text-xs text-white/40 mb-1">Email Workflow</div>
                      {lead.email_run ? (
                        <div className="space-y-1 text-sm">
                          <div className="text-white">
                            Step {lead.email_run.current_step}/{emailSteps || '-'} ·{' '}
                            <span className={lead.email_run.status === 'active' ? 'text-green-400' : 'text-white/60'}>
                              {lead.email_run.status}
                            </span>
                          </div>
                          <div className="text-white/60">Next: {formatDate(lead.email_run.next_execute_at)}</div>
                          <div className="text-white/60">
                            Last: {lead.last_email ? `Step ${lead.last_email.step_order} at ${formatDate(lead.last_email.completed_at)}` : 'Never'}
                          </div>
                          {lead.email_run.last_error && (
                            <div className="text-red-400 text-xs">Error: {lead.email_run.last_error}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-white/40 text-sm">No email run</div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 min-w-[160px]">
                      <div className="text-xs text-white/40 mb-1">Status</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={lead.sms_run?.status === 'active' ? 'success' : 'default'}>SMS {lead.sms_run?.status || 'idle'}</Badge>
                        <Badge variant={lead.email_run?.status === 'active' ? 'success' : 'default'}>Email {lead.email_run?.status || 'idle'}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

