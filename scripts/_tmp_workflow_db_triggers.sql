SELECT tgname AS trigger_name, c.relname AS table_name, tgenabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND tgname IN (
    'lead_status_change_workflow_trigger',
    'lead_created_workflow_trigger',
    'booking_created_workflow_trigger',
    'booking_completed_workflow_trigger',
    'booking_updated_workflow_trigger',
    'booking_cleaner_assigned_workflow_trigger',
    'booking_paid_workflow_trigger'
  )
ORDER BY table_name, trigger_name;
