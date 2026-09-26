-- Rename two public albums to the album naming standard Nino set on 2026-09-26:
-- [Level Division Sport] - [Event or matchup] - [MM-DD-YYYY]  (no prefix when no level or
-- division is known). Owner of the rule: checkAlbumName in src/lib/utils/canonical-album-naming.ts,
-- which ingest now runs after every album; these two were the recent albums it flagged.
--
--   eqYF0h  public  "Bump Bash #5 — Charity Volleyball Tournament"
--                -> "Bump Bash #5 - Charity Volleyball Tournament - 08-22-2026"
--   dKe567  public  "Diggin' for Drakes - Aug 9, 2026"
--                -> "Diggin' for Drakes - 08-09-2026"
--
-- The dates are the albums' capture dates, verified against the data rather than assumed: every
-- photo_date in each album falls on that one day (2026-08-22, 2026-08-09), matching
-- albums.event_date. Neither album has a level or division, so neither gets a prefix. The
-- event text is kept as it was; only the separator (— to -) and the date change.
--
-- Same shape as 20260730040000_repair_truncated_album_names.sql: album_name is denormalized into
-- `albums` and every `photo_metadata` row (162 and 109 rows, all carrying the exact old name), so
-- both are updated or search and the page would disagree. Neither album holds a clip (0 rows in
-- video_metadata), so video_metadata and videos_summary are untouched. Each UPDATE is guarded on
-- the exact old value: a re-run matches nothing, and an unexpected value is left alone.
--
-- Album URLs keep working: the router resolves an album by the key at the end of its slug
-- (extractAlbumKey), so the old slug still reaches the album and the new name only changes the
-- canonical slug.

BEGIN;

CREATE TEMP TABLE album_name_standard (album_key text PRIMARY KEY, old_name text, new_name text) ON COMMIT DROP;

INSERT INTO album_name_standard (album_key, old_name, new_name) VALUES
  ('eqYF0h', 'Bump Bash #5 — Charity Volleyball Tournament', 'Bump Bash #5 - Charity Volleyball Tournament - 08-22-2026'),
  ('dKe567', 'Diggin'' for Drakes - Aug 9, 2026',              'Diggin'' for Drakes - 08-09-2026');

UPDATE albums a
   SET album_name = r.new_name
  FROM album_name_standard r
 WHERE a.album_key = r.album_key
   AND a.album_name = r.old_name;

UPDATE photo_metadata p
   SET album_name = r.new_name
  FROM album_name_standard r
 WHERE p.album_key = r.album_key
   AND p.album_name = r.old_name;

COMMIT;

-- The album page and listing read the name from albums_summary, not the base tables.
REFRESH MATERIALIZED VIEW CONCURRENTLY albums_summary;
