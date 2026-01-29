-- Migration: Fix user_tags Policy and Cleanup Unused Indexes
-- Date: 2025-01-29
--
-- Issues addressed:
-- 1. user_tags INSERT policy uses WITH CHECK (true) - add proper user check
-- 2. Remove 24 unused indexes to improve write performance and reduce storage

-- ============================================================================
-- PART 1: Fix user_tags INSERT Policy
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can create tags" ON public.user_tags;

-- Require users to set their own user ID when creating tags
CREATE POLICY "Authenticated users can create tags" ON public.user_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (tagged_by_user_id = (select auth.uid())::text);


-- ============================================================================
-- PART 2: Cleanup Unused Indexes
-- These indexes have never been used and waste storage/slow down writes
-- ============================================================================

-- timeline_months_mv indexes (2)
DROP INDEX IF EXISTS idx_timeline_months_mv_year_month;
DROP INDEX IF EXISTS idx_timeline_months_mv_month_start;

-- stories indexes (6)
DROP INDEX IF EXISTS idx_stories_type;
DROP INDEX IF EXISTS idx_stories_game;
DROP INDEX IF EXISTS idx_stories_player;
DROP INDEX IF EXISTS idx_stories_status;
DROP INDEX IF EXISTS idx_stories_visibility;
DROP INDEX IF EXISTS idx_stories_created_at;

-- story_photos indexes (2)
DROP INDEX IF EXISTS idx_story_photos_story_id;
DROP INDEX IF EXISTS idx_story_photos_sequence;

-- user_tags indexes (1)
DROP INDEX IF EXISTS idx_user_tags_user;

-- photo_metadata indexes (8)
DROP INDEX IF EXISTS idx_photo_metadata_dramatic_preset;
DROP INDEX IF EXISTS idx_photo_metadata_lighting;
DROP INDEX IF EXISTS idx_photo_metadata_color_temp;
DROP INDEX IF EXISTS idx_photo_metadata_time_of_day;
DROP INDEX IF EXISTS idx_photo_metadata_composition;
DROP INDEX IF EXISTS idx_photo_metadata_play_type;
DROP INDEX IF EXISTS idx_photo_metadata_action_intensity;
DROP INDEX IF EXISTS idx_photo_metadata_category;

-- photo_views indexes (1)
DROP INDEX IF EXISTS idx_photo_views_source;

-- search_queries indexes (1)
DROP INDEX IF EXISTS idx_search_queries_searched_at;

-- albums_summary indexes (2)
DROP INDEX IF EXISTS idx_albums_summary_primary_sport;
DROP INDEX IF EXISTS idx_albums_summary_primary_category;


-- ============================================================================
-- NOTE: Remaining Warnings (Cannot be fixed via SQL)
-- ============================================================================
--
-- 1. extension_in_public (vector) - Intentional, documented
-- 2. materialized_view_in_api (3x) - Intentional for public gallery
-- 3. auth_leaked_password_protection - Dashboard > Auth > Email > Enable
-- 4. auth_insufficient_mfa_options - Dashboard > Auth > MFA > Enable TOTP
-- 5. auth_db_connections_absolute - Dashboard > Database > Connection pooling
--
-- These are either intentional design decisions or require manual configuration.
