SELECT w.id, w.name, w.enabled, w.trigger_type, w.trigger_config, COUNT(ws.id) AS steps
FROM workflows w
LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
WHERE w.org_id = '00000000-0000-0000-0000-000000000001'
  AND w.enabled = true
GROUP BY w.id, w.name, w.enabled, w.trigger_type, w.trigger_config
ORDER BY w.created_at;
