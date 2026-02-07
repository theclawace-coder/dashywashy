-- Prevent booking completion email trigger failures from blocking status updates
CREATE OR REPLACE FUNCTION notify_booking_occurrence_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      -- Keep status updates working even if the HTTP call fails
      RAISE NOTICE 'notify_booking_occurrence_completed failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
