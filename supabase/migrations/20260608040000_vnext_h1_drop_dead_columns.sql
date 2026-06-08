-- Migration: v-next H1 — drop dead columns (convergence; no transitional cruft)
-- Date: 2026-06-08
-- Drops fields with zero consumers, per DEPRECATED.md H1. All writers/readers removed first:
--   - ai_confidence: removed from sync insert + the 3 transform mappings + Photo/PhotoMetadataRow types.
--   - ball_position/venue_type/crowd_density/key_moment: their only writer (scripts/run-enhanced-extraction.ts,
--     the deprecated enhanced-agentic path, never wired into the pipeline) was deleted.
-- Safe: nothing reads or writes these after this commit.
ALTER TABLE photo_metadata
  DROP COLUMN IF EXISTS ai_confidence,
  DROP COLUMN IF EXISTS ball_position,
  DROP COLUMN IF EXISTS venue_type,
  DROP COLUMN IF EXISTS crowd_density,
  DROP COLUMN IF EXISTS key_moment;
