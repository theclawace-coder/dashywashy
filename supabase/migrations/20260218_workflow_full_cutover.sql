-- =====================================================
-- Workflow Full Cutover + Legacy Stock Templates
-- =====================================================
-- Goals:
-- 1) Bring older databases up to date with workflow runtime expectations.
-- 2) Enable full trigger/entity support used by the new automation UI.
-- 3) Seed legacy automation presets as global stock templates.
-- =====================================================

-- Core columns for workflow cutover
ALTER TABLE IF EXISTS organizations
  ADD COLUMN IF NOT EXISTS use_workflow_automations boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS workflows
  ADD COLUMN IF NOT EXISTS system_key text;

-- Keep only one workflow per (org_id, system_key) to protect idempotent upserts
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, system_key
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM workflows
  WHERE system_key IS NOT NULL
)
UPDATE workflows w
SET system_key = NULL
FROM ranked r
WHERE w.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_org_system_key
  ON workflows(org_id, system_key)
  WHERE system_key IS NOT NULL;

-- Align trigger/entity constraints with runtime + UI
ALTER TABLE IF EXISTS workflows
  DROP CONSTRAINT IF EXISTS workflows_trigger_type_check;
ALTER TABLE workflows
  ADD CONSTRAINT workflows_trigger_type_check
  CHECK (trigger_type IN ('lead_status_change', 'time_based', 'event_based', 'manual', 'scheduled'));

ALTER TABLE IF EXISTS workflow_templates
  DROP CONSTRAINT IF EXISTS workflow_templates_trigger_type_check;
ALTER TABLE workflow_templates
  ADD CONSTRAINT workflow_templates_trigger_type_check
  CHECK (trigger_type IN ('lead_status_change', 'time_based', 'event_based', 'manual', 'scheduled'));

ALTER TABLE IF EXISTS workflow_runs
  DROP CONSTRAINT IF EXISTS workflow_runs_entity_type_check;
ALTER TABLE workflow_runs
  ADD CONSTRAINT workflow_runs_entity_type_check
  CHECK (entity_type IN ('lead', 'booking', 'quote', 'org'));

-- Helpful for scheduled run dedupe query in workflow-runner
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_scheduled_date
  ON workflow_runs(workflow_id, (metadata->>'scheduled_date'))
  WHERE metadata ? 'scheduled_date';

