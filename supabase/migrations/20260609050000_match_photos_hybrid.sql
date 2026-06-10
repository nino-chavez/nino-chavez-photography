-- Hybrid semantic+structured photo search (powers the LLM query planner).
-- ADDITIVE + prod-safe: a NEW function; `match_photos` is untouched, so deployed `main` keeps working.
--
-- WHY: the existing match_photos takes only the query embedding, so the search path loses every
-- structured filter the moment it goes semantic (a query mixing "volleyball spike" with an unknown
-- term tips fully to vector). This function ANDs the facet + date filters into the same query that
-- ranks by caption-embedding similarity, so "volleyball blocks from last summer" filters AND ranks.
--
-- All filter params default NULL = "no constraint", so callers pass only what the planner extracted.
-- match_threshold is lower than match_photos' 0.5 because the structured filters already narrow the
-- candidate set — we still want the best semantic order within it even at modest similarity.
CREATE OR REPLACE FUNCTION match_photos_hybrid(
  query_embedding vector,
  match_count integer DEFAULT 24,
  match_threshold double precision DEFAULT 0.15,
  p_sport text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_play_type text DEFAULT NULL,
  p_album_key text DEFAULT NULL,
  p_date_from timestamp DEFAULT NULL,
  p_date_to timestamp DEFAULT NULL
)
RETURNS TABLE(image_key text, similarity double precision)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT pm.image_key::text,
         (1 - (pm.embedding <=> query_embedding))::double precision AS similarity
  FROM public.photo_metadata pm
  WHERE pm.embedding IS NOT NULL
    AND pm.sharpness IS NOT NULL
    AND (p_sport     IS NULL OR pm.sport_type     = p_sport)
    AND (p_category  IS NULL OR pm.photo_category  = p_category)
    AND (p_play_type IS NULL OR pm.play_type       = p_play_type)
    AND (p_album_key IS NULL OR pm.album_key       = p_album_key)
    AND (p_date_from IS NULL OR pm.photo_date      >= p_date_from)
    AND (p_date_to   IS NULL OR pm.photo_date      <= p_date_to)
    AND (1 - (pm.embedding <=> query_embedding)) >= match_threshold
  ORDER BY pm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_photos_hybrid(vector, integer, double precision, text, text, text, text, timestamp, timestamp)
  TO anon, authenticated;
