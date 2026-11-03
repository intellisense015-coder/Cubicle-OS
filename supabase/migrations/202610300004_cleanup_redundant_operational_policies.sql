-- Remove the broad duplicate policies from the initial operational RLS
-- migration. Existing permission-based policies remain in force.
--
-- Supabase combines permissive policies with OR logic. Keeping the broad
-- staff-read policies would bypass visits.read/workspaces.read permissions.
-- This migration affects only visits and workspaces.

drop policy if exists "MFA staff can read visits" on public.visits;
drop policy if exists "Visits write permission can create visits" on public.visits;
drop policy if exists "Visits write permission can update visits" on public.visits;
drop policy if exists "MFA staff can read workspaces" on public.workspaces;
drop policy if exists "Workspaces write permission can create workspaces" on public.workspaces;
drop policy if exists "Workspaces write permission can update workspaces" on public.workspaces;

-- Preserve the existing visits.write permission while preventing clients from
-- forging the creator identity on newly inserted visits.
drop policy if exists "MFA admins can create visits" on public.visits;
create policy "MFA admins can create visits"
  on public.visits
  for insert
  to authenticated
  with check (
    public.is_permission_granted('visits.write')
    and created_by = auth.uid()
  );
