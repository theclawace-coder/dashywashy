-- Fix workflow triggers to handle pg_net failures gracefully
-- This prevents the "function net.http_post does not exist" error from breaking
-- lead status updates and lead creation when pg_net extension isn't available.

-- Enable pg_net if not already (may require superuser in some environments)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_net extension could not be created - requires higher privileges';
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net extension not available: %', SQLERRM;
END $$;

-- Recreate function to notify workflow-trigger when lead status changes (with graceful error handling)
CREATE OR REPLACE FUNCTION notify_workflow_on_lead_status_change()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
BEGIN
  -- Only trigger if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      webhook_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/workflow-trigger';

      -- If setting not available, try hardcoded URL
      IF webhook_url IS NULL OR webhook_url = '/functions/v1/workflow-trigger' THEN
        webhook_url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-trigger';
      END IF;

      payload := jsonb_build_object(
        'event_type', 'lead_status_change',
        'org_id', NEW.org_id,
        'entity_type', 'lead',
        'entity_id', NEW.id,
        'old_data', jsonb_build_object('status', OLD.status),
        'new_data', jsonb_build_object('status', NEW.status, 'name', NEW.name, 'email', NEW.email, 'phone_number', NEW.phone_number)
      );

      -- Use pg_net to make async HTTP call (non-blocking)
      -- Wrapped in exception handler to prevent failures from breaking the transaction
      PERFORM net.http_post(
        url := webhook_url,
        body := payload::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
        )::jsonb
      );
    EXCEPTION
      WHEN undefined_function THEN
        -- pg_net extension not available, silently skip webhook
        RAISE NOTICE 'Workflow trigger skipped: pg_net extension not available';
      WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RAISE NOTICE 'Workflow trigger failed: % - %', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate function to notify workflow-trigger when lead is created (with graceful error handling)
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
      'new_data', jsonb_build_object('status', NEW.status, 'name', NEW.name, 'email', NEW.email, 'phone_number', NEW.phone_number)
    );

    PERFORM net.http_post(
      url := webhook_url,
      body := payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
      )::jsonb
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

-- Also fix the booking completion trigger if it exists
CREATE OR REPLACE FUNCTION notify_booking_occurrence_completed()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  service_key text;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    BEGIN
      webhook_url := COALESCE(
        current_setting('app.settings.supabase_url', true),
        'https://jditayvwnlxktotfybvk.supabase.co'
      ) || '/functions/v1/booking-completed-email';

      service_key := COALESCE(current_setting('app.settings.service_role_key', true), '');

      PERFORM net.http_post(
        url := webhook_url,
        body := json_build_object('occurrence_id', NEW.id, 'org_id', NEW.org_id)::text,
        headers := json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key,
          'X-Org-Id', NEW.org_id::text
        )::jsonb
      );
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'Booking completion email skipped: pg_net extension not available';
      WHEN OTHERS THEN
        RAISE NOTICE 'Booking completion email failed: % - %', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
