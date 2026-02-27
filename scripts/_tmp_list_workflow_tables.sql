SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema')
  AND (
    table_name LIKE '%workflow%'
    OR table_name LIKE '%automation%'
    OR table_name LIKE '%marketing%'
    OR table_name LIKE '%booking_occurrence%'
    OR table_name IN ('organizations','extracted_leads','workflow_runs','workflow_steps','workflows')
  )
ORDER BY table_schema, table_name;
