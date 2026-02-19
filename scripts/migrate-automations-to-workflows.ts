import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const SMS_DELAYS = [3, 7, 14, 14, 30, 30]
const EMAIL_ABSOLUTE = [1, 5, 14, 32, 44, 79, 121]

function toEmailDelays() {
  const delays = []
  for (let i = 0; i < EMAIL_ABSOLUTE.length; i += 1) {
    if (i === 0) delays.push(EMAIL_ABSOLUTE[i])
    else delays.push(EMAIL_ABSOLUTE[i] - EMAIL_ABSOLUTE[i - 1])
  }
  return delays
}

function normalizeTemplatesByStep(rows, key) {
  const map = new Map()
  const sorted = [...rows].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
  for (const row of sorted) {
    if (!row.step) continue
    if (!map.has(row.step)) map.set(row.step, row[key])
  }
  return map
}

async function upsertWorkflow(orgId, payload, steps) {
  const { data: existing } = await supabase
    .from('workflows')
    .select('id')
    .eq('org_id', orgId)
    .eq('system_key', payload.system_key)
    .maybeSingle()

  let workflowId = existing?.id
  if (workflowId) {
    const { error } = await supabase
      .from('workflows')
      .update({
        name: payload.name,
        description: payload.description || null,
        enabled: payload.enabled,
        trigger_type: payload.trigger_type,
        trigger_config: payload.trigger_config,
      })
      .eq('id', workflowId)
    if (error) throw error

    await supabase.from('workflow_steps').delete().eq('workflow_id', workflowId)
  } else {
    const { data, error } = await supabase
      .from('workflows')
      .insert({
        org_id: orgId,
        name: payload.name,
        description: payload.description || null,
        enabled: payload.enabled,
        trigger_type: payload.trigger_type,
        trigger_config: payload.trigger_config,
        system_key: payload.system_key,
      })
      .select('id')
      .single()
    if (error) throw error
    workflowId = data.id
  }

  if (steps.length) {
    const stepsToInsert = steps.map((step, index) => ({
      workflow_id: workflowId,
      step_order: index + 1,
      action_type: step.action_type,
      action_config: step.action_config,
    }))
    const { error } = await supabase.from('workflow_steps').insert(stepsToInsert)
    if (error) throw error
  }

  return workflowId
}

