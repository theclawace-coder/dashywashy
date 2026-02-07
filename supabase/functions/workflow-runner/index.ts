/**
 * workflow-runner - Scheduled function that processes due workflow runs.
 *
 * Called periodically (every 1-5 minutes) to:
 * 1. Fetch active workflow runs where next_execute_at <= now
 * 2. Lock and process each run
 * 3. Execute the current step's action
 * 4. Advance to next step or complete the run
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface WorkflowRun {
  id: string
  org_id: string
  workflow_id: string
  entity_type: string
  entity_id: string
  status: string
  current_step: number
  next_execute_at: string
  metadata: Record<string, unknown>
}

interface WorkflowStep {
  id: string
  step_order: number
  action_type: string
  action_config: Record<string, unknown>
}

interface Workflow {
  id: string
  name: string
  enabled: boolean
  steps: WorkflowStep[]
}

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone_number: string | null
  status: string | null
}

interface Organization {
  id: string
  name: string
  business_name: string | null
}

/**
 * Personalize a template string with entity and org data
 */
function personalize(
  template: string,
  lead: Lead | null,
  org: Organization | null
): string {
  const replacements: Record<string, string> = {
    '{{name}}': lead?.name || 'there',
    '{{first_name}}': (lead?.name || 'there').split(' ')[0],
    '{{email}}': lead?.email || '',
    '{{phone}}': lead?.phone_number || '',
    '{{business_name}}': org?.business_name || org?.name || '',
    // Booking placeholders would need booking data
    '{{booking_date}}': '[booking date]',
    '{{booking_time}}': '[booking time]',
    '{{quote_total}}': '[quote total]',
    '{{payment_link}}': '[payment link]',
  }

  let result = template
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value)
  }
  return result
}

/**
 * Calculate delay in milliseconds for a wait action
 */
function calculateDelayMs(config: Record<string, unknown>): number {
  const delayValue = (config.delay_value as number) || 0
  const delayUnit = (config.delay_unit as string) || 'days'

  switch (delayUnit) {
    case 'minutes':
      return delayValue * 60 * 1000
    case 'hours':
      return delayValue * 60 * 60 * 1000
    case 'days':
      return delayValue * 24 * 60 * 60 * 1000
    default:
      return delayValue * 24 * 60 * 60 * 1000
  }
}

/**
 * Execute a single action
 */
