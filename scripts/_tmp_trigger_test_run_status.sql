SELECT id, workflow_id, status, current_step, next_execute_at, last_error, created_at
FROM workflow_runs
WHERE id IN ('369d4095-374a-4aaf-a826-3081223edec4','48e82eaa-55fb-4b3d-9aa1-a7ee2a40ff94')
ORDER BY created_at;
