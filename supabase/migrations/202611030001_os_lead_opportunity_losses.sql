begin;

-- OS-owned opportunity-loss ledger. This intentionally has no foreign key to
-- public.leads because that table is shared with the live public website.
create table if not exists public.os_lead_opportunity_losses (
  lead_id uuid primary key,
  monthly_loss numeric(14, 2) not null check (monthly_loss > 0),
  lost_reason text not null check (char_length(btrim(lost_reason)) between 1 and 240),
  lost_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.os_lead_opportunity_losses is
  'OS-owned immutable-at-loss-time monthly value ledger for lost leads; intentionally separate from the live website leads table.';

create index if not exists os_lead_opportunity_losses_lost_at_idx
  on public.os_lead_opportunity_losses (lost_at desc);

create or replace function public.os_update_lead(
  p_id uuid,
  p_workspace_option text default null,
  p_update_workspace boolean default false,
  p_visited boolean default null,
  p_update_visited boolean default false,
  p_visit_date date default null,
  p_update_visit_date boolean default false,
  p_visit_time time default null,
  p_update_visit_time boolean default false,
  p_stage text default null,
  p_lost_reason text default null,
  p_lost_monthly_value numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lead public.leads;
  v_now timestamptz := clock_timestamp();
begin
  if not public.is_permission_granted('leads.write') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  if p_stage = 'Not interested' then
    if p_lost_reason is null
       or char_length(btrim(p_lost_reason)) < 1
       or char_length(p_lost_reason) > 240
       or p_lost_monthly_value is null
       or p_lost_monthly_value <= 0
       or p_lost_monthly_value > 1000000000000 then
      raise exception 'Invalid opportunity loss.' using errcode = '22023';
    end if;
  end if;

  update public.leads
  set
    workspace_option = case when p_update_workspace then p_workspace_option else workspace_option end,
    visited = case when p_update_visited then p_visited else visited end,
    visit_date = case when p_update_visit_date then p_visit_date else visit_date end,
    visit_time = case when p_update_visit_time then p_visit_time else visit_time end
  where id = p_id
  returning * into v_lead;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if p_stage = 'Not interested' then
    insert into public.os_lead_opportunity_losses (
      lead_id, monthly_loss, lost_reason, lost_at, created_by, updated_by, created_at, updated_at
    ) values (
      p_id, round(p_lost_monthly_value, 2), btrim(p_lost_reason), v_now,
      auth.uid(), auth.uid(), v_now, v_now
    )
    on conflict (lead_id) do update
      set monthly_loss = excluded.monthly_loss,
          lost_reason = excluded.lost_reason,
          lost_at = excluded.lost_at,
          updated_by = auth.uid(),
          updated_at = v_now;
  elsif p_stage is not null then
    delete from public.os_lead_opportunity_losses where lead_id = p_id;
  end if;

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.os_update_lead(
  uuid, text, boolean, boolean, boolean, date, boolean, time, boolean, text, text, numeric
) from public, anon;
grant execute on function public.os_update_lead(
  uuid, text, boolean, boolean, boolean, date, boolean, time, boolean, text, text, numeric
) to authenticated;

alter table public.os_lead_opportunity_losses enable row level security;

revoke all on table public.os_lead_opportunity_losses from public, anon;
grant select, insert, update, delete on table public.os_lead_opportunity_losses to authenticated;

drop policy if exists "OS users can read lead opportunity losses" on public.os_lead_opportunity_losses;
create policy "OS users can read lead opportunity losses"
  on public.os_lead_opportunity_losses
  for select
  to authenticated
  using (public.is_permission_granted('leads.read'));

drop policy if exists "OS users can create lead opportunity losses" on public.os_lead_opportunity_losses;
create policy "OS users can create lead opportunity losses"
  on public.os_lead_opportunity_losses
  for insert
  to authenticated
  with check (
    public.is_permission_granted('leads.write')
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

drop policy if exists "OS users can update lead opportunity losses" on public.os_lead_opportunity_losses;
create policy "OS users can update lead opportunity losses"
  on public.os_lead_opportunity_losses
  for update
  to authenticated
  using (public.is_permission_granted('leads.write'))
  with check (
    public.is_permission_granted('leads.write')
    and updated_by = auth.uid()
  );

drop policy if exists "OS users can delete lead opportunity losses" on public.os_lead_opportunity_losses;
create policy "OS users can delete lead opportunity losses"
  on public.os_lead_opportunity_losses
  for delete
  to authenticated
  using (public.is_permission_granted('leads.write'));

commit;
