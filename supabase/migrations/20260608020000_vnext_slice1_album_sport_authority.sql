-- Migration: v-next Slice 1 — authoritative album sport + enforcement
-- Date: 2026-06-08
-- Status: PROPOSED — apply ONLY after (a) operator confirms .temp/album-sport-sheet and
--   (b) explicit sign-off. Apply via `supabase db push` after copying into supabase/migrations/.
-- Depends on: sport_enum (database/generated/taxonomy-enums.sql, generated from taxonomy.ts).
--
-- GOAL: make sport a KNOWN album-level fact that the vision model can never corrupt. The prior
-- per-photo, prompt-guessed sport_type (with a hard-coded "default volleyball" bias) mislabeled
-- 18 whole albums and put a sport on 23 non-sport shoots. This migration moves sport authority
-- to the album and FORCES every photo's sport_type to mirror it.
--
-- DELIBERATE DEVIATION from NORTH-STAR-REDESIGN.md §4 (which has albums.sport as a mirror of
-- events.sport with a NOT NULL events FK): `events` is DEFERRED to Slice 2. Slice 1's job is only
-- to kill the sport corruption — that needs authoritative album sport + enforcement, not the full
-- event/team graph (which serves identity, Slice 2+). Introducing events now would force inventing
-- one per album with no consumer. albums.sport is the direct authority here (sport_source tracks
-- provenance); when events arrive in Slice 2, albums.event_id is added and sport becomes its mirror.
-- This is the additive, non-big-bang path the doc's sequencing mandates.
--
-- ADDITIVE BRIDGE: photo_metadata.sport_type is KEPT for now as a trigger-enforced mirror so live
-- consumers keep working. The contract's end-state ("no per-photo sport column", served via a
-- photos↔albums view) is reached later by the final-contract migration (Open Decision 7), after
-- the new read path is green.

-- 1. sport enum (generated from src/lib/ai/taxonomy.ts) ----------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sport_enum') THEN
    CREATE TYPE sport_enum AS ENUM (
      'volleyball','basketball','soccer','softball','baseball','football',
      'track','cross_country','golf','tennis','bowling','pickleball','other'
    );
  END IF;
END $$;

-- 2. albums: authoritative album-level facts (sport is KNOWN, never AI-written) --------------
CREATE TABLE IF NOT EXISTS albums (
  album_key     text PRIMARY KEY,                 -- carried verbatim (e.g. 'TRoiyO')
  album_name    text NOT NULL,
  sport         sport_enum,                       -- NULL = non-sport album (portrait/graduation/event)
  sport_source  text NOT NULL DEFAULT 'legacy-unconfirmed'
                CHECK (sport_source IN ('operator','detection-unanimous','legacy-unconfirmed')),
  event_type    text CHECK (event_type IS NULL OR event_type IN ('game','practice','tournament','portrait','event')),
  -- Non-sport album category (operator vocabulary, emerging): portrait, street, pets, drama,
  -- flag_football, etc. Free-text for now; formalize to an enum once the vocabulary stabilizes.
  -- Lets non-sport albums (sport IS NULL) still be classified/browsable.
  category      text,
  event_date    date,
  gallery_scope text,                             -- lift-and-shift from album_settings (LPO)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_albums_sport ON albums(sport) WHERE sport IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_albums_scope ON albums(gallery_scope) WHERE gallery_scope IS NOT NULL;

-- 3. seed one albums row per existing album (sport left NULL; the loader sets it from the
--    operator-confirmed sheet). gallery_scope lifted from album_settings.
INSERT INTO albums (album_key, album_name, gallery_scope, sport_source)
SELECT DISTINCT ON (pm.album_key)
       pm.album_key, pm.album_name, s.gallery_scope, 'legacy-unconfirmed'
FROM photo_metadata pm
LEFT JOIN album_settings s USING (album_key)
WHERE pm.album_key IS NOT NULL AND pm.album_name IS NOT NULL
ORDER BY pm.album_key, pm.album_name
ON CONFLICT (album_key) DO NOTHING;

-- 4. enforcement: a photo's sport_type is FORCED to mirror its album's sport. Any writer
--    (the vision model included) that sets sport_type is overridden with the album truth.
CREATE OR REPLACE FUNCTION enforce_album_sport() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT a.sport::text INTO NEW.sport_type FROM albums a WHERE a.album_key = NEW.album_key;
  RETURN NEW;   -- album unknown → sport_type NULL (cannot invent a sport)
END $$;

DROP TRIGGER IF EXISTS trg_enforce_album_sport ON photo_metadata;
CREATE TRIGGER trg_enforce_album_sport
  BEFORE INSERT OR UPDATE OF sport_type, album_key ON photo_metadata
  FOR EACH ROW EXECUTE FUNCTION enforce_album_sport();

-- 5. sport_type integrity: only valid sports or NULL. Added NOT VALID so it does not fail on the
--    existing junk ('portrait', 'cross country', etc.); the loader's backfill rewrites every row
--    to its album's sport, then migration 2 VALIDATEs it. After that, junk can never re-enter.
ALTER TABLE photo_metadata DROP CONSTRAINT IF EXISTS valid_sport_type;
ALTER TABLE photo_metadata ADD CONSTRAINT valid_sport_type CHECK (
  sport_type IS NULL OR sport_type IN (
    'volleyball','basketball','soccer','softball','baseball','football',
    'track','cross_country','golf','tennis','bowling','pickleball','other'
  )
) NOT VALID;

-- 6. RLS: albums publicly readable; writes are service_role-only (no anon/authenticated policy).
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS albums_read ON albums;
CREATE POLICY albums_read ON albums FOR SELECT TO anon, authenticated USING (true);

-- NOTE: the one-time backfill (force every existing photo_metadata.sport_type to its album's
-- sport) and VALIDATE of valid_sport_type run in scripts/load-album-sports.ts AFTER albums.sport
-- is populated from the confirmed sheet — not here, because the values are operator-supplied.

-- Verification (after the loader runs):
-- SELECT sport, count(*) FROM albums GROUP BY 1 ORDER BY 2 DESC;        -- album-level truth
-- SELECT sport_type, count(*) FROM photo_metadata GROUP BY 1 ORDER BY 2 DESC;  -- only valid sports + NULL
-- SELECT count(*) FROM photo_metadata p JOIN albums a USING(album_key)
--   WHERE p.sport_type IS DISTINCT FROM a.sport::text;                  -- expect 0 (perfect mirror)
