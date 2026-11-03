-- Restrict internal permission-management RPCs.
--
-- These routines are used by Cubicle OS after authentication. The public
-- website does not need to call them. In particular, submit_lead and all
-- website/content routines are intentionally not changed here.
--
-- This migration changes execution/table privileges only. It does not change
-- table definitions, rows, RLS policies, or website-facing data.

-- This internal table has no client RLS policies and is accessed through
-- guarded security-definer functions. Remove unnecessary browser table
-- privileges while leaving the trusted service role unchanged.
revoke all on table public.admin_role_permission_overrides
from anon, authenticated;

-- This routine can change RLS configuration and must never be callable by a
-- browser role. Keep it available only to the trusted server role.
revoke execute on function public.rls_auto_enable()
from public, anon, authenticated;
grant execute on function public.rls_auto_enable()
to service_role;

-- Permission administration remains available to authenticated OS users;
-- their function bodies must continue enforcing administrator authorization.
revoke execute on function public.set_admin_role_permission(text, text, boolean)
from public, anon;
grant execute on function public.set_admin_role_permission(text, text, boolean)
to authenticated, service_role;

revoke execute on function public.set_admin_user_permission(uuid, text, boolean)
from public, anon;
grant execute on function public.set_admin_user_permission(uuid, text, boolean)
to authenticated, service_role;

-- These routines return internal role/permission information and are only
-- consumed by authenticated Cubicle OS administrator screens.
revoke execute on function public.list_admin_role_permissions(text)
from public, anon;
grant execute on function public.list_admin_role_permissions(text)
to authenticated, service_role;

revoke execute on function public.list_admin_user_permissions(uuid)
from public, anon;
grant execute on function public.list_admin_user_permissions(uuid)
to authenticated, service_role;

revoke execute on function public.list_visible_admin_users()
from public, anon;
grant execute on function public.list_visible_admin_users()
to authenticated, service_role;
