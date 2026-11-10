begin;

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

commit;
