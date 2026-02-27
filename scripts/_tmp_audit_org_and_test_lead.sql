SELECT id, name, business_name, use_workflow_automations, timezone, created_at
FROM organizations
ORDER BY created_at;

SELECT org_id, automation_type, enabled, config
FROM organization_automation_settings
ORDER BY org_id, automation_type;

SELECT id, org_id, name, email, phone_number, status, created_at, updated_at
FROM extracted_leads
WHERE phone_number = '+61405092779' OR email = 'erfanau93@gmail.com'
ORDER BY updated_at DESC;
