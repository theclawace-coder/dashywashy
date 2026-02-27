SELECT column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='dialpad_emails' AND column_name='org_id';
