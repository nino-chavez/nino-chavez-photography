-- Migration: v-next Slice 2 — relational identity + jersey people-finding
-- File: supabase/migrations/20260609000000_vnext_slice2_identity.sql
-- Apply via: supabase db push
-- Depends on Slice 1 (LIVE): albums(album_key PK, sport sport_enum), sport_enum,
--   photo_metadata (photo_id TEXT PK, image_key TEXT, album_key TEXT, players JSONB,
--   jersey_number INTEGER, quality_score GENERATED), user_tags(photo_id TEXT FK,
--   jersey_number TEXT, approved BOOLEAN).
--
-- DEVIATIONS from NORTH-STAR-REDESIGN.md §4.4 (justified):
--  (1) photo_id is TEXT FK -> photo_metadata(photo_id), not uuid -> photos (not built).
--  (2) teams/rosters/events/seasons DEFERRED (no data, no ingest, no consumer);
--      album_key is the scope handle, team signal is free-text team_color/team_side.
--  (3) Unresolved sightings live in a typed photo_jersey_sightings TABLE (TEXT jersey,
--      B-tree indexable, carries soft resolved_player_id). players[] JSONB kept as untyped
--      landing pad but NOT the queryable surface (jsonb_path_ops GIN serves @> only, not
--      ->> equality; int blob cannot represent '00'/'7A'). NULL-PK fix honored: photo_players
--      is RESOLVED-only (player_id NOT NULL, in PK); resolved_player_id is in NO primary key.
--  (4) player_consent BUILT in Slice 2 (minimal) — concrete consumer NOW is the RLS gate;
--      youth platform needs a fail-CLOSED gate the moment naming can name a minor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- NOT installed in this project (only `vector` is)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'link_source') THEN
    CREATE TYPE link_source AS ENUM
      ('jersey_roster','face_cluster','vision_players','manual','user_tag');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'link_status') THEN
    CREATE TYPE link_status AS ENUM ('proposed','confirmed','rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_status') THEN
    CREATE TYPE consent_status AS ENUM ('waiver_signed','pending','revoked','unknown');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS players (
  player_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     text NOT NULL,
  display_name  text,
  slug          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NOT NULL,
  merged_into   uuid REFERENCES players(player_id),
  CONSTRAINT full_name_not_blank CHECK (length(btrim(full_name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_slug
  ON players(slug) WHERE slug IS NOT NULL AND merged_into IS NULL;
CREATE INDEX IF NOT EXISTS players_name_trgm
  ON players USING gin (coalesce(display_name, full_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS players_fullname_trgm
  ON players USING gin (full_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS player_consent (
  player_id    uuid PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  status       consent_status NOT NULL DEFAULT 'unknown',
  fully_hidden boolean NOT NULL DEFAULT false,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photo_players (
  photo_id     text NOT NULL REFERENCES photo_metadata(photo_id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES players(player_id),
  source       link_source NOT NULL,
  status       link_status NOT NULL DEFAULT 'proposed',
  confidence   real CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  jersey_seen  text CHECK (jersey_seen IS NULL OR jersey_seen ~ '^[0-9]{1,3}[A-Z]?$'),
  team_color   text,
  resolved_by  text,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, player_id, source)
);
CREATE INDEX IF NOT EXISTS idx_pp_player_confirmed
  ON photo_players(player_id) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_pp_pending
  ON photo_players(status) WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS idx_pp_photo ON photo_players(photo_id);
CREATE INDEX IF NOT EXISTS idx_pp_jersey_seen
  ON photo_players(jersey_seen) WHERE jersey_seen IS NOT NULL AND status = 'confirmed';

CREATE TABLE IF NOT EXISTS photo_jersey_sightings (
  sighting_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id       text NOT NULL REFERENCES photo_metadata(photo_id) ON DELETE CASCADE,
  album_key      text,
  jersey_number  text CHECK (jersey_number IS NULL OR jersey_number ~ '^[0-9]{1,3}[A-Z]?$'),
  team_side      text CHECK (team_side IS NULL OR team_side IN ('home','away')),
  team_color     text,
  jersey_confidence real CHECK (jersey_confidence IS NULL OR jersey_confidence BETWEEN 0 AND 1),
  action_text    text,
  position_in_frame text,
  is_primary_subject boolean,
  source         text NOT NULL CHECK (source IN ('players_old','players_new','jersey_singular')),
  resolved_player_id uuid REFERENCES players(player_id) ON DELETE SET NULL,
  resolved_at    timestamptz,
  resolved_by    text,
  dedup_key      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_sighting_dedup UNIQUE (dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_pjs_jersey
  ON photo_jersey_sightings(jersey_number) WHERE jersey_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pjs_album_jersey
  ON photo_jersey_sightings(album_key, jersey_number) WHERE jersey_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pjs_photo ON photo_jersey_sightings(photo_id);
CREATE INDEX IF NOT EXISTS idx_pjs_unresolved
  ON photo_jersey_sightings(album_key, jersey_number)
  WHERE resolved_player_id IS NULL AND jersey_number IS NOT NULL;

ALTER TABLE user_tags ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES players(player_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_player
  ON user_tags(player_id) WHERE player_id IS NOT NULL;

CREATE OR REPLACE FUNCTION norm_color(c text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(split_part(trim(c), ' ', 1)), '');
$$;

ALTER TABLE players                ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_consent         ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_players          ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_jersey_sightings ENABLE ROW LEVEL SECURITY;

-- Fail-CLOSED positive allowlist (NOT 'status <> revoked' — that denylist failed open for minors).
DROP POLICY IF EXISTS players_read ON players;
CREATE POLICY players_read ON players FOR SELECT TO anon, authenticated
  USING (
    merged_into IS NULL
    AND EXISTS (SELECT 1 FROM player_consent c
                WHERE c.player_id = players.player_id
                  AND c.status = 'waiver_signed' AND c.fully_hidden = false)
  );

DROP POLICY IF EXISTS pp_read ON photo_players;
CREATE POLICY pp_read ON photo_players FOR SELECT TO anon, authenticated
  USING (
    status = 'confirmed'
    AND EXISTS (SELECT 1 FROM player_consent c
                WHERE c.player_id = photo_players.player_id
                  AND c.status = 'waiver_signed' AND c.fully_hidden = false)
  );

-- player_consent: no select policy => default-deny (RLS subqueries run as policy owner).
-- photo_jersey_sightings: no select policy => default-deny (raw sightings are admin-only).
-- No write policies anywhere => all writes require service_role.

-- Tighten user_tags public read (decision #2, minors-safety): an approved tag is anon-visible
-- ONLY if its linked player has a signed waiver and isn't hidden. The prior 'approved=true'
-- policy exposed an athlete's name with NO consent join. Own tags stay visible to their tagger.
-- (user_tags is currently empty, so this is zero behavior change now — a fail-closed default
-- before the naming UI goes live.)
DROP POLICY IF EXISTS "View approved or own tags" ON user_tags;
DROP POLICY IF EXISTS ut_read ON user_tags;
CREATE POLICY ut_read ON user_tags FOR SELECT TO anon, authenticated USING (
  tagged_by_user_id = (SELECT auth.uid())::text
  OR (approved = true AND player_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM player_consent c
                  WHERE c.player_id = user_tags.player_id
                    AND c.status = 'waiver_signed' AND c.fully_hidden = false))
);

COMMIT;