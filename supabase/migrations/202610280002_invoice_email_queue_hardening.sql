-- Invoice email queue hardening for scheduled reminders and retries.
-- Apply after the existing invoice email queue migration/function.

create unique index if not exists invoice_email_queue_invoice_delivery_uidx
  on public.invoice_email_queue(invoice_id, delivery_kind);

create index if not exists invoice_email_queue_processing_idx
  on public.invoice_email_queue(status, scheduled_for, next_attempt_at);

alter table public.invoice_email_queue enable row level security;

-- Queue writes and processing are performed by server-side routes using the
-- service role. No client policy is granted for queue mutation.
