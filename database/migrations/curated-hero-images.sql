-- Migration: Create curated_hero_images table
-- Purpose: Store preselected high-quality images for hero rotation
-- These images will be downloaded and cached locally during build time
-- to eliminate SmugMug third-party cookies and improve LCP

CREATE TABLE IF NOT EXISTS curated_hero_images (
  id SERIAL PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photo_metadata(photo_id) ON DELETE CASCADE,
  image_key TEXT NOT NULL,

  -- Local static path (populated after build script runs)
  local_path TEXT, -- e.g., '/hero-images/hero-001.webp'

  -- Quality metrics for sorting
  quality_score DECIMAL(4, 2),
  sharpness DECIMAL(4, 2),
  composition_score DECIMAL(4, 2),
  emotional_impact DECIMAL(4, 2),

  -- Source URLs
  original_url TEXT NOT NULL,
  smugmug_thumbnail_url TEXT,

  -- Album diversity tracking
  album_key TEXT,
  album_name TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher = more likely to be selected

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on photo_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_curated_hero_photo_id ON curated_hero_images(photo_id);

-- Index for active images sorted by priority
CREATE INDEX IF NOT EXISTS idx_curated_hero_active_priority ON curated_hero_images(is_active, priority DESC);

-- Function to update timestamp on modification
CREATE OR REPLACE FUNCTION update_curated_hero_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS curated_hero_updated_at ON curated_hero_images;
CREATE TRIGGER curated_hero_updated_at
  BEFORE UPDATE ON curated_hero_images
  FOR EACH ROW
  EXECUTE FUNCTION update_curated_hero_updated_at();

-- Seed with initial curated images (top 20 volleyball action shots)
-- These are selected from our best hero-worthy photos
INSERT INTO curated_hero_images (photo_id, image_key, quality_score, sharpness, composition_score, emotional_impact, original_url, album_key, album_name, priority)
SELECT
  pm.photo_id,
  pm.image_key,
  ROUND((COALESCE(pm.sharpness, 0) + COALESCE(pm.composition_score, 0) + COALESCE(pm.emotional_impact, 0)) / 3, 2) as quality_score,
  pm.sharpness,
  pm.composition_score,
  pm.emotional_impact,
  pm."ImageUrl" as original_url,
  pm.album_key,
  pm.album_name,
  ROW_NUMBER() OVER (ORDER BY (COALESCE(pm.sharpness, 0) + COALESCE(pm.composition_score, 0) + COALESCE(pm.emotional_impact, 0)) DESC) as priority
FROM photo_metadata pm
WHERE pm.sport_type = 'volleyball'
  AND pm.aspect_ratio >= 1.0
  AND pm.sharpness >= 8.5
  AND pm.composition_score >= 8.5
  AND pm.emotional_impact >= 8.5
  AND pm.photo_category IN ('action', 'celebration', 'portrait')
  AND pm.photo_date >= NOW() - INTERVAL '2 years'
ORDER BY (COALESCE(pm.sharpness, 0) + COALESCE(pm.composition_score, 0) + COALESCE(pm.emotional_impact, 0)) DESC
LIMIT 20
ON CONFLICT (photo_id) DO NOTHING;

-- Comment on table
COMMENT ON TABLE curated_hero_images IS 'Preselected high-quality images for hero section rotation. Images are downloaded to static/ during build for optimal LCP and to avoid third-party cookies.';
