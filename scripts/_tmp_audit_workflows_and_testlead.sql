SELECT id, name, business_name, use_workflow_automations, timezone, created_at
FROM organizations
ORDER BY created_at;

SELECT id, org_id, system_key, name, enabled, trigger_type, trigger_config, created_at, updated_at
FROM workflows
ORDER BY org_id, created_at;

SELECT workflow_id, step_order, action_type, action_config
FROM workflow_steps
ORDER BY workflow_id, step_order;

SELECT id, org_id, name, email, phone_number, status, created_at, updated_at
FROM extracted_leads
WHERE phone_number = '+61405092779' OR email = 'erfanau93@gmail.com'
ORDER BY updated_at DESC;
