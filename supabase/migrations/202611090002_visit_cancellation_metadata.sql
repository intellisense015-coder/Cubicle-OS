begin;

alter table public.visits
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_by_name text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_details text;

-- Recover the cancelling actor and timestamp for cancellations already written
-- through the secured mutation route.
with latest_cancel_audit as (
  select distinct on (entity_id)
    entity_id,
    actor_user_id,
    created_at
  from public.os_security_audit_log
  where action = 'visit.status'
    and outcome = 'success'
    and entity_type = 'visit'
  order by entity_id, created_at desc
)
update public.visits as visit
set
  cancelled_at = coalesce(visit.cancelled_at, audit.created_at),
  cancelled_by = coalesce(visit.cancelled_by, audit.actor_user_id),
  cancelled_by_name = coalesce(
    visit.cancelled_by_name,
    nullif(btrim(coalesce(user_row.raw_user_meta_data ->> 'full_name', user_row.raw_user_meta_data ->> 'name', user_row.email)), '')
  )
from latest_cancel_audit as audit
left join auth.users as user_row on user_row.id = audit.actor_user_id
where visit.id = audit.entity_id
  and visit.status = 'Cancelled';

create index if not exists visits_cancelled_at_idx
  on public.visits(cancelled_at desc)
  where cancelled_at is not null;

comment on column public.visits.cancelled_at is 'Timestamp when the visit was cancelled.';
comment on column public.visits.cancelled_by is 'Authenticated user who cancelled the visit.';
comment on column public.visits.cancelled_by_name is 'Display name captured for the cancelling user.';
comment on column public.visits.cancellation_reason is 'Selected cancellation reason.';
comment on column public.visits.cancellation_details is 'Required cancellation description.';

commit;
