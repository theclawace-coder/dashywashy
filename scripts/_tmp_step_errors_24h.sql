SELECT status, action_type, error, COUNT(*) AS count
FROM workflow_step_logs
WHERE started_at >= NOW() - interval '24 hours'
GROUP BY status, action_type, error
ORDER BY count DESC
LIMIT 20;
