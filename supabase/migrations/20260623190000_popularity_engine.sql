-- Migration: Popularity engine (Phase 1 — data foundation)
--
-- North-star popularity for photos AND albums:
--   - ONE owned event table (engagement_events) — supersedes the dashboard-drift
--     photo_views as the source of truth for ranking. Multi-signal: view / favorite
--     / download / share.
--   - Tunable weights live in a lookup table (engagement_weights) joined at scoring
--     time, so re-weighting reweights ALL history (single knob, full control).
--   - Time-decayed "trending" score (7-day gravity) + an all-time score.
--   - photo_popularity + album_popularity matviews (albums size-normalized → both
--     "most active" and "best per-photo"), refreshed every 30 min via pg_cron
--     (CONCURRENTLY) — closes the no-refresher gap that left popular_photos empty.
--   - Backfills recent photo_views so trending isn't empty on day one.
--
-- Writes are service-role only (RLS denies anon/authenticated INSERT). The two
-- popularity matviews are intentionally anon-SELECTable — they power public
-- discovery surfaces (Phase 3). All public photo metadata; no PII.

BEGIN;

-- 1. Unified event table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  photo_id     text,                         -- null for album-level events
  album_key    text,
  event_type   text NOT NULL CHECK (event_type IN ('view','favorite','download','share')),
  session_hash text,                         -- hashed session (IP+UA+day); no PII
  source       text,                         -- view_source / context
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Plain date column for the dedup index (timestamptz::date isn't IMMUTABLE so
  -- it can't be indexed directly; a default is evaluated at insert, which is fine).
  event_day    date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date
);

CREATE INDEX IF NOT EXISTS engagement_events_created_idx        ON public.engagement_events (created_at);
CREATE INDEX IF NOT EXISTS engagement_events_photo_created_idx  ON public.engagement_events (photo_id, created_at);
CREATE INDEX IF NOT EXISTS engagement_events_album_created_idx  ON public.engagement_events (album_key, created_at);
-- Dedup: at most one event per session+photo+type+day (nulls distinct → backfill unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS engagement_events_dedup_idx
  ON public.engagement_events (session_hash, photo_id, event_type, event_day);

ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies → only service_role (which bypasses RLS) can write.

-- 2. Tunable weights -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_weights (
  event_type text PRIMARY KEY,
  weight     numeric NOT NULL
);
INSERT INTO public.engagement_weights (event_type, weight) VALUES
  ('view', 1), ('favorite', 4), ('download', 6), ('share', 8)
ON CONFLICT (event_type) DO UPDATE SET weight = EXCLUDED.weight;

-- 3. Backfill recent views (gives trending a seed; new events flow in via Phase 2)
INSERT INTO public.engagement_events (photo_id, album_key, event_type, source, created_at, event_day)
SELECT pv.photo_id, pm.album_key, 'view', pv.view_source, pv.viewed_at,
       (pv.viewed_at AT TIME ZONE 'UTC')::date
FROM public.photo_views pv
LEFT JOIN public.photo_metadata pm ON pm.photo_id = pv.photo_id
WHERE pv.viewed_at >= now() - interval '90 days';

-- 4. Photo popularity ----------------------------------------------------------
-- trending_score = Σ weight·exp(-age/τ), τ = 7 days (604800s). all_time_score = Σ weight.
CREATE MATERIALIZED VIEW public.photo_popularity AS
SELECT
  e.photo_id,
  sum(w.weight * exp(-extract(epoch FROM (now() - e.created_at)) / 604800.0)) AS trending_score,
  sum(w.weight) AS all_time_score,
  count(*) FILTER (WHERE e.event_type = 'view')     AS views,
  count(*) FILTER (WHERE e.event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE e.event_type = 'download') AS downloads,
  count(*) FILTER (WHERE e.event_type = 'share')    AS shares,
  max(e.created_at) AS last_event
FROM public.engagement_events e
JOIN public.engagement_weights w ON w.event_type = e.event_type
WHERE e.photo_id IS NOT NULL
GROUP BY e.photo_id
WITH NO DATA;
CREATE UNIQUE INDEX photo_popularity_pkey ON public.photo_popularity (photo_id);

-- 5. Album popularity (size-normalized) ---------------------------------------
CREATE MATERIALIZED VIEW public.album_popularity AS
WITH album_events AS (
  SELECT e.album_key, e.photo_id, e.event_type, e.created_at, w.weight
  FROM public.engagement_events e
  JOIN public.engagement_weights w ON w.event_type = e.event_type
  WHERE e.album_key IS NOT NULL
),
sizes AS (
  SELECT album_key, count(*)::numeric AS total_photos
  FROM public.photo_metadata
  WHERE sharpness IS NOT NULL
  GROUP BY album_key
)
SELECT
  ae.album_key,
  sum(ae.weight * exp(-extract(epoch FROM (now() - ae.created_at)) / 604800.0)) AS trending_score,
  sum(ae.weight) AS all_time_score,
  sum(ae.weight) / nullif(s.total_photos, 0) AS score_per_photo,
  count(DISTINCT ae.photo_id) AS photos_engaged,
  s.total_photos,
  max(ae.created_at) AS last_event
FROM album_events ae
LEFT JOIN sizes s ON s.album_key = ae.album_key
GROUP BY ae.album_key, s.total_photos
WITH NO DATA;
CREATE UNIQUE INDEX album_popularity_pkey ON public.album_popularity (album_key);

-- 6. Public read access for the discovery surfaces (Phase 3)
GRANT SELECT ON public.photo_popularity, public.album_popularity TO anon, authenticated;

-- 7. Refresh function — service_role only (mirrors refresh_popular_photos pattern)
CREATE OR REPLACE FUNCTION public.refresh_popularity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.photo_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.album_popularity;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_popularity() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_popularity() TO service_role;

-- 8. Initial (non-concurrent) populate so the matviews are ready for CONCURRENTLY refreshes
REFRESH MATERIALIZED VIEW public.photo_popularity;
REFRESH MATERIALIZED VIEW public.album_popularity;

-- 9. Schedule the refresh every 30 minutes (pg_cron). Kept in-txn so a missing
--    pg_cron rolls the whole migration back (atomic, re-runnable) rather than
--    leaving the matviews created but unscheduled.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('refresh-popularity')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-popularity');
SELECT cron.schedule('refresh-popularity', '*/30 * * * *', $$SELECT public.refresh_popularity();$$);

COMMIT;
