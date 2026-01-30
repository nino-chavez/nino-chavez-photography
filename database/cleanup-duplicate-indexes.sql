/**
 * Index Cleanup Script
 *
 * Run this AFTER verifying which indexes are duplicates.
 * First, run the SELECT query to see all indexes, then decide which to drop.
 *
 * With 53 indexes on a 20K row table, you likely have duplicates from:
 * - Running multiple index scripts
 * - Old indexes that were replaced
 * - Overlapping composite indexes
 */

-- ============================================
-- STEP 1: Analyze Current Indexes
-- ============================================

-- List all indexes with their definitions
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    idx_scan as times_used,
    indexdef
FROM pg_indexes i
LEFT JOIN pg_stat_user_indexes s
    ON i.indexname = s.indexrelname
    AND i.tablename = s.relname
WHERE i.tablename = 'photo_metadata'
ORDER BY indexname;

-- ============================================
-- STEP 2: Find Unused Indexes (run after 1+ day of usage)
-- ============================================

-- Indexes with 0 scans might be unused (or just newly created)
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    idx_scan as times_used
FROM pg_stat_user_indexes
WHERE relname = 'photo_metadata'
  AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================
-- STEP 3: Find Duplicate/Overlapping Indexes
-- ============================================

-- Look for indexes that start with the same columns
-- (the more specific one is usually redundant)
SELECT
    a.indexname as index1,
    b.indexname as index2,
    a.indexdef as def1,
    b.indexdef as def2
FROM pg_indexes a
JOIN pg_indexes b ON a.tablename = b.tablename
    AND a.indexname < b.indexname
WHERE a.tablename = 'photo_metadata'
  AND (
    -- Same leading column suggests overlap
    a.indexdef LIKE '%(' || split_part(split_part(b.indexdef, '(', 2), ',', 1) || '%'
    OR b.indexdef LIKE '%(' || split_part(split_part(a.indexdef, '(', 2), ',', 1) || '%'
  );

-- ============================================
-- STEP 4: Essential Indexes to KEEP
-- ============================================

/*
These indexes are critical for performance - DO NOT DROP:

1. idx_photo_metadata_emotional_impact  -- Quality sort
2. idx_photo_metadata_upload_date       -- Newest/oldest sort
3. idx_photo_metadata_sport_type        -- Sport filter
4. idx_photo_metadata_category          -- Category filter
5. idx_photo_metadata_sport_category    -- Combined filter
6. idx_photo_metadata_sport_quality     -- Sport + quality sort
7. idx_photo_metadata_category_quality  -- Category + quality sort
8. idx_photo_metadata_explore_covering  -- Main explore query
9. idx_photo_metadata_sport_agg         -- Sport distribution
10. idx_photo_metadata_category_agg     -- Category distribution
11. photo_metadata_pkey                 -- Primary key (never drop)

Any other indexes may be redundant.
*/

-- ============================================
-- STEP 5: Recommended Indexes to DROP (if they exist)
-- ============================================

-- CAUTION: Review before running! These are common duplicates:

-- Old quality_score based indexes (wrong field name)
-- DROP INDEX IF EXISTS idx_photo_metadata_quality_score;
-- DROP INDEX IF EXISTS idx_photo_metadata_sport_quality_score;

-- Simple single-column indexes that are covered by composite indexes
-- (Only drop if the composite index is being used instead)
-- DROP INDEX IF EXISTS idx_photo_metadata_action_intensity;
-- DROP INDEX IF EXISTS idx_photo_metadata_play_type;

-- Run ANALYZE after dropping indexes
-- ANALYZE photo_metadata;

-- ============================================
-- STEP 6: Check Total Index Size
-- ============================================

-- Target: Index size should be ~20-50MB for 20K photos
-- Current: 97MB is high, indicating possible duplicates
SELECT
    'Total Index Size' as metric,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as size,
    COUNT(*) as index_count
FROM pg_stat_user_indexes
WHERE relname = 'photo_metadata';

-- Ideal state: ~15-20 indexes, ~30-50MB total
