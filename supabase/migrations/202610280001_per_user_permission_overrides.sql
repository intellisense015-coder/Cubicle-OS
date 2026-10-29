-- Per-employee permission overrides.
-- Additive migration: it does not delete or alter existing rows.

create table if not exists public.admin_user_permission_overrides (
  user_id uuid not null references auth.users(id),
  permission_key text not null,
  granted boolean not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint admin_user_permission_overrides_pkey primary key (user_id, permission_key)
);

alter table public.admin_user_permission_overrides enable row level security;

revoke all on table public.admin_user_permission_overrides from anon, authenticated;

create or replace function public.is_permission_granted(p_permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  current_role_key text;
  user_override boolean;
begin
  if auth.uid() is null or not public.is_mfa_verified() then
    return false;
  end if;

  select role
  into current_role_key
  from public.admin_users
  where user_id = auth.uid()
    and active = true
  limit 1;

  if current_role_key is null then
    return false;
  end if;

  if current_role_key = 'owner' then
    return true;
  end if;

  select granted
  into user_override
  from public.admin_user_permission_overrides
  where user_id = auth.uid()
    and permission_key = p_permission_key;

  if found then
    return user_override;
  end if;

  return exists (
    select 1
    from public.admin_permissions permission_row
    left join public.admin_roles role_row
      on role_row.role_key = current_role_key
     and role_row.active = true
    left join public.admin_role_permissions role_permission
      on role_permission.role_id = role_row.id
     and role_permission.permission_key = permission_row.permission_key
    left join public.admin_role_permission_overrides role_override
      on role_override.role_key = role_row.role_key
     and role_override.permission_key = permission_row.permission_key
    where permission_row.permission_key = p_permission_key
      and permission_row.active = true
      and coalesce(role_override.granted, role_permission.permission_key is not null) = true
  );
end;
$$;

create or replace function public.list_admin_user_permissions(p_user_id uuid)
returns table (
  permission_key text,
  label text,
  description text,
  granted boolean,
  overridden boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  target_role_key text;
begin
  if not public.is_permission_granted('admin_users.manage') then
    raise exception 'Administrator access required';
  end if;

  select role
  into target_role_key
  from public.admin_users
  where user_id = p_user_id
    and active = true
  limit 1;

  if target_role_key is null then
    raise exception 'Administrator account not found';
  end if;

  return query
  select
    permission_row.permission_key,
    permission_row.label,
    permission_row.description,
    case
      when target_role_key = 'owner' then true
      when user_override.user_id is not null then user_override.granted
      else coalesce(role_override.granted, role_permission.permission_key is not null)
    end as granted,
    user_override.user_id is not null as overridden
  from public.admin_permissions permission_row
  left join public.admin_roles role_row
    on role_row.role_key = target_role_key
   and role_row.active = true
  left join public.admin_role_permissions role_permission
    on role_permission.role_id = role_row.id
   and role_permission.permission_key = permission_row.permission_key
  left join public.admin_role_permission_overrides role_override
    on role_override.role_key = target_role_key
   and role_override.permission_key = permission_row.permission_key
  left join public.admin_user_permission_overrides user_override
    on user_override.user_id = p_user_id
   and user_override.permission_key = permission_row.permission_key
  where permission_row.active = true
  order by permission_row.permission_key;
end;
$$;

create or replace function public.set_admin_user_permission(
  p_user_id uuid,
  p_permission_key text,
  p_granted boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  target_role_key text;
begin
  if not public.is_permission_granted('admin_users.manage') then
    raise exception 'Administrator access required';
  end if;

  select role
  into target_role_key
  from public.admin_users
  where user_id = p_user_id
    and active = true
  limit 1;

  if target_role_key is null then
    raise exception 'Administrator account not found';
  end if;

  if target_role_key = 'owner' then
    raise exception 'Owner access is protected';
  end if;

  if not exists (
    select 1
    from public.admin_permissions
    where permission_key = p_permission_key
      and active = true
  ) then
    raise exception 'Permission not found';
  end if;

  insert into public.admin_user_permission_overrides (
    user_id,
    permission_key,
    granted,
    updated_at
  )
  values (
    p_user_id,
    p_permission_key,
    p_granted,
    now()
  )
  on conflict (user_id, permission_key) do update
  set granted = excluded.granted,
      updated_at = now();
end;
$$;

grant execute on function public.list_admin_user_permissions(uuid) to authenticated;
grant execute on function public.set_admin_user_permission(uuid, text, boolean) to authenticated;
