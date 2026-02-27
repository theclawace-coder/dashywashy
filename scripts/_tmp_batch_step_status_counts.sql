SELECT status, COUNT(*) AS count
FROM workflow_step_logs
WHERE run_id IN (
  SELECT id FROM workflow_runs
  WHERE org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
    AND metadata->>'batch_id' = 'automation-audit-2026-02-26T12:59:57.162Z'
)
GROUP BY status
ORDER BY status;
