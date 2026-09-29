-- A fingerprint can cross the heuristic threshold on several UTC days.
-- Keep one row per fingerprint so joining classifications never multiplies events.
BEGIN;
CREATE OR REPLACE VIEW analytics_private.suspected_automation_sessions
WITH (security_invoker = true) AS
SELECT DISTINCT e.session_hash
FROM public.engagement_events e
WHERE e.event_type = 'view'
  AND e.photo_id IS NOT NULL
  AND e.session_hash IS NOT NULL
  AND e.traffic_context = 'audience'
GROUP BY e.session_hash, e.event_day
HAVING count(*) > 500;

REFRESH MATERIALIZED VIEW public.photo_popularity;
REFRESH MATERIALIZED VIEW public.album_popularity;
REFRESH MATERIALIZED VIEW public.album_top_photo;
COMMIT;
-- Re-run analytics_private.reconcile_due_days(now()) after applying to replace
-- retained daily totals. Verify raw and effective row counts match before release.
