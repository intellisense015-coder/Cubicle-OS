-- Enforce the explicit workspace permissions instead of the broader
-- is_content_admin() bypass. The active role matrix already assigns
-- workspaces.read/workspaces.write to the intended workspace roles.
-- Website tables and leads are not affected.

drop policy if exists "MFA admins can insert workspaces" on public.workspaces;
drop policy if exists "MFA admins can read workspaces" on public.workspaces;
drop policy if exists "MFA admins can update workspaces" on public.workspaces;
