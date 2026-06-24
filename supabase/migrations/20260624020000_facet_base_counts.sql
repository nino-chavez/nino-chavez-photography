-- Migration: precompute base (no-filter) facet counts
--
-- The root +layout.server.ts ran getFilterCounts() + getSportDistribution() +
-- getCategoryDistribution() on EVERY page load site-wide. Each fanned out to a paged
-- distinct scan + one exact-count head request per value (12 sports + 7 categories +
-- 62 play_types ≈ 80+ round-trips). The layout's in-memory cache doesn't save it on
-- Cloudflare Pages — module globals are per-isolate and isolates churn, so cold isolates
-- re-run the whole fan-out. In pg_stat_statements these facet queries were the dominant
-- call VOLUME (1M+ calls each).
--
-- This matview precomputes the base counts so the layout reads ONE row set (~80 rows via
-- the unique index) instead of 80+ round-trips. Refreshed on ingest (the write event,
-- mirroring refresh_albums_summary) + a 30-min pg_cron safety net.
--
-- Semantics mirror the TS exactly: sharpness IS NOT NULL, dimension value NOT NULL, and
-- the unlisted-album privacy gate (album_settings.visibility='unlisted' photos excluded
-- from public discovery counts). NOT EXISTS keeps null-album_key photos (there are none
-- today) and only drops genuinely-unlisted ones. Percentages and the 'unknown' sport
-- exclusion stay in TS so the matview is a pure (dimension, value, count) source for all
-- three layout consumers.

BEGIN;

CREATE MATERIALIZED VIEW public.facet_base_counts AS
SELECT d.dimension, d.value, count(*)::bigint AS count
FROM (
  SELECT 'sport_type'::text AS dimension, pm.sport_type AS value
  FROM public.photo_metadata pm
  WHERE pm.sharpness IS NOT NULL AND pm.sport_type IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.album_settings s
                    WHERE s.visibility = 'unlisted' AND s.album_key = pm.album_key)
  UNION ALL
  SELECT 'photo_category'::text, pm.photo_category
  FROM public.photo_metadata pm
  WHERE pm.sharpness IS NOT NULL AND pm.photo_category IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.album_settings s
                    WHERE s.visibility = 'unlisted' AND s.album_key = pm.album_key)
  UNION ALL
  SELECT 'play_type'::text, pm.play_type
  FROM public.photo_metadata pm
  WHERE pm.sharpness IS NOT NULL AND pm.play_type IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.album_settings s
                    WHERE s.visibility = 'unlisted' AND s.album_key = pm.album_key)
) d
GROUP BY d.dimension, d.value
WITH NO DATA;

-- Unique index required for REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX facet_base_counts_pkey ON public.facet_base_counts (dimension, value);

-- Public aggregate data (no PII); mirrors the popularity matviews' anon grant.
GRANT SELECT ON public.facet_base_counts TO anon, authenticated;

-- Refresh function — service_role only (mirrors refresh_popularity / refresh_albums_summary).
CREATE OR REPLACE FUNCTION public.refresh_facet_base_counts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.facet_base_counts;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_facet_base_counts() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_facet_base_counts() TO service_role;

-- Initial (non-concurrent) populate so it's ready for CONCURRENTLY refreshes.
REFRESH MATERIALIZED VIEW public.facet_base_counts;

-- 30-min safety-net refresh (ingest refreshes it on the write event; cron covers
-- unlisted-visibility changes made outside ingest). In-txn so a missing pg_cron rolls
-- the whole migration back rather than leaving the matview unscheduled.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('refresh-facet-base-counts')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-facet-base-counts');
SELECT cron.schedule('refresh-facet-base-counts', '*/30 * * * *', $$SELECT public.refresh_facet_base_counts();$$);

COMMIT;
