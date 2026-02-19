-- =====================================================
-- Workflow Automations Core Flags + System Keys
-- =====================================================

-- Per-org cutover flag for workflow automations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS use_workflow_automations boolean NOT NULL DEFAULT false;

-- System key for core workflows (marketing_sms, quote_email, etc.)
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS system_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_org_system_key
  ON workflows(org_id, system_key)
  WHERE system_key IS NOT NULL;

