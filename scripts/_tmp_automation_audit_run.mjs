import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const envPath = path.join(ROOT, '.env')
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    process.env[m[1].trim()] = m[2].trim().replace(/^['\"]|['\"]$/g, '')
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const ORG_ID = process.env.AUDIT_ORG_ID || process.argv[2] || 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
const TEST_PHONE = process.env.AUDIT_TEST_PHONE || process.argv[3] || '+61405092779'
const TEST_EMAIL = process.env.AUDIT_TEST_EMAIL || process.argv[4] || 'erfanau93@gmail.com'
const TEST_LEAD_NAME = process.env.AUDIT_TEST_LEAD_NAME || 'Automation Test Lead'
const TEST_CLEANER_PHONE = process.env.AUDIT_TEST_CLEANER_PHONE || TEST_PHONE
const batchId = `automation-audit-${new Date().toISOString()}`

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function nowIso() {
  return new Date().toISOString()
}

async function invokeFunction(fn, payload = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  return { ok: res.ok, status: res.status, data: json }
}

async function ensureLead() {
  const { data: existingByPhone, error: phoneErr } = await supabase
    .from('extracted_leads')
    .select('id, status')
    .eq('org_id', ORG_ID)
    .eq('phone_number', TEST_PHONE)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (phoneErr) throw phoneErr

  if (existingByPhone?.id) {
    const { error } = await supabase
      .from('extracted_leads')
      .update({
        name: TEST_LEAD_NAME,
        email: TEST_EMAIL,
        phone_number: TEST_PHONE,
        status: 'Unanswered',
        region_notes: `Automation audit ${batchId}`,
      })
      .eq('id', existingByPhone.id)
    if (error) throw error
    return existingByPhone.id
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('extracted_leads')
    .insert({
      org_id: ORG_ID,
      name: TEST_LEAD_NAME,
      email: TEST_EMAIL,
      phone_number: TEST_PHONE,
      status: 'Unanswered',
      region_notes: `Automation audit ${batchId}`,
    })
    .select('id')
    .single()
  if (insertErr) throw insertErr

  return inserted.id
}

async function ensureQuote(leadId) {
  const { data: existing, error } = await supabase
    .from('quotes')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (existing?.id) return existing.id

  const quoteNumber = `TEST-${Date.now()}`
  const { data: inserted, error: insErr } = await supabase
    .from('quotes')
    .insert({
      org_id: ORG_ID,
      lead_id: leadId,
      customer_name: TEST_LEAD_NAME,
      customer_email: TEST_EMAIL,
      customer_phone: TEST_PHONE,
      quote_number: quoteNumber,
      share_token: `share-${Date.now()}`,
      service: 'General Clean',
      address: '123 Test St, Sydney',
      subtotal: 200,
      discount_amount: 0,
      gst: 20,
      total_inc_gst: 220,
      cleaner_pay: 120,
      remaining_balance: 220,
      quote_scope: 'series_base',
    })
    .select('id')
    .single()
  if (insErr) throw insErr
  return inserted.id
}

async function ensureCleaner() {
  const { data: existing, error } = await supabase
    .from('cleaners')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('full_name', 'Automation Test Cleaner')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (existing?.id) return existing.id

  const { data: inserted, error: insErr } = await supabase
    .from('cleaners')
    .insert({
      org_id: ORG_ID,
      full_name: 'Automation Test Cleaner',
      phone: TEST_CLEANER_PHONE,
      email: TEST_EMAIL,
      rates: { hourly: 45 },
      availability: {},
      active: true,
    })
    .select('id')
    .single()
  if (insErr) throw insErr
  return inserted.id
}

async function createBooking(leadId, quoteId, cleanerId) {
  const start = new Date(Date.now() + 23 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)

  const { data: series, error: seriesErr } = await supabase
    .from('booking_series')
    .insert({
      org_id: ORG_ID,
      lead_id: leadId,
      quote_id: quoteId,
      title: 'Automation Audit Booking',
      timezone: 'Australia/Sydney',
      starts_at: start.toISOString(),
      duration_minutes: 120,
      status: 'active',
      service_address: '123 Test St, Sydney',
      notes: batchId,
    })
    .select('id')
    .single()
  if (seriesErr) throw seriesErr

  const { data: occurrence, error: occErr } = await supabase
    .from('booking_occurrences')
    .insert({
      org_id: ORG_ID,
      series_id: series.id,
      quote_id: quoteId,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: 'completed',
      notes: batchId,
      payment_status: 'waiting_payment',
      payment_link: 'https://example.com/pay/automation-test',
      payment_amount_cents: 22000,
      cleaner_id: cleanerId,
    })
    .select('id')
    .single()
  if (occErr) throw occErr

  return occurrence.id
}

async function loadWorkflows() {
  const { data, error } = await supabase
    .from('workflows')
    .select('id, name, system_key, enabled, trigger_type, trigger_config, steps:workflow_steps(id, step_order, action_type, action_config)')
    .eq('org_id', ORG_ID)
    .eq('enabled', true)
  if (error) throw error
  return (data || []).map((w) => ({
    ...w,
    steps: (w.steps || []).slice().sort((a, b) => a.step_order - b.step_order),
  }))
}

function chooseStartStep(workflow) {
  const steps = workflow.steps || []
  if (!steps.length) return 1
  const firstNonWait = steps.find((s) => s.action_type !== 'wait')
  return firstNonWait ? firstNonWait.step_order : 1
}

function chooseEntity(workflow, leadId, bookingId) {
  if (workflow.trigger_type === 'scheduled') {
    return { entity_type: 'org', entity_id: ORG_ID }
  }

  if (workflow.trigger_type === 'manual') {
    const entity = workflow.trigger_config?.entity_type || 'lead'
    if (entity === 'booking') return { entity_type: 'booking', entity_id: bookingId }
    return { entity_type: 'lead', entity_id: leadId }
  }

  if (workflow.trigger_type === 'event_based' || workflow.trigger_type === 'time_based') {
    return { entity_type: 'booking', entity_id: bookingId }
  }

  return { entity_type: 'lead', entity_id: leadId }
}

async function queueRuns(workflows, leadId, bookingId) {
  const queued = []

  for (const workflow of workflows) {
    const steps = workflow.steps || []
    if (!steps.length) {
      queued.push({ workflow, skipped: true, reason: 'no_steps' })
      continue
    }

    const { entity_type, entity_id } = chooseEntity(workflow, leadId, bookingId)
    const startStep = chooseStartStep(workflow)

    const { error: cancelErr } = await supabase
      .from('workflow_runs')
      .update({ status: 'cancelled', cancelled_at: nowIso(), last_error: 'cancelled_for_manual_test' })
      .eq('workflow_id', workflow.id)
      .eq('entity_id', entity_id)
      .in('status', ['active', 'paused'])
    if (cancelErr) throw cancelErr

    const { data: inserted, error: insErr } = await supabase
      .from('workflow_runs')
      .insert({
        org_id: ORG_ID,
        workflow_id: workflow.id,
        entity_type,
        entity_id,
        status: 'active',
        current_step: startStep,
        next_execute_at: nowIso(),
        metadata: {
          trigger_event: 'manual_automation_audit',
          batch_id: batchId,
          forced_start_step: startStep,
        },
      })
      .select('id, workflow_id, current_step')
      .single()
    if (insErr) throw insErr

    queued.push({ workflow, run: inserted, entity_type, entity_id, startStep })
  }

  return queued
}

async function runRunnerUntilIdle(maxPasses = 8) {
  const passes = []
  for (let i = 0; i < maxPasses; i += 1) {
    const result = await invokeFunction('workflow-runner', {})
    passes.push(result)

    const processed = result?.data?.processed ?? 0
    if (!result.ok || processed === 0) break

    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  return passes
}

async function fetchRunResults() {
  const { data: runs, error: runsErr } = await supabase
    .from('workflow_runs')
    .select('id, workflow_id, status, current_step, last_error, created_at, completed_at, metadata')
    .eq('org_id', ORG_ID)
    .eq('metadata->>batch_id', batchId)
    .order('created_at', { ascending: true })
  if (runsErr) throw runsErr

  const runIds = (runs || []).map((r) => r.id)
  let logs = []
  if (runIds.length > 0) {
    const { data: stepLogs, error: logsErr } = await supabase
      .from('workflow_step_logs')
      .select('run_id, step_order, action_type, status, error, result, started_at')
      .in('run_id', runIds)
      .order('started_at', { ascending: true })
    if (logsErr) throw logsErr
    logs = stepLogs || []
  }

  return { runs: runs || [], logs }
}

async function main() {
  console.log(`Batch: ${batchId}`)

  const leadId = await ensureLead()
  const quoteId = await ensureQuote(leadId)
  const cleanerId = await ensureCleaner()
  const bookingId = await createBooking(leadId, quoteId, cleanerId)

  console.log('Test entities ready:', { leadId, quoteId, cleanerId, bookingId })

  const workflows = await loadWorkflows()
  console.log(`Enabled workflows found: ${workflows.length}`)

  const queued = await queueRuns(workflows, leadId, bookingId)
  console.log(`Queued runs: ${queued.filter((q) => !q.skipped).length}`)

  const runnerPasses = await runRunnerUntilIdle()
  console.log('Runner passes:')
  for (const [idx, pass] of runnerPasses.entries()) {
    console.log(`  Pass ${idx + 1}:`, JSON.stringify(pass.data))
  }

  const { runs, logs } = await fetchRunResults()

  const workflowMap = new Map(workflows.map((w) => [w.id, w]))
  const logsByRun = logs.reduce((acc, log) => {
    if (!acc[log.run_id]) acc[log.run_id] = []
    acc[log.run_id].push(log)
    return acc
  }, {})

  const summary = runs.map((run) => ({
    workflow: workflowMap.get(run.workflow_id)?.name || run.workflow_id,
    system_key: workflowMap.get(run.workflow_id)?.system_key || null,
    run_id: run.id,
    status: run.status,
    current_step: run.current_step,
    last_error: run.last_error,
    step_logs: logsByRun[run.id] || [],
  }))

  const outPath = path.join(ROOT, 'scripts', `_tmp_automation_audit_result_${Date.now()}.json`)
  fs.writeFileSync(outPath, JSON.stringify({
    batch_id: batchId,
    org_id: ORG_ID,
    lead_id: leadId,
    quote_id: quoteId,
    cleaner_id: cleanerId,
    booking_id: bookingId,
    runner_passes: runnerPasses,
    summary,
  }, null, 2))

  console.log(`Result file: ${outPath}`)

  for (const item of summary) {
    const lastStep = item.step_logs[item.step_logs.length - 1]
    console.log(`- ${item.workflow} [${item.system_key || 'custom'}]: ${item.status}`)
    if (item.last_error) console.log(`    run_error: ${item.last_error}`)
    if (lastStep) {
      console.log(`    last_step: #${lastStep.step_order} ${lastStep.action_type} -> ${lastStep.status}`)
      if (lastStep.error) console.log(`    step_error: ${lastStep.error}`)
    }
  }
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
