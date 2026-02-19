-- Add cf_image_id column for Cloudflare Images migration
ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS cf_image_id TEXT;

-- Index for efficient lookup of unmigrated photos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_photo_metadata_cf_image_id
  ON photo_metadata (cf_image_id) WHERE cf_image_id IS NOT NULL;
