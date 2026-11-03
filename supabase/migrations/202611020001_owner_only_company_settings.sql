-- Company settings are owner-only. The application hides the route for other
-- roles, while these policies keep the database boundary authoritative.
begin;

drop policy if exists "OS admins can read company profile" on public.os_company_profile;
drop policy if exists "OS content admins can create company profile" on public.os_company_profile;
drop policy if exists "OS content admins can update company profile" on public.os_company_profile;

create policy "OS owners can read company profile"
  on public.os_company_profile for select to authenticated
  using (public.is_content_owner());

create policy "OS owners can create company profile"
  on public.os_company_profile for insert to authenticated
  with check (public.is_content_owner() and updated_by = auth.uid());

create policy "OS owners can update company profile"
  on public.os_company_profile for update to authenticated
  using (public.is_content_owner())
  with check (public.is_content_owner() and updated_by = auth.uid());

commit;
