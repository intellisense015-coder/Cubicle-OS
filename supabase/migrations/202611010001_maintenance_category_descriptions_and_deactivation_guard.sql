begin;

alter table public.maintenance_categories
  add column if not exists description text;

update public.maintenance_categories
set description = case
  when active then 'Available for maintenance requests'
  else 'Deactivated for new requests'
end
where description is null or btrim(description) = '';

alter table public.maintenance_categories
  alter column description set default 'Available for maintenance requests';

create or replace function public.prevent_maintenance_category_deactivation_with_active_ticket()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if old.active = true
    and new.active = false
    and exists (
      select 1
      from public.maintenance_records as record
      where record.status::text in ('OPEN', 'IN_PROGRESS')
        and (
          lower(btrim(coalesce(record.category, ''))) = lower(btrim(old.name))
          or lower(btrim(coalesce(record.category, ''))) = lower(btrim(old.id::text))
        )
    )
  then
    raise exception 'This category has an active maintenance ticket. Complete or cancel it before deactivating the category.'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists prevent_maintenance_category_deactivation_with_active_ticket
  on public.maintenance_categories;

create trigger prevent_maintenance_category_deactivation_with_active_ticket
before update of active, name on public.maintenance_categories
for each row
execute function public.prevent_maintenance_category_deactivation_with_active_ticket();

commit;
