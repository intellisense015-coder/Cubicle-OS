begin;

-- Meta's leadgen_id is the durable idempotency key for webhook deliveries.
-- The existing public.leads table remains the single source of truth for OS
-- leads; this column only records the upstream identifier when present.
alter table public.leads
  add column if not exists meta_leadgen_id text;

comment on column public.leads.meta_leadgen_id is
  'Meta Lead Ads leadgen_id; unique when the lead originated from Meta.';

create unique index if not exists leads_meta_leadgen_id_uidx
  on public.leads (meta_leadgen_id)
  where meta_leadgen_id is not null;

-- This is not a second leads table. It is a server-only delivery ledger used
-- to claim webhook work exactly once and safely retry a failed notification.
create table if not exists public.os_meta_lead_events (
  leadgen_id text primary key check (char_length(btrim(leadgen_id)) between 1 and 128),
  page_id text not null check (char_length(btrim(page_id)) between 1 and 64),
  form_id text,
  ad_id text,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 1000),
  resend_email_id text,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.os_meta_lead_events is
  'Private Meta Lead Ads webhook idempotency and notification ledger.';

create index if not exists os_meta_lead_events_status_updated_idx
  on public.os_meta_lead_events (status, updated_at);

alter table public.os_meta_lead_events enable row level security;
revoke all on table public.os_meta_lead_events from public, anon, authenticated;

commit;
