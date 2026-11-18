begin;

-- Office 20 and the visually enclosed Cabin 02 are one 20-person office.
-- Move references to the canonical office workspace before removing the
-- duplicate workspace row.
do $$
begin
  if not exists (select 1 from public.workspaces where id = 'floor4-office20') then
    raise exception 'Canonical workspace floor4-office20 was not found.';
  end if;
end;
$$;

-- The workspace audit trigger derives updated_by from auth.uid(). Supabase's
-- SQL editor has no JWT subject, so provide the existing workspace creator as
-- the transaction-local actor for this data migration.
do $$
declare
  audit_actor text;
begin
  select created_by::text
    into audit_actor
  from public.workspaces
  where id = 'floor4-office20'
    and created_by is not null
  limit 1;

  if audit_actor is null then
    raise exception 'Workspace floor4-office20 has no valid audit actor.';
  end if;

  perform set_config('request.jwt.claim.sub', audit_actor, true);
end;
$$;

-- Existing workspace rows may predate the audit-column requirement. Repair
-- those rows from their original creator before any workspace update runs.
update public.workspaces
set updated_by = created_by
where updated_by is null
  and created_by is not null;

update public.members
set assigned_space = 'floor4-office20'
where assigned_space = 'floor4-cabin02';

update public.invoices
set workspace_id = 'floor4-office20'
where workspace_id = 'floor4-cabin02';

update public.maintenance_records
set workspace_id = 'floor4-office20'
where workspace_id = 'floor4-cabin02';

update public.workspaces canonical
set label = 'Office 20',
    workspace_type = 'Private office',
    kind = 'office',
    capacity = 20,
    updated_by = coalesce(
      canonical.updated_by,
      canonical.created_by,
      (select u.id from auth.users u order by u.created_at nulls last, u.id limit 1)
    ),
    updated_at = now()
where canonical.id = 'floor4-office20';

-- Preserve an assignment that may have been stored on Cabin 02 when the
-- canonical office row was still empty.
update public.members member_row
set assigned_space = 'floor4-office20'
from public.workspaces old_cabin
where old_cabin.id = 'floor4-cabin02'
  and old_cabin.member_id = member_row.id
  and nullif(trim(member_row.assigned_space), '') is null;

update public.workspaces canonical
set member_id = old_cabin.member_id,
    occupant = old_cabin.occupant,
    company_name = old_cabin.company_name,
    status = old_cabin.status,
    updated_by = coalesce(
      canonical.updated_by,
      canonical.created_by,
      old_cabin.updated_by,
      old_cabin.created_by,
      (select u.id from auth.users u order by u.created_at nulls last, u.id limit 1)
    ),
    updated_at = now()
from public.workspaces old_cabin
where canonical.id = 'floor4-office20'
  and old_cabin.id = 'floor4-cabin02'
  and canonical.member_id is null
  and old_cabin.member_id is not null;

delete from public.workspaces
where id = 'floor4-cabin02';

commit;
