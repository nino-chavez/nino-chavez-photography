-- find_photos_by_jersey: exclude unlisted albums.
--
-- The RPC is the public jersey-search surface (anon-granted, SECURITY DEFINER over the admin-only
-- photo_jersey_sightings). It did NOT honor album_settings.visibility='unlisted' — so jersey search
-- could surface photos from private client albums (e.g. "Homecoming Jersey Photoshoot" — 682 jersey
-- sightings sit in unlisted albums). This is the same privacy gate the app applies to browse/search;
-- the RPC was the one discovery path that bypassed it. Add the LEFT JOIN + filter. Signature unchanged.

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
    JOIN photo_metadata pm   ON pm.photo_id = s.photo_id
    LEFT JOIN albums a       ON a.album_key = pm.album_key
    LEFT JOIN album_settings aset ON aset.album_key = pm.album_key
    WHERE s.jersey_number = btrim(p_jersey)
      AND pm.sharpness IS NOT NULL
      AND (aset.visibility IS NULL OR aset.visibility <> 'unlisted')  -- privacy gate
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
