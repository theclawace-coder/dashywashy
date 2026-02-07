-- =====================================================
-- Workflow webhooks: do not fail lead insert/update if pg_net is unavailable
-- =====================================================

CREATE OR REPLACE FUNCTION notify_workflow_on_lead_status_change()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
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
    'new_data', jsonb_build_object('status', NEW.status, 'name', NEW.name, 'email', NEW.email, 'phone_number', NEW.phone_number)
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
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE 'net.http_post is unavailable; skipping workflow webhook';
    WHEN OTHERS THEN
      RAISE NOTICE 'workflow webhook failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_workflow_on_lead_created()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url text;
  payload jsonb;
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

  BEGIN
    PERFORM net.http_post(
      url := webhook_url,
      body := payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )::jsonb
    );
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE 'net.http_post is unavailable; skipping workflow webhook';
    WHEN OTHERS THEN
      RAISE NOTICE 'workflow webhook failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
