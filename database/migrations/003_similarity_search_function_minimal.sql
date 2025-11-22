-- Migration: Add Similarity Search Function (Minimal - No Index)
-- Purpose: Enable vector similarity search using pgvector
-- Created: 2025-11-21
-- Version: Minimal - Function only, no index (index can be added later if needed)

-- Drop existing function if it exists (needed when changing return type)
DROP FUNCTION IF EXISTS match_photos(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_photos(vector, float, integer);
DROP FUNCTION IF EXISTS match_photos(vector);

-- Create function for finding similar photos by embedding
CREATE OR REPLACE FUNCTION match_photos (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  image_key text,
  sport_type text,
  photo_category text,
  emotion text,
  action_intensity text,
  play_type text,
  composition text,
  lighting text,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.image_key::text,
    pm.sport_type::text,
    pm.photo_category::text,
    pm.emotion::text,
    pm.action_intensity::text,
    pm.play_type::text,
    pm.composition::text,
    pm.lighting::text,
    (1 - (pm.embedding <=> query_embedding))::double precision AS similarity
  FROM photo_metadata pm
  WHERE pm.embedding IS NOT NULL
    AND 1 - (pm.embedding <=> query_embedding) >= match_threshold
  ORDER BY pm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_photos TO authenticated;
GRANT EXECUTE ON FUNCTION match_photos TO anon;

-- Note: No index is created in this version to avoid memory issues
-- The function will work but may be slower on large datasets
-- For 20K photos, performance should still be acceptable (< 1 second)
