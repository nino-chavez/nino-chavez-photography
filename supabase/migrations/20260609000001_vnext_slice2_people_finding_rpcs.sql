-- File: supabase/migrations/20260609000001_vnext_slice2_people_finding_rpcs.sql
-- Public find RPCs = SECURITY INVOKER (RLS + consent gate apply to anon; NOT DEFINER
-- which bypasses RLS and would leak proposed/unconsented links). Admin RPCs = DEFINER
-- + REVOKE from anon. SET search_path = public. jersey param is TEXT.
-- Apply AFTER 20260609000000_vnext_slice2_identity.sql.

BEGIN;

-- Retire the legacy INT-signature RPC (INT breaks '00'/'7A'; scanned the JSONB blob).
DROP FUNCTION IF EXISTS find_photos_by_jersey(INT, VARCHAR, INT);

-- find_photos_by_jersey: relational only, indexed, consent-gated.
--   jersey_seen TEXT equality ('07' <> '7'); never touches the INTEGER column (no
--   uncallable integer=text cast, no unindexed LATERAL JSONB scan).
--   Returns empty until naming fills photo_players — precision-first, not a bug.
--   LEFT JOIN albums (no FK photo_metadata.album_key -> albums; INNER would drop rows).
--   pm.quality_score = the GENERATED STORED column (selected, not re-derived).
CREATE OR REPLACE FUNCTION find_photos_by_jersey(
  p_jersey      text,
  p_album_key   text       DEFAULT NULL,
  p_team_color  text       DEFAULT NULL,
  p_sport       sport_enum DEFAULT NULL,
  p_limit       int        DEFAULT 50,
  p_offset      int        DEFAULT 0
)
RETURNS TABLE (
  photo_id text, image_key text, album_key text, album_name text, sport_type text,
  cf_image_id text, quality_score numeric, player_id uuid, player_display_name text,
  jersey_seen text, team_color text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT pm.photo_id, pm.image_key, pm.album_key, a.album_name,
         pm.sport_type, pm.cf_image_id, pm.quality_score,
         pp.player_id, coalesce(pl.display_name, pl.full_name) AS player_display_name,
         pp.jersey_seen, pp.team_color
  FROM photo_players pp
  JOIN photo_metadata pm ON pm.photo_id = pp.photo_id
  JOIN players pl        ON pl.player_id = pp.player_id AND pl.merged_into IS NULL
  LEFT JOIN albums a     ON a.album_key = pm.album_key
  WHERE pp.status = 'confirmed'
    AND pp.jersey_seen = btrim(p_jersey)
    AND pm.sharpness IS NOT NULL
    AND (p_album_key  IS NULL OR pm.album_key = p_album_key)
    AND (p_sport      IS NULL OR a.sport = p_sport)
    AND (p_team_color IS NULL OR norm_color(pp.team_color) = norm_color(p_team_color))
  ORDER BY pm.quality_score DESC NULLS LAST, pm.photo_id
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION find_photos_by_jersey(text,text,text,sport_enum,int,int)
  TO anon, authenticated;

-- find_player_photos: every confirmed photo of a player, quality-ranked.
-- CTE wrapper so DISTINCT ON + global quality sort + pagination compose (p_limit/p_offset live).
CREATE OR REPLACE FUNCTION find_player_photos(
  p_player_id uuid, p_limit int DEFAULT 50, p_offset int DEFAULT 0
)
RETURNS TABLE (
  photo_id text, image_key text, album_key text, album_name text, sport_type text,
  cf_image_id text, quality_score numeric, match_source text, jersey_seen text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH ranked AS (
    SELECT DISTINCT ON (pm.photo_id)
           pm.photo_id, pm.image_key, pm.album_key, a.album_name, pm.sport_type,
           pm.cf_image_id, pm.quality_score, pp.source::text AS match_source, pp.jersey_seen
    FROM photo_players pp
    JOIN photo_metadata pm ON pm.photo_id = pp.photo_id
    LEFT JOIN albums a     ON a.album_key = pm.album_key
    WHERE pp.player_id = p_player_id AND pp.status = 'confirmed' AND pm.sharpness IS NOT NULL
    ORDER BY pm.photo_id,
      CASE pp.source WHEN 'face_cluster' THEN 0 WHEN 'user_tag' THEN 1
                     WHEN 'manual' THEN 2 WHEN 'jersey_roster' THEN 3 ELSE 4 END
  )
  SELECT photo_id, image_key, album_key, album_name, sport_type,
         cf_image_id, quality_score, match_source, jersey_seen
  FROM ranked
  ORDER BY quality_score DESC NULLS LAST, photo_id
  LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION find_player_photos(uuid,int,int) TO anon, authenticated;

-- admin_unresolved_jerseys: the naming-path work queue (ADMIN ONLY).
CREATE OR REPLACE FUNCTION admin_unresolved_jerseys(
  p_album_key text DEFAULT NULL, p_limit int DEFAULT 200
)
RETURNS TABLE (
  album_key text, jersey_number text, team_color text, team_side text,
  sighting_count bigint, photo_ids text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.album_key, s.jersey_number, s.team_color, s.team_side,
         count(*) AS sighting_count, array_agg(s.photo_id ORDER BY s.photo_id) AS photo_ids
  FROM photo_jersey_sightings s
  WHERE s.resolved_player_id IS NULL AND s.jersey_number IS NOT NULL
    AND (p_album_key IS NULL OR s.album_key = p_album_key)
  GROUP BY s.album_key, s.jersey_number, s.team_color, s.team_side
  ORDER BY count(*) DESC
  LIMIT p_limit;
$$;
REVOKE EXECUTE ON FUNCTION admin_unresolved_jerseys(text,int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION admin_unresolved_jerseys(text,int) TO service_role;

-- find_player_candidates: admin trigram dedupe (ADMIN ONLY; must see pre-consent players).
CREATE OR REPLACE FUNCTION find_player_candidates(p_name text, p_limit int DEFAULT 5)
RETURNS TABLE (player_id uuid, full_name text, display_name text, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT player_id, full_name, display_name, similarity(full_name, p_name) AS similarity
  FROM players
  WHERE merged_into IS NULL AND full_name % p_name
  ORDER BY similarity(full_name, p_name) DESC
  LIMIT p_limit;
$$;
REVOKE EXECUTE ON FUNCTION find_player_candidates(text,int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION find_player_candidates(text,int) TO service_role;

-- resolve_jersey_to_player: the jersey FANOUT (fills photo_players.jersey_seen so the
-- relational jersey query returns rows). Writes proposed jersey_roster links (NEVER
-- auto-confirmed — OCR alone resolves a motion-blur misread to the wrong real athlete)
-- and stamps the matching sightings resolved. Called in the service-role approval txn.
CREATE OR REPLACE FUNCTION resolve_jersey_to_player(
  p_player_id uuid, p_jersey text, p_album_key text, p_resolved_by text
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  INSERT INTO photo_players (photo_id, player_id, source, status, jersey_seen,
                             team_color, confidence, resolved_by, resolved_at)
  SELECT s.photo_id, p_player_id, 'jersey_roster', 'proposed', s.jersey_number,
         s.team_color, s.jersey_confidence, p_resolved_by, now()
  FROM photo_jersey_sightings s
  WHERE s.jersey_number = btrim(p_jersey) AND s.resolved_player_id IS NULL
    AND (p_album_key IS NULL OR s.album_key = p_album_key)
  ON CONFLICT (photo_id, player_id, source) DO NOTHING;

  UPDATE photo_jersey_sightings s
  SET resolved_player_id = p_player_id, resolved_at = now(), resolved_by = p_resolved_by
  WHERE s.jersey_number = btrim(p_jersey) AND s.resolved_player_id IS NULL
    AND (p_album_key IS NULL OR s.album_key = p_album_key);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION resolve_jersey_to_player(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION resolve_jersey_to_player(uuid,text,text,text) TO service_role;

COMMIT;

-- Verify: legacy INT gone (pg_proc proname='find_photos_by_jersey' args LIKE '%integer%' = 0);
-- no anon EXECUTE on the 3 DEFINER admin fns; find_photos_by_jersey('00') != ('0');
-- a player with consent_status='unknown' returns ZERO rows to anon.