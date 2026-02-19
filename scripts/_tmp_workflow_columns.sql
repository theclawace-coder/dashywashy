SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('organizations','workflows','workflow_runs','organization_automation_settings')
ORDER BY table_name, ordinal_position;
