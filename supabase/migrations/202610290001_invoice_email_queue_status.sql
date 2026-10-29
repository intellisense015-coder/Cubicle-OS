-- Allow the queue worker to claim jobs safely while an email is being sent.
-- Apply after the existing invoice_email_queue migration and hardening migration.

alter table public.invoice_email_queue
  drop constraint if exists invoice_email_status_check;

alter table public.invoice_email_queue
  add constraint invoice_email_status_check
  check (status in ('queued', 'processing', 'sent', 'failed', 'cancelled'));
