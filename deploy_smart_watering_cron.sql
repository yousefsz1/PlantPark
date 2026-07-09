-- Run this AFTER deploy_add_smart_watering.sql has been run AND the
-- check-rainfall edge function has been deployed.
--
-- Replace <YOUR_SERVICE_ROLE_KEY> below with your actual service role key
-- (Project Settings → API → service_role secret). Never commit that key to
-- git — this file is a one-time paste-and-run in the SQL editor, not
-- something to check in with the real key filled in.
--
-- If pg_cron / pg_net aren't already enabled on this project, enable them
-- first via Database → Extensions in the dashboard, then re-run this file.

select vault.create_secret('https://xiqexeullniezghwdjfb.supabase.co', 'project_url');
select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');

select cron.schedule(
  'smart-watering-rain-check',
  '0 */3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/check-rainfall',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
