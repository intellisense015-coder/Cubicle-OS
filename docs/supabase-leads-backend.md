# Supabase backend connection

The Leads page has dormant support for `public.leads` through the Supabase
browser client. It remains on demo `sessionStorage` data unless the explicit
feature flag below is enabled.

## Local configuration

Supabase lead access is intentionally disabled by default while the rest of
the backend is being prepared. The URL and key can remain in `.env`; they do
not connect the Leads page by themselves. Enable the integration later by
adding:

```env
NEXT_PUBLIC_ENABLE_SUPABASE_LEADS=true
```

Leave that flag unset to keep Leads on demo `sessionStorage` data.

Keep these values in `.env.local` (the existing `.env` file is also supported by Next.js):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Never put a Supabase service-role key in a `NEXT_PUBLIC_*` variable or in browser code.

## Current schema mapping

| Supabase column | OS field |
| --- | --- |
| `person_name` | `name` |
| `contact_number` | `phone` |
| `email` | `email` |
| `team_size` | `team` (`6` becomes `6 people`) |
| `shift` | `shift` |
| `visit_date`, `visit_time` | visit/follow-up display |
| `message` | `message` |
| `visited` | `New lead`, `Visit scheduled`, or `Visited` display state |
| `workspace_option` | `workspace` |

The attached table does not contain `company`, `source`, `assignedTo`, `stage`, `lostReason`, `nextFollowUp`, or journey entries. The current OS keeps those extra workflow fields in session storage so the existing demo interactions continue to work, but they are not durable backend fields yet.

## RLS and authentication

The current `/login` flow is a demo session, not Supabase Auth. For private production data, migrate that login to Supabase Auth and use policies based on `auth.uid()` and `admin_users`. A starting point is:

```sql
alter table public.leads enable row level security;

create policy "admins can read leads"
on public.leads for select to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id = auth.uid()
    and a.active = true
    and lower(a.role) in ('owner', 'admin', 'administrator', 'workspace admin')
));

create policy "admins can insert leads"
on public.leads for insert to authenticated
with check (exists (
  select 1 from public.admin_users a
  where a.user_id = auth.uid()
    and a.active = true
    and lower(a.role) in ('owner', 'admin', 'administrator', 'workspace admin')
));

create policy "admins can update leads"
on public.leads for update to authenticated
using (exists (
  select 1 from public.admin_users a
  where a.user_id = auth.uid()
    and a.active = true
    and lower(a.role) in ('owner', 'admin', 'administrator', 'workspace admin')
))
with check (exists (
  select 1 from public.admin_users a
  where a.user_id = auth.uid()
    and a.active = true
    and lower(a.role) in ('owner', 'admin', 'administrator', 'workspace admin')
));
```

For a short private demo only, you can temporarily allow the browser's `anon` role to read/insert/update `leads`, but that makes the table publicly writable and should be removed before launch.

## Next production migration

Add durable workflow fields or separate tables for lead ownership, stages, follow-ups, and journey activity. The cleanest extension is usually a `lead_activities` table keyed by `lead_id`, rather than storing the journey array inside `leads`.
