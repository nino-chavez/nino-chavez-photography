-- Migration: Phase 3a — popularity-aware jersey search
--
-- Rebased on 20260623210000 (which added the album_settings unlisted privacy gate):
-- this KEEPS that gate and adds a popularity tiebreaker. Quality stays the dominant
-- signal for "find good photos of me" — a stunning unseen shot beats a mediocre
-- viewed one — and among comparably-good shots the engaged ones rank up. We do NOT
-- sum quality_score + trending_score (different scales would corrupt the order).
-- Signature, SECURITY DEFINER, search_path, and the privacy gate are unchanged.

CREATE OR REPLACE FUNCTION public.find_photos_by_jersey(
  p_jersey      text,
  p_album_key   text       DEFAULT NULL,
  p_team_color  text       DEFAULT NULL,
  p_sport       public.sport_enum DEFAULT NULL,
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
      AND (aset.visibility IS NULL OR aset.visibility <> 'unlisted')  -- privacy gate (from 210000)
      AND (p_album_key  IS NULL OR pm.album_key = p_album_key)
      AND (p_sport      IS NULL OR a.sport = p_sport)
      AND (p_team_color IS NULL OR norm_color(s.team_color) = norm_color(p_team_color))
    ORDER BY pm.photo_id
  )
  SELECT hits.photo_id, hits.image_key, hits.album_key, hits.album_name, hits.sport_type,
         hits.cf_image_id, hits.quality_score, hits.jersey_number, hits.team_color, hits.team_side
  FROM hits
  LEFT JOIN public.photo_popularity pp ON pp.photo_id = hits.photo_id
  ORDER BY hits.quality_score DESC NULLS LAST,
           COALESCE(pp.trending_score, 0) DESC,
           hits.photo_id
  LIMIT p_limit OFFSET p_offset;
$$;
