-- =====================================================
-- ADD org_id TO ALL EXISTING BUSINESS TABLES
-- Seeds a default organization and backfills org_id.
-- =====================================================

-- ---------- 1. Insert default organization ----------
INSERT INTO organizations (
  id, name, slug, business_name, business_abn,
  business_phone, business_email, business_operating_name,
  timezone, currency,
  default_client_hourly_rate, default_cleaner_hourly_rate,
  gst_rate, default_discount_pct, default_deposit_pct,
  plan, max_users, max_cleaners
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Sydney Premium Cleaning',
  'sydney-premium-cleaning',
  'Sydney Premium Cleaning Pty Ltd',
  NULL,
  '0426 413 984',
  'sales@sydneypremiumcleaning.com.au',
  'Sydney Premium Cleaning',
  'Australia/Sydney',
  'AUD',
  60.00,
  35.00,
  0.10,
  10.00,
  0.00,
  'pro',
  25,
  50
)
ON CONFLICT (id) DO NOTHING;

-- ---------- 2. Core tables: always exist ----------

-- extracted_leads
ALTER TABLE extracted_leads ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE extracted_leads SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE extracted_leads ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extracted_leads_org_id ON extracted_leads(org_id);

-- quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE quotes SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE quotes ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_org_id ON quotes(org_id);

-- booking_series
ALTER TABLE booking_series ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE booking_series SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE booking_series ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_series_org_id ON booking_series(org_id);

-- booking_occurrences
ALTER TABLE booking_occurrences ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE booking_occurrences SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE booking_occurrences ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_occurrences_org_id ON booking_occurrences(org_id);

-- cleaners
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE cleaners SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE cleaners ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cleaners_org_id ON cleaners(org_id);

-- cleaner_job_reviews
ALTER TABLE cleaner_job_reviews ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE cleaner_job_reviews SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE cleaner_job_reviews ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cleaner_job_reviews_org_id ON cleaner_job_reviews(org_id);

-- dialpad_calls
ALTER TABLE dialpad_calls ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE dialpad_calls SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE dialpad_calls ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dialpad_calls_org_id ON dialpad_calls(org_id);

-- dialpad_sms
ALTER TABLE dialpad_sms ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE dialpad_sms SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE dialpad_sms ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dialpad_sms_org_id ON dialpad_sms(org_id);

-- dialpad_emails
ALTER TABLE dialpad_emails ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE dialpad_emails SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE dialpad_emails ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dialpad_emails_org_id ON dialpad_emails(org_id);

-- payment_sms_templates
ALTER TABLE payment_sms_templates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE payment_sms_templates SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE payment_sms_templates ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_sms_templates_org_id ON payment_sms_templates(org_id);

-- payment_sms_logs
ALTER TABLE payment_sms_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE payment_sms_logs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE payment_sms_logs ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_sms_logs_org_id ON payment_sms_logs(org_id);

-- review_sms_templates
ALTER TABLE review_sms_templates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE review_sms_templates SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE review_sms_templates ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_sms_templates_org_id ON review_sms_templates(org_id);

-- review_sms_logs
ALTER TABLE review_sms_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE review_sms_logs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE review_sms_logs ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_sms_logs_org_id ON review_sms_logs(org_id);

-- marketing_email_templates
ALTER TABLE marketing_email_templates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE marketing_email_templates SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE marketing_email_templates ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_org_id ON marketing_email_templates(org_id);

-- marketing_email_journeys
ALTER TABLE marketing_email_journeys ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE marketing_email_journeys SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE marketing_email_journeys ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_email_journeys_org_id ON marketing_email_journeys(org_id);

-- marketing_email_logs
ALTER TABLE marketing_email_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE marketing_email_logs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE marketing_email_logs ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_email_logs_org_id ON marketing_email_logs(org_id);

-- todos
ALTER TABLE todos ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE todos SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE todos ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todos_org_id ON todos(org_id);

-- daily_summary_logs
ALTER TABLE daily_summary_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
UPDATE daily_summary_logs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE daily_summary_logs ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_summary_logs_org_id ON daily_summary_logs(org_id);

-- ---------- 3. Tables that may or may not exist ----------

-- booking_occurrence_completion_emails
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_completion_emails') THEN
    ALTER TABLE booking_occurrence_completion_emails ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE booking_occurrence_completion_emails SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE booking_occurrence_completion_emails ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_booking_occurrence_completion_emails_org_id ON booking_occurrence_completion_emails(org_id);
  END IF;
END $$;

-- booking_occurrence_reminders
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_reminders') THEN
    ALTER TABLE booking_occurrence_reminders ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE booking_occurrence_reminders SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE booking_occurrence_reminders ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_booking_occurrence_reminders_org_id ON booking_occurrence_reminders(org_id);
  END IF;
END $$;

-- booking_occurrence_receipt_emails
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_receipt_emails') THEN
    ALTER TABLE booking_occurrence_receipt_emails ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE booking_occurrence_receipt_emails SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE booking_occurrence_receipt_emails ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_booking_occurrence_receipt_emails_org_id ON booking_occurrence_receipt_emails(org_id);
  END IF;
END $$;

-- marketing_sms_templates
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_sms_templates') THEN
    ALTER TABLE marketing_sms_templates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE marketing_sms_templates SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE marketing_sms_templates ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_marketing_sms_templates_org_id ON marketing_sms_templates(org_id);
  END IF;
END $$;

-- marketing_sms_journeys
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_sms_journeys') THEN
    ALTER TABLE marketing_sms_journeys ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE marketing_sms_journeys SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE marketing_sms_journeys ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_marketing_sms_journeys_org_id ON marketing_sms_journeys(org_id);
  END IF;
END $$;

-- marketing_sms_logs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_sms_logs') THEN
    ALTER TABLE marketing_sms_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE marketing_sms_logs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE marketing_sms_logs ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_marketing_sms_logs_org_id ON marketing_sms_logs(org_id);
  END IF;
END $$;

-- cleaner_payouts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cleaner_payouts') THEN
    ALTER TABLE cleaner_payouts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE cleaner_payouts SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE cleaner_payouts ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_cleaner_payouts_org_id ON cleaner_payouts(org_id);
  END IF;
END $$;

-- webhook_logs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webhook_logs') THEN
    ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
    UPDATE webhook_logs SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    ALTER TABLE webhook_logs ALTER COLUMN org_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_webhook_logs_org_id ON webhook_logs(org_id);
  END IF;
END $$;
