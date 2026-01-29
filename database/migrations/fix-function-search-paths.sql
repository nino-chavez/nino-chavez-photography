-- Migration: Fix Function Search Paths and RLS Policies
-- Date: 2025-01-29
--
-- Issues addressed:
-- 1. Function search_path mutable → Add SET search_path = ''
-- 2. RLS policies too permissive → Restrict to service_role
--
-- Note: Materialized views in API are intentional for public gallery read access
-- Note: Vector extension in public is addressed in separate optional migration

-- ============================================================================
-- PART 1: Fix Function Search Paths
-- Add SET search_path = '' to prevent search_path hijacking
-- ============================================================================

-- 1.1 match_photos (vector similarity search)
DROP FUNCTION IF EXISTS match_photos(vector, double precision, integer);
DROP FUNCTION IF EXISTS match_photos(vector, float, integer);
DROP FUNCTION IF EXISTS match_photos(vector);

CREATE OR REPLACE FUNCTION public.match_photos (
  query_embedding public.vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  image_key text,
  sport_type text,
  photo_category text,
  emotion text,
  action_intensity text,
  play_type text,
  composition text,
  lighting text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.image_key::text,
    pm.sport_type::text,
    pm.photo_category::text,
    pm.emotion::text,
    pm.action_intensity::text,
    pm.play_type::text,
    pm.composition::text,
    pm.lighting::text,
    (1 - (pm.embedding <=> query_embedding))::double precision AS similarity
  FROM public.photo_metadata pm
  WHERE pm.embedding IS NOT NULL
    AND 1 - (pm.embedding <=> query_embedding) >= match_threshold
  ORDER BY pm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_photos TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_photos TO anon;


-- 1.2 find_similar_photos (if exists)
DROP FUNCTION IF EXISTS find_similar_photos(text, integer, float);

CREATE OR REPLACE FUNCTION public.find_similar_photos(
  target_image_key text,
  limit_count integer DEFAULT 10,
  min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  image_key text,
  sport_type text,
  photo_category text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_embedding public.vector(768);
BEGIN
  -- Get the embedding for the target photo
  SELECT pm.embedding INTO target_embedding
  FROM public.photo_metadata pm
  WHERE pm.image_key = target_image_key;

  IF target_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pm.image_key::text,
    pm.sport_type::text,
    pm.photo_category::text,
    (1 - (pm.embedding <=> target_embedding))::double precision AS similarity
  FROM public.photo_metadata pm
  WHERE pm.image_key != target_image_key
    AND pm.embedding IS NOT NULL
    AND 1 - (pm.embedding <=> target_embedding) >= min_similarity
  ORDER BY pm.embedding <=> target_embedding
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_similar_photos TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_similar_photos TO anon;


-- 1.3 refresh_timeline_months
CREATE OR REPLACE FUNCTION public.refresh_timeline_months()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.timeline_months_mv;
END;
$$;

-- Only service role should refresh
REVOKE EXECUTE ON FUNCTION public.refresh_timeline_months() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_timeline_months() TO service_role;


-- 1.4 update_curated_hero_updated_at (trigger function)
CREATE OR REPLACE FUNCTION public.update_curated_hero_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- 1.5 normalize_composition (data migration function)
CREATE OR REPLACE FUNCTION public.normalize_composition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.photo_metadata
  SET composition = LOWER(TRIM(composition))
  WHERE composition IS NOT NULL
    AND composition != LOWER(TRIM(composition));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_composition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_composition() TO service_role;


-- 1.6 refresh_albums_summary
CREATE OR REPLACE FUNCTION public.refresh_albums_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.albums_summary;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_albums_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_albums_summary() TO service_role;


-- 1.7 update_updated_at_column (generic trigger function)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- 1.8 refresh_popular_photos
CREATE OR REPLACE FUNCTION public.refresh_popular_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.popular_photos;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_popular_photos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_popular_photos() TO service_role;


-- ============================================================================
-- PART 2: Fix Overly Permissive RLS Policies
-- Change from WITH CHECK (true) to proper service_role check
-- ============================================================================

-- 2.1 photo_views - Fix INSERT policy
DROP POLICY IF EXISTS "Service role can insert photo views" ON public.photo_views;

CREATE POLICY "Service role can insert photo views"
  ON public.photo_views
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Also restrict to service_role explicitly (belt and suspenders)
CREATE POLICY "Anon cannot insert photo views"
  ON public.photo_views
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "Authenticated cannot insert photo views"
  ON public.photo_views
  FOR INSERT
  TO authenticated
  WITH CHECK (false);


-- 2.2 search_queries - Fix INSERT policy
DROP POLICY IF EXISTS "Service role can insert search queries" ON public.search_queries;

CREATE POLICY "Service role can insert search queries"
  ON public.search_queries
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Anon cannot insert search queries"
  ON public.search_queries
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "Authenticated cannot insert search queries"
  ON public.search_queries
  FOR INSERT
  TO authenticated
  WITH CHECK (false);


-- ============================================================================
-- PART 3: Documentation Comments
-- ============================================================================

COMMENT ON FUNCTION public.match_photos IS 'Vector similarity search with secure search_path';
COMMENT ON FUNCTION public.find_similar_photos IS 'Find similar photos by image_key with secure search_path';
COMMENT ON FUNCTION public.refresh_timeline_months IS 'Refresh timeline_months_mv (service_role only)';
COMMENT ON FUNCTION public.refresh_albums_summary IS 'Refresh albums_summary (service_role only)';
COMMENT ON FUNCTION public.refresh_popular_photos IS 'Refresh popular_photos (service_role only)';


-- ============================================================================
-- NOTE: Materialized Views in API
-- ============================================================================
-- The following materialized views are intentionally exposed to anon/authenticated:
-- - timeline_months_mv: Public timeline navigation
-- - albums_summary: Public album listings
-- - popular_photos: Public popular photos display
--
-- This is by design for a public photo gallery. The linter warning is acknowledged.


-- ============================================================================
-- NOTE: Auth Settings (Manual Configuration Required)
-- ============================================================================
-- The following must be configured in Supabase Dashboard > Authentication > Settings:
--
-- 1. Leaked Password Protection:
--    Dashboard > Authentication > Providers > Email > Enable "Leaked password protection"
--
-- 2. Multi-Factor Authentication:
--    Dashboard > Authentication > Multi-Factor Auth > Enable TOTP
--
-- These cannot be configured via SQL migrations.
