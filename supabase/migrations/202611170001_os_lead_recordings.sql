-- Private, permission-checked call recordings for lead follow-ups.
-- Audio is kept in Supabase Storage; this table stores metadata only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-call-recordings',
  'lead-call-recordings',
  false,
  26214400,
  array[
    'audio/aac',
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/x-wav'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.os_lead_journey_recordings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  journey_client_entry_id text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  constraint os_lead_recording_path_check check (storage_path like (lead_id::text || '/%')),
  constraint os_lead_recording_journey_fk
    foreign key (lead_id, journey_client_entry_id)
    references public.os_lead_journey(lead_id, client_entry_id)
    on delete cascade
);

create index if not exists os_lead_journey_recordings_lookup_idx
  on public.os_lead_journey_recordings (lead_id, journey_client_entry_id, created_at desc);

alter table public.os_lead_journey_recordings enable row level security;

revoke all on table public.os_lead_journey_recordings from public, anon;
grant select, insert, delete on table public.os_lead_journey_recordings to authenticated;

drop policy if exists "OS users can read lead journey recordings"
on public.os_lead_journey_recordings;
create policy "OS users can read lead journey recordings"
  on public.os_lead_journey_recordings
  for select
  to authenticated
  using (public.is_permission_granted('leads.read'));

drop policy if exists "OS users can add lead journey recordings"
on public.os_lead_journey_recordings;
create policy "OS users can add lead journey recordings"
  on public.os_lead_journey_recordings
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_permission_granted('leads.write')
      or public.is_permission_granted('leads.followups.write')
      or public.is_permission_granted('leads.journey.write')
    )
  );

drop policy if exists "OS users can delete lead journey recordings"
on public.os_lead_journey_recordings;
create policy "OS users can delete lead journey recordings"
  on public.os_lead_journey_recordings
  for delete
  to authenticated
  using (
    public.is_permission_granted('leads.write')
    or public.is_permission_granted('leads.followups.write')
    or public.is_permission_granted('leads.journey.write')
  );

drop policy if exists "OS users can read lead call recordings"
on storage.objects;
create policy "OS users can read lead call recordings"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'lead-call-recordings'
    and public.is_permission_granted('leads.read')
  );

drop policy if exists "OS users can upload lead call recordings"
on storage.objects;
create policy "OS users can upload lead call recordings"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'lead-call-recordings'
    and (
      public.is_permission_granted('leads.write')
      or public.is_permission_granted('leads.followups.write')
      or public.is_permission_granted('leads.journey.write')
    )
  );

drop policy if exists "OS users can delete lead call recordings"
on storage.objects;
create policy "OS users can delete lead call recordings"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'lead-call-recordings'
    and (
      public.is_permission_granted('leads.write')
      or public.is_permission_granted('leads.followups.write')
      or public.is_permission_granted('leads.journey.write')
    )
  );