async function migrateOrg(org) {
  const orgId = org.id
  console.log(`\nMigrating org ${org.name} (${orgId})`) 

  const { data: settingsRows } = await supabase
    .from('organization_automation_settings')
    .select('automation_type, enabled, config')
    .eq('org_id', orgId)

  const settings = new Map()
  ;(settingsRows || []).forEach((row) => {
    settings.set(row.automation_type, row)
  })

  const [smsTemplatesRes, emailTemplatesRes, paymentTemplatesRes, reviewTemplatesRes] = await Promise.all([
    supabase.from('marketing_sms_templates').select('step, body, is_default').eq('org_id', orgId),
    supabase.from('marketing_email_templates').select('step, subject, body, is_default').eq('org_id', orgId),
    supabase.from('payment_sms_templates').select('body, is_default, sort_order').eq('org_id', orgId),
    supabase.from('review_sms_templates').select('body, is_default, sort_order').eq('org_id', orgId),
  ])

  const smsTemplates = smsTemplatesRes.data || []
  const emailTemplates = emailTemplatesRes.data || []
  const paymentTemplates = paymentTemplatesRes.data || []
  const reviewTemplates = reviewTemplatesRes.data || []

  const smsByStep = normalizeTemplatesByStep(smsTemplates, 'body')
  const emailByStep = normalizeTemplatesByStep(emailTemplates, 'body')
  const emailSubjectByStep = normalizeTemplatesByStep(emailTemplates, 'subject')

  const paymentDefault = [...paymentTemplates].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))[0]
  const reviewDefault = [...reviewTemplates].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))[0]

  const smsSteps = []
  for (let i = 1; i <= 7; i += 1) {
    const body = smsByStep.get(i) || `Step ${i} SMS for {{lead_name}}`
    smsSteps.push({ action_type: 'send_sms', action_config: { message: body, recipient: 'lead' } })
    if (i < 7) {
      smsSteps.push({ action_type: 'wait', action_config: { delay_value: SMS_DELAYS[i - 1], delay_unit: 'days' } })
    }
  }

  const emailSteps = []
  const emailDelays = toEmailDelays()
  for (let i = 1; i <= 7; i += 1) {
    const subject = emailSubjectByStep.get(i) || `Follow up from {{business_name}}`
    const body = emailByStep.get(i) || `Hi {{lead_name}},\n\nThanks for getting in touch.`
    emailSteps.push({ action_type: 'wait', action_config: { delay_value: emailDelays[i - 1], delay_unit: 'days' } })
    emailSteps.push({ action_type: 'send_email', action_config: { subject, body, recipient: 'lead' } })
  }

  const bookingCompletion = settings.get('booking_completion')?.config || {}
  const bookingReminder = settings.get('booking_reminder')?.config || {}
  const dailySummary = settings.get('daily_summary')?.config || {}

  const workflows = [
    {
      system_key: 'marketing_sms',
      name: 'Marketing Loop SMS',
      description: '7-step SMS nurture journey for Marketing Loop leads.',
      enabled: settings.get('marketing_sms')?.enabled ?? true,
      trigger_type: 'lead_status_change',
      trigger_config: { to_status: ['Marketing Loop'], cancel_on_status_change: true },
      steps: smsSteps,
    },
    {
      system_key: 'marketing_email',
      name: 'Marketing Loop Email',
      description: '7-step email journey for Marketing Loop leads.',
      enabled: settings.get('marketing_email')?.enabled ?? true,
      trigger_type: 'lead_status_change',
      trigger_config: { to_status: ['Marketing Loop'], cancel_on_status_change: true },
      steps: emailSteps,
    },
    {
      system_key: 'quote_email',
      name: 'Quote Email',
      description: 'Send quote email when a lead moves to Quote Sent.',
      enabled: settings.get('quote_email')?.enabled ?? true,
      trigger_type: 'lead_status_change',
      trigger_config: { to_status: ['Quote Sent'] },
      steps: [
        {
          action_type: 'send_email',
          action_config: {
            subject: 'Your quote from {{business_name}}',
            body: 'Hi {{lead_name}},\n\nHere is your quote for {{quote_service}}.\nTotal: {{quote_total}}\nView it here: {{quote_share_link}}\n\nThanks,\n{{business_name}}',
            recipient: 'lead',
          },
        },
      ],
    },
    {
      system_key: 'booking_completion',
      name: 'Booking Completion Email',
      description: 'Send a completion email after a job is finished.',
      enabled: settings.get('booking_completion')?.enabled ?? true,
      trigger_type: 'event_based',
      trigger_config: { event: 'booking_completed' },
      steps: [
        {
          action_type: 'send_email',
          action_config: {
            subject: bookingCompletion.subject || 'Thanks for choosing {{business_name}}',
            body: bookingCompletion.body || 'Hi {{lead_name}},\n\nYour clean is complete. Thanks for choosing us!',
            recipient: 'lead',
          },
        },
      ],
    },
    {
      system_key: 'booking_reminder',
      name: 'Booking Reminder Email',
      description: 'Send reminders before scheduled bookings.',
      enabled: settings.get('booking_reminder')?.enabled ?? true,
      trigger_type: 'time_based',
      trigger_config: {
        relative_to: 'start_at',
        offset_value: -Math.abs(Number(bookingReminder.lead_hours || 24)),
        offset_unit: 'hours',
      },
      steps: [
        {
          action_type: 'send_email',
          action_config: {
            subject: bookingReminder.subject || 'Your clean is coming up',
            body: bookingReminder.body || 'Hi {{lead_name}},\n\nJust a reminder your clean is scheduled for {{booking_date}} at {{booking_time}}.',
            recipient: 'lead',
          },
        },
      ],
    },
    {
      system_key: 'payment_sms',
      name: 'Payment Reminder SMS',
      description: 'Text customers to complete payment after a job.',
      enabled: settings.get('payment_sms')?.enabled ?? true,
      trigger_type: 'event_based',
      trigger_config: { event: 'booking_completed' },
      steps: [
        { action_type: 'wait', action_config: { delay_value: 24, delay_unit: 'hours' } },
        {
          action_type: 'send_sms',
          action_config: {
            message: paymentDefault?.body || 'Hi {{lead_name}}, your payment of {{amount}} is due. {{payment_link}}',
            recipient: 'lead',
            only_if: { payment_status_not: 'paid' },
          },
        },
      ],
    },
    {
      system_key: 'review_sms',
      name: 'Review Request SMS',
      description: 'Request a review after a completed job.',
      enabled: settings.get('review_sms')?.enabled ?? true,
      trigger_type: 'manual',
      trigger_config: { entity_type: 'booking' },
      steps: [
        {
          action_type: 'send_sms',
          action_config: {
            message: reviewDefault?.body || 'Hi {{lead_name}}, we would love a review: {{review_link}}',
            recipient: 'lead',
          },
        },
      ],
    },
    {
      system_key: 'daily_summary',
      name: 'Daily Summary',
      description: 'Daily business summary email.',
      enabled: settings.get('daily_summary')?.enabled ?? true,
      trigger_type: 'scheduled',
      trigger_config: {
        time: '18:00',
        timezone: dailySummary.timezone || org.timezone || 'Australia/Sydney',
      },
      steps: [
        {
          action_type: 'send_email',
          action_config: {
            subject: 'Daily Summary ({{summary_date}})',
            body: 'Sales: {{summary_sales_total}}\nProjected profit: {{summary_projected_profit}}\nLeads: {{summary_leads_count}}\nQuotes: {{summary_quotes_count}}\nCleans today: {{summary_cleans_count}}\n\nSales detail:\n{{summary_sales_lines}}\n\nCleans:\n{{summary_clean_lines}}',
            recipient: 'org',
            to: dailySummary.recipient_email || undefined,
          },
        },
      ],
    },
    {
      system_key: 'cleaner_assignment_sms',
      name: 'Cleaner Assignment SMS',
      description: 'Notify cleaners when assigned to a job.',
      enabled: true,
      trigger_type: 'event_based',
      trigger_config: { event: 'cleaner_assigned' },
      steps: [
        {
          action_type: 'send_sms',
          action_config: {
            message: 'Hi {{cleaner_name}}, you are assigned to {{service_title}} on {{booking_date}} at {{booking_time}}. Address: {{booking_address}}. Contact: {{lead_name}} {{lead_phone}}.',
            recipient: 'cleaner',
          },
        },
      ],
    },
    {
      system_key: 'receipt_email',
      name: 'Receipt Email',
      description: 'Send receipt when payment is recorded.',
      enabled: true,
      trigger_type: 'event_based',
      trigger_config: { event: 'booking_paid' },
      steps: [
        {
          action_type: 'send_email',
          action_config: {
            subject: 'Receipt — {{business_name}}',
            body: 'Hi {{lead_name}},\n\nThanks for your payment of {{payment_amount}}. Receipt: {{receipt_number}}.\nService: {{service_title}} on {{booking_date}}.\n\n{{business_name}}',
            recipient: 'lead',
          },
        },
      ],
    },
  ]

  const workflowIds = {}
  for (const workflow of workflows) {
    const id = await upsertWorkflow(orgId, workflow, workflow.steps)
    workflowIds[workflow.system_key] = id
    console.log(`  • ${workflow.name}`)
  }

  const smsWorkflowId = workflowIds['marketing_sms']
  const emailWorkflowId = workflowIds['marketing_email']

  if (smsWorkflowId || emailWorkflowId) {
    const [smsJourneysRes, emailJourneysRes] = await Promise.all([
      smsWorkflowId
        ? supabase
            .from('marketing_sms_journeys')
            .select('id, lead_id, status, current_step, next_send_at, started_at')
            .eq('org_id', orgId)
            .in('status', ['active', 'paused'])
        : Promise.resolve({ data: [] }),
      emailWorkflowId
        ? supabase
            .from('marketing_email_journeys')
            .select('id, lead_id, status, current_step, next_send_at, started_at')
            .eq('org_id', orgId)
            .in('status', ['active', 'paused'])
        : Promise.resolve({ data: [] }),
    ])

    const smsJourneys = smsJourneysRes.data || []
    const emailJourneys = emailJourneysRes.data || []
    const nowIso = new Date().toISOString()

    for (const journey of smsJourneys) {
      const stepOrder = (journey.current_step - 1) * 2 + 1
      const { data: existing } = await supabase
        .from('workflow_runs')
        .select('id')
        .eq('workflow_id', smsWorkflowId)
        .eq('entity_id', journey.lead_id)
        .in('status', ['active', 'paused'])
        .maybeSingle()
      if (!existing) {
        await supabase.from('workflow_runs').insert({
          org_id: orgId,
          workflow_id: smsWorkflowId,
          entity_type: 'lead',
          entity_id: journey.lead_id,
          status: journey.status === 'paused' ? 'paused' : 'active',
          current_step: stepOrder,
          next_execute_at: journey.next_send_at || nowIso,
          started_at: journey.started_at || nowIso,
          metadata: {
            trigger_event: 'marketing_loop_migration',
            journey_id: journey.id,
            legacy_step: journey.current_step,
          },
        })
      }

      await supabase
        .from('marketing_sms_journeys')
        .update({ status: 'cancelled', cancelled_at: nowIso, last_error: 'migrated_to_workflows' })
        .eq('id', journey.id)
    }

    for (const journey of emailJourneys) {
      const stepOrder = journey.current_step * 2
      const { data: existing } = await supabase
        .from('workflow_runs')
        .select('id')
        .eq('workflow_id', emailWorkflowId)
        .eq('entity_id', journey.lead_id)
        .in('status', ['active', 'paused'])
        .maybeSingle()
      if (!existing) {
        await supabase.from('workflow_runs').insert({
          org_id: orgId,
          workflow_id: emailWorkflowId,
          entity_type: 'lead',
          entity_id: journey.lead_id,
          status: journey.status === 'paused' ? 'paused' : 'active',
          current_step: stepOrder,
          next_execute_at: journey.next_send_at || nowIso,
          started_at: journey.started_at || nowIso,
          metadata: {
            trigger_event: 'marketing_loop_migration',
            journey_id: journey.id,
            legacy_step: journey.current_step,
          },
        })
      }

      await supabase
        .from('marketing_email_journeys')
        .update({ status: 'cancelled', cancelled_at: nowIso, last_error: 'migrated_to_workflows' })
        .eq('id', journey.id)
    }
  }

  await supabase
    .from('organizations')
    .update({ use_workflow_automations: true })
    .eq('id', orgId)
}

async function main() {
  const { data: orgs, error } = await supabase.from('organizations').select('id, name, timezone')
  if (error) {
    console.error('Failed to load organizations:', error.message)
    process.exit(1)
  }

  for (const org of orgs || []) {
    try {
      await migrateOrg(org)
    } catch (err) {
      console.error('Migration failed for org', org.id, err)
    }
  }

  console.log('\nMigration complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

