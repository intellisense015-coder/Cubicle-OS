begin;

-- Deactivate a company and all of its linked members as one lifecycle
-- operation. Member edit mutations intentionally preserve lifecycle fields,
-- so company deactivation must use its own database operation.
create or replace function public.deactivate_company_members(
  p_company_id uuid
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  company_row public.companies%rowtype;
  member_row public.members%rowtype;
  representative public.members%rowtype;
  affected_workspace_ids text[] := '{}';
  affected_member_ids uuid[] := '{}';
  workspace_key text;
  periods jsonb;
  remaining_count integer;
  company_names text;
  member_id uuid;
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_permission_granted('companies.write') then
    raise exception 'You are not allowed to change company status.' using errcode = '42501';
  end if;

  select * into company_row
  from public.companies
  where id = p_company_id
  for update;
  if not found then
    raise exception 'Company was not found.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct nullif(trim(m.assigned_space), '')), '{}')
    into affected_workspace_ids
  from public.members m
  where lower(coalesce(m.company_name, '')) = lower(coalesce(company_row.name, ''));

  select coalesce(array_agg(m.id), '{}')
    into affected_member_ids
  from public.members m
  where lower(coalesce(m.company_name, '')) = lower(coalesce(company_row.name, ''));

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

    if jsonb_array_length(periods) = 0 then
      periods := jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'company', coalesce(member_row.company_name, ''),
        'companyId', '',
        'team', coalesce(member_row.team, ''),
        'spaceId', coalesce(nullif(trim(member_row.assigned_space), ''), ''),
        'space', coalesce(nullif(trim(member_row.assigned_space), ''), 'Unassigned'),
        'rent', coalesce(member_row.monthly_rent, 0),
        'deposit', coalesce(member_row.security_deposit, 0),
        'startDate', coalesce(member_row.joined_date, current_date)::text,
        'endDate', current_date::text,
        'billingStartDate', coalesce(member_row.billing_start_date, current_date)::text,
        'status', 'Completed'
      ));
    else
      select coalesce(jsonb_agg(
        case
          when item.ordinality = jsonb_array_length(periods)
            and item.value->>'status' = 'Active'
            then item.value || jsonb_build_object('status', 'Completed', 'endDate', current_date::text)
          else item.value
        end
        order by item.ordinality
      ), '[]'::jsonb)
      into periods
      from jsonb_array_elements(periods) with ordinality item(value, ordinality);
    end if;

    update public.members
    set status = 'inactive',
        membership_status = 'active',
        notice_start_date = null,
        expected_leaving_date = null,
        notice_reason = null,
        notice_notes = null,
        deactivated_at = coalesce(member_row.deactivated_at, now()),
        deactivation_reason = coalesce(nullif(trim(member_row.deactivation_reason), ''), 'Company deactivated'),
        deactivation_description = coalesce(nullif(trim(member_row.deactivation_description), ''), 'Automatically deactivated because the company was deactivated.'),
        assigned_space = null,
        membership_periods = periods,
        updated_by = actor,
        updated_at = now()
    where id = member_row.id;
  end loop;

  foreach member_id in array affected_member_ids loop
    update public.invoice_automation_settings
    set member_ids = array_remove(member_ids, member_id),
        updated_by = actor,
        updated_at = now()
    where id = 1;
  end loop;

  update public.companies
  set status = 'inactive',
      updated_at = now()
  where id = p_company_id
  returning * into company_row;

  foreach workspace_key in array affected_workspace_ids loop
    select count(*) into remaining_count
    from public.members m
    where m.assigned_space = workspace_key
      and lower(coalesce(m.status, 'active')) in ('active', 'activated');

    if remaining_count > 0 then
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
          occupant = case when remaining_count > 1 then remaining_count::text || ' members' else representative.member_name end,
          company_name = coalesce(company_names, 'Unassigned'),
          status = 'occupied',
          membership_status = coalesce(representative.membership_status, 'active'),
          notice_start_date = representative.notice_start_date,
          expected_leaving_date = representative.expected_leaving_date,
          notice_notes = representative.notice_notes,
          updated_by = actor,
          updated_at = now()
      where w.id::text = workspace_key;
    else
      update public.workspaces w
      set member_id = null,
          occupant = 'Available',
          company_name = 'Unassigned',
          status = 'available',
          membership_status = 'active',
          notice_start_date = null,
          expected_leaving_date = null,
          notice_notes = null,
          updated_by = actor,
          updated_at = now()
      where w.id::text = workspace_key;
    end if;
  end loop;

  return company_row;
end;
$$;

revoke all on function public.deactivate_company_members(uuid) from public, anon;
grant execute on function public.deactivate_company_members(uuid) to authenticated, service_role;

commit;
