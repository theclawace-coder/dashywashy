SELECT w.name AS workflow_name, w.system_key, w.trigger_type, ws.step_order, ws.action_type, ws.action_config
FROM workflows w
JOIN workflow_steps ws ON ws.workflow_id = w.id
WHERE w.org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
ORDER BY w.created_at, ws.step_order;
