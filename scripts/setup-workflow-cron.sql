-- Run this in Supabase SQL Editor after enabling pg_cron extension
-- Dashboard > SQL Editor > New Query

-- Schedule workflow-runner to run every 5 minutes
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

-- Verify it was created
SELECT * FROM cron.job WHERE jobname = 'workflow-runner-cron';
