-- =============================================================================
-- Visual Workflow Builder - Database Schema
-- =============================================================================
-- A no-code automation system for creating custom trigger->action workflows.
-- Multi-tenant via org_id with RLS policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Core Tables
-- -----------------------------------------------------------------------------

-- Workflows: The main automation definition
CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  trigger_type text NOT NULL CHECK (trigger_type IN ('lead_status_change', 'time_based', 'event_based')),
  trigger_config jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workflows_org_name_unique UNIQUE(org_id, name)
);

-- Workflow Steps: Individual actions in sequence
CREATE TABLE IF NOT EXISTS workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order > 0),
  action_type text NOT NULL CHECK (action_type IN ('send_sms', 'send_email', 'make_call', 'update_status', 'wait')),
  action_config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workflow_steps_order_unique UNIQUE(workflow_id, step_order)
);

-- Workflow Runs: Active executions tracking state
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('lead', 'booking', 'quote')),
  entity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'paused', 'failed')),
  current_step integer NOT NULL DEFAULT 1,
  next_execute_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  metadata jsonb DEFAULT '{}',
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workflow Step Logs: Audit trail for each step execution
CREATE TABLE IF NOT EXISTS workflow_step_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'executing', 'success', 'failed', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Workflow Templates: Pre-built templates users can clone
CREATE TABLE IF NOT EXISTS workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text CHECK (category IN ('marketing', 'reminders', 'notifications', 'follow_up')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('lead_status_change', 'time_based', 'event_based')),
  trigger_config jsonb NOT NULL DEFAULT '{}',
  steps jsonb NOT NULL DEFAULT '[]',
  is_global boolean DEFAULT false,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_workflows_org_id ON workflows(org_id);
CREATE INDEX IF NOT EXISTS idx_workflows_enabled ON workflows(org_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON workflows(org_id, trigger_type);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_order ON workflow_steps(workflow_id, step_order);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_org_id ON workflow_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(org_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_next_execute ON workflow_runs(next_execute_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_workflow_runs_entity ON workflow_runs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_step_logs_run_id ON workflow_step_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_step_logs_org_id ON workflow_step_logs(org_id);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_global ON workflow_templates(is_global) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_workflow_templates_org_id ON workflow_templates(org_id);

-- -----------------------------------------------------------------------------
-- 3. Updated At Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_workflow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflows_updated_at ON workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_updated_at();

DROP TRIGGER IF EXISTS workflow_steps_updated_at ON workflow_steps;
CREATE TRIGGER workflow_steps_updated_at
  BEFORE UPDATE ON workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_updated_at();

DROP TRIGGER IF EXISTS workflow_runs_updated_at ON workflow_runs;
CREATE TRIGGER workflow_runs_updated_at
  BEFORE UPDATE ON workflow_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_updated_at();

-- -----------------------------------------------------------------------------
-- 4. RLS Policies
-- -----------------------------------------------------------------------------

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;

-- Workflows policies
DROP POLICY IF EXISTS workflows_select ON workflows;
CREATE POLICY workflows_select ON workflows
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS workflows_insert ON workflows;
CREATE POLICY workflows_insert ON workflows
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS workflows_update ON workflows;
CREATE POLICY workflows_update ON workflows
  FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS workflows_delete ON workflows;
CREATE POLICY workflows_delete ON workflows
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

-- Workflow steps policies (inherit from workflow)
DROP POLICY IF EXISTS workflow_steps_select ON workflow_steps;
CREATE POLICY workflow_steps_select ON workflow_steps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND user_is_org_member(w.org_id))
  );

DROP POLICY IF EXISTS workflow_steps_insert ON workflow_steps;
CREATE POLICY workflow_steps_insert ON workflow_steps
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND user_has_org_role(w.org_id, ARRAY['owner','admin','manager']::org_role[]))
  );

DROP POLICY IF EXISTS workflow_steps_update ON workflow_steps;
CREATE POLICY workflow_steps_update ON workflow_steps
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND user_has_org_role(w.org_id, ARRAY['owner','admin','manager']::org_role[]))
  );

DROP POLICY IF EXISTS workflow_steps_delete ON workflow_steps;
CREATE POLICY workflow_steps_delete ON workflow_steps
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND user_has_org_role(w.org_id, ARRAY['owner','admin']::org_role[]))
  );

-- Workflow runs policies
DROP POLICY IF EXISTS workflow_runs_select ON workflow_runs;
CREATE POLICY workflow_runs_select ON workflow_runs
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS workflow_runs_insert ON workflow_runs;
CREATE POLICY workflow_runs_insert ON workflow_runs
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS workflow_runs_update ON workflow_runs;
CREATE POLICY workflow_runs_update ON workflow_runs
  FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS workflow_runs_delete ON workflow_runs;
CREATE POLICY workflow_runs_delete ON workflow_runs
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

-- Workflow step logs policies (read-only for members)
DROP POLICY IF EXISTS workflow_step_logs_select ON workflow_step_logs;
CREATE POLICY workflow_step_logs_select ON workflow_step_logs
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS workflow_step_logs_insert ON workflow_step_logs;
CREATE POLICY workflow_step_logs_insert ON workflow_step_logs
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- Workflow templates policies
DROP POLICY IF EXISTS workflow_templates_select ON workflow_templates;
CREATE POLICY workflow_templates_select ON workflow_templates
  FOR SELECT USING (is_global = true OR (org_id IS NOT NULL AND user_is_org_member(org_id)));

