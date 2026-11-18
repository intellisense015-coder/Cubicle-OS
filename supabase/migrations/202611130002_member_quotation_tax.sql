begin;

-- Preserve the tax settings agreed in the quotation when a lead becomes a
-- member. The recurring invoice job uses these rates for future invoices.
alter table public.members
  add column if not exists wht_enabled boolean not null default false,
  add column if not exists wht_rate numeric(7, 4) not null default 0,
  add column if not exists sales_tax_enabled boolean not null default false,
  add column if not exists sales_tax_rate numeric(7, 4) not null default 0;

-- The members audit trigger derives updated_by from auth.uid(). Supabase's
-- SQL editor has no JWT subject, so use an existing member creator as the
-- transaction-local actor for this data backfill.
do $$
declare
  audit_actor text;
begin
  select coalesce(
    (select created_by::text from public.members where created_by is not null limit 1),
    (select id::text from auth.users order by created_at nulls last, id limit 1)
  ) into audit_actor;

  if audit_actor is null then
    raise exception 'No valid audit actor was found for the members tax backfill.';
  end if;

  perform set_config('request.jwt.claim.sub', audit_actor, true);
end;
$$;

-- Backfill members that were already converted from a lead. Prefer an
-- accepted quotation, otherwise use the most recently updated quotation.
with ranked_quotations as (
  select
    m.id as member_id,
    q.wht_enabled,
    q.wht_rate,
    q.sales_tax_enabled,
    q.sales_tax_rate,
    row_number() over (
      partition by m.id
      order by
        (lower(coalesce(q.status::text, '')) = 'accepted') desc,
        q.updated_at desc nulls last,
        q.created_at desc nulls last
    ) as row_number
  from public.members m
  join public.quotations q on q.lead_id = m.lead_id
  where m.lead_id is not null
)
update public.members m
set wht_enabled = coalesce(r.wht_enabled, false),
    wht_rate = least(greatest(coalesce(r.wht_rate, 0), 0), 100),
    sales_tax_enabled = coalesce(r.sales_tax_enabled, false),
    sales_tax_rate = least(greatest(coalesce(r.sales_tax_rate, 0), 0), 99.9999)
from ranked_quotations r
where r.member_id = m.id
  and r.row_number = 1;

alter table public.members
  drop constraint if exists members_tax_rates_valid;

alter table public.members
  add constraint members_tax_rates_valid check (
    coalesce(wht_rate, 0) >= 0
    and coalesce(wht_rate, 0) <= 100
    and coalesce(sales_tax_rate, 0) >= 0
    and coalesce(sales_tax_rate, 0) < 100
  );

comment on column public.members.wht_enabled is 'Whether the approved quotation includes WHT for recurring invoices.';
comment on column public.members.wht_rate is 'WHT percentage carried forward from the approved quotation.';
comment on column public.members.sales_tax_enabled is 'Whether the approved quotation includes sales tax for recurring invoices.';
comment on column public.members.sales_tax_rate is 'Sales tax percentage carried forward from the approved quotation.';

commit;
