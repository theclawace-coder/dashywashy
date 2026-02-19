SELECT t.tgname, p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE c.relname = 'booking_occurrences'
  AND NOT t.tgisinternal
  AND t.tgname LIKE '%workflow%'
ORDER BY t.tgname;