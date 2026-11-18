-- Store vehicle details entered for company team members.
begin;

alter table public.members
  add column if not exists vehicle_make text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_variant text,
  add column if not exists vehicle_color text;

commit;
