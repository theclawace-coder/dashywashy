SELECT t.tgname, p.proname AS function_name, t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE c.relname = 'extracted_leads'
  AND NOT t.tgisinternal
ORDER BY t.tgname;