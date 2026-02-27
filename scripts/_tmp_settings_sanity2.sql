SELECT 'organization_integrations' AS table_name, COUNT(*) AS rows, MAX(updated_at) AS max_updated_at
FROM organization_integrations WHERE org_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'workflows' AS table_name, COUNT(*) AS rows, MAX(updated_at) AS max_updated_at
FROM workflows WHERE org_id = '00000000-0000-0000-0000-000000000001';
