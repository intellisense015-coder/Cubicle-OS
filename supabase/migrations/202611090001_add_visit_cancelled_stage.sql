begin;

-- Persist cancelled visits as a distinct OS lead stage so cancellation does
-- not look like an active follow-up or a completed visit after a reload.
with latest_visit as (
  select distinct on (lead_id)
    lead_id,
    status
  from public.visits
  where lead_id is not null
  order by lead_id, coalesce(updated_at, created_at) desc, id desc
)
update public.leads as lead
set
  os_stage = 'Visit cancelled',
  visit_date = null,
  visit_time = null,
  visited = false
from latest_visit
where latest_visit.lead_id = lead.id
  and latest_visit.status = 'Cancelled';

drop function if exists public.os_update_lead(
  uuid, text, boolean, boolean, boolean, date, boolean, time, boolean,
  text, text, numeric, text, text, text, text, boolean
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
    'Visit cancelled',
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
