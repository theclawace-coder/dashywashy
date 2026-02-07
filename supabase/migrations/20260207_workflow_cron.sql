-- =============================================================================
-- Workflow Runner Cron Job
-- =============================================================================
-- Schedules the workflow-runner function to run every 5 minutes
-- Requires pg_cron extension to be enabled
-- =============================================================================

-- Enable pg_cron if not already enabled (requires superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net for HTTP calls (should already be enabled)
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the workflow runner to execute every 5 minutes
SELECT cron.schedule(
  'workflow-runner-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jditayvwnlxktotfybvk.supabase.co/functions/v1/workflow-runner',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('workflow-runner-cron');
