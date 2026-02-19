SELECT last_error, COUNT(*) AS count
FROM workflow_runs
WHERE status = 'failed'
GROUP BY last_error
ORDER BY count DESC
LIMIT 20;