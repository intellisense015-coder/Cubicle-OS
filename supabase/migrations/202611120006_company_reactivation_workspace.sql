begin;

-- Reactivate a company and place all of its linked members in one selected
-- workspace after validating the complete company-level capacity.
create or replace function public.reactivate_company_members(
  p_company_id uuid,
  p_workspace_id text
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
  workspace_key text := nullif(trim(p_workspace_id), '');
  periods jsonb;
  company_member_count integer;
  external_active_count integer;
  total_active_count integer;
  capacity integer;
  company_names text;
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_permission_granted('companies.write') then
    raise exception 'You are not allowed to change company status.' using errcode = '42501';
  end if;
  if workspace_key is null then
    raise exception 'Choose a workspace before reactivating the company.' using errcode = '22023';
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

  select count(*) into company_member_count
  from public.members m
  where lower(coalesce(m.company_name, '')) = lower(coalesce(company_row.name, ''));

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
      'rent', coalesce(member_row.monthly_rent, 0),
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

revoke all on function public.reactivate_company_members(uuid, text) from public, anon;
grant execute on function public.reactivate_company_members(uuid, text) to authenticated, service_role;

commit;
