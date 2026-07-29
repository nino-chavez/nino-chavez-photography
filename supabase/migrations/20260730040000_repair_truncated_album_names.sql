-- Four album names were stored with a truncation artifact baked into the data: a fixed-width cut
-- at 33-34 characters, a literal "...", and then the date suffix appended by the 2026-06-23
-- cleanup. Three of the four are public, so the ellipsis shipped in the album page's <title> and
-- <h1>, the album card on /albums, the OG share card, the sitemap-linked title, and — since #140 /
-- #141 compose photo titles as "<album> — <caption>" — in 298 public photo-page titles as well.
--
--   jDbB4z  public    "DU Women's Soccer - Homecoming We... - Sep 20"
--   VFTwzS  public    "ACC Drama – Alice in Wonderland (F... - Nov 6"
--   kZ3pTs  public    "Benet Academy – Senior Night - Ma... - May 23"
--   MNNbgk  unlisted  "Homecoming Jersey Photoshoot - Se... - Sep 26"
--
-- WHAT THE NEW NAMES ARE, AND WHAT THEY ARE NOT
--
-- The dropped fragments ("We", "(F", "Ma", "Se") are NOT recoverable from the database, and this
-- migration does not invent them. The rule is strictly subtractive: cut at the last COMPLETE word
-- before the ellipsis and keep the existing date suffix. Every word that survives is already in
-- the stored string, and each is independently corroborated by the SmugMug source path and the
-- original filename — e.g. jDbB4z's photos are `du-womens-soccer-homecoming-64.jpg` under
-- `.../Soccer/DU-Womens-Soccer-20230916/`, so "Homecoming" is evidence, not a guess.
--
-- The date suffixes were verified against the data rather than assumed: each album's photo_date is
-- a single day and it matches the suffix exactly (Sep 20, Nov 6, May 23, Sep 26). Note the SmugMug
-- folder dates differ for two of them (20230916, 20250521) — those are shoot/upload folders, not
-- capture dates, so photo_date is the authority and the suffixes stay as they are.
--
-- If the true full names are known to the operator, replacing these is a one-line follow-up. This
-- migration's job is only to stop publishing a mid-word truncation.
--
-- WHY TWO TABLES
--
-- `album_name` is denormalized into `albums` (4 rows) AND `photo_metadata` (400 rows — 396
-- processed plus 4 with null sharpness). Fixing one leaves search, which matches
-- `album_name ILIKE`, disagreeing with what the page displays. `video_metadata` also carries the
-- column but none of these albums hold clips (verified: 0). `curated_hero_images` carries it too
-- and is NOT touched here — nothing in src/ or scripts/ reads that table, and its copies are
-- stale in a different way (9 rows still hold the " - Jan 1" placeholder the 2026-06-23 pass
-- removed from the live tables). That is its own finding, not this repair.
--
-- Idempotent and loud: each UPDATE is guarded on the exact expected old value, so a re-run matches
-- nothing and a surprise value is left alone rather than silently rewritten.

BEGIN;

CREATE TEMP TABLE album_name_repair (album_key text PRIMARY KEY, old_name text, new_name text) ON COMMIT DROP;

INSERT INTO album_name_repair (album_key, old_name, new_name) VALUES
  ('jDbB4z', 'DU Women''s Soccer - Homecoming We... - Sep 20', 'DU Women''s Soccer - Homecoming - Sep 20'),
  ('VFTwzS', 'ACC Drama – Alice in Wonderland (F... - Nov 6',  'ACC Drama – Alice in Wonderland - Nov 6'),
  ('kZ3pTs', 'Benet Academy – Senior Night - Ma... - May 23',   'Benet Academy – Senior Night - May 23'),
  ('MNNbgk', 'Homecoming Jersey Photoshoot - Se... - Sep 26',   'Homecoming Jersey Photoshoot - Sep 26');

UPDATE albums a
   SET album_name = r.new_name
  FROM album_name_repair r
 WHERE a.album_key = r.album_key
   AND a.album_name = r.old_name;

UPDATE photo_metadata p
   SET album_name = r.new_name
  FROM album_name_repair r
 WHERE p.album_key = r.album_key
   AND p.album_name = r.old_name;

COMMIT;

-- A migration owns its matview refresh. `albums_summary` is where the album page and the listing
-- read the name from (NOT the base table), so skipping this leaves the page and the card
-- disagreeing — the exact failure mode this project has hit before. CONCURRENTLY is available here
-- because the view has a unique index (idx_albums_summary_album_key_uniq).
--
-- `videos_summary` carries album_name too and is deliberately NOT refreshed: none of these four
-- albums holds a single clip (verified: 0 rows in video_metadata), so it has nothing to update. It
-- also has no unique index, so a refresh there must be non-CONCURRENT — an exclusive lock on a view
-- the album listing reads on every request. Not worth taking for a no-op.
REFRESH MATERIALIZED VIEW CONCURRENTLY albums_summary;
