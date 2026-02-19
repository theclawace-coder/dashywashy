/**
 * workflow-trigger - Handles incoming events and starts matching workflows.
 *
 * Called by database triggers when events occur (lead status change, booking created, etc.)
 * Finds matching enabled workflows and creates workflow_runs for them.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-org-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface TriggerPayload {
  event_type:
    | 'lead_status_change'
    | 'lead_created'
    | 'booking_created'
    | 'booking_completed'
    | 'booking_updated'
    | 'cleaner_assigned'
    | 'booking_paid'
  org_id: string
  entity_type: 'lead' | 'booking' | 'quote'
  entity_id: string
  old_data?: Record<string, unknown>
  new_data: Record<string, unknown>
}

interface Workflow {
  id: string
  name: string
  trigger_type: string
  trigger_config: Record<string, unknown>
}

interface WorkflowStep {
  id: string
  step_order: number
  action_type: string
  action_config: Record<string, unknown>
}

/**
 * Map event types to workflow trigger types
 */
function mapEventToTriggerType(
  eventType: TriggerPayload['event_type']
): string {
  if (eventType === 'lead_status_change') {
    return 'lead_status_change'
  }
  // All other events are event_based
  return 'event_based'
}

/**
 * Check if a workflow's trigger config matches the incoming event
 */
function doesTriggerMatch(
  workflow: Workflow,
  payload: TriggerPayload
): boolean {
  const { trigger_type, trigger_config } = workflow

  if (trigger_type === 'lead_status_change') {
    const toStatus = trigger_config.to_status as string[] | undefined
    const newStatus = payload.new_data?.status as string | undefined

    if (!toStatus || !newStatus) return false
    return toStatus.includes(newStatus)
  }

  if (trigger_type === 'event_based') {
    const configEvent = trigger_config.event as string | undefined
    return configEvent === payload.event_type
  }

  // time_based triggers are handled separately by a scheduler
  return false
}

/**
 * Calculate the initial next_execute_at for a workflow run
 */
function calculateNextExecuteAt(
  steps: WorkflowStep[]
): Date {
  // If first step is a wait, calculate delay
  if (steps.length > 0 && steps[0].action_type === 'wait') {
    const config = steps[0].action_config
    const delayValue = (config.delay_value as number) || 0
    const delayUnit = (config.delay_unit as string) || 'days'

    let delayMs = delayValue * 1000 // start with seconds
    switch (delayUnit) {
      case 'minutes':
        delayMs = delayValue * 60 * 1000
        break
      case 'hours':
        delayMs = delayValue * 60 * 60 * 1000
        break
      case 'days':
        delayMs = delayValue * 24 * 60 * 60 * 1000
        break
    }

    return new Date(Date.now() + delayMs)
  }

  // Otherwise execute immediately
  return new Date()
}

