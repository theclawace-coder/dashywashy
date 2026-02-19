-- =====================================================
-- Workflow triggers for booking occurrences (time-based + event-based)
-- =====================================================

-- Notify workflow-trigger when a booking occurrence is created
CREATE OR REPLACE FUNCTION notify_workflow_on_booking_created()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
  lead_id uuid;
  org_id uuid;
BEGIN
  SELECT bs.lead_id, bs.org_id INTO lead_id, org_id
  FROM booking_series bs
  WHERE bs.id = NEW.series_id;

  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';
  IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
    webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
  END IF;

  payload := jsonb_build_object(
    'event_type', 'booking_created',
    'org_id', org_id,
    'entity_type', 'booking',
    'entity_id', NEW.id,
    'new_data', jsonb_build_object(
      'start_at', NEW.start_at,
      'end_at', NEW.end_at,
      'created_at', NEW.created_at,
      'status', NEW.status,
      'series_id', NEW.series_id,
      'lead_id', lead_id
    )
  );

  PERFORM net.http_post(
    url := webhook_url,
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_created_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_created_workflow_trigger
  AFTER INSERT ON booking_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION notify_workflow_on_booking_created();

-- Notify workflow-trigger when a booking occurrence is completed
CREATE OR REPLACE FUNCTION notify_workflow_on_booking_completed()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
  lead_id uuid;
  org_id uuid;
BEGIN
  SELECT bs.lead_id, bs.org_id INTO lead_id, org_id
  FROM booking_series bs
  WHERE bs.id = NEW.series_id;

  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';
  IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
    webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
  END IF;

  payload := jsonb_build_object(
    'event_type', 'booking_completed',
    'org_id', org_id,
    'entity_type', 'booking',
    'entity_id', NEW.id,
    'old_data', jsonb_build_object(
      'status', OLD.status
    ),
    'new_data', jsonb_build_object(
      'start_at', NEW.start_at,
      'end_at', NEW.end_at,
      'created_at', NEW.created_at,
      'status', NEW.status,
      'series_id', NEW.series_id,
      'lead_id', lead_id
    )
  );

  PERFORM net.http_post(
    url := webhook_url,
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_completed_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_completed_workflow_trigger
  AFTER UPDATE ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION notify_workflow_on_booking_completed();

-- Notify workflow-trigger when a booking occurrence is rescheduled (time-based workflows)
CREATE OR REPLACE FUNCTION notify_workflow_on_booking_updated()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
  lead_id uuid;
  org_id uuid;
BEGIN
  SELECT bs.lead_id, bs.org_id INTO lead_id, org_id
  FROM booking_series bs
  WHERE bs.id = NEW.series_id;

  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';
  IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
    webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
  END IF;

  payload := jsonb_build_object(
    'event_type', 'booking_updated',
    'org_id', org_id,
    'entity_type', 'booking',
    'entity_id', NEW.id,
    'old_data', jsonb_build_object(
      'start_at', OLD.start_at,
      'end_at', OLD.end_at,
      'status', OLD.status
    ),
    'new_data', jsonb_build_object(
      'start_at', NEW.start_at,
      'end_at', NEW.end_at,
      'created_at', NEW.created_at,
      'status', NEW.status,
      'series_id', NEW.series_id,
      'lead_id', lead_id
    )
  );

  PERFORM net.http_post(
    url := webhook_url,
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_updated_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_updated_workflow_trigger
  AFTER UPDATE ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.start_at IS DISTINCT FROM NEW.start_at OR OLD.end_at IS DISTINCT FROM NEW.end_at)
  EXECUTE FUNCTION notify_workflow_on_booking_updated();
