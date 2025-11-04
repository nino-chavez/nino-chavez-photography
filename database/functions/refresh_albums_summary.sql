/**
 * Function: refresh_albums_summary
 *
 * Refreshes the albums_summary materialized view
 * Callable via Supabase RPC or directly in SQL
 */

CREATE OR REPLACE FUNCTION refresh_albums_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use non-concurrent refresh (requires exclusive lock but is more reliable)
  -- CONCURRENTLY would require a unique index on the view
  REFRESH MATERIALIZED VIEW albums_summary;
END;
$$;

-- Grant execute permission to authenticated users (or adjust as needed)
GRANT EXECUTE ON FUNCTION refresh_albums_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_albums_summary() TO anon;
