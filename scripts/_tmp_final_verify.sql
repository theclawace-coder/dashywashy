SELECT
  (SELECT COUNT(*) FROM organizations WHERE use_workflow_automations = true) AS orgs_workflow_enabled,
  (SELECT COUNT(*) FROM workflows WHERE system_key IS NOT NULL) AS workflows_with_system_key,
  (SELECT COUNT(*) FROM workflow_templates WHERE name LIKE 'Legacy Stock:%' AND is_global = true) AS legacy_stock_templates,
  (
    SELECT jsonb_object_agg(trigger_type, count)
    FROM (
      SELECT trigger_type, COUNT(*)::int AS count
      FROM workflows
      GROUP BY trigger_type
    ) t
  ) AS workflow_trigger_counts;