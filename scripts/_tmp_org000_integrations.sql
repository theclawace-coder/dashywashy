SELECT id, name, business_name, business_email, use_workflow_automations
FROM organizations
WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT provider, enabled,
       (config ? 'api_key') AS has_api_key,
       (config ? 'user_id') AS has_user_id,
       (config ? 'access_token') AS has_access_token,
       (config ? 'user_email') AS has_user_email,
       config->>'user_email' AS user_email
FROM organization_integrations
WHERE org_id = '00000000-0000-0000-0000-000000000001'
ORDER BY provider;
