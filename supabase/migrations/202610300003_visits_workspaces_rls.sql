-- RLS for Cubicle OS operational visits and workspaces.
--
-- These tables are not public website tables. They contain internal tour,
-- occupancy, rent, member-assignment, and maintenance data.
-- No policy or privilege in this migration applies to leads or website CMS
-- tables.

alter table public.visits enable row level security;
alter table public.workspaces enable row level security;

-- Browser clients need only the operations they use. Anonymous clients get no
-- table privileges, and DELETE is intentionally not granted.
revoke all on table public.visits, public.workspaces from anon;
grant select, insert, update on table public.visits, public.workspaces to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'visits'
      and policyname = 'MFA staff can read visits'
  ) then
    create policy "MFA staff can read visits"
      on public.visits
      for select
      to authenticated
      using (public.is_staff() and public.is_mfa_verified());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'visits'
      and policyname = 'Visits write permission can create visits'
  ) then
    create policy "Visits write permission can create visits"
      on public.visits
      for insert
      to authenticated
      with check (
        public.is_permission_granted('visits.write')
        and created_by = auth.uid()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'visits'
      and policyname = 'Visits write permission can update visits'
  ) then
    create policy "Visits write permission can update visits"
      on public.visits
      for update
      to authenticated
      using (public.is_permission_granted('visits.write'))
      with check (public.is_permission_granted('visits.write'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and policyname = 'MFA staff can read workspaces'
  ) then
    create policy "MFA staff can read workspaces"
      on public.workspaces
      for select
      to authenticated
      using (public.is_staff() and public.is_mfa_verified());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and policyname = 'Workspaces write permission can create workspaces'
  ) then
    create policy "Workspaces write permission can create workspaces"
      on public.workspaces
      for insert
      to authenticated
      with check (public.is_permission_granted('workspaces.write'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and policyname = 'Workspaces write permission can update workspaces'
  ) then
    create policy "Workspaces write permission can update workspaces"
      on public.workspaces
      for update
      to authenticated
      using (public.is_permission_granted('workspaces.write'))
      with check (public.is_permission_granted('workspaces.write'));
  end if;
end
$$;
