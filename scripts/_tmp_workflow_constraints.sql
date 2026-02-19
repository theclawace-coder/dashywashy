SELECT
  t.relname AS table_name,
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN ('workflows','workflow_runs','workflow_templates')
  AND c.contype = 'c'
ORDER BY t.relname, c.conname;
