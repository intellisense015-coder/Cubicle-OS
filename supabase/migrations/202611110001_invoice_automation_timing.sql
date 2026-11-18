-- Generate recurring invoices 30 minutes before their configured send time.
-- Email queue processing runs every five minutes so a large recipient list is
-- drained in batches without sending before the selected time.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $migration$
declare
  existing_job record;
  app_url text;
  cron_secret text;
begin
  select decrypted_secret into app_url
    from vault.decrypted_secrets
   where name = 'cubicle_app_url'
   limit 1;

  select decrypted_secret into cron_secret
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
     where jobname in ('cubicle-invoice-automation', 'cubicle-invoice-email-queue')
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
    '*/5 * * * *',
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
