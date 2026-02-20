-- Album Settings: Unlisted albums + share tokens
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS album_settings (
  album_key TEXT PRIMARY KEY,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted')),
  share_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_album_settings_share_token ON album_settings(share_token);

-- RLS: allow anon SELECT for share link lookups, restrict writes to service role
ALTER TABLE album_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON album_settings FOR SELECT USING (true);
