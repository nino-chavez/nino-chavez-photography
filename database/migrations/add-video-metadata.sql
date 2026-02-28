-- Video metadata table for Cloudflare Stream content
-- Stores video metadata migrated from SmugMug and future CF Stream uploads.
-- Run via Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS video_metadata (
  video_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cf_stream_id TEXT UNIQUE NOT NULL,
  cf_stream_thumbnail TEXT,
  source_platform TEXT DEFAULT 'smugmug',
  source_url TEXT,
  album_key TEXT NOT NULL,
  album_name TEXT,
  title TEXT,
  description TEXT,
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,
  sport_type TEXT DEFAULT 'volleyball',
  video_category TEXT DEFAULT 'highlights',
  video_date TIMESTAMPTZ,
  upload_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_metadata_album_key ON video_metadata(album_key);
CREATE INDEX idx_video_metadata_cf_stream_id ON video_metadata(cf_stream_id);

ALTER TABLE video_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON video_metadata FOR SELECT USING (true);
