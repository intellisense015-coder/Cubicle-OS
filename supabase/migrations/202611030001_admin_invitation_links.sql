-- Store the provider invite token server-side and expose only a one-time opaque code in email.
create table if not exists public.admin_invitation_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null unique,
  provider_token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_invitation_links_user_id_idx
  on public.admin_invitation_links(user_id);

create index if not exists admin_invitation_links_expiry_idx
  on public.admin_invitation_links(expires_at)
  where consumed_at is null;

alter table public.admin_invitation_links enable row level security;
revoke all on table public.admin_invitation_links from anon, authenticated;
