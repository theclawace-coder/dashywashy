CREATE TABLE IF NOT EXISTS workflow_debug_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  lead_id uuid,
  old_status text,
  new_status text
);

CREATE OR REPLACE FUNCTION debug_lead_status_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workflow_debug_events(source, lead_id, old_status, new_status)
  VALUES ('debug_lead_status_trigger', NEW.id, OLD.status, NEW.status);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS debug_lead_status_trigger ON extracted_leads;
CREATE TRIGGER debug_lead_status_trigger
  AFTER UPDATE ON extracted_leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION debug_lead_status_trigger();

UPDATE extracted_leads
SET status = CASE WHEN status = 'Marketing Loop' THEN 'Quote Sent' ELSE 'Marketing Loop' END
WHERE id = '65f47a0b-cb67-4bef-8032-f37a3d96e967';

SELECT id, source, lead_id, old_status, new_status, created_at
FROM workflow_debug_events
ORDER BY created_at DESC
LIMIT 5;