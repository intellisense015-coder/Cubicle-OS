begin;

-- Reactivation must use the same capacity rules as normal shared-workspace
-- assignment. The original lifecycle function only accepted status=available,
-- which rejected an occupied shared workspace even when it still had capacity.
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

  if workspace_key is not null then
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
    'spaceId', coalesce(workspace_key, ''),
    'space', coalesce(workspace_key, 'Unassigned'),
    'rent', coalesce(target.monthly_rent, 0),
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

  if workspace_key is not null then
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
  end if;

  return target;
end;
$$;

revoke all on function public.reactivate_member_lifecycle(uuid, text) from public, anon;
grant execute on function public.reactivate_member_lifecycle(uuid, text) to authenticated, service_role;

commit;
