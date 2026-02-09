-- =====================================================
-- CLEANER INVITES (self-intake links)
-- =====================================================

CREATE TABLE IF NOT EXISTS cleaner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  token text NOT NULL UNIQUE,
  email text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_cleaner_id uuid REFERENCES cleaners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cleaner_invites_token ON cleaner_invites(token);
CREATE INDEX IF NOT EXISTS idx_cleaner_invites_org_id ON cleaner_invites(org_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_invites_used_at ON cleaner_invites(used_at);

ALTER TABLE cleaner_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cleaner_invites_select_admin" ON cleaner_invites;
CREATE POLICY "cleaner_invites_select_admin" ON cleaner_invites
  FOR SELECT USING (
    user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[])
  );

DROP POLICY IF EXISTS "cleaner_invites_insert_admin" ON cleaner_invites;
CREATE POLICY "cleaner_invites_insert_admin" ON cleaner_invites
  FOR INSERT WITH CHECK (
    user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[])
  );

DROP POLICY IF EXISTS "cleaner_invites_update_admin" ON cleaner_invites;
CREATE POLICY "cleaner_invites_update_admin" ON cleaner_invites
  FOR UPDATE USING (
    user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[])
  );

DROP POLICY IF EXISTS "cleaner_invites_delete_admin" ON cleaner_invites;
CREATE POLICY "cleaner_invites_delete_admin" ON cleaner_invites
  FOR DELETE USING (
    user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[])
  );
