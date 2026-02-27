SELECT status, COUNT(*) AS count
FROM workflow_runs
WHERE org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
GROUP BY status
ORDER BY status;
