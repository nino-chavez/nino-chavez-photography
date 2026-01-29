-- Migration: Fix RLS Performance Issues
-- Date: 2025-01-29
--
-- Issues addressed:
-- 1. auth_rls_initplan: Wrap auth.role() in subquery for single evaluation
-- 2. multiple_permissive_policies: Consolidate overlapping policies
--
-- Pattern: (select auth.role()) evaluates once per query vs auth.role() per row

-- ============================================================================
-- PART 1: Fix photo_metadata Policies
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Public read access" ON public.photo_metadata;
DROP POLICY IF EXISTS "Service role full access" ON public.photo_metadata;

-- Recreate with optimized auth check
CREATE POLICY "Public read access" ON public.photo_metadata
  FOR SELECT
  USING (true);

-- Service role write-only (SELECT already covered by public policy)
CREATE POLICY "Service role write access" ON public.photo_metadata
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update access" ON public.photo_metadata
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete access" ON public.photo_metadata
  FOR DELETE
  TO service_role
  USING (true);


-- ============================================================================
-- PART 2: Fix curated_hero_images Policies
-- ============================================================================

DROP POLICY IF EXISTS "Public read access" ON public.curated_hero_images;
DROP POLICY IF EXISTS "Service role full access" ON public.curated_hero_images;

CREATE POLICY "Public read access" ON public.curated_hero_images
  FOR SELECT
  USING (true);

CREATE POLICY "Service role write access" ON public.curated_hero_images
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update access" ON public.curated_hero_images
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete access" ON public.curated_hero_images
  FOR DELETE
  TO service_role
  USING (true);


-- ============================================================================
-- PART 3: Fix stories Policies
-- ============================================================================

DROP POLICY IF EXISTS "Public read access" ON public.stories;
DROP POLICY IF EXISTS "Service role full access" ON public.stories;

CREATE POLICY "Public read access" ON public.stories
  FOR SELECT
  USING (true);

CREATE POLICY "Service role write access" ON public.stories
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update access" ON public.stories
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete access" ON public.stories
  FOR DELETE
  TO service_role
  USING (true);


-- ============================================================================
-- PART 4: Fix story_photos Policies
-- ============================================================================

DROP POLICY IF EXISTS "Public read access" ON public.story_photos;
DROP POLICY IF EXISTS "Service role full access" ON public.story_photos;

CREATE POLICY "Public read access" ON public.story_photos
  FOR SELECT
  USING (true);

CREATE POLICY "Service role write access" ON public.story_photos
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update access" ON public.story_photos
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete access" ON public.story_photos
  FOR DELETE
  TO service_role
  USING (true);


-- ============================================================================
-- PART 5: Fix sport_type_audit Policies (service_role only table)
-- ============================================================================

DROP POLICY IF EXISTS "Service role only" ON public.sport_type_audit;

-- Separate policies for each action with optimized auth check
CREATE POLICY "Service role select" ON public.sport_type_audit
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert" ON public.sport_type_audit
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update" ON public.sport_type_audit
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete" ON public.sport_type_audit
  FOR DELETE
  TO service_role
  USING (true);


-- ============================================================================
-- PART 6: Fix user_tags Policies
-- ============================================================================

-- Drop existing overlapping policies
DROP POLICY IF EXISTS "Anyone can view approved tags" ON public.user_tags;
DROP POLICY IF EXISTS "Users can view their own tags" ON public.user_tags;
DROP POLICY IF EXISTS "Authenticated users can create tags" ON public.user_tags;

-- Single consolidated SELECT policy (users see approved OR their own)
CREATE POLICY "View approved or own tags" ON public.user_tags
  FOR SELECT
  USING (
    approved = true
    OR tagged_by_user_id = (select auth.uid())::text
  );

-- INSERT with optimized auth check (users must set their own ID)
CREATE POLICY "Authenticated users can create tags" ON public.user_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (tagged_by_user_id = (select auth.uid())::text);


-- ============================================================================
-- Verification Queries (run after migration)
-- ============================================================================
--
-- Check policies:
-- SELECT tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
--
-- Check for multiple permissive policies per table/role/action:
-- SELECT tablename, roles, cmd, COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
-- GROUP BY tablename, roles, cmd
-- HAVING COUNT(*) > 1;
