-- Extend OS access to active employee roles and enforce the new Leads
-- sub-permissions at the API permission boundary.
--
-- The previous get_my_admin_role() function only returned owner/editor. That
-- made an active invited employee look like an account with no OS access even
-- after the invitation was accepted and MFA was completed.

create or replace function public.get_my_admin_role()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
  select admin_row.role::text
  from public.admin_users as admin_row
  where admin_row.user_id = auth.uid()
    and admin_row.active = true
  limit 1;
$function$;

grant execute on function public.get_my_admin_role() to authenticated;
