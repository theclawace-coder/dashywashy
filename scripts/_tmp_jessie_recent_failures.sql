SELECT last_error, COUNT(*) AS count
FROM workflow_runs
WHERE org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
  AND status = 'failed'
  AND created_at >= NOW() - interval '2 hours'
GROUP BY last_error
ORDER BY count DESC;
