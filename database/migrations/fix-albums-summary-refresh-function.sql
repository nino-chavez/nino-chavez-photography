/**
 * Fix albums_summary refresh function
 *
 * Changes CONCURRENTLY to non-concurrent refresh since the view
 * doesn't have a unique index (required for concurrent refresh)
 */

-- Drop the old function
DROP FUNCTION IF EXISTS refresh_albums_summary();

-- Recreate without CONCURRENTLY
CREATE OR REPLACE FUNCTION refresh_albums_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Non-concurrent refresh (requires exclusive lock but works without unique index)
  REFRESH MATERIALIZED VIEW albums_summary;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION refresh_albums_summary() TO anon;
GRANT EXECUTE ON FUNCTION refresh_albums_summary() TO authenticated;

-- Now refresh the view to include latest albums
REFRESH MATERIALIZED VIEW albums_summary;
