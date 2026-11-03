-- OS-only company profile. This table is intentionally separate from the
-- public website tables and from operational company/member records.
begin;

create table if not exists public.os_company_profile (
  id integer primary key default 1 check (id = 1),
  company_name text not null check (char_length(trim(company_name)) between 1 and 160),
  contact_email text not null check (char_length(trim(contact_email)) between 3 and 320),
  owner_name text not null check (char_length(trim(owner_name)) between 1 and 120),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.os_company_profile enable row level security;
revoke all on table public.os_company_profile from public, anon;
grant select, insert, update on table public.os_company_profile to authenticated;

create policy "OS admins can read company profile"
  on public.os_company_profile for select to authenticated
  using (public.is_permission_granted('settings.read'));

create policy "OS content admins can create company profile"
  on public.os_company_profile for insert to authenticated
  with check (public.is_content_admin() and updated_by = auth.uid());

create policy "OS content admins can update company profile"
  on publAlright ic.os_company_profile for update to authenticated
  using (public.is_content_admin())
  with check (public.is_content_admin() and updated_by = auth.uid());

commit;
