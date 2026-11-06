-- Include employee phone numbers and OS invitation lifecycle in the directory.

begin;

drop function if exists public.list_visible_admin_users();

create function public.list_visible_admin_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  active boolean,
  invitation_status text,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz,
  last_sign_in_at timestamptz
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
    nullif(auth_row.raw_user_meta_data->>'phone', '') as phone,
    admin_row.role,
    admin_row.active,
    coalesce(os_state.invitation_status, 'not_applicable') as invitation_status,
    os_state.invited_at,
    os_state.accepted_at,
    admin_row.created_at,
    auth_row.last_sign_in_at
  from public.admin_users as admin_row
  join auth.users as auth_row on auth_row.id = admin_row.user_id
  left join public.os_auth_state as os_state on os_state.user_id = admin_row.user_id
  where public.is_mfa_verified()
    and public.is_permission_granted('employees.read')
  order by admin_row.created_at asc;
$$;

grant execute on function public.list_visible_admin_users() to authenticated;

commit;
