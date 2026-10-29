-- Invoice tax and delivery audit support.
-- Existing invoices.tax_* columns remain the WHT-compatible columns so that
-- older RPCs and records continue to work. New code exposes them as WHT and
-- stores Sales Tax in dedicated columns.

alter table public.invoices
  add column if not exists sales_tax_enabled boolean not null default false,
  add column if not exists sales_tax_rate numeric(7, 4) not null default 0,
  add column if not exists sales_tax_amount numeric(14, 2) not null default 0;

comment on column public.invoices.tax_enabled is 'Legacy-compatible WHT inclusion flag.';
comment on column public.invoices.tax_rate is 'Legacy-compatible WHT rate percentage.';
comment on column public.invoices.tax_amount is 'Legacy-compatible WHT amount withheld from subtotal.';
comment on column public.invoices.sales_tax_amount is 'Inclusive Sales Tax extracted from the total, rounded to two decimal places.';

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid not null references public.invoices(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  recipient_email text not null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists activity_log_entity_idx on public.activity_log(entity_type, entity_id, created_at desc);
create index if not exists activity_log_actor_idx on public.activity_log(actor_user_id, created_at desc);

alter table public.activity_log enable row level security;

-- Delivery writes are performed by the server-side service-role route. No
-- client policy is granted, preventing clients from forging audit history.
