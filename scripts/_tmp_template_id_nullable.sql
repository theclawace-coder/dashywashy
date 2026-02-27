SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('marketing_sms_logs','marketing_email_logs','payment_sms_logs','review_sms_logs')
  AND column_name='template_id'
ORDER BY table_name;
