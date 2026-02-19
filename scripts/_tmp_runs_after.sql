SELECT id, workflow_id, status, created_at, metadata
FROM workflow_runs
WHERE entity_id = '65f47a0b-cb67-4bef-8032-f37a3d96e967'
ORDER BY created_at DESC
LIMIT 5;