-- =====================================================
-- PLAN NORMALIZATION + NEW PRICING TIERS
-- Free / Growth / Unlimited
-- =====================================================

-- Drop old check constraint so we can update legacy values
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;

-- Map legacy plans to new tiers
UPDATE organizations
SET plan = CASE
  WHEN plan = 'starter' THEN 'growth'
  WHEN plan IN ('pro', 'enterprise') THEN 'unlimited'
  ELSE plan
END;

-- Re-add constraint with new tiers
ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('free', 'growth', 'unlimited'));