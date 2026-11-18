begin;

alter table public.members
  add column if not exists membership_status text not null default 'active',
  add column if not exists notice_start_date date,
  add column if not exists expected_leaving_date date,
  add column if not exists notice_notes text,
  add column if not exists membership_periods jsonb not null default '[]'::jsonb,
  add column if not exists notice_reason text,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text,
  add column if not exists deactivation_description text;

alter table public.members
  alter column membership_status set default 'active';

update public.members
set membership_status = 'active'
where membership_status is null;

update public.members
set membership_status = 'active',
    notice_start_date = null,
    expected_leaving_date = null,
    notice_reason = null,
    notice_notes = null
where lower(coalesce(status, 'active')) = 'inactive';

alter table public.members
  drop constraint if exists members_lifecycle_status_check,
  drop constraint if exists members_lifecycle_notice_check,
  drop constraint if exists members_lifecycle_deactivation_check;

alter table public.members
  add constraint members_lifecycle_status_check check (
    lower(coalesce(status, 'active')) in ('active', 'activated', 'inactive')
    and lower(coalesce(membership_status, 'active')) in ('active', 'notice_period')
    and not (lower(coalesce(status, 'active')) = 'inactive' and lower(coalesce(membership_status, 'active')) = 'notice_period')
  ),
  add constraint members_lifecycle_notice_check check (
    lower(coalesce(membership_status, 'active')) <> 'notice_period'
    or (notice_start_date is not null and expected_leaving_date is not null and expected_leaving_date >= notice_start_date)
  ),
  add constraint members_lifecycle_deactivation_check check (
    deactivated_at is null
    or (nullif(trim(deactivation_reason), '') is not null and nullif(trim(deactivation_description), '') is not null)
  );

create index if not exists members_lifecycle_expiry_idx
  on public.members (membership_status, expected_leaving_date)
  where lower(coalesce(status, 'active')) in ('active', 'activated') and membership_status = 'notice_period';

create unique index if not exists invoices_member_period_unique_idx
  on public.invoices (member_id, period_start)
  where member_id is not null and period_start is not null;

