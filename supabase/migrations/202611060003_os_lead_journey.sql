begin;

-- Durable OS journey entries for shared website leads. The browser cache may
-- still be used for optimistic UI, but it is not the source of truth.
create table if not exists public.os_lead_journey (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  client_entry_id text,
  entry_type text not null check (char_length(btrim(entry_type)) between 1 and 80),
  occurred_date date not null default current_date,
  occurred_time time,
  entry_data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint os_lead_journey_lead_client_key unique (lead_id, client_entry_id)
);

comment on table public.os_lead_journey is
  'Durable OS journey entries for shared website leads.';

create index if not exists os_lead_journey_lead_date_idx
  on public.os_lead_journey (lead_id, occurred_date desc, occurred_time desc);

alter table public.os_lead_journey enable row level security;

revoke all on table public.os_lead_journey from public, anon;
grant select, insert, update, delete on table public.os_lead_journey to authenticated;

drop policy if exists "OS users can read lead journey" on public.os_lead_journey;
create policy "OS users can read lead journey"
  on public.os_lead_journey
  for select
  to authenticated
  using (public.is_permission_granted('leads.read'));

drop policy if exists "OS users can create lead journey" on public.os_lead_journey;
create policy "OS users can create lead journey"
  on public.os_lead_journey
  for insert
  to authenticated
  with check (
    (
      public.is_permission_granted('leads.write')
      or public.is_permission_granted('leads.followups.write')
      or public.is_permission_granted('leads.journey.write')
    )
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

drop policy if exists "OS users can update lead journey" on public.os_lead_journey;
create policy "OS users can update lead journey"
  on public.os_lead_journey
  for update
  to authenticated
  using (
    public.is_permission_granted('leads.write')
    or public.is_permission_granted('leads.followups.write')
    or public.is_permission_granted('leads.journey.write')
  )
  with check (
    (
      public.is_permission_granted('leads.write')
      or public.is_permission_granted('leads.followups.write')
      or public.is_permission_granted('leads.journey.write')
    )
    and updated_by = auth.uid()
  );

drop policy if exists "OS users can delete lead journey" on public.os_lead_journey;
create policy "OS users can delete lead journey"
  on public.os_lead_journey
  for delete
  to authenticated
  using (
    public.is_permission_granted('leads.write')
    or public.is_permission_granted('leads.followups.write')
    or public.is_permission_granted('leads.journey.write')
  );

commit;
