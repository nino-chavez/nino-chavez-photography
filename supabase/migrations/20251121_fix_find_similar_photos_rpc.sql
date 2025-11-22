
-- Fix find_similar_photos RPC to use correct column names (CamelCase)
-- AND fix ambiguous column reference in subquery
-- AND fix return type mismatch (sport_type/play_type are likely varchar, not text)

CREATE OR REPLACE FUNCTION find_similar_photos(
  query_image_key TEXT,
  match_count INT DEFAULT 12,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  image_key TEXT,
  thumbnail_url TEXT,
  sport_type TEXT,
  play_type TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.image_key::TEXT,
    pm."ThumbnailUrl"::TEXT as thumbnail_url,
    pm.sport_type::TEXT,
    pm.play_type::TEXT,
    (1 - (pm.embedding <=> (SELECT sub.embedding FROM photo_metadata sub WHERE sub.image_key = query_image_key)))::FLOAT AS similarity
  FROM photo_metadata pm
  WHERE pm.image_key != query_image_key
    AND pm.embedding IS NOT NULL
    AND 1 - (pm.embedding <=> (SELECT sub.embedding FROM photo_metadata sub WHERE sub.image_key = query_image_key)) > match_threshold
  ORDER BY pm.embedding <=> (SELECT sub.embedding FROM photo_metadata sub WHERE sub.image_key = query_image_key)
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_similar_photos IS
'Find photos similar to a given image based on vector embeddings. Returns photos sorted by cosine similarity. Fixed to handle CamelCase column names, ambiguous references, and type casting.';
