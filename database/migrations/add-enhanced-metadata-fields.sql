-- Migration: Add Enhanced Metadata Fields
-- Date: 2026-02-06
-- Description: Adds new columns for deep visual analysis metadata extracted via agentic vision
--
-- New fields:
--   - players (JSONB): Array of detected players with jersey numbers and team assignment
--   - team_colors (JSONB): Home and away team color identification
--   - ball_position (VARCHAR): Where the ball is in the frame
--   - venue_type (VARCHAR): Type of venue (indoor_gym, outdoor_grass, etc.)
--   - crowd_density (VARCHAR): Crowd level assessment
--   - player_count (INT): Total visible players in frame
--   - key_moment (TEXT): Natural language description of captured moment
--   - portfolio_worthy (BOOLEAN): Auto-calculated from quality scores

-- =============================================================================
-- Add New Columns
-- =============================================================================

-- Players array (JSONB for flexible structure)
-- Example: [{"jersey_number": 14, "team": "home", "current_action": "blocking"}, ...]
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS players JSONB DEFAULT '[]'::jsonb;

-- Team colors identification
-- Example: {"home_colors": ["navy", "white"], "away_colors": ["red", "black"], "home_name": "Spartans"}
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS team_colors JSONB DEFAULT NULL;

-- Ball position in frame
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS ball_position VARCHAR(50) DEFAULT NULL;

-- Venue type
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS venue_type VARCHAR(50) DEFAULT NULL;

-- Crowd density
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS crowd_density VARCHAR(20) DEFAULT NULL;

-- Player count (total visible in frame)
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS player_count INT DEFAULT NULL;

-- Key moment description
ALTER TABLE photo_metadata
ADD COLUMN IF NOT EXISTS key_moment TEXT DEFAULT NULL;

-- =============================================================================
-- Add Constraints for Enum-like Fields
-- =============================================================================

-- Ball position constraint
ALTER TABLE photo_metadata
DROP CONSTRAINT IF EXISTS valid_ball_position;

ALTER TABLE photo_metadata
ADD CONSTRAINT valid_ball_position
CHECK (ball_position IS NULL OR ball_position IN (
  'in_hands', 'above_net', 'in_flight', 'on_ground', 'out_of_frame'
));

-- Venue type constraint
ALTER TABLE photo_metadata
DROP CONSTRAINT IF EXISTS valid_venue_type;

ALTER TABLE photo_metadata
ADD CONSTRAINT valid_venue_type
CHECK (venue_type IS NULL OR venue_type IN (
  'indoor_gym', 'outdoor_grass', 'beach', 'stadium', 'outdoor_court'
));

-- Crowd density constraint
ALTER TABLE photo_metadata
DROP CONSTRAINT IF EXISTS valid_crowd_density;

ALTER TABLE photo_metadata
ADD CONSTRAINT valid_crowd_density
CHECK (crowd_density IS NULL OR crowd_density IN (
  'empty', 'sparse', 'moderate', 'packed'
));

-- =============================================================================
-- Create Indexes for New Filterable Fields
-- =============================================================================

-- Index on ball_position for "ball in frame" queries
CREATE INDEX IF NOT EXISTS idx_photo_metadata_ball_position
ON photo_metadata(ball_position)
WHERE ball_position IS NOT NULL;

-- Index on venue_type for venue filtering
CREATE INDEX IF NOT EXISTS idx_photo_metadata_venue_type
ON photo_metadata(venue_type)
WHERE venue_type IS NOT NULL;

-- Index on crowd_density for atmosphere filtering
CREATE INDEX IF NOT EXISTS idx_photo_metadata_crowd_density
ON photo_metadata(crowd_density)
WHERE crowd_density IS NOT NULL;

-- Index on player_count for "solo vs team" queries
CREATE INDEX IF NOT EXISTS idx_photo_metadata_player_count
ON photo_metadata(player_count)
WHERE player_count IS NOT NULL;

-- GIN index on players JSONB for jersey number searches
-- Enables queries like: SELECT * FROM photo_metadata WHERE players @> '[{"jersey_number": 14}]'
CREATE INDEX IF NOT EXISTS idx_photo_metadata_players_gin
ON photo_metadata USING GIN (players jsonb_path_ops)
WHERE players IS NOT NULL AND players != '[]'::jsonb;

-- GIN index on team_colors for team color searches
CREATE INDEX IF NOT EXISTS idx_photo_metadata_team_colors_gin
ON photo_metadata USING GIN (team_colors jsonb_path_ops)
WHERE team_colors IS NOT NULL;

-- =============================================================================
-- Create Helper Function for Player Jersey Search
-- =============================================================================

-- Function to find photos containing a specific jersey number
CREATE OR REPLACE FUNCTION find_photos_by_jersey(
  p_jersey_number INT,
  p_team VARCHAR DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  photo_id TEXT,
  image_key TEXT,
  album_name TEXT,
  sport_type TEXT,
  play_type TEXT,
  players JSONB,
  "ThumbnailUrl" TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.photo_id::TEXT,
    pm.image_key::TEXT,
    pm.album_name::TEXT,
    pm.sport_type::TEXT,
    pm.play_type::TEXT,
    pm.players,
    pm."ThumbnailUrl"::TEXT
  FROM photo_metadata pm
  WHERE pm.players @> jsonb_build_array(
    CASE
      WHEN p_team IS NOT NULL THEN
        jsonb_build_object('jersey_number', p_jersey_number, 'team', p_team)
      ELSE
        jsonb_build_object('jersey_number', p_jersey_number)
    END
  )
  ORDER BY pm.sharpness DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_photos_by_jersey(INT, VARCHAR, INT) TO anon;
GRANT EXECUTE ON FUNCTION find_photos_by_jersey(INT, VARCHAR, INT) TO authenticated;

-- =============================================================================
-- Comments for Documentation
-- =============================================================================

COMMENT ON COLUMN photo_metadata.players IS 'Array of detected players: [{jersey_number, team, current_action, position_in_frame}]';
COMMENT ON COLUMN photo_metadata.team_colors IS 'Team identification: {home_colors, away_colors, home_name, away_name}';
COMMENT ON COLUMN photo_metadata.ball_position IS 'Ball location: in_hands, above_net, in_flight, on_ground, out_of_frame';
COMMENT ON COLUMN photo_metadata.venue_type IS 'Venue type: indoor_gym, outdoor_grass, beach, stadium, outdoor_court';
COMMENT ON COLUMN photo_metadata.crowd_density IS 'Crowd level: empty, sparse, moderate, packed';
COMMENT ON COLUMN photo_metadata.player_count IS 'Total number of visible players in frame';
COMMENT ON COLUMN photo_metadata.key_moment IS 'Natural language description of the captured moment';

-- =============================================================================
-- Verification Query
-- =============================================================================

-- Run this to verify the migration:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'photo_metadata'
-- AND column_name IN ('players', 'team_colors', 'ball_position', 'venue_type', 'crowd_density', 'player_count', 'key_moment');
