-- Add album_settings.published_at: when this album most recently went hidden -> public.
--
-- The "latest gallery" route (/latest, /api/latest, /api/galleries/recent — see
-- src/lib/albums/latest.ts) needs to answer "which public album is newest", and neither
-- existing timestamp on this table works for that: `created_at` is set once, at ingest, before
-- an album is public at all, and `updated_at` moves on ANY edit to the row (a --scope change,
-- an --unpublish/--republish cycle, a gallery_scope flip) — verified against production, not a
-- publish-only signal. Publishing is the one event that should move "latest", so it gets its
-- own column instead of overloading either.
--
-- ADDITIVE ONLY: one nullable column. NULL means "never published through
-- scripts/publish-album.ts since this column existed" — every album published before this
-- migration, plus every legacy-public album with no album_settings row at all (242 of 262, per
-- src/lib/supabase/server.ts's getAlbumSettings comment) has no opinion here. src/lib/albums/
-- latest.ts falls back to the album's capture date (albums_summary.latest_photo_date) when no
-- public album has a published_at, which is the common case until publish-album.ts (this same
-- change) starts stamping it going forward.
--
-- scripts/publish-album.ts sets this to now() only on a hidden -> public transition (before is
-- absent or 'unlisted'), never on --unpublish and never on re-publishing an already-public album
-- — see src/lib/albums/publish-target.ts, the pure function both the script and its tests share.
--
-- ORDERING (same shape as 20260925210000_photo_metadata_content_hash.sql): apply this BEFORE
-- merging/using the updated scripts/publish-album.ts for a real publish. That script's WRITE
-- already fails loudly without this column (the `update`/`insert` call errors, `writeErr` is
-- checked, the script exits 1 rather than corrupting anything) — the ordering note is so nobody
-- has to rediscover that by hitting it.

ALTER TABLE public.album_settings
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

COMMENT ON COLUMN public.album_settings.published_at IS
  'Set by scripts/publish-album.ts the moment this album goes from hidden to public (never on '
  'unpublish, never on re-publishing an already-public album). NULL for every album published '
  'before this column existed, and for legacy-public albums with no album_settings row. The '
  '"latest gallery" route sorts on this first, falling back to capture date when it is null — '
  'see src/lib/albums/latest.ts.';

-- album_settings' anon/authenticated SELECT grant is column-level (20260730030000_
-- revoke_anon_share_token_retry.sql) and does NOT extend to a newly added column automatically.
-- /api/latest and /latest read this column through the anon client (supabaseServer), same as
-- visibility and gallery_scope already do — grant it the same way, additively (this does not
-- touch the existing grant on the other columns, including the still-excluded share_token).
GRANT SELECT (published_at) ON public.album_settings TO anon, authenticated;

-- Backfill the two albums already public today (Nino, 2026-09-26): DWdCET published later
-- (19:00 UTC) than Re7kho (16:00 UTC) the same day, so DWdCET is "latest" once this lands.
-- Every other album is deliberately left NULL — the ranking function's capture-date fallback is
-- what serves them until they're (re)published through the updated script. Upsert rather than
-- UPDATE: a row may not exist yet for either key (legacy-public), and INSERT ... ON CONFLICT
-- creates it with the table's own defaults (visibility='public', a fresh share_token) rather
-- than assuming one is already there.
INSERT INTO public.album_settings (album_key, published_at)
VALUES
  ('DWdCET', '2026-09-26T19:00:00Z'),
  ('Re7kho', '2026-09-26T16:00:00Z')
ON CONFLICT (album_key) DO UPDATE SET published_at = EXCLUDED.published_at;
