-- =====================================================
-- MULTI-TENANT FOUNDATION
-- Organizations, memberships, invites, integrations,
-- user preferences, helper functions, and RLS policies.
-- =====================================================

-- ---------- org_role enum ----------
DO $$ BEGIN
  CREATE TYPE org_role AS ENUM ('owner','admin','manager','staff','cleaner');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- 1. ORGANIZATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  business_name text NOT NULL,
  business_abn text,
  business_phone text,
  business_email text,
  business_operating_name text,
  timezone text NOT NULL DEFAULT 'Australia/Sydney',
  currency text NOT NULL DEFAULT 'AUD',
  default_client_hourly_rate numeric(10,2) NOT NULL DEFAULT 60.00,
  default_cleaner_hourly_rate numeric(10,2) NOT NULL DEFAULT 35.00,
  gst_rate numeric(5,4) NOT NULL DEFAULT 0.10,
  default_discount_pct numeric(5,2) NOT NULL DEFAULT 10.00,
  default_deposit_pct numeric(5,2) NOT NULL DEFAULT 0.00,
  logo_url text,
  primary_color text DEFAULT '#14b8a6',
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise')),
  plan_expires_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  max_users int NOT NULL DEFAULT 5,
  max_cleaners int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan);

-- =====================================================
-- 2. ORGANIZATION MEMBERS
-- =====================================================
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'staff',
  display_name text,
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_role ON organization_members(role);

-- =====================================================
-- 3. ORGANIZATION INVITES
-- =====================================================
CREATE TABLE IF NOT EXISTS organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role org_role NOT NULL DEFAULT 'staff',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_organization_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_organization_invites_email ON organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_organization_invites_org_id ON organization_invites(org_id);

-- =====================================================
-- 4. ORGANIZATION INTEGRATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS organization_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_organization_integrations_org_id ON organization_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_organization_integrations_provider ON organization_integrations(provider);

-- =====================================================
-- 5. USER PREFERENCES
-- =====================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 6. TRIGGERS: updated_at
-- =====================================================
-- Reuse the existing update_updated_at_column() function from booking_tables migration.

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_members_updated_at ON organization_members;
CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_integrations_updated_at ON organization_integrations;
CREATE TRIGGER update_organization_integrations_updated_at
  BEFORE UPDATE ON organization_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. HELPER FUNCTIONS
-- =====================================================

-- 7a. current_user_org_id()
-- Returns the active org for the current user, falling back to first membership.
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  -- Try user_preferences first
  SELECT current_org_id INTO _org_id
  FROM user_preferences
  WHERE user_id = auth.uid();

  -- Validate the preference points to a real membership
  IF _org_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid() AND org_id = _org_id
    ) THEN
      _org_id := NULL;
    END IF;
  END IF;

  -- Fallback: first membership by join date
  IF _org_id IS NULL THEN
    SELECT org_id INTO _org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    ORDER BY joined_at ASC
    LIMIT 1;

    -- Persist the fallback so we don't repeat the lookup
    IF _org_id IS NOT NULL THEN
      INSERT INTO user_preferences (user_id, current_org_id)
      VALUES (auth.uid(), _org_id)
      ON CONFLICT (user_id) DO UPDATE SET current_org_id = EXCLUDED.current_org_id;
    END IF;
  END IF;

  RETURN _org_id;
END;
$$;

-- 7b. user_has_org_role(check_org_id, allowed_roles)
CREATE OR REPLACE FUNCTION user_has_org_role(check_org_id uuid, allowed_roles org_role[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
  );
END;
$$;

-- 7c. user_is_org_member(check_org_id)
CREATE OR REPLACE FUNCTION user_is_org_member(check_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
  );
END;
$$;

-- =====================================================
-- 8. RLS POLICIES
-- =====================================================

-- ---------- organizations ----------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select_member" ON organizations;
CREATE POLICY "org_select_member" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.org_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_insert_authenticated" ON organizations;
CREATE POLICY "org_insert_authenticated" ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "org_update_owner_admin" ON organizations;
CREATE POLICY "org_update_owner_admin" ON organizations
  FOR UPDATE USING (
    user_has_org_role(id, ARRAY['owner','admin']::org_role[])
  );

-- ---------- organization_members ----------
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgmem_select_co_members" ON organization_members;
CREATE POLICY "orgmem_select_co_members" ON organization_members
  FOR SELECT USING (
    user_is_org_member(org_id)
  );

DROP POLICY IF EXISTS "orgmem_insert_owner_admin" ON organization_members;
CREATE POLICY "orgmem_insert_owner_admin" ON organization_members
  FOR INSERT WITH CHECK (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
    OR user_id = auth.uid()  -- self-insert on invite accept
  );

DROP POLICY IF EXISTS "orgmem_update_owner_admin" ON organization_members;
CREATE POLICY "orgmem_update_owner_admin" ON organization_members
  FOR UPDATE USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
  );

DROP POLICY IF EXISTS "orgmem_delete_owner_admin_or_self" ON organization_members;
CREATE POLICY "orgmem_delete_owner_admin_or_self" ON organization_members
  FOR DELETE USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
    OR user_id = auth.uid()  -- self-leave
  );

-- ---------- organization_invites ----------
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orginv_select_admin_or_invitee" ON organization_invites;
CREATE POLICY "orginv_select_admin_or_invitee" ON organization_invites
  FOR SELECT USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "orginv_insert_owner_admin" ON organization_invites;
CREATE POLICY "orginv_insert_owner_admin" ON organization_invites
  FOR INSERT WITH CHECK (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
  );

DROP POLICY IF EXISTS "orginv_update_admin_or_invitee" ON organization_invites;
CREATE POLICY "orginv_update_admin_or_invitee" ON organization_invites
  FOR UPDATE USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "orginv_delete_owner_admin" ON organization_invites;
CREATE POLICY "orginv_delete_owner_admin" ON organization_invites
  FOR DELETE USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
  );

-- ---------- organization_integrations ----------
ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgint_select_owner_admin" ON organization_integrations;
CREATE POLICY "orgint_select_owner_admin" ON organization_integrations
  FOR SELECT USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
  );

DROP POLICY IF EXISTS "orgint_insert_owner_admin" ON organization_integrations;
CREATE POLICY "orgint_insert_owner_admin" ON organization_integrations
  FOR INSERT WITH CHECK (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
  );

DROP POLICY IF EXISTS "orgint_update_owner_admin" ON organization_integrations;
CREATE POLICY "orgint_update_owner_admin" ON organization_integrations
  FOR UPDATE USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
  );

DROP POLICY IF EXISTS "orgint_delete_owner_admin" ON organization_integrations;
CREATE POLICY "orgint_delete_owner_admin" ON organization_integrations
  FOR DELETE USING (
    user_has_org_role(org_id, ARRAY['owner','admin']::org_role[])
  );

-- ---------- user_preferences ----------
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "userpref_own_row" ON user_preferences;
CREATE POLICY "userpref_own_row" ON user_preferences
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 9. REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE organizations;
ALTER PUBLICATION supabase_realtime ADD TABLE organization_members;
