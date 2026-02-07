-- =====================================================
-- Organization Automation Settings
-- =====================================================

CREATE TABLE IF NOT EXISTS organization_automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, automation_type)
);

CREATE INDEX IF NOT EXISTS idx_org_automation_settings_org_id
  ON organization_automation_settings(org_id);

-- Keep updated_at current if the helper exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_org_automation_settings_updated_at ON organization_automation_settings;
    CREATE TRIGGER update_org_automation_settings_updated_at
      BEFORE UPDATE ON organization_automation_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RLS
ALTER TABLE organization_automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_automation_select" ON organization_automation_settings;
CREATE POLICY "org_automation_select" ON organization_automation_settings
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "org_automation_insert" ON organization_automation_settings;
CREATE POLICY "org_automation_insert" ON organization_automation_settings
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "org_automation_update" ON organization_automation_settings;
CREATE POLICY "org_automation_update" ON organization_automation_settings
  FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "org_automation_delete" ON organization_automation_settings;
CREATE POLICY "org_automation_delete" ON organization_automation_settings
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
