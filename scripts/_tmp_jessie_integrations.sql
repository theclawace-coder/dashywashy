SELECT provider, enabled, created_at, updated_at,
       CASE WHEN config IS NULL THEN false ELSE true END AS has_config,
       (config ? 'api_key') AS has_api_key,
       (config ? 'user_id') AS has_user_id,
       (config ? 'access_token') AS has_access_token
FROM organization_integrations
WHERE org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
ORDER BY provider;
