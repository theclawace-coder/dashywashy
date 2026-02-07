-- =====================================================
-- ORG-SCOPED RLS POLICIES
-- Drops all legacy "Allow all" policies and replaces
-- them with org-scoped membership checks.
-- =====================================================

-- =====================================================
-- 1. DROP ALL LEGACY "Allow all" POLICIES
-- =====================================================

-- booking_series
DROP POLICY IF EXISTS "Allow all for booking_series" ON booking_series;

-- booking_occurrences
DROP POLICY IF EXISTS "Allow all for booking_occurrences" ON booking_occurrences;

-- cleaners
DROP POLICY IF EXISTS "Allow all for cleaners" ON cleaners;

-- cleaner_job_reviews
DROP POLICY IF EXISTS "Allow all for cleaner_job_reviews" ON cleaner_job_reviews;

-- payment_sms_templates
DROP POLICY IF EXISTS "Allow all for payment_sms_templates" ON payment_sms_templates;

-- payment_sms_logs
DROP POLICY IF EXISTS "Allow all for payment_sms_logs" ON payment_sms_logs;

-- review_sms_templates
DROP POLICY IF EXISTS "Allow all for review_sms_templates" ON review_sms_templates;

-- review_sms_logs
DROP POLICY IF EXISTS "Allow all for review_sms_logs" ON review_sms_logs;

-- marketing_email_templates
DROP POLICY IF EXISTS "Allow all for marketing_email_templates" ON marketing_email_templates;

-- marketing_email_journeys
DROP POLICY IF EXISTS "Allow all for marketing_email_journeys" ON marketing_email_journeys;

-- marketing_email_logs
DROP POLICY IF EXISTS "Allow all for marketing_email_logs" ON marketing_email_logs;

-- todos
DROP POLICY IF EXISTS "Allow all for todos" ON todos;

-- =====================================================
-- 2. ENABLE RLS ON TABLES THAT MAY NOT HAVE IT
-- =====================================================
ALTER TABLE extracted_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialpad_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialpad_sms ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialpad_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_completion_emails') THEN
    ALTER TABLE booking_occurrence_completion_emails ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_reminders') THEN
    ALTER TABLE booking_occurrence_reminders ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_receipt_emails') THEN
    ALTER TABLE booking_occurrence_receipt_emails ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- =====================================================
-- 3. STANDARD BUSINESS TABLES: org-scoped policies
--    SELECT/INSERT/UPDATE = member, DELETE = owner/admin/manager
-- =====================================================

