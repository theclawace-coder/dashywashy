-- Track completion emails and trigger notifications when jobs are completed
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS booking_occurrence_completion_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES booking_occurrences(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  email_to text,
  payload jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_occurrence_completion_emails_occurrence_id
  ON booking_occurrence_completion_emails(occurrence_id);

CREATE OR REPLACE FUNCTION notify_booking_occurrence_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM net.http_post(
      url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/booking-completed-email',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkaXRheXZ3bmx4a3RvdGZ5YnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNzg0NTAsImV4cCI6MjA4NTY1NDQ1MH0.0rqy-Z3OJLEByoPHvRevNlBxYjYSb_oCgY2pj-Nytz4',
        'Content-Type',
        'application/json'
      ),
      body := jsonb_build_object('occurrenceId', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_occurrence_completed_notify ON booking_occurrences;
CREATE TRIGGER trg_booking_occurrence_completed_notify
  AFTER UPDATE OF status ON booking_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_occurrence_completed();
