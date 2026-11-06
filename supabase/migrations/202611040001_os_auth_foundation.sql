-- Cubicle OS authentication foundation.
--
-- These tables are intentionally OS-scoped. They do not change the website
-- admin panel, its routes, or its existing policies. The existing
-- public.admin_users.role remains the authorization source of truth; the
-- role stored here is only the OS authentication-flow snapshot used for
-- routing and lifecycle state.

begin;

create table if not exists public.os_auth_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (char_length(trim(role)) between 1 and 80),
  is_onboarded boolean not null default false,
  invitation_status text not null default 'not_applicable'
    check (invitation_status in ('not_applicable', 'pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.os_auth_state is
  'Cubicle OS-only authentication lifecycle state; not used by the website admin panel.';

comment on column public.os_auth_state.role is
  'OS routing snapshot. public.admin_users.role remains the authorization source of truth.';

create index if not exists os_auth_state_invitation_status_idx
  on public.os_auth_state(invitation_status, updated_at desc);

create table if not exists public.os_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  email text not null check (char_length(trim(email)) between 3 and 320),
  phone text not null check (char_length(trim(phone)) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.os_user_profiles is
  'Cubicle OS-only profile fields collected during owner onboarding.';

create table if not exists public.os_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null unique,
  public_key_jwk jsonb not null,
  device_label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  unlocked_token_hash text,
  unlocked_until timestamptz,
  failed_unlock_attempts smallint not null default 0
    check (failed_unlock_attempts between 0 and 5),
  locked_at timestamptz
);

comment on table public.os_device_sessions is
  'Cubicle OS trusted-browser records. No PIN or PIN hash is stored here.';

create index if not exists os_device_sessions_user_active_idx
  on public.os_device_sessions(user_id, expires_at desc)
  where revoked_at is null;

create index if not exists os_device_sessions_unlocked_token_idx
  on public.os_device_sessions(unlocked_token_hash)
  where unlocked_token_hash is not null and revoked_at is null;

create table if not exists public.os_device_challenges (
  id uuid primary key default gen_random_uuid(),
  device_session_id uuid not null references public.os_device_sessions(id) on delete cascade,
  challenge_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

comment on table public.os_device_challenges is
  'Single-use Cubicle OS trusted-device unlock challenges.';

create index if not exists os_device_challenges_expiry_idx
  on public.os_device_challenges(expires_at)
  where consumed_at is null;

-- Browser clients never access these tables directly. Future OS API routes
-- will validate the Supabase session and use the server-side service role.
alter table public.os_auth_state enable row level security;
alter table public.os_user_profiles enable row level security;
alter table public.os_device_sessions enable row level security;
alter table public.os_device_challenges enable row level security;

revoke all on table public.os_auth_state from public, anon, authenticated;
revoke all on table public.os_user_profiles from public, anon, authenticated;
revoke all on table public.os_device_sessions from public, anon, authenticated;
revoke all on table public.os_device_challenges from public, anon, authenticated;

create or replace function public.verify_os_device_access(
  p_device_token_hash text,
  p_unlocked_token_hash text
)
returns table (
  device_session_id uuid,
  user_id uuid,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select
    device_row.id,
    device_row.user_id,
    device_row.expires_at
  from public.os_device_sessions as device_row
  where auth.uid() is not null
    and device_row.user_id = auth.uid()
    and device_row.device_token_hash = p_device_token_hash
    and device_row.unlocked_token_hash = p_unlocked_token_hash
    and device_row.expires_at > now()
    and device_row.unlocked_until > now()
    and device_row.revoked_at is null
    and device_row.locked_at is null;
$$;

revoke all on function public.verify_os_device_access(text, text)
  from public, anon;
grant execute on function public.verify_os_device_access(text, text)
  to authenticated, service_role;

create or replace function public.record_os_device_unlock_failure(
  p_device_session_id uuid
)
returns table (
  failed_attempts smallint,
  locked boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.os_device_sessions as device_row
  set
    failed_unlock_attempts = least(device_row.failed_unlock_attempts + 1, 5),
    locked_at = case
      when device_row.failed_unlock_attempts + 1 >= 5 then coalesce(device_row.locked_at, now())
      else device_row.locked_at
    end
  where device_row.id = p_device_session_id
    and device_row.revoked_at is null
  returning
    device_row.failed_unlock_attempts,
    device_row.locked_at is not null;
end;
$$;

revoke all on function public.record_os_device_unlock_failure(uuid)
  from public, anon, authenticated;
grant execute on function public.record_os_device_unlock_failure(uuid)
  to service_role;

commit;
