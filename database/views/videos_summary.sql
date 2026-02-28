-- Materialized view for video album summaries
-- Aggregates video_metadata by album_key for fast album-level queries.
-- Refresh after bulk video uploads: SELECT refresh_videos_summary();

CREATE MATERIALIZED VIEW IF NOT EXISTS videos_summary AS
SELECT
  v.album_key,
  MAX(v.album_name) as album_name,
  COUNT(*) as video_count,
  (ARRAY_AGG(v.cf_stream_thumbnail ORDER BY v.upload_date DESC))[1] as cover_thumbnail_url,
  SUM(v.duration_seconds) as total_duration_seconds,
  MIN(v.video_date) as earliest_video_date,
  MAX(v.video_date) as latest_video_date,
  MAX(v.upload_date) as last_upload_date
FROM video_metadata v
WHERE v.album_key IS NOT NULL
GROUP BY v.album_key;

CREATE INDEX idx_videos_summary_album_key ON videos_summary(album_key);

GRANT SELECT ON videos_summary TO anon, authenticated;

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_videos_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW videos_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_videos_summary() TO anon, authenticated;
