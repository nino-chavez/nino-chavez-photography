-- Album/site-level arrival dedup for engagement_events (acquisition attribution)
-- ==============================================================================
-- Share links minted by $lib/utils/share-url (withSrc) now carry ?src=<channel>,
-- and the albums/[slug] and homepage loaders log a matching arrival as a 'view'
-- engagement_events row with photo_id NULL (see $lib/analytics/tracker's
-- trackArrival, wired 2026-07-09). The EXISTING dedup index from
-- 20260623190000_popularity_engine.sql —
--   engagement_events_dedup_idx ON (session_hash, photo_id, event_type, event_day)
-- — relies on photo_id to disambiguate rows, but Postgres unique indexes treat
-- NULL as distinct from every other value (including other NULLs) by default. So
-- every album/site-level row has photo_id NULL and NONE of them ever collide on
-- that index — repeat views from the same visitor/album/day would each insert a
-- fresh row and inflate the per-day counts arrival logging is meant to produce.
-- This migration adds a second dedup index scoped to those photo_id-NULL rows.

BEGIN;

-- Clean up pre-existing duplicates so CREATE UNIQUE INDEX succeeds. Keeps the
-- earliest (min id) row per (session_hash, album_key, event_type, event_day);
-- IS NOT DISTINCT FROM (not =) so album_key NULL (homepage/site-wide arrivals)
-- groups correctly instead of every NULL comparing as non-matching.
DELETE FROM public.engagement_events e
WHERE e.photo_id IS NULL
  AND e.session_hash IS NOT NULL
  AND e.id > (
    SELECT min(e2.id)
    FROM public.engagement_events e2
    WHERE e2.photo_id IS NULL
      AND e2.session_hash IS NOT NULL
      AND e2.session_hash = e.session_hash
      AND e2.event_type = e.event_type
      AND e2.event_day = e.event_day
      AND e2.album_key IS NOT DISTINCT FROM e.album_key
  );

-- Dedup: at most one photo_id-NULL event per session+album+type+day. Partial
-- index (WHERE photo_id IS NULL) so it never overlaps the per-photo dedup index
-- above. album_key is COALESCE'd because homepage/site-wide arrivals carry
-- album_key NULL, and a raw NULL column never collides in a unique index —
-- without the COALESCE those rows would re-inherit the exact bug this migration
-- fixes, one level up. NOTE: rows with NULL session_hash stay non-deduped
-- (NULLs distinct) — accepted, matches the existing per-photo index's behavior.
CREATE UNIQUE INDEX IF NOT EXISTS engagement_events_album_dedup_idx
  ON public.engagement_events (session_hash, COALESCE(album_key, ''), event_type, event_day)
  WHERE photo_id IS NULL;

COMMIT;