-- ---------- extracted_leads ----------
DROP POLICY IF EXISTS "extracted_leads_select" ON extracted_leads;
CREATE POLICY "extracted_leads_select" ON extracted_leads
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "extracted_leads_insert" ON extracted_leads;
CREATE POLICY "extracted_leads_insert" ON extracted_leads
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "extracted_leads_update" ON extracted_leads;
CREATE POLICY "extracted_leads_update" ON extracted_leads
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "extracted_leads_delete" ON extracted_leads;
CREATE POLICY "extracted_leads_delete" ON extracted_leads
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- quotes ----------
DROP POLICY IF EXISTS "quotes_select" ON quotes;
CREATE POLICY "quotes_select" ON quotes
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "quotes_insert" ON quotes;
CREATE POLICY "quotes_insert" ON quotes
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "quotes_update" ON quotes;
CREATE POLICY "quotes_update" ON quotes
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "quotes_delete" ON quotes;
CREATE POLICY "quotes_delete" ON quotes
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- booking_series ----------
DROP POLICY IF EXISTS "booking_series_select" ON booking_series;
CREATE POLICY "booking_series_select" ON booking_series
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "booking_series_insert" ON booking_series;
CREATE POLICY "booking_series_insert" ON booking_series
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "booking_series_update" ON booking_series;
CREATE POLICY "booking_series_update" ON booking_series
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "booking_series_delete" ON booking_series;
CREATE POLICY "booking_series_delete" ON booking_series
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- booking_occurrences ----------
DROP POLICY IF EXISTS "booking_occurrences_select" ON booking_occurrences;
CREATE POLICY "booking_occurrences_select" ON booking_occurrences
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "booking_occurrences_insert" ON booking_occurrences;
CREATE POLICY "booking_occurrences_insert" ON booking_occurrences
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "booking_occurrences_update" ON booking_occurrences;
CREATE POLICY "booking_occurrences_update" ON booking_occurrences
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "booking_occurrences_delete" ON booking_occurrences;
CREATE POLICY "booking_occurrences_delete" ON booking_occurrences
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- dialpad_calls ----------
DROP POLICY IF EXISTS "dialpad_calls_select" ON dialpad_calls;
CREATE POLICY "dialpad_calls_select" ON dialpad_calls
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_calls_insert" ON dialpad_calls;
CREATE POLICY "dialpad_calls_insert" ON dialpad_calls
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_calls_update" ON dialpad_calls;
CREATE POLICY "dialpad_calls_update" ON dialpad_calls
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_calls_delete" ON dialpad_calls;
CREATE POLICY "dialpad_calls_delete" ON dialpad_calls
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- dialpad_sms ----------
DROP POLICY IF EXISTS "dialpad_sms_select" ON dialpad_sms;
CREATE POLICY "dialpad_sms_select" ON dialpad_sms
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_sms_insert" ON dialpad_sms;
CREATE POLICY "dialpad_sms_insert" ON dialpad_sms
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_sms_update" ON dialpad_sms;
CREATE POLICY "dialpad_sms_update" ON dialpad_sms
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_sms_delete" ON dialpad_sms;
CREATE POLICY "dialpad_sms_delete" ON dialpad_sms
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- dialpad_emails ----------
DROP POLICY IF EXISTS "dialpad_emails_select" ON dialpad_emails;
CREATE POLICY "dialpad_emails_select" ON dialpad_emails
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_emails_insert" ON dialpad_emails;
CREATE POLICY "dialpad_emails_insert" ON dialpad_emails
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_emails_update" ON dialpad_emails;
CREATE POLICY "dialpad_emails_update" ON dialpad_emails
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "dialpad_emails_delete" ON dialpad_emails;
CREATE POLICY "dialpad_emails_delete" ON dialpad_emails
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- todos ----------
DROP POLICY IF EXISTS "todos_select" ON todos;
CREATE POLICY "todos_select" ON todos
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "todos_insert" ON todos;
CREATE POLICY "todos_insert" ON todos
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "todos_update" ON todos;
CREATE POLICY "todos_update" ON todos
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "todos_delete" ON todos;
CREATE POLICY "todos_delete" ON todos
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- daily_summary_logs ----------
DROP POLICY IF EXISTS "daily_summary_logs_select" ON daily_summary_logs;
CREATE POLICY "daily_summary_logs_select" ON daily_summary_logs
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "daily_summary_logs_insert" ON daily_summary_logs;
CREATE POLICY "daily_summary_logs_insert" ON daily_summary_logs
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "daily_summary_logs_update" ON daily_summary_logs;
CREATE POLICY "daily_summary_logs_update" ON daily_summary_logs
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "daily_summary_logs_delete" ON daily_summary_logs;
CREATE POLICY "daily_summary_logs_delete" ON daily_summary_logs
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- cleaner_job_reviews ----------
DROP POLICY IF EXISTS "cleaner_job_reviews_select" ON cleaner_job_reviews;
CREATE POLICY "cleaner_job_reviews_select" ON cleaner_job_reviews
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "cleaner_job_reviews_insert" ON cleaner_job_reviews;
CREATE POLICY "cleaner_job_reviews_insert" ON cleaner_job_reviews
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "cleaner_job_reviews_update" ON cleaner_job_reviews;
CREATE POLICY "cleaner_job_reviews_update" ON cleaner_job_reviews
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "cleaner_job_reviews_delete" ON cleaner_job_reviews;
CREATE POLICY "cleaner_job_reviews_delete" ON cleaner_job_reviews
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- payment_sms_logs ----------
DROP POLICY IF EXISTS "payment_sms_logs_select" ON payment_sms_logs;
CREATE POLICY "payment_sms_logs_select" ON payment_sms_logs
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "payment_sms_logs_insert" ON payment_sms_logs;
CREATE POLICY "payment_sms_logs_insert" ON payment_sms_logs
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "payment_sms_logs_update" ON payment_sms_logs;
CREATE POLICY "payment_sms_logs_update" ON payment_sms_logs
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "payment_sms_logs_delete" ON payment_sms_logs;
CREATE POLICY "payment_sms_logs_delete" ON payment_sms_logs
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- review_sms_logs ----------
DROP POLICY IF EXISTS "review_sms_logs_select" ON review_sms_logs;
CREATE POLICY "review_sms_logs_select" ON review_sms_logs
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "review_sms_logs_insert" ON review_sms_logs;
CREATE POLICY "review_sms_logs_insert" ON review_sms_logs
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "review_sms_logs_update" ON review_sms_logs;
CREATE POLICY "review_sms_logs_update" ON review_sms_logs
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "review_sms_logs_delete" ON review_sms_logs;
CREATE POLICY "review_sms_logs_delete" ON review_sms_logs
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- marketing_email_journeys ----------
DROP POLICY IF EXISTS "marketing_email_journeys_select" ON marketing_email_journeys;
CREATE POLICY "marketing_email_journeys_select" ON marketing_email_journeys
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "marketing_email_journeys_insert" ON marketing_email_journeys;
CREATE POLICY "marketing_email_journeys_insert" ON marketing_email_journeys
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "marketing_email_journeys_update" ON marketing_email_journeys;
CREATE POLICY "marketing_email_journeys_update" ON marketing_email_journeys
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "marketing_email_journeys_delete" ON marketing_email_journeys;
CREATE POLICY "marketing_email_journeys_delete" ON marketing_email_journeys
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- marketing_email_logs ----------
DROP POLICY IF EXISTS "marketing_email_logs_select" ON marketing_email_logs;
CREATE POLICY "marketing_email_logs_select" ON marketing_email_logs
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "marketing_email_logs_insert" ON marketing_email_logs;
CREATE POLICY "marketing_email_logs_insert" ON marketing_email_logs
  FOR INSERT WITH CHECK (user_is_org_member(org_id));

