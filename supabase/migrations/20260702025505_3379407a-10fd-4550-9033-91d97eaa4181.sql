
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any prior schedule with the same name (idempotent re-runs)
DO $$
BEGIN
  PERFORM cron.unschedule('send-painless-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-painless-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'send-painless-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jxiqcdxuttwhblzrgtct.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
