-- Analytics: exclude automated sessions, and aggregate view-sources in Postgres.
--
-- Two defects, one migration, because they share a root cause: engagement numbers
-- were being derived from raw event rows without asking what produced them.
--
-- 1. CRAWLER CONTAMINATION. 40,518 of 42,726 recorded 30-day views came from four
--    sessions. One walked 19,046 distinct photos in a single day (the library is
--    ~20K). Cloudflare zone analytics for /photography/photo/* over the same period
--    attributes the traffic to SEMrush (20,373 req/7d), Hetzner (6,704), Huawei
--    Clouds (5,996), Facebook (5,060) and TECHOFF SRV (2,265, spoofing a Firefox
--    UA) — every one a datacenter ASN. Roughly 350 of 43,620 photo-page requests
--    came from a residential browser.
--
--    The isbot UA gate in bot-detection.ts catches AppleBot and misses all of the
--    above: they send either an unrecognized UA or a spoofed browser UA, and the
--    signal that separates them (datacenter ASN) is not available to the gate on
--    this plan. Filtering at READ is what makes the numbers honest, and it is the
--    only fix that also corrects the history already in the table.
--
--    Threshold: >500 photo-views by one session in one day. Empirically the p95
--    session-day is 104 views and the next values are 490, 1,241, 8,124, 10,014,
--    19,046 — a 5x gap with nothing in it. Exclusion is per SESSION, not per day:
--    a crawler's quiet day is still a crawler. Views are already deduped per
--    (session, photo, day), so the count is distinct photos, not page refreshes.
--
--    This is not dashboard cosmetics. photo_popularity / album_popularity feed
--    album_top_photo and the public discovery rails, so crawler traffic has been
--    voting on which photos visitors are shown.
--
-- 2. VIEW-SOURCE DISTRIBUTION READ A 1,000-ROW SLICE. The dashboard selected raw
--    `source` values with no aggregate and no limit, then reduced in TypeScript.
--    PostgREST caps responses at db-max-rows=1000, so the panel described 1,000
--    arbitrary rows out of 42,726: it rendered direct=995 / ig-flickday=4 /
--    ig-nino=1 while the truth was direct=42,227 / album=462 / ig-flickday=17 /
--    ig-nino=11 / timeline=6 — with `album` missing entirely. The PR #74 ?src=
--    attribution channels were unmeasurable as built. Same lesson the
--    album_engagement_30d header already recorded: aggregate in Postgres, where
--    the answer is correct regardless of row volume.
--
-- security_invoker = true on every view (lint 0010). No GRANTs — account default
-- privileges are revoked project-wide (SEC-8, PR #63) and every reader here is the
-- service-role admin client. Recreated matviews carry an explicit REVOKE: Supabase
-- default privileges auto-grant anon/authenticated on creation in `public`, which
-- would re-trip lint 0016 (see 20260624030000_revoke_matview_api_access.sql).

BEGIN;

-- Sessions whose behavior is not a human browsing a gallery. ----------------------
CREATE OR REPLACE VIEW public.automated_sessions WITH (security_invoker = true) AS
SELECT DISTINCT session_hash
FROM (
  SELECT session_hash
  FROM public.engagement_events
  WHERE event_type = 'view'
    AND photo_id IS NOT NULL
    AND session_hash IS NOT NULL
  GROUP BY session_hash, event_day
  HAVING count(*) > 500
) heavy_days;

COMMENT ON VIEW public.automated_sessions IS
  'Session hashes that viewed >500 distinct photos in a single day — crawlers the UA gate misses. Excluded from every engagement aggregate. Threshold sits in the empty 5x gap between the p95 human session-day (104) and the lowest crawler session (490).';

-- Per-album engagement over the trailing 30 days, humans only. --------------------
-- Column list unchanged (CREATE OR REPLACE requires it); only the population changes.
CREATE OR REPLACE VIEW public.album_engagement_30d WITH (security_invoker = true) AS
SELECT
  e.album_key,
  count(DISTINCT e.session_hash) AS unique_visitors,
  count(*) FILTER (WHERE e.event_type = 'view')     AS views,
  count(*) FILTER (WHERE e.event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE e.event_type = 'download') AS downloads,
  count(*) FILTER (WHERE e.event_type = 'share')    AS shares,
  max(e.created_at) AS last_event
FROM public.engagement_events e
WHERE e.created_at >= now() - interval '30 days'
  AND e.album_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.automated_sessions a WHERE a.session_hash = e.session_hash)
GROUP BY e.album_key;

-- Where 30-day views came from — aggregated in Postgres, not sliced by PostgREST. --
CREATE OR REPLACE VIEW public.view_source_30d WITH (security_invoker = true) AS
SELECT
  coalesce(e.source, 'direct') AS source,
  count(*) AS views
FROM public.engagement_events e
WHERE e.event_type = 'view'
  AND e.created_at >= now() - interval '30 days'
  AND NOT EXISTS (SELECT 1 FROM public.automated_sessions a WHERE a.session_hash = e.session_hash)
GROUP BY 1;

-- Headline totals, with the excluded volume reported rather than silently dropped. -
-- The automated flag is resolved once per row in the CTE: an aggregate FILTER
-- clause cannot contain a subquery.
CREATE OR REPLACE VIEW public.engagement_totals_30d WITH (security_invoker = true) AS
WITH scoped AS (
  SELECT
    e.event_type,
    e.session_hash,
    EXISTS (SELECT 1 FROM public.automated_sessions a WHERE a.session_hash = e.session_hash) AS automated
  FROM public.engagement_events e
  WHERE e.created_at >= now() - interval '30 days'
)
SELECT
  count(*) FILTER (WHERE event_type = 'view' AND NOT automated)  AS views,
  count(DISTINCT session_hash) FILTER (WHERE NOT automated)      AS visitors,
  count(*) FILTER (WHERE event_type = 'view' AND automated)      AS automated_views
FROM scoped;

-- Popularity matviews, rebuilt on human events only. -------------------------------
-- CASCADE takes album_top_photo (it reads photo_popularity); both are recreated below,
-- inside this transaction, and populated before COMMIT so no reader sees an empty rail.
DROP MATERIALIZED VIEW IF EXISTS public.photo_popularity CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.album_popularity CASCADE;

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
  AND NOT EXISTS (SELECT 1 FROM public.automated_sessions a WHERE a.session_hash = e.session_hash)
GROUP BY e.photo_id
WITH NO DATA;
CREATE UNIQUE INDEX photo_popularity_pkey ON public.photo_popularity (photo_id);
REVOKE ALL ON public.photo_popularity FROM anon, authenticated;
COMMENT ON COLUMN public.photo_popularity.all_time_score IS
  'Weighted sum over RETAINED events (<=90d retention) — a rolling recent total, not literal lifetime. Intentional: avoids stale early photos dominating forever.';

CREATE MATERIALIZED VIEW public.album_popularity AS
WITH album_events AS (
  SELECT e.album_key, e.photo_id, e.event_type, e.created_at, w.weight
  FROM public.engagement_events e
  JOIN public.engagement_weights w ON w.event_type = e.event_type
  WHERE e.album_key IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.automated_sessions a WHERE a.session_hash = e.session_hash)
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
REVOKE ALL ON public.album_popularity FROM anon, authenticated;
COMMENT ON COLUMN public.album_popularity.all_time_score IS
  'Weighted sum over retained events (<=90d); see photo_popularity.all_time_score.';

-- Unchanged definition, recreated because CASCADE dropped it with photo_popularity.
CREATE MATERIALIZED VIEW public.album_top_photo AS
SELECT DISTINCT ON (pm.album_key)
       pm.album_key,
       pm.photo_id,
       pm.cf_image_id,
       pp.trending_score
FROM public.photo_popularity pp
JOIN public.photo_metadata pm ON pm.photo_id = pp.photo_id
WHERE pm.album_key IS NOT NULL
  AND pm.cf_image_id IS NOT NULL
  AND pm.sharpness IS NOT NULL
ORDER BY pm.album_key, pp.trending_score DESC NULLS LAST, pm.photo_id
WITH NO DATA;
CREATE UNIQUE INDEX album_top_photo_pkey ON public.album_top_photo (album_key);
REVOKE ALL ON public.album_top_photo FROM anon, authenticated;

-- Populate before COMMIT. Plain (non-CONCURRENTLY) refresh is required on a
-- WITH NO DATA matview and is what makes the swap atomic for readers.
REFRESH MATERIALIZED VIEW public.photo_popularity;
REFRESH MATERIALIZED VIEW public.album_popularity;
REFRESH MATERIALIZED VIEW public.album_top_photo;

COMMIT;
