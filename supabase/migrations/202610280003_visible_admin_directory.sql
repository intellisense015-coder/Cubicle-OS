-- Read-only employee directory for authenticated workspace administrators.
-- Additive migration: creates/replaces one function and grants execute only.

create or replace function public.list_visible_admin_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  active boolean,
  created_at timestamp with time zone,
  last_sign_in_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
set row_security = off
as $$
  select
    admin_row.user_id,
    auth_row.email,
    coalesce(
      nullif(auth_row.raw_user_meta_data->>'full_name', ''),
      nullif(auth_row.raw_user_meta_data->>'name', '')
    ) as full_name,
    admin_row.role,
    admin_row.active,
    admin_row.created_at,
    auth_row.last_sign_in_at
  from public.admin_users as admin_row
  join auth.users as auth_row on auth_row.id = admin_row.user_id
  where public.is_mfa_verified()
    and public.is_permission_granted('employees.read')
  order by admin_row.created_at asc;
$$;

grant execute on function public.list_visible_admin_users() to authenticated;
