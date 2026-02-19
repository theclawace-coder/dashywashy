SELECT c.relname, c.relkind, c.relispartition
FROM pg_class c
WHERE c.relname IN ('extracted_leads','booking_occurrences');