DROP POLICY IF EXISTS "marketing_email_logs_update" ON marketing_email_logs;
CREATE POLICY "marketing_email_logs_update" ON marketing_email_logs
  FOR UPDATE USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "marketing_email_logs_delete" ON marketing_email_logs;
CREATE POLICY "marketing_email_logs_delete" ON marketing_email_logs
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- =====================================================
-- 4. SENSITIVE TABLES: owner/admin/manager for writes
-- =====================================================

-- ---------- cleaners (sensitive: bank details, rates) ----------
DROP POLICY IF EXISTS "cleaners_select" ON cleaners;
CREATE POLICY "cleaners_select" ON cleaners
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "cleaners_insert" ON cleaners;
CREATE POLICY "cleaners_insert" ON cleaners
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "cleaners_update" ON cleaners;
CREATE POLICY "cleaners_update" ON cleaners
  FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "cleaners_delete" ON cleaners;
CREATE POLICY "cleaners_delete" ON cleaners
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- payment_sms_templates (sensitive: template content) ----------
DROP POLICY IF EXISTS "payment_sms_templates_select" ON payment_sms_templates;
CREATE POLICY "payment_sms_templates_select" ON payment_sms_templates
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "payment_sms_templates_insert" ON payment_sms_templates;
CREATE POLICY "payment_sms_templates_insert" ON payment_sms_templates
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "payment_sms_templates_update" ON payment_sms_templates;
CREATE POLICY "payment_sms_templates_update" ON payment_sms_templates
  FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "payment_sms_templates_delete" ON payment_sms_templates;
CREATE POLICY "payment_sms_templates_delete" ON payment_sms_templates
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- review_sms_templates (sensitive: template content) ----------
DROP POLICY IF EXISTS "review_sms_templates_select" ON review_sms_templates;
CREATE POLICY "review_sms_templates_select" ON review_sms_templates
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "review_sms_templates_insert" ON review_sms_templates;
CREATE POLICY "review_sms_templates_insert" ON review_sms_templates
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "review_sms_templates_update" ON review_sms_templates;
CREATE POLICY "review_sms_templates_update" ON review_sms_templates
  FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "review_sms_templates_delete" ON review_sms_templates;
