SELECT 'workflows' AS table_name, trigger_type AS value, COUNT(*) AS count
FROM workflows
GROUP BY trigger_type
UNION ALL
SELECT 'workflow_runs' AS table_name, entity_type AS value, COUNT(*) AS count
FROM workflow_runs
GROUP BY entity_type
ORDER BY table_name, value;
