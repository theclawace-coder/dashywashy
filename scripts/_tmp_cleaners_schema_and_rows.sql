SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='cleaners'
ORDER BY ordinal_position;

SELECT id, org_id, full_name, phone, email, active, created_at
FROM cleaners
WHERE org_id = 'be073b8b-0de8-4e54-9d2f-9ad4d222501c'
ORDER BY created_at DESC
LIMIT 10;
