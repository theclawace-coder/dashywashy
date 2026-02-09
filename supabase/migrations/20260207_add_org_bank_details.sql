-- =====================================================
-- Add banking details to organizations
-- =====================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_bsb text,
  ADD COLUMN IF NOT EXISTS bank_account_number text;
