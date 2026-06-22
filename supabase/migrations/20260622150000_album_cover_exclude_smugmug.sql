-- Exclude legacy SmugMug URLs from album cover selection (read-model cleanup).
--
-- Context: SmugMug was removed from the product months ago, but the albums_summary
-- "legacy SmugMug fallback" cover expression still surfaces photos.smugmug.com URLs as
-- cover_image_url for 256 albums (the ThumbnailUrl source column was never repointed off
-- SmugMug; only cf_image_id was added). cover_image_url is materialized-view-derived, so a
-- direct UPDATE would be overwritten on the next REFRESH — the fix belongs in the view.
--
-- Verified safe before writing this migration (service_role read):
--   * 256 albums have a SmugMug cover_image_url; ALL 256 already have a cover_cf_image_id.
--   * 0 albums have a SmugMug cover with no CF cover → 0 albums lose a visible cover.
-- The app prefers cover_cf_image_id, so nulling the SmugMug fallbacks is a no-op visually;
-- it only removes dead SmugMug references from the read model and every album-list payload.
--
-- This recreates albums_summary with a FILTER that drops SmugMug URLs from cover selection
-- (cover becomes the newest non-SmugMug photo thumbnail, or NULL → folder fallback).
-- It re-creates the view's indexes AND the unique index that backs the CONCURRENTLY refresh
-- from 20260622000000 (ADR 0001). The refresh_albums_summary() function and its REVOKEs are
-- left untouched — this migration does not redefine them.
--
-- CASCADE is safe: verified no other objects depend on albums_summary.

DROP MATERIALIZED VIEW IF EXISTS albums_summary CASCADE;

CREATE MATERIALIZED VIEW albums_summary AS
SELECT
  p.album_key,
  MAX(p.album_name) as album_name,
  COUNT(*) as photo_count,
  -- Cover: newest NON-SmugMug photo thumbnail (legacy SmugMug URLs excluded);
  -- NULL when an album has only SmugMug-thumbnailed photos (app falls back to cover_cf_image_id).
  (ARRAY_AGG(COALESCE(p."ThumbnailUrl", p."ImageUrl") ORDER BY p.upload_date DESC)
     FILTER (WHERE COALESCE(p."ThumbnailUrl", p."ImageUrl") NOT LIKE '%smugmug.com%'))[1] as cover_image_url,
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

-- Data indexes (dropped with the MV above; recreated identically).
CREATE INDEX IF NOT EXISTS idx_albums_summary_album_key ON albums_summary(album_key);
CREATE INDEX IF NOT EXISTS idx_albums_summary_photo_count ON albums_summary(photo_count DESC);
CREATE INDEX IF NOT EXISTS idx_albums_summary_latest_photo_date ON albums_summary(latest_photo_date DESC);
CREATE INDEX IF NOT EXISTS idx_albums_summary_primary_sport ON albums_summary(primary_sport);
CREATE INDEX IF NOT EXISTS idx_albums_summary_primary_category ON albums_summary(primary_category);

-- Unique index required by refresh_albums_summary()'s CONCURRENTLY refresh (from 20260622000000).
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_summary_album_key_uniq ON albums_summary(album_key);

-- Read grants (dropped with the MV; refresh-function EXECUTE grants are untouched).
GRANT SELECT ON albums_summary TO anon;
GRANT SELECT ON albums_summary TO authenticated;
