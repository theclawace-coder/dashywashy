SELECT last_error, COUNT(*) AS count
FROM workflow_runs
WHERE org_id = '00000000-0000-0000-0000-000000000001'
  AND metadata->>'batch_id' = 'automation-audit-2026-02-26T13:08:07.663Z'
GROUP BY last_error
ORDER BY count DESC;
