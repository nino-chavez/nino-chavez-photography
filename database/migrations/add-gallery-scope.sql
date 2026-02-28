-- Add gallery_scope column to album_settings
-- Enables database-driven album scoping (e.g. 'lpo' for Let's Pepper Open)
-- without requiring code deploys to update album allowlists.
-- Run via Supabase SQL Editor.

ALTER TABLE album_settings
  ADD COLUMN IF NOT EXISTS gallery_scope TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_album_settings_gallery_scope
  ON album_settings(gallery_scope) WHERE gallery_scope IS NOT NULL;

-- Seed LPO albums (photo + video)
INSERT INTO album_settings (album_key, visibility, gallery_scope) VALUES
  ('j5MfJD', 'public', 'lpo'),  -- Bell Pepper Open – Official Gallery
  ('5M7kNx', 'public', 'lpo'),  -- Grass Launch | Open Triples Tournament
  ('QwhCK5', 'public', 'lpo'),  -- Bell Pepper - Final Match Highlights (video)
  ('p4J2jk', 'public', 'lpo')   -- Bell Pepper Open - Video Highlights (video)
ON CONFLICT (album_key) DO UPDATE SET
  gallery_scope = 'lpo', updated_at = now();
