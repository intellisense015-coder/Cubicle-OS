begin;

-- OS-owned assignment metadata. The public.leads table is shared with the
-- website, so assignment stays in an OS-owned table instead of changing the
-- website lead schema.
create table if not exists public.os_lead_assignments (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  assigned_to text not null check (char_length(btrim(assigned_to)) between 1 and 160),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.os_lead_assignments is
  'OS-owned assignment metadata for shared website leads.';

alter table public.os_lead_assignments enable row level security;

revoke all on table public.os_lead_assignments from public, anon;
grant select, insert, update, delete on table public.os_lead_assignments to authenticated;

drop policy if exists "OS users can read lead assignments" on public.os_lead_assignments;
create policy "OS users can read lead assignments"
  on public.os_lead_assignments
  for select
  to authenticated
  using (public.is_permission_granted('leads.read'));

drop policy if exists "OS users can create lead assignments" on public.os_lead_assignments;
create policy "OS users can create lead assignments"
  on public.os_lead_assignments
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

drop policy if exists "OS users can update lead assignments" on public.os_lead_assignments;
create policy "OS users can update lead assignments"
  on public.os_lead_assignments
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

drop policy if exists "OS users can delete lead assignments" on public.os_lead_assignments;
create policy "OS users can delete lead assignments"
  on public.os_lead_assignments
  for delete
  to authenticated
  using (
    public.is_permission_granted('leads.write')
    or public.is_permission_granted('leads.followups.write')
    or public.is_permission_granted('leads.journey.write')
  );

-- Replace the current contact/stage-aware RPC with the same behavior plus an
-- optional persisted assignment update. The old 15-argument function must be
-- removed first because PostgreSQL identifies functions by argument types.
drop function if exists public.os_update_lead(
  uuid, text, boolean, boolean, boolean, date, boolean, time, boolean,
  text, text, numeric, text, text, text
);

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
  p_lost_monthly_value numeric default null,
  p_permission_key text default 'leads.write',
  p_email text default null,
  p_contact_number text default null,
  p_assigned_to text default null,
  p_update_assigned_to boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lead public.leads;
  v_now timestamptz := clock_timestamp();
  v_assigned_to text := nullif(btrim(p_assigned_to), '');
begin
  if p_permission_key not in ('leads.write', 'leads.followups.write', 'leads.journey.write') then
    raise exception 'Invalid lead permission.' using errcode = '22023';
  end if;

  if not public.is_permission_granted(p_permission_key) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  if p_stage is not null and p_stage not in (
    'New lead',
    'Follow-up due',
    'Visit scheduled',
    'Visited',
    'Quotation requested',
    'Quote Sent',
    'Proposal Sent',
    'Proposal Approved',
    'Quotation Approved',
    'Agreement shared',
    'Converted',
    'Not interested'
  ) then
    raise exception 'Invalid lead stage.' using errcode = '22023';
  end if;

  if p_email is not null and (
    char_length(btrim(p_email)) < 3
    or char_length(p_email) > 320
    or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ) then
    raise exception 'Invalid lead email.' using errcode = '22023';
  end if;

  if p_contact_number is not null and (
    char_length(btrim(p_contact_number)) < 1
    or char_length(p_contact_number) > 40
  ) then
    raise exception 'Invalid lead phone number.' using errcode = '22023';
  end if;

  if p_update_assigned_to and v_assigned_to is not null and char_length(v_assigned_to) > 160 then
    raise exception 'Invalid lead assignment.' using errcode = '22023';
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
    email = case when p_email is not null then lower(btrim(p_email)) else email end,
    contact_number = case when p_contact_number is not null then btrim(p_contact_number) else contact_number end,
    workspace_option = case when p_update_workspace then p_workspace_option else workspace_option end,
    visited = case when p_update_visited then p_visited else visited end,
    visit_date = case when p_update_visit_date then p_visit_date else visit_date end,
    visit_time = case when p_update_visit_time then p_visit_time else visit_time end,
    os_stage = case when p_stage is not null then p_stage else os_stage end
  where id = p_id
  returning * into v_lead;

  if not found then
    raise exception 'Lead not found.';
  end if;

  if p_update_assigned_to then
    if v_assigned_to is null or lower(v_assigned_to) = 'unassigned' then
      delete from public.os_lead_assignments where lead_id = p_id;
    else
      insert into public.os_lead_assignments (
        lead_id, assigned_to, created_by, updated_by, created_at, updated_at
      ) values (
        p_id, v_assigned_to, auth.uid(), auth.uid(), v_now, v_now
      )
      on conflict (lead_id) do update
        set assigned_to = excluded.assigned_to,
            updated_by = auth.uid(),
            updated_at = v_now;
    end if;
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
  uuid, text, boolean, boolean, boolean, date, boolean, time, boolean,
  text, text, numeric, text, text, text, text, boolean
) from public, anon;
grant execute on function public.os_update_lead(
  uuid, text, boolean, boolean, boolean, date, boolean, time, boolean,
  text, text, numeric, text, text, text, text, boolean
) to authenticated;

commit;
