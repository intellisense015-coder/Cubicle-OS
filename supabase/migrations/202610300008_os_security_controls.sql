-- Cubicle OS-only security controls.
-- Website tables and website-facing policies are not changed.

begin;

create table if not exists public.os_security_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists os_security_rate_limits_updated_idx
  on public.os_security_rate_limits(updated_at);

alter table public.os_security_rate_limits enable row level security;
revoke all on table public.os_security_rate_limits from public, anon, authenticated;

create or replace function public.consume_os_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  window_interval interval;
  current_window_started_at timestamptz;
  current_request_count integer;
begin
  if p_bucket_key is null or char_length(p_bucket_key) < 32 or char_length(p_bucket_key) > 128 then
    raise exception 'Invalid rate limit bucket.' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'Invalid rate limit.' using errcode = '22023';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit window.' using errcode = '22023';
  end if;

  window_interval := make_interval(secs => p_window_seconds);

  -- Keep abandoned IP/user buckets from growing forever without requiring a
  -- separate scheduler. This is intentionally probabilistic to avoid adding a
  -- delete scan to every request.
  if random() < 0.01 then
    delete from public.os_security_rate_limits
    where updated_at < v_now - interval '2 days';
  end if;

  insert into public.os_security_rate_limits as rate_limit (bucket_key, window_started_at, request_count, updated_at)
  values (p_bucket_key, v_now, 1, v_now)
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when rate_limit.window_started_at <= v_now - window_interval
        then v_now
      else rate_limit.window_started_at
    end,
    request_count = case
      when rate_limit.window_started_at <= v_now - window_interval
        then 1
      else least(rate_limit.request_count + 1, p_limit + 1)
    end,
    updated_at = v_now
  returning rate_limit.window_started_at, rate_limit.request_count
  into current_window_started_at, current_request_count;

  allowed := current_request_count <= p_limit;
  remaining := greatest(p_limit - current_request_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (current_window_started_at + window_interval - v_now)))::integer)
  end;

  return next;
end;
$$;

revoke all on function public.consume_os_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_os_rate_limit(text, integer, integer) to service_role;

create table if not exists public.os_security_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) between 1 and 120),
  outcome text not null check (outcome in ('success', 'denied', 'failure', 'rate_limited')),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  entity_type text check (entity_type is null or char_length(entity_type) between 1 and 80),
  entity_id uuid,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists os_security_audit_action_idx
  on public.os_security_audit_log(action, created_at desc);

create index if not exists os_security_audit_actor_idx
  on public.os_security_audit_log(actor_user_id, created_at desc);

alter table public.os_security_audit_log enable row level security;
revoke all on table public.os_security_audit_log from public, anon, authenticated;

commit;
