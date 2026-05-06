-- Migration: Fix Security Linter Warnings (March 2025)
--
-- Issues addressed:
-- 1. refresh_videos_summary() - mutable search_path
-- 2. lp_increment_fire(bigint) - mutable search_path
-- 3. lp_decrement_fire(bigint) - mutable search_path
-- 4. lp_increment_quiz_tally(text) - mutable search_path
-- 5. album_settings - overly permissive RLS policies (INSERT/UPDATE/DELETE with true)
-- 6. videos_summary materialized view - document as intentionally public
--
-- NOT addressed (manual/intentional):
-- - vector extension in public schema (acknowledged, moving requires downtime)
-- - Materialized views in API (intentionally public for gallery)
-- - Leaked password protection (Dashboard > Authentication > Providers > Email)

-- ============================================================================
-- PART 1: Fix refresh_videos_summary() search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_videos_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.videos_summary;
END;
$$;

-- Restrict to service_role only (was previously granted to anon/authenticated)
REVOKE EXECUTE ON FUNCTION public.refresh_videos_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_videos_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_videos_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_videos_summary() TO service_role;


-- ============================================================================
-- PART 2: Fix lp_* function search_paths
-- These belong to a separate project but share the same Supabase instance.
-- Recreated from actual schema dump with search_path added.
-- ============================================================================

-- 2.1 lp_increment_fire(p_take_id bigint) - LANGUAGE sql
CREATE OR REPLACE FUNCTION public.lp_increment_fire(p_take_id bigint)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.lp_hot_takes SET fire_count = fire_count + 1 WHERE id = p_take_id;
$$;

-- 2.2 lp_decrement_fire(p_take_id bigint) - LANGUAGE sql
CREATE OR REPLACE FUNCTION public.lp_decrement_fire(p_take_id bigint)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.lp_hot_takes SET fire_count = GREATEST(fire_count - 1, 0) WHERE id = p_take_id;
$$;

-- 2.3 lp_increment_quiz_tally(p_personality text) - LANGUAGE sql
CREATE OR REPLACE FUNCTION public.lp_increment_quiz_tally(p_personality text)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.lp_quiz_tallies SET count = count + 1 WHERE personality = p_personality;
$$;


-- ============================================================================
-- PART 3: Fix album_settings overly permissive RLS policies
-- Intent: public SELECT, writes restricted to service_role
-- ============================================================================

-- Drop the overly permissive authenticated policies
DROP POLICY IF EXISTS "Allow authenticated delete" ON public.album_settings;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.album_settings;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.album_settings;

-- Add service_role-only write policies
CREATE POLICY "Service role can insert album_settings"
  ON public.album_settings
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update album_settings"
  ON public.album_settings
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete album_settings"
  ON public.album_settings
  FOR DELETE
  TO service_role
  USING (true);


-- ============================================================================
-- PART 4: Document videos_summary as intentionally public
-- ============================================================================

COMMENT ON MATERIALIZED VIEW public.videos_summary IS
  'Video album summary data - intentionally public for gallery display. Linter warning acknowledged.';


-- ============================================================================
-- MANUAL STEPS REQUIRED (cannot be done via SQL):
-- ============================================================================
-- 1. Leaked Password Protection:
--    Dashboard > Authentication > Providers > Email > Enable "Leaked password protection"
--    https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
--
-- 2. Vector extension in public schema:
--    Acknowledged and documented. Moving to a dedicated schema requires downtime.
--    See: database/migrations/fix-remaining-security-issues.sql for details.
