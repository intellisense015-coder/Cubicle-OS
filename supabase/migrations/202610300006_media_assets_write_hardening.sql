-- Keep the public website's existing media reads unchanged, but prevent an
-- anonymous browser from creating, changing, or deleting media metadata.
--
-- The live site-media Storage bucket remains public by design. This migration
-- does not change bucket visibility, storage objects, SELECT access, rows, or
-- any website-owned content. Authenticated/service-role behavior is preserved.

revoke insert, update, delete, truncate
on table public.media_assets
from anon;
