-- Visibility-gated RLS for photo_metadata
-- =======================================
-- Previously the public SELECT policy on photo_metadata was `USING (true)` — every row was readable
-- by the anon key over PostgREST, including photos in UNLISTED (private client) albums, along with
-- their GPS/EXIF. Unlisted-album privacy was enforced only in application code (excludeUnlisted), so
-- any read path that forgot the filter (AI crawler APIs, sitemap, photo/[id]) leaked private albums.
--
-- This replaces the blanket policy with a visibility gate: a row is publicly readable only when its
-- album is NOT marked visibility='unlisted' in album_settings. This makes the database the single
-- source of truth for the privacy model and turns the app-layer excludeUnlisted into defense-in-depth.
--
-- service_role bypasses RLS, so all legitimate single-album reads of unlisted albums (the share flow,
-- /api/album-photos, and the album-zip Worker) continue to work — they read via the service_role
-- client; the unguessable share_token remains the access boundary for those. Only the anon/authenticated
-- "gallery read" role is gated.
--
-- album_settings.album_key is the PRIMARY KEY, so the NOT EXISTS subquery is an index lookup.
-- Rollback: restore `USING (true)`.

ALTER TABLE public.photo_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.photo_metadata;
CREATE POLICY "Public read access" ON public.photo_metadata
  FOR SELECT
  USING (
    NOT EXISTS (
      SELECT 1
      FROM public.album_settings s
      WHERE s.album_key = photo_metadata.album_key
        AND s.visibility = 'unlisted'
    )
  );

COMMENT ON POLICY "Public read access" ON public.photo_metadata IS
  'Public SELECT gated by album visibility: rows in unlisted albums are hidden from anon/authenticated. service_role bypasses RLS for share/download paths.';
