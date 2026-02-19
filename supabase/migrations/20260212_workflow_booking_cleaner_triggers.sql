-- =====================================================
-- Workflow triggers for cleaner assignment + booking paid
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Notify workflow-trigger when a cleaner assignment changes
CREATE OR REPLACE FUNCTION notify_workflow_on_cleaner_assigned()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
  lead_id uuid;
  org_id uuid;
BEGIN
  IF NEW.cleaner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.cleaner_id IS NOT DISTINCT FROM NEW.cleaner_id THEN
    RETURN NEW;
  END IF;

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
    'event_type', 'cleaner_assigned',
    'org_id', org_id,
    'entity_type', 'booking',
    'entity_id', NEW.id,
    'old_data', jsonb_build_object(
      'cleaner_id', OLD.cleaner_id,
      'status', OLD.status,
      'start_at', OLD.start_at,
      'end_at', OLD.end_at
    ),
    'new_data', jsonb_build_object(
      'cleaner_id', NEW.cleaner_id,
      'assigned_at', NEW.assigned_at,
      'status', NEW.status,
      'start_at', NEW.start_at,
      'end_at', NEW.end_at,
      'series_id', NEW.series_id,
      'lead_id', lead_id
    )
  );

  BEGIN
    PERFORM net.http_post(
      url := webhook_url,
      body := payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_workflow_on_cleaner_assigned failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_cleaner_assigned_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_cleaner_assigned_workflow_trigger
  AFTER UPDATE ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.cleaner_id IS DISTINCT FROM NEW.cleaner_id)
  EXECUTE FUNCTION notify_workflow_on_cleaner_assigned();

-- Notify workflow-trigger when a booking is paid
CREATE OR REPLACE FUNCTION notify_workflow_on_booking_paid()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
  lead_id uuid;
  org_id uuid;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'paid' OR OLD.payment_status = 'paid' THEN
    RETURN NEW;
  END IF;

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
    'event_type', 'booking_paid',
    'org_id', org_id,
    'entity_type', 'booking',
    'entity_id', NEW.id,
    'old_data', jsonb_build_object(
      'payment_status', OLD.payment_status,
      'payment_paid_at', OLD.payment_paid_at
    ),
    'new_data', jsonb_build_object(
      'payment_status', NEW.payment_status,
      'payment_paid_at', NEW.payment_paid_at,
      'payment_amount_cents', NEW.payment_amount_cents,
      'payment_link', NEW.payment_link,
      'series_id', NEW.series_id,
      'lead_id', lead_id,
      'start_at', NEW.start_at,
      'end_at', NEW.end_at,
      'status', NEW.status
    )
  );

  BEGIN
    PERFORM net.http_post(
      url := webhook_url,
      body := payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_workflow_on_booking_paid failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_paid_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_paid_workflow_trigger
  AFTER UPDATE OF payment_status ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION notify_workflow_on_booking_paid();

