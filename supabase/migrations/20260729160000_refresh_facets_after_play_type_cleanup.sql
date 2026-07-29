-- Refresh the materialized views that read the columns 20260729140000 and
-- 20260729150000 rewrote.
--
-- Those two migrations changed 7,739 rows of photo_metadata and refreshed nothing.
-- The collection pages read the base table and were correct within seconds; /faq and
-- the facet filters read facet_base_counts and went on publishing the pre-migration
-- vocabulary — `attack` 3,534, `celebration` 2,758, `fishing` 1 — as the live answer to
-- "what play types are available?". The gap was invisible from the app: two surfaces
-- disagreed and only one of them was wrong.
--
-- THE RULE (same one videos_summary taught, from the other direction): whatever writes
-- the base table owns the refresh. scripts/ingest-album.ts already does this at the end
-- of a run. A migration is a writer too, and this one had no owner because a migration
-- is not a script anybody thought to check.
--
-- Only these two matviews reference play_type or photo_category:
--
--   facet_base_counts   play_type + photo_category   (the one that was stale)
--   albums_summary      photo_category
--
-- The other six (album_popularity, album_top_photo, photo_popularity, popular_photos,
-- timeline_months_mv, videos_summary) do not, and are deliberately left alone —
-- refreshing a matview that cannot have changed is noise that hides the ones that can.
--
-- refresh_facet_base_counts() is plain REFRESH; refresh_albums_summary() is
-- CONCURRENTLY. Do not assume they match (see 20260305000000_fix_security_lint.sql).

SELECT refresh_facet_base_counts();
SELECT refresh_albums_summary();
