-- =====================================================
-- Force unlimited plan for Sydney Premium Cleaning owner account
-- =====================================================

UPDATE organizations
SET plan = 'unlimited'
WHERE business_email = 'sales@sydneypremiumcleaning.com.au';

UPDATE organizations
SET plan = 'unlimited'
WHERE id IN (
  SELECT om.org_id
  FROM organization_members om
  JOIN auth.users u ON u.id = om.user_id
  WHERE u.email = 'sales@sydneypremiumcleaning.com.au'
    AND om.role = 'owner'
);