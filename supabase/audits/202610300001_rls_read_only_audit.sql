-- READ-ONLY Supabase authorization audit.
-- This file intentionally contains no schema, policy, privilege, or data changes.
-- Run it in the Supabase SQL Editor and save the result before any RLS changes.

-- 1. RLS state for every public table.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- 2. Every policy, including its command and expressions.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Explicit table privileges granted to anon/authenticated/service_role.
select
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- 4. Public routines and their execution grants.
select
  routine_schema,
  routine_name,
  specific_name,
  routine_type,
  data_type as return_type
from information_schema.routines
where routine_schema = 'public'
order by routine_name, specific_name;

select
  routine_schema,
  routine_name,
  specific_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by routine_name, grantee, privilege_type;

-- 5. Focused table groups for review. These are labels only; no changes occur.
with table_groups(table_name, ownership_group) as (
  values
    ('site_settings', 'public_website'),
    ('blog_posts', 'public_website'),
    ('amenities', 'public_website'),
    ('business_hours', 'public_website'),
    ('client_logos', 'public_website'),
    ('job_openings', 'public_website'),
    ('member_reviews', 'public_website'),
    ('social_links', 'public_website'),
    ('workspace_options', 'public_website'),
    ('media_assets', 'public_website'),
    ('leads', 'shared_public_website_and_os'),
    ('admin_users', 'os_internal'),
    ('admin_roles', 'os_internal'),
    ('admin_permissions', 'os_internal'),
    ('admin_role_permissions', 'os_internal'),
    ('admin_role_permission_overrides', 'os_internal'),
    ('admin_user_permission_overrides', 'os_internal'),
    ('companies', 'os_internal'),
    ('members', 'os_internal'),
    ('visits', 'os_internal'),
    ('workspaces', 'os_internal'),
    ('quotations', 'os_internal'),
    ('quotation_items', 'os_internal'),
    ('proposals', 'os_internal'),
    ('invoices', 'os_internal'),
    ('invoice_items', 'os_internal'),
    ('invoice_payments', 'os_internal'),
    ('maintenance_categories', 'os_internal'),
    ('maintenance_records', 'os_internal'),
    ('maintenance_events', 'os_internal'),
    ('activity_log', 'os_internal'),
    ('invoice_email_queue', 'os_internal'),
    ('agreements', 'unknown_review_required'),
    ('agreement_events', 'unknown_review_required')
)
select *
from table_groups
order by ownership_group, table_name;
