-- Cutover drops — batch 2: the 6 vanity categorical aesthetic columns.
-- Verified safe: not in the deployed PHOTO_COLUMNS/types/mapping (removed pre-merge); their only DB
-- consumers are match_photos (returns 4 of them) and normalize_composition (a dead maintenance fn).
-- All 3 match_photos callers (searchPhotos, chat, related-photos) use ONLY image_key from the result.
BEGIN;

-- Recreate match_photos without the vanity output columns (return-type change → DROP+CREATE).
DROP FUNCTION IF EXISTS match_photos(vector, double precision, integer);
CREATE FUNCTION match_photos(query_embedding vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 10)
RETURNS TABLE(image_key text, sport_type text, photo_category text, play_type text, similarity double precision)
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT pm.image_key::text, pm.sport_type::text, pm.photo_category::text, pm.play_type::text,
         (1 - (pm.embedding <=> query_embedding))::double precision AS similarity
  FROM public.photo_metadata pm
  WHERE pm.embedding IS NOT NULL
    AND 1 - (pm.embedding <=> query_embedding) >= match_threshold
  ORDER BY pm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
GRANT EXECUTE ON FUNCTION match_photos(vector, double precision, integer) TO anon, authenticated;

-- Drop the dead maintenance function that referenced the composition column.
DROP FUNCTION IF EXISTS normalize_composition();

-- Drop the 6 vanity columns (no remaining consumers).
ALTER TABLE photo_metadata
  DROP COLUMN IF EXISTS composition,
  DROP COLUMN IF EXISTS lighting,
  DROP COLUMN IF EXISTS color_temperature,
  DROP COLUMN IF EXISTS time_of_day,
  DROP COLUMN IF EXISTS emotion,
  DROP COLUMN IF EXISTS action_intensity;

COMMIT;
