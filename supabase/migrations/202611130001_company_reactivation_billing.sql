begin;

-- Active members must always have a real workspace and a positive monthly rent.
-- NOT VALID keeps existing legacy rows from blocking this migration while still
-- enforcing the rule for every new or updated row.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_active_requires_workspace_and_rent'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_active_requires_workspace_and_rent check (
        lower(coalesce(status, 'active')) not in ('active', 'activated')
        or (
          nullif(trim(assigned_space), '') is not null
          and lower(trim(assigned_space)) <> 'unassigned'
          and coalesce(monthly_rent, 0) > 0
        )
      ) not valid;
  end if;
end;
$$;

drop function if exists public.reactivate_company_members(uuid, text);

create or replace function public.reactivate_company_members(
  p_company_id uuid,
  p_workspace_id text,
  p_monthly_rent numeric,
  p_invoice_recipient_id uuid
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  company_row public.companies%rowtype;
  member_row public.members%rowtype;
  selected_workspace public.workspaces%rowtype;
  representative public.members%rowtype;
  invoice_recipient public.members%rowtype;
  workspace_key text := nullif(trim(p_workspace_id), '');
  periods jsonb;
  company_member_count integer;
  external_active_count integer;
  total_active_count integer;
  capacity integer;
  company_names text;
  member_id uuid;
  company_member_ids uuid[] := '{}';
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_permission_granted('companies.write') then
    raise exception 'You are not allowed to change company status.' using errcode = '42501';
  end if;
  if workspace_key is null or lower(workspace_key) = 'unassigned' then
    raise exception 'Choose a real workspace before reactivating the company.' using errcode = '22023';
  end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then
    raise exception 'Enter a monthly rent greater than PKR 0.' using errcode = '22023';
  end if;

  select * into company_row
  from public.companies
  where id = p_company_id
  for update;
  if not found then
    raise exception 'Company was not found.' using errcode = 'P0002';
  end if;

  select * into selected_workspace
  from public.workspaces
  where id::text = workspace_key
  for update;
  if not found
    or lower(coalesce(selected_workspace.kind, '')) not in ('office', 'seat', 'cabin')
    or upper(coalesce(selected_workspace.operational_status, 'ACTIVE')) <> 'ACTIVE'
    or lower(coalesce(selected_workspace.maintenance_status, 'deactivated')) <> 'deactivated'
    or lower(coalesce(selected_workspace.status, 'available')) in ('maintenance', 'reserved') then
    raise exception 'That workspace is not available.' using errcode = '40901';
  end if;

  select count(*), coalesce(array_agg(m.id), '{}')
    into company_member_count, company_member_ids
  from public.members m
  where lower(coalesce(m.company_name, '')) = lower(coalesce(company_row.name, ''));

  if company_member_count = 0 then
    raise exception 'This company has no members to reactivate.' using errcode = '22023';
  end if;

  if p_invoice_recipient_id is not null then
    if not public.is_permission_granted('invoices.write') then
      raise exception 'Invoice management permission is required to choose an invoice recipient.' using errcode = '42501';
    end if;
    select * into invoice_recipient
    from public.members m
    where m.id = p_invoice_recipient_id
      and lower(coalesce(m.company_name, '')) = lower(coalesce(company_row.name, ''))
    for update;
    if not found then
      raise exception 'The invoice recipient must be a member of this company.' using errcode = '22023';
    end if;
  end if;

  select count(*) into external_active_count
  from public.members m
  where m.assigned_space = workspace_key
    and lower(coalesce(m.status, 'active')) in ('active', 'activated')
    and lower(coalesce(m.company_name, '')) <> lower(coalesce(company_row.name, ''));

  capacity := greatest(coalesce(selected_workspace.capacity, 1), 1);
  total_active_count := external_active_count + company_member_count;
  if total_active_count > capacity then
    raise exception 'That workspace does not have enough capacity for all company members.' using errcode = '40901';
  end if;

  for member_row in
    select *
    from public.members m
    where lower(coalesce(m.company_name, '')) = lower(coalesce(company_row.name, ''))
    for update
  loop
    periods := case
      when jsonb_typeof(coalesce(member_row.membership_periods, '[]'::jsonb)) = 'array'
        then coalesce(member_row.membership_periods, '[]'::jsonb)
      else '[]'::jsonb
    end;
    periods := periods || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'company', coalesce(member_row.company_name, ''),
      'companyId', p_company_id::text,
      'team', coalesce(member_row.team, ''),
      'spaceId', workspace_key,
      'space', workspace_key,
      'rent', p_monthly_rent,
      'deposit', coalesce(member_row.security_deposit, 0),
      'startDate', current_date::text,
      'endDate', '',
      'billingStartDate', current_date::text,
      'status', 'Active'
    ));

    update public.members
    set status = 'active',
        membership_status = 'active',
        joined_date = current_date,
        billing_start_date = current_date,
        assigned_space = workspace_key,
        monthly_rent = p_monthly_rent,
        notice_start_date = null,
        expected_leaving_date = null,
        notice_reason = null,
        notice_notes = null,
        deactivated_at = null,
        deactivation_reason = null,
        deactivation_description = null,
        membership_periods = periods,
        updated_by = actor,
        updated_at = now()
    where id = member_row.id;
  end loop;

  -- A deactivated company must not leave stale invoice recipients behind. If
  -- an optional recipient was selected, add only that member back.
  foreach member_id in array company_member_ids loop
    update public.invoice_automation_settings
    set member_ids = array_remove(coalesce(member_ids, '{}'), member_id),
        updated_by = actor,
        updated_at = now()
    where id = 1;
  end loop;
  if p_invoice_recipient_id is not null then
    update public.invoice_automation_settings
    set member_ids = array_append(array_remove(coalesce(member_ids, '{}'), p_invoice_recipient_id), p_invoice_recipient_id),
        updated_by = actor,
        updated_at = now()
    where id = 1;
  end if;

  select count(*) into total_active_count
  from public.members m
  where m.assigned_space = workspace_key
    and lower(coalesce(m.status, 'active')) in ('active', 'activated');

  select * into representative
  from public.members m
  where m.assigned_space = workspace_key
    and lower(coalesce(m.status, 'active')) in ('active', 'activated')
  order by m.joined_date nulls last, m.created_at
  limit 1;

  select string_agg(distinct nullif(trim(m.company_name), ''), ', ' order by nullif(trim(m.company_name), ''))
    into company_names
  from public.members m
  where m.assigned_space = workspace_key
    and lower(coalesce(m.status, 'active')) in ('active', 'activated');

  update public.workspaces w
  set member_id = representative.id,
      occupant = case when total_active_count > 1 then total_active_count::text || ' members' else representative.member_name end,
      company_name = coalesce(company_names, 'Unassigned'),
      status = 'occupied',
      membership_status = 'active',
      notice_start_date = null,
      expected_leaving_date = null,
      notice_notes = null,
      updated_by = actor,
      updated_at = now()
  where w.id::text = workspace_key;

  update public.companies
  set status = 'active',
      updated_at = now()
  where id = p_company_id
  returning * into company_row;

  return company_row;