-- -----------------------------------------------------
-- Seed legacy automations as stock global templates
-- -----------------------------------------------------
WITH seed(name, description, category, trigger_type, trigger_config, steps) AS (
  VALUES
    (
      'Legacy Stock: Marketing Loop SMS',
      'Legacy 7-step SMS nurture journey for leads in Marketing Loop.',
      'marketing',
      'lead_status_change',
      '{"to_status":["Marketing Loop"],"cancel_on_status_change":true}'::jsonb,
      '[
        {"action_type":"send_sms","action_config":{"recipient":"lead","message":"Hi {{lead_name}}, thanks for reaching out to {{business_name}}."}},
        {"action_type":"wait","action_config":{"delay_value":3,"delay_unit":"days"}},
        {"action_type":"send_sms","action_config":{"recipient":"lead","message":"Hi {{lead_name}}, just checking in on your cleaning enquiry."}},
        {"action_type":"wait","action_config":{"delay_value":7,"delay_unit":"days"}},
        {"action_type":"send_sms","action_config":{"recipient":"lead","message":"We still have spots available this week if you would like a quote."}},
        {"action_type":"wait","action_config":{"delay_value":14,"delay_unit":"days"}},
        {"action_type":"send_sms","action_config":{"recipient":"lead","message":"Final follow up from {{business_name}}. Reply anytime if you would like to proceed."}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Marketing Loop Email',
      'Legacy 7-step email nurture journey for leads in Marketing Loop.',
      'marketing',
      'lead_status_change',
      '{"to_status":["Marketing Loop"],"cancel_on_status_change":true}'::jsonb,
      '[
        {"action_type":"wait","action_config":{"delay_value":1,"delay_unit":"days"}},
        {"action_type":"send_email","action_config":{"recipient":"lead","subject":"Thanks for reaching out","body":"Hi {{lead_name}}, thanks for contacting {{business_name}}."}},
        {"action_type":"wait","action_config":{"delay_value":4,"delay_unit":"days"}},
        {"action_type":"send_email","action_config":{"recipient":"lead","subject":"Checking in","body":"Just checking in on your quote request."}},
        {"action_type":"wait","action_config":{"delay_value":9,"delay_unit":"days"}},
        {"action_type":"send_email","action_config":{"recipient":"lead","subject":"Still interested?","body":"We can still help with your clean. Reply to this email to continue."}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Quote Email',
      'Send quote email when a lead moves to Quote Sent.',
      'follow_up',
      'lead_status_change',
      '{"to_status":["Quote Sent"]}'::jsonb,
      '[
        {"action_type":"send_email","action_config":{"recipient":"lead","subject":"Your quote from {{business_name}}","body":"Hi {{lead_name}}, here is your quote total {{quote_total}}. View it here: {{quote_share_link}}."}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Booking Completion Email',
      'Send completion email when booking is completed.',
      'notifications',
      'event_based',
      '{"event":"booking_completed"}'::jsonb,
      '[
        {"action_type":"send_email","action_config":{"recipient":"lead","subject":"Thanks for choosing {{business_name}}","body":"Hi {{lead_name}}, your clean is complete. Thank you for choosing us."}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Booking Reminder Email',
      'Send reminder before booking start time.',
      'reminders',
      'time_based',
      '{"relative_to":"start_at","offset_value":-24,"offset_unit":"hours"}'::jsonb,
      '[
        {"action_type":"send_email","action_config":{"recipient":"lead","subject":"Your clean is tomorrow","body":"Reminder: your booking is on {{booking_date}} at {{booking_time}}."}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Payment Reminder SMS',
      'Send payment reminder after booking completion when not paid.',
      'follow_up',
      'event_based',
      '{"event":"booking_completed"}'::jsonb,
      '[
        {"action_type":"wait","action_config":{"delay_value":24,"delay_unit":"hours"}},
        {"action_type":"send_sms","action_config":{"recipient":"lead","message":"Hi {{lead_name}}, your payment is due. {{payment_link}}","only_if":{"payment_status_not":"paid"}}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Review Request SMS',
      'Manual review request message after service.',
      'follow_up',
      'manual',
      '{"entity_type":"booking"}'::jsonb,
      '[
        {"action_type":"send_sms","action_config":{"recipient":"lead","message":"Hi {{lead_name}}, we would love your feedback: {{review_link}}"}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Daily Summary Email',
      'Daily business summary email.',
      'notifications',
      'scheduled',
      '{"time":"18:00","timezone":"Australia/Sydney"}'::jsonb,
      '[
        {"action_type":"send_email","action_config":{"recipient":"org","subject":"Daily Summary ({{summary_date}})","body":"Sales: {{summary_sales_total}}\nProjected profit: {{summary_projected_profit}}\nLeads: {{summary_leads_count}}\nQuotes: {{summary_quotes_count}}\nCleans: {{summary_cleans_count}}"}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Cleaner Assignment SMS',
      'Notify cleaner when assigned to a booking.',
      'notifications',
      'event_based',
      '{"event":"cleaner_assigned"}'::jsonb,
      '[
        {"action_type":"send_sms","action_config":{"recipient":"cleaner","message":"Hi {{cleaner_name}}, you are assigned to {{service_title}} on {{booking_date}} at {{booking_time}}."}}
      ]'::jsonb
    ),
    (
      'Legacy Stock: Receipt Email',
      'Send receipt email after payment recorded.',
      'notifications',
      'event_based',
      '{"event":"booking_paid"}'::jsonb,
      '[
        {"action_type":"send_email","action_config":{"recipient":"lead","subject":"Receipt from {{business_name}}","body":"Hi {{lead_name}}, thanks for your payment of {{payment_amount}}. Receipt number: {{receipt_number}}."}}
      ]'::jsonb
    )
)
INSERT INTO workflow_templates (
  name,
  description,
  category,
  trigger_type,
  trigger_config,
  steps,
  is_global
)
SELECT
  s.name,
  s.description,
  s.category,
  s.trigger_type,
  s.trigger_config,
  s.steps,
  true
FROM seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM workflow_templates wt
  WHERE wt.is_global = true
    AND wt.name = s.name
);
