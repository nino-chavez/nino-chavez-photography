-- Materialized view for album summaries
-- This pre-aggregates album data for instant retrieval
-- Refresh this view after bulk photo uploads/updates

CREATE MATERIALIZED VIEW IF NOT EXISTS albums_summary AS
SELECT
  p.album_key,
  MAX(p.album_name) as album_name,
  COUNT(*) as photo_count,
  -- Get the most recent photo's thumbnail for cover (legacy SmugMug fallback)
  (ARRAY_AGG(COALESCE(p."ThumbnailUrl", p."ImageUrl") ORDER BY p.upload_date DESC))[1] as cover_image_url,
  -- Cloudflare Images cover (preferred, picks highest quality photo)
  (ARRAY_AGG(p.cf_image_id ORDER BY p.sharpness DESC NULLS LAST))[1] as cover_cf_image_id,
  -- Collect unique sports and categories
  ARRAY_AGG(DISTINCT p.sport_type) FILTER (WHERE p.sport_type IS NOT NULL AND p.sport_type != 'unknown') as sports,
  ARRAY_AGG(DISTINCT p.photo_category) FILTER (WHERE p.photo_category IS NOT NULL AND p.photo_category != 'unknown') as categories,
  -- Count high-quality photos (sharpness >= 0.7 as proxy for portfolio-worthy)
  COUNT(*) FILTER (WHERE p.sharpness >= 0.7) as portfolio_count,
  -- Calculate average sharpness as quality metric
  ROUND(AVG(p.sharpness)::numeric, 2) as avg_quality_score,
  -- Get most common sport (primary)
  MODE() WITHIN GROUP (ORDER BY p.sport_type) as primary_sport,
  -- Get most common category (primary)
  MODE() WITHIN GROUP (ORDER BY p.photo_category) as primary_category,
  -- Date range for albums
  MIN(p.photo_date) as earliest_photo_date,
  MAX(p.photo_date) as latest_photo_date,
  -- Track last update
  MAX(p.upload_date) as last_upload_date,
  MAX(p.enriched_at) as last_enriched_at
FROM photo_metadata p
WHERE
  p.album_key IS NOT NULL
  AND p.sharpness IS NOT NULL  -- Only enriched photos
GROUP BY p.album_key
ORDER BY photo_count DESC;

-- Create indexes on the materialized view for fast lookups and sorting
CREATE INDEX IF NOT EXISTS idx_albums_summary_album_key ON albums_summary(album_key);
CREATE INDEX IF NOT EXISTS idx_albums_summary_photo_count ON albums_summary(photo_count DESC);
CREATE INDEX IF NOT EXISTS idx_albums_summary_latest_photo_date ON albums_summary(latest_photo_date DESC);
CREATE INDEX IF NOT EXISTS idx_albums_summary_primary_sport ON albums_summary(primary_sport);
CREATE INDEX IF NOT EXISTS idx_albums_summary_primary_category ON albums_summary(primary_category);

-- Grant read access
GRANT SELECT ON albums_summary TO anon;
GRANT SELECT ON albums_summary TO authenticated;

-- Refresh function (call this after bulk uploads)
-- Note: Uses non-concurrent refresh since view doesn't have a unique index
-- For concurrent refresh, add: CREATE UNIQUE INDEX ON albums_summary(album_key);
CREATE OR REPLACE FUNCTION refresh_albums_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW albums_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_albums_summary() TO anon;
GRANT EXECUTE ON FUNCTION refresh_albums_summary() TO authenticated;
