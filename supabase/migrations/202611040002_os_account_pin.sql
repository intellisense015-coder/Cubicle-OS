-- Account-level Cubicle OS PIN verifier.
-- The raw PIN is never stored. Existing accounts are initialized on the first
-- successful trusted-device setup or unlock after this migration is applied.

begin;

alter table public.os_auth_state
  add column if not exists pin_verifier text,
  add column if not exists pin_updated_at timestamptz;

comment on column public.os_auth_state.pin_verifier is
  'Salted, slow server-side verifier for the shared four-digit OS PIN. Never store the raw PIN.';

comment on column public.os_auth_state.pin_updated_at is
  'Timestamp of the last account-level OS PIN initialization or change.';

commit;
