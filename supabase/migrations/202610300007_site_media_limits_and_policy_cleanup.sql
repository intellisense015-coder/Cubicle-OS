-- Keep site-media publicly downloadable, but bound future uploads to the
-- formats currently used by the live website and a reasonable 10 MiB limit.
-- Existing objects are not modified or deleted.

update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png']::text[]
where id = 'site-media';

-- These two policies had the same bucket-only SELECT condition. Keep the
-- original public-read policy and remove the redundant/misleading duplicate.
drop policy if exists "Public can view published site media"
on storage.objects;
