-- Album read-model hardening (ADR 0001)
--
-- Makes album ingest the sole owner of read-model maintenance and removes the per-request work
-- that welded the public album read path onto the OLTP table.
-- See docs/adr/0001-ingest-owned-read-model-and-edge-cache.md.
--
-- Applied via `supabase db push` (runs in a transaction) → all index builds are NON-concurrent.
-- Safe: photo_metadata is ~20K rows and ingest (the only writer) is not running during a push,
-- so a plain CREATE INDEX is sub-second and never blocks reads. Additive: current prod (`main`)
-- keeps working — its anon refresh path is wrapped in try/catch, and ingest uses service_role.

-- Prerequisite for CONCURRENTLY refresh: a UNIQUE index on the MV. The view is GROUP BY
-- album_key, so album_key is already unique. (A prior migration reverted CONCURRENTLY *because*
-- this index was missing; adding it is the fix, not the backoff.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_summary_album_key_uniq
  ON albums_summary(album_key);

-- Concurrent refresh no longer takes an ACCESS EXCLUSIVE lock → readers are never blocked while
-- ingest refreshes the view.
CREATE OR REPLACE FUNCTION public.refresh_albums_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY albums_summary;
END;
$$;

-- Maintenance is owned by the write event (scripts/ingest-album.ts, service_role). Strip the
-- ability of public/anon/authenticated to trigger a refresh (closes the unauthenticated refresh
-- trigger; the read-path auto-refresh and the /api/admin/refresh-albums endpoint are removed in
-- code). REVOKE FROM anon/authenticated alone is insufficient — EXECUTE is granted to PUBLIC by
-- default and anon inherits it; must revoke PUBLIC too (matches fix-security-lint-2025-03.sql).
REVOKE EXECUTE ON FUNCTION public.refresh_albums_summary() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_albums_summary() TO service_role;

-- One-time refresh so the new unique index + any pending data are consistent.
REFRESH MATERIALIZED VIEW albums_summary;

-- Index-only album feed. Backs the album page / album-photos query exactly:
--   WHERE album_key = $1 AND sharpness IS NOT NULL ORDER BY upload_date DESC, image_key
-- → filter+sort+paginate becomes index-only: no in-memory sort, no OFFSET re-scan on deep pages.
CREATE INDEX IF NOT EXISTS idx_photo_metadata_album_feed
  ON photo_metadata (album_key, upload_date DESC, image_key)
  WHERE sharpness IS NOT NULL;