function calculateTimeBasedNextExecuteAt(
  workflow: Workflow,
  payload: TriggerPayload
): Date | null {
  const { trigger_config } = workflow
  const relativeTo = (trigger_config.relative_to as string) || 'start_at'
  const offsetValue = (trigger_config.offset_value as number) ?? (trigger_config.offset_days as number) ?? 0
  const offsetUnit = (trigger_config.offset_unit as string) || 'days'
  const baseValue = payload.new_data?.[relativeTo] as string | undefined
  const fallback = payload.new_data?.start_at as string | undefined
  const base = baseValue || fallback

  if (!base) return null

  const baseDate = new Date(base)
  if (Number.isNaN(baseDate.getTime())) return null

  const unitMs =
    offsetUnit === 'minutes'
      ? 60 * 1000
      : offsetUnit === 'hours'
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000
  const nextTime = new Date(baseDate.getTime() + offsetValue * unitMs)
  return nextTime
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const payload: TriggerPayload = await req.json()

    console.log('[workflow-trigger] Received event:', payload.event_type, 'for entity:', payload.entity_id)

    // Validate payload
    if (!payload.event_type || !payload.org_id || !payload.entity_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: event_type, org_id, entity_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Feature flag: only run workflows for orgs that have cut over
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('use_workflow_automations')
      .eq('id', payload.org_id)
      .maybeSingle()

    const useWorkflows = Boolean(orgRow?.use_workflow_automations)
    if (!useWorkflows) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'workflow_automations_disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find matching workflows for lead status changes + event-based triggers
    const triggerType = mapEventToTriggerType(payload.event_type)
    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select(`
        id,
        name,
        trigger_type,
        trigger_config,
        system_key,
        steps:workflow_steps(id, step_order, action_type, action_config)
      `)
      .eq('org_id', payload.org_id)
      .eq('enabled', true)
      .eq('trigger_type', triggerType)

    if (workflowsError) {
      console.error('[workflow-trigger] Error fetching workflows:', workflowsError)
      throw workflowsError
    }

    console.log('[workflow-trigger] Found', workflows?.length || 0, 'potential workflows')

    // Cancel active runs when leaving a lead status (if configured)
    if (payload.event_type === 'lead_status_change' && workflows && workflows.length > 0) {
      const oldStatus = payload.old_data?.status as string | undefined
      const newStatus = payload.new_data?.status as string | undefined
      if (oldStatus && newStatus && oldStatus !== newStatus) {
        const nowIso = new Date().toISOString()
        const cancelTargets = (workflows || []).filter((w) => {
          const cfg = (w.trigger_config as Record<string, unknown>) || {}
          const cancelOnStatusChange = Boolean(cfg.cancel_on_status_change)
          if (!cancelOnStatusChange) return false
          const toStatus = cfg.to_status as string[] | undefined
          if (!toStatus || toStatus.length === 0) return false
          return toStatus.includes(oldStatus) && !toStatus.includes(newStatus)
        })

        for (const workflow of cancelTargets) {
          await supabase
            .from('workflow_runs')
            .update({
              status: 'cancelled',
              cancelled_at: nowIso,
              last_error: 'cancelled_on_status_change',
            })
            .eq('workflow_id', workflow.id)
            .eq('entity_id', payload.entity_id)
            .in('status', ['active', 'paused'])
        }
      }
    }

    const matchingWorkflows = (workflows || []).filter((w) =>
      doesTriggerMatch(w as unknown as Workflow, payload)
    )

    console.log('[workflow-trigger] Matched', matchingWorkflows.length, 'workflows')

    const runsCreated: string[] = []

    for (const workflow of matchingWorkflows) {
      const steps = (workflow.steps as WorkflowStep[]) || []
      if (steps.length === 0) {
        console.log(`[workflow-trigger] Skipping workflow ${workflow.id} - no steps`)
        continue
      }

      steps.sort((a, b) => a.step_order - b.step_order)

      const { data: existingRun } = await supabase
        .from('workflow_runs')
        .select('id')
        .eq('workflow_id', workflow.id)
        .eq('entity_id', payload.entity_id)
        .in('status', ['active', 'paused'])
        .maybeSingle()

      if (existingRun) {
        console.log(`[workflow-trigger] Skipping workflow ${workflow.id} - already has active run for entity`)
        continue
      }

      const nextExecuteAt = calculateNextExecuteAt(steps)

      const { data: newRun, error: runError } = await supabase
        .from('workflow_runs')
        .insert({
          org_id: payload.org_id,
          workflow_id: workflow.id,
          entity_type: payload.entity_type,
          entity_id: payload.entity_id,
          status: 'active',
          current_step: 1,
          next_execute_at: nextExecuteAt.toISOString(),
          metadata: {
            trigger_event: payload.event_type,
            old_data: payload.old_data,
            new_data: payload.new_data,
          },
        })
        .select('id')
        .single()

      if (runError) {
        console.error(`[workflow-trigger] Error creating run for workflow ${workflow.id}:`, runError)
        continue
      }

      console.log(`[workflow-trigger] Created run ${newRun.id} for workflow ${workflow.name}`)
      runsCreated.push(newRun.id)
    }

    // Handle time-based workflows for booking entities
    if (payload.entity_type === 'booking') {
      const bookingStatus = (payload.new_data?.status as string | undefined) || ''
      if (bookingStatus !== 'cancelled' && bookingStatus !== 'skipped') {
        const { data: timeWorkflows, error: timeError } = await supabase
          .from('workflows')
          .select(`
            id,
            name,
            trigger_type,
            trigger_config,
            steps:workflow_steps(id, step_order, action_type, action_config)
          `)
          .eq('org_id', payload.org_id)
          .eq('enabled', true)
          .eq('trigger_type', 'time_based')

        if (timeError) {
          console.error('[workflow-trigger] Error fetching time-based workflows:', timeError)
        } else {
          for (const workflow of timeWorkflows || []) {
            const steps = (workflow.steps as WorkflowStep[]) || []
            if (steps.length === 0) continue
            steps.sort((a, b) => a.step_order - b.step_order)

            const nextExecuteAt = calculateTimeBasedNextExecuteAt(
              workflow as unknown as Workflow,
              payload
            )

            if (!nextExecuteAt) continue

            const { data: existingRun } = await supabase
              .from('workflow_runs')
              .select('id')
              .eq('workflow_id', workflow.id)
              .eq('entity_id', payload.entity_id)
              .in('status', ['active', 'paused'])
              .maybeSingle()

            if (existingRun) {
              await supabase
                .from('workflow_runs')
                .update({
                  next_execute_at: nextExecuteAt.toISOString(),
                  metadata: {
                    trigger_event: payload.event_type,
                    old_data: payload.old_data,
                    new_data: payload.new_data,
                  },
                })
                .eq('id', existingRun.id)
              continue
            }

            const { data: newRun, error: runError } = await supabase
              .from('workflow_runs')
              .insert({
                org_id: payload.org_id,
                workflow_id: workflow.id,
                entity_type: payload.entity_type,
                entity_id: payload.entity_id,
                status: 'active',
                current_step: 1,
                next_execute_at: nextExecuteAt.toISOString(),
                metadata: {
                  trigger_event: payload.event_type,
                  old_data: payload.old_data,
                  new_data: payload.new_data,
                },
              })
              .select('id')
              .single()

            if (runError) {
              console.error(`[workflow-trigger] Error creating time-based run for workflow ${workflow.id}:`, runError)
              continue
            }

            runsCreated.push(newRun.id)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        workflows_matched: matchingWorkflows.length,
        runs_created: runsCreated.length,
        run_ids: runsCreated,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[workflow-trigger] Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
