-- Run only the automatic invoice workflow from Supabase Cron.
--
-- Before applying this migration, store these two secrets in Supabase Vault:
--   cubicle_app_url       = the production app URL, without a trailing slash
--   cubicle_cron_secret   = the same value as the app's CRON_SECRET
--
-- The job commands read the secrets at runtime instead of storing the secret
-- in cron.job. The existing Next.js routes continue to enforce the secret.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  existing_job record;
  app_url text;
  cron_secret text;
begin
  select decrypted_secret
    into app_url
    from vault.decrypted_secrets
   where name = 'cubicle_app_url'
   limit 1;

  select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
   where name = 'cubicle_cron_secret'
   limit 1;

  if nullif(trim(app_url), '') is null then
    raise exception 'Supabase Vault secret cubicle_app_url is required before installing invoice cron jobs.';
  end if;

  if nullif(trim(cron_secret), '') is null then
    raise exception 'Supabase Vault secret cubicle_cron_secret is required before installing invoice cron jobs.';
  end if;

  for existing_job in
    select jobid
      from cron.job
     where jobname in (
       'cubicle-invoice-automation',
       'cubicle-invoice-email-queue'
     )
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'cubicle-invoice-automation',
    '*/15 * * * *',
    $job$
      select net.http_get(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'cubicle_app_url'), '/') || '/api/invoices/automation/run',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cubicle_cron_secret')
        )
      );
    $job$
  );

  perform cron.schedule(
    'cubicle-invoice-email-queue',
    '*/15 * * * *',
    $job$
      select net.http_get(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'cubicle_app_url'), '/') || '/api/invoices/email-queue/process',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cubicle_cron_secret')
        )
      );
    $job$
  );
end;
$migration$;

commit;
