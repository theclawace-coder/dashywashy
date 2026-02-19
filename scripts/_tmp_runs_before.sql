SELECT COUNT(*) AS runs_before
FROM workflow_runs
WHERE entity_id = '65f47a0b-cb67-4bef-8032-f37a3d96e967'
  AND metadata->>'trigger_event' = 'lead_status_change';