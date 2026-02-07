-- =====================================================
-- USER PREFERENCES: Guided tour completion
-- =====================================================

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS tour_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tour_completed_at timestamptz;

UPDATE user_preferences
SET tour_completed = false
WHERE tour_completed IS NULL;