CREATE POLICY "review_sms_templates_delete" ON review_sms_templates
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- ---------- marketing_email_templates (sensitive: template content) ----------
DROP POLICY IF EXISTS "marketing_email_templates_select" ON marketing_email_templates;
CREATE POLICY "marketing_email_templates_select" ON marketing_email_templates
  FOR SELECT USING (user_is_org_member(org_id));

DROP POLICY IF EXISTS "marketing_email_templates_insert" ON marketing_email_templates;
CREATE POLICY "marketing_email_templates_insert" ON marketing_email_templates
  FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "marketing_email_templates_update" ON marketing_email_templates;
CREATE POLICY "marketing_email_templates_update" ON marketing_email_templates
  FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

DROP POLICY IF EXISTS "marketing_email_templates_delete" ON marketing_email_templates;
CREATE POLICY "marketing_email_templates_delete" ON marketing_email_templates
  FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

-- =====================================================
-- 5. CONDITIONAL TABLES (may not exist)
-- =====================================================

-- booking_occurrence_completion_emails
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_completion_emails') THEN
    DROP POLICY IF EXISTS "booking_occurrence_completion_emails_select" ON booking_occurrence_completion_emails;
    CREATE POLICY "booking_occurrence_completion_emails_select" ON booking_occurrence_completion_emails
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_completion_emails_insert" ON booking_occurrence_completion_emails;
    CREATE POLICY "booking_occurrence_completion_emails_insert" ON booking_occurrence_completion_emails
      FOR INSERT WITH CHECK (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_completion_emails_update" ON booking_occurrence_completion_emails;
    CREATE POLICY "booking_occurrence_completion_emails_update" ON booking_occurrence_completion_emails
      FOR UPDATE USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_completion_emails_delete" ON booking_occurrence_completion_emails;
    CREATE POLICY "booking_occurrence_completion_emails_delete" ON booking_occurrence_completion_emails
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;

-- booking_occurrence_reminders
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_reminders') THEN
    DROP POLICY IF EXISTS "booking_occurrence_reminders_select" ON booking_occurrence_reminders;
    CREATE POLICY "booking_occurrence_reminders_select" ON booking_occurrence_reminders
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_reminders_insert" ON booking_occurrence_reminders;
    CREATE POLICY "booking_occurrence_reminders_insert" ON booking_occurrence_reminders
      FOR INSERT WITH CHECK (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_reminders_update" ON booking_occurrence_reminders;
    CREATE POLICY "booking_occurrence_reminders_update" ON booking_occurrence_reminders
      FOR UPDATE USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_reminders_delete" ON booking_occurrence_reminders;
    CREATE POLICY "booking_occurrence_reminders_delete" ON booking_occurrence_reminders
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;

-- booking_occurrence_receipt_emails
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_occurrence_receipt_emails') THEN
    DROP POLICY IF EXISTS "booking_occurrence_receipt_emails_select" ON booking_occurrence_receipt_emails;
    CREATE POLICY "booking_occurrence_receipt_emails_select" ON booking_occurrence_receipt_emails
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_receipt_emails_insert" ON booking_occurrence_receipt_emails;
    CREATE POLICY "booking_occurrence_receipt_emails_insert" ON booking_occurrence_receipt_emails
      FOR INSERT WITH CHECK (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_receipt_emails_update" ON booking_occurrence_receipt_emails;
    CREATE POLICY "booking_occurrence_receipt_emails_update" ON booking_occurrence_receipt_emails
      FOR UPDATE USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "booking_occurrence_receipt_emails_delete" ON booking_occurrence_receipt_emails;
    CREATE POLICY "booking_occurrence_receipt_emails_delete" ON booking_occurrence_receipt_emails
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;

-- marketing_sms_templates (sensitive)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_sms_templates') THEN
    ALTER TABLE marketing_sms_templates ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all for marketing_sms_templates" ON marketing_sms_templates;

    DROP POLICY IF EXISTS "marketing_sms_templates_select" ON marketing_sms_templates;
    CREATE POLICY "marketing_sms_templates_select" ON marketing_sms_templates
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "marketing_sms_templates_insert" ON marketing_sms_templates;
    CREATE POLICY "marketing_sms_templates_insert" ON marketing_sms_templates
      FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

    DROP POLICY IF EXISTS "marketing_sms_templates_update" ON marketing_sms_templates;
    CREATE POLICY "marketing_sms_templates_update" ON marketing_sms_templates
      FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

    DROP POLICY IF EXISTS "marketing_sms_templates_delete" ON marketing_sms_templates;
    CREATE POLICY "marketing_sms_templates_delete" ON marketing_sms_templates
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;

-- marketing_sms_journeys
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_sms_journeys') THEN
    ALTER TABLE marketing_sms_journeys ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all for marketing_sms_journeys" ON marketing_sms_journeys;

    DROP POLICY IF EXISTS "marketing_sms_journeys_select" ON marketing_sms_journeys;
    CREATE POLICY "marketing_sms_journeys_select" ON marketing_sms_journeys
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "marketing_sms_journeys_insert" ON marketing_sms_journeys;
    CREATE POLICY "marketing_sms_journeys_insert" ON marketing_sms_journeys
      FOR INSERT WITH CHECK (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "marketing_sms_journeys_update" ON marketing_sms_journeys;
    CREATE POLICY "marketing_sms_journeys_update" ON marketing_sms_journeys
      FOR UPDATE USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "marketing_sms_journeys_delete" ON marketing_sms_journeys;
    CREATE POLICY "marketing_sms_journeys_delete" ON marketing_sms_journeys
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;

-- marketing_sms_logs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_sms_logs') THEN
    ALTER TABLE marketing_sms_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all for marketing_sms_logs" ON marketing_sms_logs;

    DROP POLICY IF EXISTS "marketing_sms_logs_select" ON marketing_sms_logs;
    CREATE POLICY "marketing_sms_logs_select" ON marketing_sms_logs
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "marketing_sms_logs_insert" ON marketing_sms_logs;
    CREATE POLICY "marketing_sms_logs_insert" ON marketing_sms_logs
      FOR INSERT WITH CHECK (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "marketing_sms_logs_update" ON marketing_sms_logs;
    CREATE POLICY "marketing_sms_logs_update" ON marketing_sms_logs
      FOR UPDATE USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "marketing_sms_logs_delete" ON marketing_sms_logs;
    CREATE POLICY "marketing_sms_logs_delete" ON marketing_sms_logs
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;

-- cleaner_payouts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cleaner_payouts') THEN
    ALTER TABLE cleaner_payouts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all for cleaner_payouts" ON cleaner_payouts;

    DROP POLICY IF EXISTS "cleaner_payouts_select" ON cleaner_payouts;
    CREATE POLICY "cleaner_payouts_select" ON cleaner_payouts
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "cleaner_payouts_insert" ON cleaner_payouts;
    CREATE POLICY "cleaner_payouts_insert" ON cleaner_payouts
      FOR INSERT WITH CHECK (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

    DROP POLICY IF EXISTS "cleaner_payouts_update" ON cleaner_payouts;
    CREATE POLICY "cleaner_payouts_update" ON cleaner_payouts
      FOR UPDATE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));

    DROP POLICY IF EXISTS "cleaner_payouts_delete" ON cleaner_payouts;
    CREATE POLICY "cleaner_payouts_delete" ON cleaner_payouts
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;

-- webhook_logs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'webhook_logs') THEN
    ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all for webhook_logs" ON webhook_logs;

    DROP POLICY IF EXISTS "webhook_logs_select" ON webhook_logs;
    CREATE POLICY "webhook_logs_select" ON webhook_logs
      FOR SELECT USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "webhook_logs_insert" ON webhook_logs;
    CREATE POLICY "webhook_logs_insert" ON webhook_logs
      FOR INSERT WITH CHECK (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "webhook_logs_update" ON webhook_logs;
    CREATE POLICY "webhook_logs_update" ON webhook_logs
      FOR UPDATE USING (user_is_org_member(org_id));

    DROP POLICY IF EXISTS "webhook_logs_delete" ON webhook_logs;
    CREATE POLICY "webhook_logs_delete" ON webhook_logs
      FOR DELETE USING (user_has_org_role(org_id, ARRAY['owner','admin','manager']::org_role[]));
  END IF;
END $$;
