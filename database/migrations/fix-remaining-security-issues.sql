-- Migration: Fix Remaining Security Issues
-- Date: 2025-01-29
--
-- Addresses:
-- 1. normalize_composition(TEXT) function missing search_path
-- 2. Documentation for intentionally public materialized views
-- 3. Note about auth settings requiring dashboard configuration

-- ============================================================================
-- PART 1: Fix normalize_composition(TEXT) Function
-- This is a utility function for data migration - can be dropped if not needed
-- ============================================================================

-- Option A: Drop if no longer needed (recommended - it was a one-time migration helper)
DROP FUNCTION IF EXISTS public.normalize_composition(TEXT);

-- Option B: If keeping the function, recreate with secure search_path
-- Uncomment below and comment out the DROP above if you need this function

/*
CREATE OR REPLACE FUNCTION public.normalize_composition(raw_composition TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  normalized TEXT;
  primary_value TEXT;
BEGIN
  -- Handle NULL or empty
  IF raw_composition IS NULL OR raw_composition = '' THEN
    RETURN NULL;
  END IF;

  -- Extract primary value from multi-value strings (take first value before |)
  primary_value := SPLIT_PART(raw_composition, '|', 1);

  -- Replace hyphens with underscores
  normalized := REPLACE(primary_value, '-', '_');

  -- Map common variations to canonical values
  normalized := CASE
    -- Rule of thirds variants
    WHEN normalized LIKE '%rule%third%' THEN 'rule_of_thirds'

    -- Leading lines variants
    WHEN normalized LIKE '%leading%line%' THEN 'leading_lines'

    -- Centered variants
    WHEN normalized IN ('centered', 'center_focus', 'center_weighted',
                        'centered_subject', 'central_focus', 'central_framing',
                        'centralized') THEN 'centered'

    -- Symmetry variants
    WHEN normalized = 'symmetry' THEN 'symmetry'

    -- Frame within frame variants
    WHEN normalized LIKE '%frame%frame%' OR
         normalized LIKE '%framing%' OR
         normalized = 'natural_framing' THEN 'frame_within_frame'

    -- Non-composition types mapped to defaults
    WHEN normalized = 'close_up' THEN 'centered'
    WHEN normalized = 'dramatic_angle' THEN 'rule_of_thirds'
    WHEN normalized = 'motion_blur' THEN 'leading_lines'
    WHEN normalized = 'wide_angle' THEN 'rule_of_thirds'
    WHEN normalized LIKE '%shallow%' OR normalized LIKE '%depth%field%' THEN 'centered'

    -- Unknown values
    ELSE NULL
  END;

  -- Validate against canonical values
  IF normalized NOT IN ('rule_of_thirds', 'leading_lines', 'centered', 'symmetry', 'frame_within_frame') THEN
    RETURN NULL;
  END IF;

  RETURN normalized;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_composition(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_composition(TEXT) TO service_role;
*/


-- ============================================================================
-- PART 2: Document Intentionally Public Materialized Views
-- These warnings are acknowledged - public gallery requires public data access
-- ============================================================================

COMMENT ON MATERIALIZED VIEW public.timeline_months_mv IS
  'Timeline navigation data - intentionally public for gallery display. Linter warning acknowledged.';

COMMENT ON MATERIALIZED VIEW public.albums_summary IS
  'Album listing data - intentionally public for gallery display. Linter warning acknowledged.';

COMMENT ON MATERIALIZED VIEW public.popular_photos IS
  'Popular photos data - intentionally public for gallery display. Linter warning acknowledged.';


-- ============================================================================
-- PART 3: Vector Extension Note
-- ============================================================================
-- The vector extension is intentionally kept in the public schema.
-- Moving it requires downtime and is optional for this public gallery.
-- See: database/migrations/move-vector-extension-optional.sql

COMMENT ON EXTENSION vector IS
  'pgvector extension for similarity search - kept in public schema for simplicity (linter warning acknowledged)';


-- ============================================================================
-- PART 4: Auth Settings (Manual Configuration Required)
-- ============================================================================
-- The following CANNOT be configured via SQL and require Supabase Dashboard:
--
-- 1. Leaked Password Protection:
--    Dashboard > Authentication > Providers > Email > Enable "Leaked password protection"
--    https://supabase.com/docs/guides/auth/password-security
--
-- 2. Multi-Factor Authentication:
--    Dashboard > Authentication > Multi-Factor Auth > Enable TOTP
--    https://supabase.com/docs/guides/auth/auth-mfa
--
-- NOTE: These warnings will persist until manually configured in the dashboard.
-- For a public photo gallery without user accounts, these are low priority.
