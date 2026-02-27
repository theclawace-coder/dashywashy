SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('extracted_leads','quotes','booking_series','booking_occurrences','workflow_runs','workflow_steps')
ORDER BY table_name, ordinal_position;