end;
$$;

revoke all on function public.reactivate_company_members(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.reactivate_company_members(uuid, text, numeric, uuid) to authenticated, service_role;

-- Individual reactivation must obey the same active-member invariant. The
-- workspace is mandatory and the existing member rent must already be > 0.
create or replace function public.reactivate_member_lifecycle(
  p_member_id uuid,
  p_workspace_id text default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.members%rowtype;
  selected_workspace public.workspaces%rowtype;
  representative public.members%rowtype;
  periods jsonb;
  active_count integer;
  capacity integer;
  company_names text;
  actor uuid := auth.uid();
  workspace_key text := nullif(trim(p_workspace_id), '');
begin
  if actor is null or not public.is_permission_granted('members.write') then
    raise exception 'You are not allowed to change member lifecycle.' using errcode = '42501';
  end if;
  if workspace_key is null or lower(workspace_key) = 'unassigned' then
    raise exception 'Choose a real workspace before reactivating the member.' using errcode = '22023';
  end if;

  select * into target
  from public.members
  where id = p_member_id
  for update;
  if not found then
    raise exception 'Member was not found.' using errcode = 'P0002';
  end if;
  if lower(coalesce(target.status, 'active')) <> 'inactive' then
    raise exception 'Only inactive members can be reactivated.' using errcode = '22023';
  end if;
  if coalesce(target.monthly_rent, 0) <= 0 then
    raise exception 'Enter a monthly rent greater than PKR 0 before reactivating the member.' using errcode = '22023';
  end if;

  select * into selected_workspace
  from public.workspaces
  where id::text = workspace_key
  for update;
  if not found
    or lower(coalesce(selected_workspace.kind, '')) not in ('office', 'seat', 'cabin')
    or upper(coalesce(selected_workspace.operational_status, 'ACTIVE')) <> 'ACTIVE'
    or lower(coalesce(selected_workspace.maintenance_status, 'deactivated')) <> 'deactivated'
    or lower(coalesce(selected_workspace.status, 'available')) in ('maintenance', 'reserved') then
    raise exception 'That workspace is not available.' using errcode = '40901';
  end if;

  select count(*) into active_count
  from public.members m
  where m.assigned_space = workspace_key
    and m.id <> p_member_id
    and lower(coalesce(m.status, 'active')) in ('active', 'activated');

  capacity := greatest(coalesce(selected_workspace.capacity, 1), 1);
  if active_count >= capacity then
    raise exception 'That workspace is not available.' using errcode = '40901';
  end if;

  periods := case
    when jsonb_typeof(coalesce(target.membership_periods, '[]'::jsonb)) = 'array'
      then coalesce(target.membership_periods, '[]'::jsonb)
    else '[]'::jsonb
  end;
  periods := periods || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'company', coalesce(target.company_name, ''),
    'companyId', '',
    'team', coalesce(target.team, ''),
    'spaceId', workspace_key,
    'space', workspace_key,
    'rent', target.monthly_rent,
    'deposit', coalesce(target.security_deposit, 0),
    'startDate', current_date::text,
    'endDate', '',
    'billingStartDate', current_date::text,
    'status', 'Active'
  ));

  update public.members
  set status = 'active',
      membership_status = 'active',
      joined_date = current_date,
      billing_start_date = current_date,
      assigned_space = workspace_key,
      notice_start_date = null,
      expected_leaving_date = null,
      notice_reason = null,
      notice_notes = null,
      deactivated_at = null,
      deactivation_reason = null,
      deactivation_description = null,
      membership_periods = periods,
      updated_by = actor,
      updated_at = now()
  where id = p_member_id
  returning * into target;

  select count(*) into active_count
  from public.members m
  where m.assigned_space = workspace_key
    and lower(coalesce(m.status, 'active')) in ('active', 'activated');

  select * into representative
  from public.members m
  where m.assigned_space = workspace_key
    and lower(coalesce(m.status, 'active')) in ('active', 'activated')
  order by m.joined_date nulls last, m.created_at
  limit 1;

  select string_agg(distinct nullif(trim(m.company_name), ''), ', ' order by nullif(trim(m.company_name), ''))
    into company_names
  from public.members m
  where m.assigned_space = workspace_key
    and lower(coalesce(m.status, 'active')) in ('active', 'activated');

  update public.workspaces w
  set member_id = representative.id,
      occupant = case when active_count > 1 then active_count::text || ' members' else representative.member_name end,
      company_name = coalesce(company_names, 'Unassigned'),
      status = 'occupied',
      membership_status = 'active',
      notice_start_date = null,
      expected_leaving_date = null,
      notice_notes = null,
      updated_by = actor,
      updated_at = now()
  where w.id::text = workspace_key;

  return target;
end;
$$;

revoke all on function public.reactivate_member_lifecycle(uuid, text) from public, anon;
grant execute on function public.reactivate_member_lifecycle(uuid, text) to authenticated, service_role;

commit;
