-- Migration: Popularity engine — cadence + retention tuning
--
-- Per the "batch + pruning" decision: keep the matview+cron model (right for a
-- gallery; real-time would be over-engineering at this volume) but make it
-- bounded and fresher.
--   1. Refresh cadence 30 -> 10 min (10-min staleness is invisible on a rail).
--   2. 90-day retention prune so the full CONCURRENTLY refresh stays cheap forever
--      (events past ~13 trending half-lives contribute ~exp(-90/7) ≈ 0.0000026).
--   3. Document that all_time_score is therefore a rolling retained-window total,
--      not literal lifetime — which is the desired behavior (no stale early photos
--      dominating permanently).

BEGIN;

-- 1. Tighter refresh cadence (cron.schedule upserts by job name).
SELECT cron.schedule('refresh-popularity', '*/10 * * * *', $$SELECT public.refresh_popularity();$$);

-- 2. Retention prune — daily at 03:17 UTC.
CREATE OR REPLACE FUNCTION public.prune_engagement_events()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.engagement_events WHERE created_at < now() - interval '90 days';
$$;
REVOKE EXECUTE ON FUNCTION public.prune_engagement_events() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prune_engagement_events() TO service_role;
SELECT cron.schedule('prune-engagement-events', '17 3 * * *', $$SELECT public.prune_engagement_events();$$);

-- 3. Honest semantics for the secondary score.
COMMENT ON COLUMN public.photo_popularity.all_time_score IS
  'Weighted sum over RETAINED events (<=90d retention) — a rolling recent total, not literal lifetime. Intentional: avoids stale early photos dominating forever.';
COMMENT ON COLUMN public.album_popularity.all_time_score IS
  'Weighted sum over retained events (<=90d); see photo_popularity.all_time_score.';

COMMIT;
