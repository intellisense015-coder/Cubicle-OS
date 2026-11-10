-- Recurring monthly invoice generation and email scheduling.
-- All writes are performed by authenticated server routes or the cron runner;
-- browser clients never write directly to these tables.
begin;

create table if not exists public.invoice_automation_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  send_day smallint not null default 1 check (send_day between 1 and 28),
  send_time time not null default '09:00:00',
  timezone text not null default 'Asia/Karachi' check (timezone = 'Asia/Karachi'),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_automation_runs (
  period_start date primary key,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  generated_count integer not null default 0 check (generated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);

create index if not exists invoice_automation_runs_status_idx
  on public.invoice_automation_runs(status, started_at desc);

alter table public.invoice_automation_settings enable row level security;
alter table public.invoice_automation_runs enable row level security;
revoke all on table public.invoice_automation_settings from public, anon, authenticated;
revoke all on table public.invoice_automation_runs from public, anon, authenticated;

comment on table public.invoice_automation_settings is 'Singleton monthly invoice generation and email schedule. Server routes use the service role after permission checks.';
comment on table public.invoice_automation_runs is 'Idempotency records for recurring invoice generation, one row per billing month.';

commit;
