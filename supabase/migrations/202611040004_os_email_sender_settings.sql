begin;

create table if not exists public.os_email_sender_settings (
  purpose text primary key check (purpose in ('invitations', 'invoices', 'proposals', 'notifications')),
  from_email text not null check (char_length(trim(from_email)) between 3 and 320),
  from_name text not null default 'The Cubicle' check (char_length(trim(from_name)) between 1 and 120),
  reply_to text check (reply_to is null or char_length(trim(reply_to)) between 3 and 320),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.os_email_sender_settings enable row level security;

revoke all on table public.os_email_sender_settings from anon, authenticated;

commit;
