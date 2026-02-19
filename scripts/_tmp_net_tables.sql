SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname IN ('net','pg_net')
ORDER BY schemaname, tablename;