create or replace function public.transition_member_lifecycle(
  p_member_id uuid,
  p_action text,
  p_expected_leaving_date date default null,
  p_notice_reason text default null,
  p_notice_details text default null,
  p_deactivation_reason text default null,
  p_deactivation_description text default null,
  p_replacement_invoice_recipient_id uuid default null,
  p_workspace_id text default null,
  p_system boolean default false,
  p_effective_date date default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.members%rowtype;
  replacement public.members%rowtype;
  affected_workspace_ids text[] := '{}';
  workspace_id text;
  representative public.members%rowtype;
  remaining_count integer;
  company_names text;
  periods jsonb;
  actor uuid := auth.uid();
  assigned_space text;
  effective_date date := coalesce(p_effective_date, current_date);
begin
  if p_system and auth.role() <> 'service_role' then
    raise exception 'System lifecycle transitions require the service role.' using errcode = '42501';
  end if;
  if not p_system and (actor is null or not public.is_permission_granted('members.write')) then
    raise exception 'You are not allowed to change member lifecycle.' using errcode = '42501';
  end if;
  if p_action not in ('start_notice', 'cancel_notice', 'deactivate', 'reactivate', 'expire_notice') then
    raise exception 'Invalid member lifecycle action.' using errcode = '22023';
  end if;

  select * into target from public.members where id = p_member_id for update;
  if not found then raise exception 'Member was not found.' using errcode = 'P0002'; end if;

  if p_action = 'start_notice' then
    if lower(coalesce(target.status, 'active')) = 'inactive' then raise exception 'Inactive members cannot start a notice period.' using errcode = '22023'; end if;
    if p_expected_leaving_date is null or p_expected_leaving_date < effective_date then raise exception 'Expected leaving date must be today or later.' using errcode = '22023'; end if;
    if nullif(trim(p_notice_reason), '') is null or nullif(trim(p_notice_details), '') is null then raise exception 'Notice reason and details are required.' using errcode = '22023'; end if;
    update public.members set
      membership_status = 'notice_period',
      notice_start_date = coalesce(target.notice_start_date, current_date),
      expected_leaving_date = p_expected_leaving_date,
      notice_reason = trim(p_notice_reason),
      notice_notes = trim(p_notice_details),
      updated_by = coalesce(actor, updated_by),
      updated_at = now()
    where id = p_member_id returning * into target;
    return target;
  end if;

  if p_action = 'cancel_notice' then
    if lower(coalesce(target.status, 'active')) = 'inactive' then raise exception 'Inactive members do not have a notice period.' using errcode = '22023'; end if;
    update public.members set
      membership_status = 'active',
      notice_start_date = null,
      expected_leaving_date = null,
      notice_reason = null,
      notice_notes = null,
      updated_by = coalesce(actor, updated_by),
      updated_at = now()
    where id = p_member_id returning * into target;
    return target;
  end if;

  if p_action = 'reactivate' then
    if lower(coalesce(target.status, 'active')) <> 'inactive' then raise exception 'Only inactive members can be reactivated.' using errcode = '22023'; end if;
    periods := case when jsonb_typeof(coalesce(target.membership_periods, '[]'::jsonb)) = 'array' then coalesce(target.membership_periods, '[]'::jsonb) else '[]'::jsonb end;
    periods := periods || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'company', coalesce(target.company_name, ''),
      'companyId', '',
      'team', coalesce(target.team, ''),
      'spaceId', coalesce(nullif(p_workspace_id, ''), ''),
      'space', coalesce(nullif(p_workspace_id, ''), 'Unassigned'),
      'rent', coalesce(target.monthly_rent, 0),
      'deposit', coalesce(target.security_deposit, 0),
      'startDate', current_date::text,
      'endDate', '',
      'billingStartDate', current_date::text,
      'status', 'Active'
    ));
    update public.members set
      status = 'active',
      membership_status = 'active',
      joined_date = current_date,
      billing_start_date = current_date,
      assigned_space = null,
      notice_start_date = null,
      expected_leaving_date = null,
      notice_reason = null,
      notice_notes = null,
      deactivated_at = null,
      deactivation_reason = null,
      deactivation_description = null,
      membership_periods = periods,
      updated_by = coalesce(actor, updated_by),
      updated_at = now()
    where id = p_member_id returning * into target;

    if nullif(trim(p_workspace_id), '') is not null then
      if not exists (select 1 from public.workspaces where id::text = p_workspace_id and lower(coalesce(status, 'available')) = 'available' and upper(coalesce(operational_status, 'ACTIVE')) = 'ACTIVE' for update) then
        raise exception 'That workspace is not available.' using errcode = '40901';
      end if;
      update public.members set assigned_space = p_workspace_id, updated_by = coalesce(actor, updated_by), updated_at = now() where id = p_member_id returning * into target;
      update public.workspaces set member_id = p_member_id, occupant = target.member_name, company_name = coalesce(target.company_name, 'Unassigned'), status = 'occupied', membership_status = 'active', notice_start_date = null, expected_leaving_date = null, notice_notes = null, updated_by = coalesce(actor, updated_by), updated_at = now() where id::text = p_workspace_id;
    end if;
    return target;
  end if;

  if p_action = 'expire_notice' and (
    lower(coalesce(target.status, 'active')) = 'inactive'
    or lower(coalesce(target.membership_status, 'active')) <> 'notice_period'
    or target.expected_leaving_date is null
    or target.expected_leaving_date > effective_date
  ) then
    return target;
  end if;
  if lower(coalesce(target.status, 'active')) = 'inactive' then
    raise exception 'Member is already inactive.' using errcode = '22023';
  end if;

  assigned_space := target.assigned_space;
  if p_action = 'deactivate' and not p_system and (nullif(trim(p_deactivation_reason), '') is null or nullif(trim(p_deactivation_description), '') is null) then
    raise exception 'Deactivation reason and description are required.' using errcode = '22023';
  end if;
  if p_action = 'deactivate' and not p_system and exists (select 1 from public.invoice_automation_settings where p_member_id = any(coalesce(member_ids, '{}'::uuid[]))) then
    if p_replacement_invoice_recipient_id is null then raise exception 'Select another active invoice recipient before deactivation.' using errcode = '22023'; end if;
    if not public.is_permission_granted('invoices.write') then raise exception 'Invoice management permission is required.' using errcode = '42501'; end if;
    select * into replacement from public.members where id = p_replacement_invoice_recipient_id and lower(coalesce(status, 'active')) in ('active', 'activated') and lower(coalesce(membership_status, 'active')) in ('active', 'notice_period') for update;
    if not found or lower(coalesce(replacement.company_name, '')) <> lower(coalesce(target.company_name, '')) then raise exception 'Replacement invoice recipient must be another active member of the same company.' using errcode = '22023'; end if;
    update public.invoice_automation_settings set member_ids = array_append(array_remove(member_ids, p_member_id), p_replacement_invoice_recipient_id), updated_by = actor, updated_at = now() where id = 1;
  elsif p_action = 'expire_notice' then
    if lower(coalesce(target.membership_status, 'active')) <> 'notice_period' or target.expected_leaving_date is null or target.expected_leaving_date > effective_date then raise exception 'The member notice period has not ended.' using errcode = '22023'; end if;
    update public.invoice_automation_settings set member_ids = array_remove(member_ids, p_member_id), updated_by = coalesce(actor, updated_by), updated_at = now() where id = 1;
  end if;

  periods := case when jsonb_typeof(coalesce(target.membership_periods, '[]'::jsonb)) = 'array' then coalesce(target.membership_periods, '[]'::jsonb) else '[]'::jsonb end;
  if jsonb_array_length(periods) = 0 then
    periods := jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'company', coalesce(target.company_name, ''), 'team', coalesce(target.team, ''), 'spaceId', coalesce(target.assigned_space, ''), 'space', coalesce(target.assigned_space, 'Unassigned'), 'rent', coalesce(target.monthly_rent, 0), 'deposit', coalesce(target.security_deposit, 0), 'startDate', coalesce(target.joined_date, current_date)::text, 'endDate', current_date::text, 'billingStartDate', coalesce(target.billing_start_date, current_date)::text, 'status', 'Completed'));
  else
    select coalesce(jsonb_agg(case when item.ordinality = jsonb_array_length(periods) and item.value->>'status' = 'Active' then item.value || jsonb_build_object('status', 'Completed', 'endDate', current_date::text) else item.value end order by item.ordinality), '[]'::jsonb) into periods from jsonb_array_elements(periods) with ordinality item(value, ordinality);
  end if;

  select coalesce(array_agg(id::text), '{}') into affected_workspace_ids from public.workspaces where member_id = p_member_id or (nullif(assigned_space, '') is not null and id::text = assigned_space);
  update public.members set
    status = 'inactive',
    membership_status = 'active',
    notice_start_date = null,
    expected_leaving_date = null,
    notice_reason = null,
    notice_notes = null,
    deactivated_at = case when p_system then coalesce(deactivated_at, now()) else now() end,
    deactivation_reason = case when p_system then 'Notice period ended' else trim(p_deactivation_reason) end,
    deactivation_description = case when p_system then 'Automatically deactivated after the expected leaving date.' else trim(p_deactivation_description) end,
    assigned_space = null,
    membership_periods = periods,
    updated_by = coalesce(actor, updated_by),
    updated_at = now()
  where id = p_member_id returning * into target;

  update public.workspaces set member_id = null, occupant = 'Available', company_name = 'Unassigned', status = 'available', membership_status = 'active', notice_start_date = null, expected_leaving_date = null, notice_notes = null, updated_by = coalesce(actor, updated_by), updated_at = now() where member_id = p_member_id or (nullif(assigned_space, '') is not null and id::text = assigned_space);

  foreach workspace_id in array affected_workspace_ids loop
    select count(*) into remaining_count from public.members where assigned_space = workspace_id and lower(coalesce(status, 'active')) in ('active', 'activated');
    if remaining_count > 0 then
      select * into representative from public.members where assigned_space = workspace_id and lower(coalesce(status, 'active')) in ('active', 'activated') order by joined_date nulls last, created_at limit 1;
      select string_agg(distinct nullif(trim(company_name), ''), ', ' order by nullif(trim(company_name), '')) into company_names from public.members where assigned_space = workspace_id and lower(coalesce(status, 'active')) in ('active', 'activated');
      update public.workspaces set member_id = representative.id, occupant = case when remaining_count > 1 then remaining_count::text || ' members' else representative.member_name end, company_name = coalesce(company_names, 'Unassigned'), status = 'occupied', membership_status = coalesce(representative.membership_status, 'active'), notice_start_date = representative.notice_start_date, expected_leaving_date = representative.expected_leaving_date, notice_notes = representative.notice_notes, updated_by = coalesce(actor, updated_by), updated_at = now() where id::text = workspace_id;
    end if;
  end loop;
  return target;
end;
$$;

revoke all on function public.transition_member_lifecycle(uuid, text, date, text, text, text, text, uuid, text, boolean, date) from public, anon;
grant execute on function public.transition_member_lifecycle(uuid, text, date, text, text, text, text, uuid, text, boolean, date) to authenticated, service_role;

commit;
