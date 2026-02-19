-- =====================================================
-- Workflow Event Webhooks (Lead + Booking)
-- =====================================================
-- Ensures all workflow event triggers are installed and use
-- resilient pg_net headers that do not depend on DB GUC secrets.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- -----------------------------------------------------
-- Lead events
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION notify_workflow_on_lead_status_change()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';
      IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
        webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
      END IF;

      payload := jsonb_build_object(
        'event_type', 'lead_status_change',
        'org_id', NEW.org_id,
        'entity_type', 'lead',
        'entity_id', NEW.id,
        'old_data', jsonb_build_object('status', OLD.status),
        'new_data', jsonb_build_object(
          'status', NEW.status,
          'name', NEW.name,
          'email', NEW.email,
          'phone_number', NEW.phone_number
        )
      );

      PERFORM net.http_post(
        url := webhook_url,
        body := payload,
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'Workflow trigger skipped: pg_net extension not available';
      WHEN OTHERS THEN
        RAISE NOTICE 'Workflow trigger failed: % - %', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_workflow_on_lead_created()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
BEGIN
  BEGIN
    webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';
    IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
      webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
    END IF;

    payload := jsonb_build_object(
      'event_type', 'lead_created',
      'org_id', NEW.org_id,
      'entity_type', 'lead',
      'entity_id', NEW.id,
      'new_data', jsonb_build_object(
        'status', NEW.status,
        'name', NEW.name,
        'email', NEW.email,
        'phone_number', NEW.phone_number
      )
    );

    PERFORM net.http_post(
      url := webhook_url,
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE 'Workflow trigger skipped: pg_net extension not available';
    WHEN OTHERS THEN
      RAISE NOTICE 'Workflow trigger failed: % - %', SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS lead_status_change_workflow_trigger ON extracted_leads;
CREATE TRIGGER lead_status_change_workflow_trigger
  AFTER UPDATE ON extracted_leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_workflow_on_lead_status_change();

DROP TRIGGER IF EXISTS lead_created_workflow_trigger ON extracted_leads;
CREATE TRIGGER lead_created_workflow_trigger
  AFTER INSERT ON extracted_leads
  FOR EACH ROW
  EXECUTE FUNCTION notify_workflow_on_lead_created();

-- -----------------------------------------------------
-- Booking events
-- -----------------------------------------------------

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

  BEGIN
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
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_workflow_on_booking_created failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  BEGIN
    webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';
    IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
      webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
    END IF;

    payload := jsonb_build_object(
      'event_type', 'booking_completed',
      'org_id', org_id,
      'entity_type', 'booking',
      'entity_id', NEW.id,
      'old_data', jsonb_build_object('status', OLD.status),
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
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_workflow_on_booking_completed failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  BEGIN
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
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_workflow_on_booking_updated failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  BEGIN
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

    PERFORM net.http_post(
      url := webhook_url,
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_workflow_on_cleaner_assigned failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

  BEGIN
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

    PERFORM net.http_post(
      url := webhook_url,
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'notify_workflow_on_booking_paid failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_created_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_created_workflow_trigger
  AFTER INSERT ON booking_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION notify_workflow_on_booking_created();

DROP TRIGGER IF EXISTS booking_completed_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_completed_workflow_trigger
  AFTER UPDATE ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION notify_workflow_on_booking_completed();

DROP TRIGGER IF EXISTS booking_updated_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_updated_workflow_trigger
  AFTER UPDATE ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.start_at IS DISTINCT FROM NEW.start_at OR OLD.end_at IS DISTINCT FROM NEW.end_at)
  EXECUTE FUNCTION notify_workflow_on_booking_updated();

DROP TRIGGER IF EXISTS booking_cleaner_assigned_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_cleaner_assigned_workflow_trigger
  AFTER UPDATE ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.cleaner_id IS DISTINCT FROM NEW.cleaner_id)
  EXECUTE FUNCTION notify_workflow_on_cleaner_assigned();

DROP TRIGGER IF EXISTS booking_paid_workflow_trigger ON booking_occurrences;
CREATE TRIGGER booking_paid_workflow_trigger
  AFTER UPDATE OF payment_status ON booking_occurrences
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION notify_workflow_on_booking_paid();
