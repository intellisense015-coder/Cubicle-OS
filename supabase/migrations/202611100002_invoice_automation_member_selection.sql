-- Store the exact active members who should receive recurring invoices.
begin;

alter table public.invoice_automation_settings
  add column if not exists member_ids uuid[] not null default '{}';

comment on column public.invoice_automation_settings.member_ids is 'Selected active member IDs that receive the recurring monthly invoice.';

commit;
