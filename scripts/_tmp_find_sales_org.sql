SELECT id, name, business_name, business_email, created_at
FROM organizations
WHERE lower(coalesce(business_email,'')) = lower('sales@sydneypremiumcleaning.com.au')
   OR lower(coalesce(name,'')) LIKE '%sydney premium cleaning%'
   OR lower(coalesce(business_name,'')) LIKE '%sydney premium cleaning%'
ORDER BY created_at DESC
LIMIT 20;

SELECT org_id, provider, enabled,
       (config ? 'user_email') AS has_user_email,
       config->>'user_email' AS user_email
FROM organization_integrations
WHERE lower(coalesce(config->>'user_email','')) = lower('sales@sydneypremiumcleaning.com.au')
ORDER BY org_id, provider;
