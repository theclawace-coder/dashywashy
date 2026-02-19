-- =====================================================
-- LEAD JOURNAL ENTRIES (notes + callbacks + archive events)
-- =====================================================

CREATE TABLE IF NOT EXISTS lead_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES extracted_leads(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('note', 'callback', 'never_callback')),
  body text NOT NULL,
  callback_at timestamptz,
  callback_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_journal_entries_callback_requires_time
    CHECK (
      (entry_type = 'callback' AND callback_at IS NOT NULL)
      OR (entry_type <> 'callback')
    )
);

CREATE INDEX IF NOT EXISTS idx_lead_journal_entries_org_id ON lead_journal_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_lead_journal_entries_lead_id ON lead_journal_entries(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_journal_entries_callback_at ON lead_journal_entries(callback_at);
CREATE INDEX IF NOT EXISTS idx_lead_journal_entries_created_at ON lead_journal_entries(created_at DESC);

DROP TRIGGER IF EXISTS update_lead_journal_entries_updated_at ON lead_journal_entries;
CREATE TRIGGER update_lead_journal_entries_updated_at
  BEFORE UPDATE ON lead_journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE lead_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for lead_journal_entries" ON lead_journal_entries;
CREATE POLICY "Allow all for lead_journal_entries" ON lead_journal_entries
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE lead_journal_entries;
