-- Migration: Fix Supabase Security Linter Issues
-- Date: 2025-01-29
--
-- Issues addressed:
-- 1. SECURITY DEFINER views → Change to SECURITY INVOKER
-- 2. RLS disabled on public tables → Enable RLS with appropriate policies
--
-- For this public photo gallery:
-- - All data is publicly readable (no authentication required)
-- - Write operations are restricted to service role only

-- ============================================================================
-- PART 1: Fix SECURITY DEFINER Views
-- Recreate views with explicit SECURITY INVOKER
-- ============================================================================

-- 1.1 timeline_months view
DROP VIEW IF EXISTS timeline_months CASCADE;

CREATE VIEW timeline_months
WITH (security_invoker = true)
AS
WITH monthly_base AS (
  SELECT
    DATE_TRUNC('month', upload_date) AS month_start,
    EXTRACT(YEAR FROM upload_date)::INTEGER AS year,
    EXTRACT(MONTH FROM upload_date)::INTEGER AS month,
    photo_id,
    sport_type,
    photo_category,
    sharpness,
    composition_score,
    emotional_impact
  FROM photo_metadata
  WHERE upload_date IS NOT NULL
)
SELECT
  month_start,
  year,
  month,
  COUNT(*) AS photo_count,
  MIN(month_start) AS first_photo_date,
  MAX(month_start) AS last_photo_date,
  ROUND(AVG(sharpness)::NUMERIC, 2) AS avg_sharpness,
  ROUND(AVG(composition_score)::NUMERIC, 2) AS avg_composition,
  ROUND(AVG(emotional_impact)::NUMERIC, 2) AS avg_impact,
  COUNT(*) FILTER (WHERE sharpness >= 8.0) AS high_quality_count
FROM monthly_base
GROUP BY month_start, year, month;

COMMENT ON VIEW timeline_months IS 'Timeline aggregation by month with SECURITY INVOKER';

-- 1.2 timeline_month_sports view
DROP VIEW IF EXISTS timeline_month_sports CASCADE;

CREATE VIEW timeline_month_sports
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('month', upload_date) AS month_start,
  EXTRACT(YEAR FROM DATE_TRUNC('month', upload_date))::INTEGER AS year,
  EXTRACT(MONTH FROM DATE_TRUNC('month', upload_date))::INTEGER AS month,
  COALESCE(sport_type, 'unknown') AS sport_type,
  COUNT(*) AS photo_count
FROM photo_metadata
WHERE upload_date IS NOT NULL
GROUP BY DATE_TRUNC('month', upload_date), sport_type;

COMMENT ON VIEW timeline_month_sports IS 'Sport distribution per month with SECURITY INVOKER';

-- 1.3 timeline_month_categories view
DROP VIEW IF EXISTS timeline_month_categories CASCADE;

CREATE VIEW timeline_month_categories
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('month', upload_date) AS month_start,
  EXTRACT(YEAR FROM DATE_TRUNC('month', upload_date))::INTEGER AS year,
  EXTRACT(MONTH FROM DATE_TRUNC('month', upload_date))::INTEGER AS month,
  COALESCE(photo_category, 'unknown') AS photo_category,
  COUNT(*) AS photo_count
FROM photo_metadata
WHERE upload_date IS NOT NULL
GROUP BY DATE_TRUNC('month', upload_date), photo_category;

COMMENT ON VIEW timeline_month_categories IS 'Category distribution per month with SECURITY INVOKER';


-- ============================================================================
-- PART 2: Enable RLS on Tables
-- ============================================================================

-- 2.1 photo_metadata (main table - ~20K photos)
ALTER TABLE photo_metadata ENABLE ROW LEVEL SECURITY;

-- Allow public read access (this is a public gallery)
DROP POLICY IF EXISTS "Public read access" ON photo_metadata;
CREATE POLICY "Public read access" ON photo_metadata
  FOR SELECT
  USING (true);

-- Restrict write operations to service role
DROP POLICY IF EXISTS "Service role full access" ON photo_metadata;
CREATE POLICY "Service role full access" ON photo_metadata
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE photo_metadata IS 'Photo metadata with RLS: public read, service role write';


-- 2.2 curated_hero_images
ALTER TABLE curated_hero_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON curated_hero_images;
CREATE POLICY "Public read access" ON curated_hero_images
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role full access" ON curated_hero_images;
CREATE POLICY "Service role full access" ON curated_hero_images
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE curated_hero_images IS 'Curated hero images with RLS: public read, service role write';


-- 2.3 stories
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON stories;
CREATE POLICY "Public read access" ON stories
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role full access" ON stories;
CREATE POLICY "Service role full access" ON stories
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE stories IS 'AI-generated stories with RLS: public read, service role write';


-- 2.4 story_photos
ALTER TABLE story_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON story_photos;
CREATE POLICY "Public read access" ON story_photos
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role full access" ON story_photos;
CREATE POLICY "Service role full access" ON story_photos
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE story_photos IS 'Story-photo relationships with RLS: public read, service role write';


-- 2.5 sport_type_audit (internal audit table)
ALTER TABLE sport_type_audit ENABLE ROW LEVEL SECURITY;

-- Audit table should NOT be publicly readable - service role only
DROP POLICY IF EXISTS "Service role only" ON sport_type_audit;
CREATE POLICY "Service role only" ON sport_type_audit
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE sport_type_audit IS 'Internal audit table with RLS: service role only';


-- ============================================================================
-- PART 3: Grant appropriate permissions
-- ============================================================================

-- Ensure anon role can read public tables
GRANT SELECT ON photo_metadata TO anon;
GRANT SELECT ON curated_hero_images TO anon;
GRANT SELECT ON stories TO anon;
GRANT SELECT ON story_photos TO anon;

-- Ensure anon can read views
GRANT SELECT ON timeline_months TO anon;
GRANT SELECT ON timeline_month_sports TO anon;
GRANT SELECT ON timeline_month_categories TO anon;

-- Authenticated users get same read access
GRANT SELECT ON photo_metadata TO authenticated;
GRANT SELECT ON curated_hero_images TO authenticated;
GRANT SELECT ON stories TO authenticated;
GRANT SELECT ON story_photos TO authenticated;
GRANT SELECT ON timeline_months TO authenticated;
GRANT SELECT ON timeline_month_sports TO authenticated;
GRANT SELECT ON timeline_month_categories TO authenticated;


-- ============================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================================

-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check view security settings:
-- SELECT viewname, pg_get_viewdef(c.oid)
-- FROM pg_views v
-- JOIN pg_class c ON c.relname = v.viewname
-- WHERE schemaname = 'public';

-- Check policies:
-- SELECT tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies WHERE schemaname = 'public';