async function executeAction(
  supabase: SupabaseClient,
  actionType: string,
  actionConfig: Record<string, unknown>,
  lead: Lead | null,
  org: Organization | null,
  orgId: string
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  try {
    switch (actionType) {
      case 'send_sms': {
        const message = actionConfig.message as string
        if (!message) {
          return { success: false, error: 'No message configured' }
        }
        if (!lead?.phone_number) {
          return { success: false, error: 'Lead has no phone number' }
        }

        const personalizedMessage = personalize(message, lead, org)

        // Call the dialpad-send-sms function
        const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'X-Org-Id': orgId,
          },
          body: JSON.stringify({
            phone_number: lead.phone_number,
            message: personalizedMessage,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return { success: false, error: `SMS failed: ${errorText}` }
        }

        return { success: true, result: { message: personalizedMessage } }
      }

      case 'send_email': {
        const subject = actionConfig.subject as string
        const body = actionConfig.body as string
        if (!subject || !body) {
          return { success: false, error: 'No subject or body configured' }
        }
        if (!lead?.email) {
          return { success: false, error: 'Lead has no email' }
        }

        // For now, we'll use a generic email sending approach
        // In production, this would call the appropriate email function
        console.log(`[workflow-runner] Would send email to ${lead.email}:`, subject)

        return {
          success: true,
          result: {
            subject: personalize(subject, lead, org),
            to: lead.email,
          },
        }
      }

      case 'make_call': {
        if (!lead?.phone_number) {
          return { success: false, error: 'Lead has no phone number' }
        }

        // Call the dialpad-initiate-call function
        const response = await fetch(`${supabaseUrl}/functions/v1/dialpad-initiate-call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'X-Org-Id': orgId,
          },
          body: JSON.stringify({
            phone_number: lead.phone_number,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return { success: false, error: `Call failed: ${errorText}` }
        }

        return { success: true, result: { phone: lead.phone_number } }
      }

      case 'update_status': {
        const newStatus = actionConfig.new_status as string
        if (!newStatus) {
          return { success: false, error: 'No new status configured' }
        }
        if (!lead) {
          return { success: false, error: 'No lead found' }
        }

        const { error: updateError } = await supabase
          .from('extracted_leads')
          .update({ status: newStatus })
          .eq('id', lead.id)

        if (updateError) {
          return { success: false, error: `Status update failed: ${updateError.message}` }
        }

        return { success: true, result: { new_status: newStatus } }
      }

      case 'wait': {
        // Wait actions don't actually "execute" - they just delay the next step
        return { success: true, result: { waited: true } }
      }

      default:
        return { success: false, error: `Unknown action type: ${actionType}` }
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/**
 * Process a single workflow run
 */
async function processRun(
  supabase: SupabaseClient,
  run: WorkflowRun,
  workflow: Workflow,
  runnerId: string
): Promise<{ success: boolean; completed: boolean; error?: string }> {
  const steps = workflow.steps.sort((a, b) => a.step_order - b.step_order)
  const currentStepIndex = run.current_step - 1

  if (currentStepIndex >= steps.length) {
    // All steps completed
    await supabase
      .from('workflow_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq('id', run.id)

    return { success: true, completed: true }
  }

  const currentStep = steps[currentStepIndex]

  // Get lead data
  let lead: Lead | null = null
  if (run.entity_type === 'lead') {
    const { data } = await supabase
      .from('extracted_leads')
      .select('id, name, email, phone_number, status')
      .eq('id', run.entity_id)
      .single()
    lead = data
  }

  // Get org data
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, business_name')
    .eq('id', run.org_id)
    .single()

  // Execute the action
  const result = await executeAction(
    supabase,
    currentStep.action_type,
    currentStep.action_config,
    lead,
    org,
    run.org_id
  )

  // Log the step execution
  await supabase.from('workflow_step_logs').insert({
    org_id: run.org_id,
    run_id: run.id,
    step_id: currentStep.id,
    step_order: currentStep.step_order,
    action_type: currentStep.action_type,
    status: result.success ? 'success' : 'failed',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    result: result.result ? result.result : null,
    error: result.error || null,
  })

  if (!result.success) {
    // Mark run as failed
    await supabase
      .from('workflow_runs')
      .update({
        status: 'failed',
        last_error: result.error,
        locked_at: null,
        locked_by: null,
      })
      .eq('id', run.id)

    return { success: false, completed: false, error: result.error }
  }

  // Advance to next step
  const nextStepIndex = currentStepIndex + 1

  if (nextStepIndex >= steps.length) {
    // All steps completed
    await supabase
      .from('workflow_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_step: run.current_step + 1,
        locked_at: null,
        locked_by: null,
      })
      .eq('id', run.id)

    return { success: true, completed: true }
  }

  // Calculate next execution time based on next step
  const nextStep = steps[nextStepIndex]
  let nextExecuteAt = new Date()

  if (nextStep.action_type === 'wait') {
    const delayMs = calculateDelayMs(nextStep.action_config)
    nextExecuteAt = new Date(Date.now() + delayMs)
  }

  // Update run to next step
  await supabase
    .from('workflow_runs')
    .update({
      current_step: run.current_step + 1,
      next_execute_at: nextExecuteAt.toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', run.id)

  return { success: true, completed: false }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const runnerId = `runner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.log(`[workflow-runner] Starting run ${runnerId}`)

  try {
    // Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date().toISOString()

    // Fetch due workflow runs that aren't locked
    const { data: dueRuns, error: fetchError } = await supabase
      .from('workflow_runs')
      .select(`
        id,
        org_id,
        workflow_id,
        entity_type,
        entity_id,
        status,
        current_step,
        next_execute_at,
        metadata
      `)
      .eq('status', 'active')
      .lte('next_execute_at', now)
      .is('locked_at', null)
      .limit(50)

    if (fetchError) {
      console.error('[workflow-runner] Error fetching runs:', fetchError)
      throw fetchError
    }

    console.log(`[workflow-runner] Found ${dueRuns?.length || 0} due runs`)

    if (!dueRuns || dueRuns.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, completed: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let processed = 0
    let completed = 0
    let failed = 0

    for (const run of dueRuns) {
      // Try to lock the run
      const lockTime = new Date().toISOString()
      const { data: lockedRun, error: lockError } = await supabase
        .from('workflow_runs')
        .update({
          locked_at: lockTime,
          locked_by: runnerId,
        })
        .eq('id', run.id)
        .is('locked_at', null)
        .select()
        .single()

      if (lockError || !lockedRun) {
        console.log(`[workflow-runner] Failed to lock run ${run.id} - already locked`)
        continue
      }

      // Fetch the workflow with steps
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select(`
          id,
          name,
          enabled,
          steps:workflow_steps(id, step_order, action_type, action_config)
        `)
        .eq('id', run.workflow_id)
        .single()

      if (workflowError || !workflow) {
        console.error(`[workflow-runner] Workflow not found for run ${run.id}`)
        await supabase
          .from('workflow_runs')
          .update({
            status: 'failed',
            last_error: 'Workflow not found',
            locked_at: null,
            locked_by: null,
          })
          .eq('id', run.id)
        failed++
        continue
      }

      if (!workflow.enabled) {
        console.log(`[workflow-runner] Workflow ${workflow.id} is disabled, cancelling run`)
        await supabase
          .from('workflow_runs')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
          })
          .eq('id', run.id)
        continue
      }

      // Process the run
      const result = await processRun(
        supabase,
        run as WorkflowRun,
        workflow as unknown as Workflow,
        runnerId
      )

      processed++
      if (result.completed) {
        completed++
      } else if (!result.success) {
        failed++
      }
    }

    console.log(`[workflow-runner] Finished: processed=${processed}, completed=${completed}, failed=${failed}`)

    return new Response(
      JSON.stringify({ success: true, processed, completed, failed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[workflow-runner] Error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
