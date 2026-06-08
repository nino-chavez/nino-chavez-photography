-- Migration: Slice 2 SIMPLIFY — strip named-identity; jersey-search over sightings (no naming)
-- Operator clarified (2026-06-08): there is NO per-person naming workflow ("find me by name" is
-- social media's job; no time for individual tagging). The needs are find-by-jersey (no naming)
-- and find-similar-face (Slice 3, embeddings). The named system (players / photo_players /
-- player_consent / resolve / find_player_*) is overkill — removed. All were created empty in the
-- prior Slice 2 migration and are never referenced by `main`, so the drop is prod-safe (additive
-- rule: this reverses an additive migration whose objects no consumer reads).
--
-- KEPT: photo_jersey_sightings (the 2,272 jersey sightings) — now the direct jersey-search surface.

BEGIN;

-- 1. drop the named-identity RPCs
DROP FUNCTION IF EXISTS find_player_photos(uuid, int, int);
DROP FUNCTION IF EXISTS admin_unresolved_jerseys(text, int);
DROP FUNCTION IF EXISTS find_player_candidates(text, int);
DROP FUNCTION IF EXISTS resolve_jersey_to_player(uuid, text, text, text);

-- 2. revert user_tags read policy to its pre-Slice-2 form + drop player_id (player_consent is going away)
DROP POLICY IF EXISTS ut_read ON user_tags;
DROP POLICY IF EXISTS "View approved or own tags" ON user_tags;
CREATE POLICY "View approved or own tags" ON user_tags FOR SELECT TO anon, authenticated
  USING (approved = true OR tagged_by_user_id = (SELECT auth.uid())::text);
ALTER TABLE user_tags DROP COLUMN IF EXISTS player_id;

-- 3. drop the naming columns on sightings (they FK to players)
ALTER TABLE photo_jersey_sightings
  DROP COLUMN IF EXISTS resolved_player_id,
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS resolved_by;

-- 4. drop the named-identity tables. Order matters: photo_players + players own RLS policies
--    (pp_read, players_read) that reference player_consent, so drop those tables FIRST (which
--    drops their policies), then player_consent is free of dependents.
DROP TABLE IF EXISTS photo_players;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS player_consent;

-- 5. drop the now-unused enums
DROP TYPE IF EXISTS link_source;
DROP TYPE IF EXISTS link_status;
DROP TYPE IF EXISTS consent_status;

-- 6. jersey-search reads the SIGHTINGS directly (no naming, no players). SECURITY DEFINER because
--    a jersey number + photo is non-PII (no name, no face) and the sightings table is admin-only
--    by default — the function is the controlled public surface. CTE wrapper so DISTINCT ON (one
--    row per photo) composes with the global quality sort + pagination.
DROP FUNCTION IF EXISTS find_photos_by_jersey(text, text, text, sport_enum, int, int);
CREATE FUNCTION find_photos_by_jersey(
  p_jersey      text,
  p_album_key   text       DEFAULT NULL,
  p_team_color  text       DEFAULT NULL,
  p_sport       sport_enum DEFAULT NULL,
  p_limit       int        DEFAULT 50,
  p_offset      int        DEFAULT 0
)
RETURNS TABLE (
  photo_id text, image_key text, album_key text, album_name text, sport_type text,
  cf_image_id text, quality_score numeric, jersey_number text, team_color text, team_side text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hits AS (
    SELECT DISTINCT ON (pm.photo_id)
           pm.photo_id, pm.image_key, pm.album_key, a.album_name, pm.sport_type,
           pm.cf_image_id, pm.quality_score, s.jersey_number, s.team_color, s.team_side
    FROM photo_jersey_sightings s
    JOIN photo_metadata pm ON pm.photo_id = s.photo_id
    LEFT JOIN albums a     ON a.album_key = pm.album_key
    WHERE s.jersey_number = btrim(p_jersey)
      AND pm.sharpness IS NOT NULL
      AND (p_album_key  IS NULL OR pm.album_key = p_album_key)
      AND (p_sport      IS NULL OR a.sport = p_sport)
      AND (p_team_color IS NULL OR norm_color(s.team_color) = norm_color(p_team_color))
    ORDER BY pm.photo_id
  )
  SELECT photo_id, image_key, album_key, album_name, sport_type, cf_image_id,
         quality_score, jersey_number, team_color, team_side
  FROM hits
  ORDER BY quality_score DESC NULLS LAST, photo_id
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION find_photos_by_jersey(text, text, text, sport_enum, int, int)
  TO anon, authenticated;

COMMIT;
