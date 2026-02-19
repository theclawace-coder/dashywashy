SELECT
  (SELECT COUNT(*) FROM organizations) AS total_orgs,
  (SELECT COUNT(*) FROM organizations WHERE use_workflow_automations = true) AS orgs_workflow_enabled,
  (SELECT COUNT(*) FROM workflows) AS total_workflows,
  (SELECT COUNT(*) FROM workflow_runs) AS total_workflow_runs,
  (SELECT COUNT(*) FROM workflow_templates) AS total_workflow_templates,
  (SELECT COUNT(*) FROM organization_automation_settings) AS total_automation_settings;
