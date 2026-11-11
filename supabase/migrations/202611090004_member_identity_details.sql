begin;

-- Personal identity details belong to the member record so every person in a
-- company team can be stored independently and securely.
alter table public.members
  add column if not exists cnic text,
  add column if not exists gender text,
  add column if not exists vehicle_license_plate text;

commit;
