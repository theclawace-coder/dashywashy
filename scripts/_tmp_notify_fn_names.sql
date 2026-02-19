SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname LIKE 'notify_workflow_on_%'
ORDER BY proname;