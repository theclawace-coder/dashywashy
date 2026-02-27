SELECT status, COUNT(*) AS count
FROM workflow_runs
WHERE org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
GROUP BY status
ORDER BY status;

SELECT id, workflow_id, status, last_error, created_at, started_at, completed_at, entity_type, entity_id
FROM workflow_runs
WHERE org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
ORDER BY created_at DESC
LIMIT 40;
