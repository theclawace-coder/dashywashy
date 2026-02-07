-- Fix pg_net http_post signature by passing jsonb headers/body
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