DROP POLICY IF EXISTS workflow_templates_insert ON workflow_templates;
CREATE POLICY workflow_templates_insert ON workflow_templates
  FOR INSERT WITH CHECK (org_id IS NOT NULL AND user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS workflow_templates_update ON workflow_templates;
CREATE POLICY workflow_templates_update ON workflow_templates
  FOR UPDATE USING (org_id IS NOT NULL AND user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS workflow_templates_delete ON workflow_templates;
CREATE POLICY workflow_templates_delete ON workflow_templates
  FOR DELETE USING (org_id IS NOT NULL AND user_has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

-- -----------------------------------------------------------------------------
-- 5. Seed Global Templates
-- -----------------------------------------------------------------------------

INSERT INTO workflow_templates (name, description, category, trigger_type, trigger_config, steps, is_global) VALUES
(
  'Quote Follow-up',
  'Automatically follow up with leads after sending a quote. Sends SMS immediately, waits 3 days, sends reminder, waits 7 days, sends email.',
  'follow_up',
  'lead_status_change',
  '{"to_status": ["Quote Sent"]}',
  '[
    {"action_type": "send_sms", "action_config": {"message": "Hi {{name}}, thanks for your interest! We''ve sent through your quote - let us know if you have any questions."}},
    {"action_type": "wait", "action_config": {"delay_value": 3, "delay_unit": "days"}},
    {"action_type": "send_sms", "action_config": {"message": "Hi {{name}}, just checking in - did you have a chance to review our quote? Happy to answer any questions!"}},
    {"action_type": "wait", "action_config": {"delay_value": 7, "delay_unit": "days"}},
    {"action_type": "send_email", "action_config": {"subject": "Your Quote from {{business_name}}", "body": "Hi {{name}},\n\nWe wanted to follow up on the quote we sent. If you have any questions or would like to proceed, please don''t hesitate to reach out.\n\nBest regards,\n{{business_name}}"}}
  ]'::jsonb,
  true
),
(
  'Booking Reminder',
  'Send SMS and email reminders 2 days before a scheduled booking.',
  'reminders',
  'time_based',
  '{"entity_type": "booking", "relative_to": "start_at", "offset_days": -2}',
  '[
    {"action_type": "send_sms", "action_config": {"message": "Hi {{name}}, just a reminder that your {{service}} is scheduled for {{booking_date}} at {{booking_time}}. See you then!"}},
    {"action_type": "send_email", "action_config": {"subject": "Reminder: Your booking on {{booking_date}}", "body": "Hi {{name}},\n\nThis is a friendly reminder that your {{service}} is scheduled for:\n\nDate: {{booking_date}}\nTime: {{booking_time}}\nAddress: {{address}}\n\nIf you need to reschedule, please contact us.\n\nBest regards,\n{{business_name}}"}}
  ]'::jsonb,
  true
),
(
  'New Lead Welcome',
  'Send a welcome SMS immediately when a new lead is created.',
  'notifications',
  'event_based',
  '{"event": "lead_created"}',
  '[
    {"action_type": "send_sms", "action_config": {"message": "Hi {{name}}, thanks for reaching out to {{business_name}}! We''ll be in touch shortly with a quote. Reply STOP to opt out."}}
  ]'::jsonb,
  true
),
(
  'Payment Reminder',
  'Send a payment reminder SMS 1 day after booking completion.',
  'follow_up',
  'event_based',
  '{"event": "booking_completed"}',
  '[
    {"action_type": "wait", "action_config": {"delay_value": 1, "delay_unit": "days"}},
    {"action_type": "send_sms", "action_config": {"message": "Hi {{name}}, we hope you''re happy with our service! You can complete your payment here: {{payment_link}}"}}
  ]'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Grant Service Role Access (for edge functions)
-- -----------------------------------------------------------------------------

GRANT ALL ON workflows TO service_role;
GRANT ALL ON workflow_steps TO service_role;
GRANT ALL ON workflow_runs TO service_role;
GRANT ALL ON workflow_step_logs TO service_role;
GRANT ALL ON workflow_templates TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Database Triggers for Workflow Events
-- -----------------------------------------------------------------------------

-- Function to notify workflow-trigger when lead status changes
CREATE OR REPLACE FUNCTION notify_workflow_on_lead_status_change()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
BEGIN
  -- Only trigger if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';

    -- If setting not available, try environment-style
    IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
      webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
    END IF;

    payload := jsonb_build_object(
      'event_type', 'lead_status_change',
      'org_id', NEW.org_id,
      'entity_type', 'lead',
      'entity_id', NEW.id,
      'old_data', jsonb_build_object('status', OLD.status),
      'new_data', jsonb_build_object('status', NEW.status, 'name', NEW.name, 'email', NEW.email, 'phone_number', NEW.phone_number)
    );

    -- Use pg_net to make async HTTP call (non-blocking)
    PERFORM net.http_post(
      url := webhook_url,
      body := payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on extracted_leads table
DROP TRIGGER IF EXISTS lead_status_change_workflow_trigger ON extracted_leads;
CREATE TRIGGER lead_status_change_workflow_trigger
  AFTER UPDATE ON extracted_leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_workflow_on_lead_status_change();

-- Function to notify workflow-trigger when lead is created
CREATE OR REPLACE FUNCTION notify_workflow_on_lead_created()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
BEGIN
  webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';

  IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
    webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
  END IF;

  payload := jsonb_build_object(
    'event_type', 'lead_created',
    'org_id', NEW.org_id,
    'entity_type', 'lead',
    'entity_id', NEW.id,
    'new_data', jsonb_build_object('status', NEW.status, 'name', NEW.name, 'email', NEW.email, 'phone_number', NEW.phone_number)
  );

  PERFORM net.http_post(
    url := webhook_url,
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on extracted_leads table for new leads
DROP TRIGGER IF EXISTS lead_created_workflow_trigger ON extracted_leads;
CREATE TRIGGER lead_created_workflow_trigger
  AFTER INSERT ON extracted_leads
  FOR EACH ROW
  EXECUTE FUNCTION notify_workflow_on_lead_created();
