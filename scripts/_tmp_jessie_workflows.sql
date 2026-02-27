SELECT w.id, w.org_id, w.system_key, w.name, w.enabled, w.trigger_type, w.trigger_config,
       COUNT(ws.id) AS step_count
FROM workflows w
LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
WHERE w.org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
GROUP BY w.id
ORDER BY w.created_at;
