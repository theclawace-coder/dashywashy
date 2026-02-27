SELECT org_id, provider, enabled,
       config->>'user_email' AS user_email,
       config->>'tenant_id' AS tenant_id,
       LEFT(config->>'client_id', 10) AS client_id_prefix,
       updated_at
FROM organization_integrations
WHERE provider = 'outlook'
ORDER BY updated_at DESC NULLS LAST;
