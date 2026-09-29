-- Synthetic local-only prerequisite schema for the north-star analytics rehearsal.
-- It mirrors the canonical analytics columns, enum, nullable album event date,
-- constraints, RLS posture, and role grants the draft migration depends on.

BEGIN;
DROP FUNCTION IF EXISTS public.norm_color(text);
DROP FUNCTION IF EXISTS public.refresh_popularity();
DROP MATERIALIZED VIEW IF EXISTS public.album_top_photo CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.photo_popularity CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.album_popularity CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.albums_summary CASCADE;
DROP VIEW IF EXISTS public.engagement_totals_30d CASCADE;
DROP VIEW IF EXISTS public.view_source_30d CASCADE;
DROP VIEW IF EXISTS public.album_engagement_30d CASCADE;
DROP VIEW IF EXISTS public.automated_sessions CASCADE;
DROP TABLE IF EXISTS public.analytics_diagnostic_coverage CASCADE;
DROP TABLE IF EXISTS public.analytics_collection_diagnostics CASCADE;
DROP TABLE IF EXISTS public.analytics_reconciliation_runs CASCADE;
DROP TABLE IF EXISTS public.analytics_sharing_annotations CASCADE;
DROP TABLE IF EXISTS public.analytics_saved_reports CASCADE;
DROP TABLE IF EXISTS public.analytics_daily_coverage CASCADE;
DROP TABLE IF EXISTS public.analytics_daily_actions CASCADE;
DROP TABLE IF EXISTS public.engagement_classification_corrections CASCADE;
DROP TABLE IF EXISTS public.engagement_event_classifications CASCADE;
DROP TABLE IF EXISTS public.engagement_events CASCADE;
DROP TABLE IF EXISTS public.engagement_weights CASCADE;
DROP TABLE IF EXISTS public.search_queries CASCADE;
DROP TABLE IF EXISTS public.photo_metadata CASCADE;
DROP TABLE IF EXISTS public.photo_jersey_sightings CASCADE;
DROP TABLE IF EXISTS public.albums CASCADE;
DROP TABLE IF EXISTS public.album_settings CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sport_enum') THEN
    CREATE TYPE public.sport_enum AS ENUM ('volleyball', 'basketball', 'soccer', 'softball', 'baseball', 'football', 'track', 'cross_country', 'golf', 'tennis', 'bowling', 'pickleball', 'other');
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.find_photos_by_jersey(text, text, text, public.sport_enum, int, int);
CREATE TABLE IF NOT EXISTS public.analytics_rehearsal_identity (
  identity text PRIMARY KEY CHECK (identity = 'photography-analytics-synthetic-v1')
);
TRUNCATE public.analytics_rehearsal_identity;
INSERT INTO public.analytics_rehearsal_identity VALUES ('photography-analytics-synthetic-v1');
COMMENT ON TABLE public.analytics_rehearsal_identity IS
  'Destructive-reset sentinel for the dedicated photography analytics rehearsal stack only.';
ALTER TABLE public.analytics_rehearsal_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_rehearsal_identity FROM anon, authenticated;
GRANT SELECT ON public.analytics_rehearsal_identity TO service_role;
CREATE TABLE public.albums (
  album_key text PRIMARY KEY,
  album_name text NOT NULL,
  sport public.sport_enum,
  sport_source text NOT NULL DEFAULT 'operator' CHECK (sport_source IN ('operator', 'detection-unanimous', 'legacy-unconfirmed')),
  category text,
  event_date date,
  gallery_scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.photo_metadata (
  photo_id text PRIMARY KEY,
  album_key text REFERENCES public.albums(album_key),
  image_key text,
  album_name text,
  sport_type text,
  photo_category text CHECK (photo_category IS NULL OR photo_category IN ('action', 'celebration', 'candid', 'portrait', 'warmup', 'ceremony')),
  cf_image_id text,
  sharpness numeric,
  quality_score numeric
);
CREATE TABLE public.photo_jersey_sightings (
  photo_id text NOT NULL REFERENCES public.photo_metadata(photo_id),
  jersey_number text NOT NULL,
  team_color text,
  team_side text
);
CREATE TABLE public.album_settings (
  album_key text PRIMARY KEY REFERENCES public.albums(album_key),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted')),
  published_at timestamptz
);
CREATE TABLE public.engagement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  photo_id text REFERENCES public.photo_metadata(photo_id),
  album_key text REFERENCES public.albums(album_key),
  event_type text NOT NULL CHECK (event_type IN ('view', 'favorite', 'download', 'share', 'album_open')),
  session_hash text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date)
);
CREATE INDEX engagement_events_created_idx ON public.engagement_events(created_at);
CREATE UNIQUE INDEX engagement_events_dedup_idx
  ON public.engagement_events (session_hash, photo_id, event_type, event_day)
  WHERE photo_id IS NOT NULL;
CREATE UNIQUE INDEX engagement_events_album_dedup_idx
  ON public.engagement_events (session_hash, coalesce(album_key, ''), event_type, event_day)
  WHERE photo_id IS NULL;
CREATE TABLE public.engagement_weights (event_type text PRIMARY KEY, weight numeric NOT NULL);
INSERT INTO public.engagement_weights VALUES ('view', 1), ('favorite', 4), ('download', 6), ('share', 8);
CREATE TABLE public.search_queries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query_text text NOT NULL,
  filters_used jsonb,
  results_count integer NOT NULL CHECK (results_count >= 0),
  searched_at timestamptz NOT NULL DEFAULT now()
);

-- One pre-migration row proves that the migration-time catalogue backfill is
-- frozen. The later fixture changes this album's event date before reconcile.
INSERT INTO public.albums (album_key, album_name, sport, event_date)
VALUES ('legacy', 'Legacy Backfill Album', 'soccer', NULL);
INSERT INTO public.album_settings (album_key, visibility, published_at)
VALUES ('legacy', 'public', '2026-09-20T15:00:00Z');
INSERT INTO public.photo_metadata (photo_id, album_key, photo_category, cf_image_id, sharpness)
VALUES ('legacy-1', 'legacy', 'candid', 'fixture-legacy-1', 1);
INSERT INTO public.engagement_events (photo_id, album_key, event_type, session_hash, source, created_at, event_day)
VALUES ('legacy-1', 'legacy', 'view', 'legacy-audience', 'legacy-gallery', '2026-09-28T02:30:00Z', '2026-09-27');

ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY albums_read ON public.albums FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY photos_read ON public.photo_metadata FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY settings_read ON public.album_settings FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.albums, public.photo_metadata, public.album_settings TO anon, authenticated;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Canonical pre-migration analytics objects. The draft must replace the shapes
-- that already exist in the repository, not succeed only because rehearsal
-- started from empty stand-ins.
CREATE VIEW public.automated_sessions WITH (security_invoker = true) AS
SELECT DISTINCT session_hash FROM public.engagement_events
WHERE event_type = 'view' AND photo_id IS NOT NULL AND session_hash IS NOT NULL
GROUP BY session_hash, event_day HAVING count(*) > 500;
CREATE VIEW public.album_engagement_30d WITH (security_invoker = true) AS
SELECT e.album_key, count(DISTINCT e.session_hash) AS engaged_visitors,
  count(*) FILTER (WHERE e.event_type = 'album_open') AS album_opens,
  count(*) FILTER (WHERE e.event_type = 'view' AND e.photo_id IS NOT NULL) AS photo_opens,
  count(*) FILTER (WHERE e.event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE e.event_type = 'download') AS downloads,
  count(*) FILTER (WHERE e.event_type = 'share') AS shares, max(e.created_at) AS last_event
FROM public.engagement_events e WHERE e.created_at >= now() - interval '30 days' AND e.album_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.automated_sessions a WHERE a.session_hash = e.session_hash)
GROUP BY e.album_key;
CREATE VIEW public.view_source_30d WITH (security_invoker = true) AS
SELECT coalesce(e.source, 'direct') AS source, count(*) AS views FROM public.engagement_events e
WHERE e.event_type = 'view' AND e.photo_id IS NOT NULL AND e.created_at >= now() - interval '30 days'
  AND NOT EXISTS (SELECT 1 FROM public.automated_sessions a WHERE a.session_hash = e.session_hash)
GROUP BY 1;
CREATE VIEW public.engagement_totals_30d WITH (security_invoker = true) AS
WITH automated AS MATERIALIZED (SELECT session_hash FROM public.automated_sessions),
scoped AS MATERIALIZED (
  SELECT e.event_type, e.photo_id, e.session_hash, (a.session_hash IS NOT NULL) AS automated
  FROM public.engagement_events e LEFT JOIN automated a ON a.session_hash = e.session_hash
  WHERE e.created_at >= now() - interval '30 days'
)
SELECT count(*) FILTER (WHERE event_type = 'view' AND photo_id IS NOT NULL AND NOT automated) AS photo_opens,
  count(DISTINCT session_hash) FILTER (WHERE NOT automated) AS engaged_visitors,
  count(*) FILTER (WHERE event_type = 'album_open' AND NOT automated) AS album_opens,
  count(*) FILTER (WHERE event_type = 'view' AND photo_id IS NOT NULL AND automated) AS automated_photo_opens
FROM scoped;
CREATE MATERIALIZED VIEW public.photo_popularity AS
SELECT e.photo_id, sum(w.weight) AS trending_score, sum(w.weight) AS all_time_score,
  count(*) FILTER (WHERE e.event_type = 'view') AS views,
  count(*) FILTER (WHERE e.event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE e.event_type = 'download') AS downloads,
  count(*) FILTER (WHERE e.event_type = 'share') AS shares, max(e.created_at) AS last_event
FROM public.engagement_events e JOIN public.engagement_weights w ON w.event_type = e.event_type
WHERE e.photo_id IS NOT NULL GROUP BY e.photo_id WITH NO DATA;
CREATE UNIQUE INDEX photo_popularity_pkey ON public.photo_popularity(photo_id);
CREATE MATERIALIZED VIEW public.album_popularity AS
SELECT e.album_key, sum(w.weight) AS trending_score, sum(w.weight) AS all_time_score,
  sum(w.weight) AS score_per_photo, count(DISTINCT e.photo_id) AS photos_engaged,
  count(*)::numeric AS total_photos, max(e.created_at) AS last_event
FROM public.engagement_events e JOIN public.engagement_weights w ON w.event_type = e.event_type
WHERE e.album_key IS NOT NULL GROUP BY e.album_key WITH NO DATA;
CREATE UNIQUE INDEX album_popularity_pkey ON public.album_popularity(album_key);
CREATE MATERIALIZED VIEW public.album_top_photo AS
SELECT DISTINCT ON (pm.album_key) pm.album_key, pm.photo_id, pm.cf_image_id, pp.trending_score
FROM public.photo_popularity pp JOIN public.photo_metadata pm ON pm.photo_id = pp.photo_id
ORDER BY pm.album_key, pp.trending_score DESC NULLS LAST, pm.photo_id WITH NO DATA;
CREATE UNIQUE INDEX album_top_photo_pkey ON public.album_top_photo(album_key);
CREATE MATERIALIZED VIEW public.albums_summary AS
SELECT a.album_key, a.album_name, count(pm.photo_id)::bigint AS photo_count
FROM public.albums a LEFT JOIN public.photo_metadata pm ON pm.album_key = a.album_key
GROUP BY a.album_key, a.album_name WITH NO DATA;
CREATE UNIQUE INDEX albums_summary_pkey ON public.albums_summary(album_key);
CREATE OR REPLACE FUNCTION public.norm_color(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim(value)); $$;
CREATE OR REPLACE FUNCTION public.find_photos_by_jersey(
  p_jersey text,
  p_album_key text DEFAULT NULL,
  p_team_color text DEFAULT NULL,
  p_sport public.sport_enum DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  photo_id text, image_key text, album_key text, album_name text, sport_type text,
  cf_image_id text, quality_score numeric, jersey_number text, team_color text, team_side text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hits AS (
    SELECT DISTINCT ON (pm.photo_id)
      pm.photo_id, pm.image_key, pm.album_key, a.album_name, pm.sport_type,
      pm.cf_image_id, pm.quality_score, sighting.jersey_number,
      sighting.team_color, sighting.team_side
    FROM public.photo_jersey_sightings sighting
    JOIN public.photo_metadata pm ON pm.photo_id = sighting.photo_id
    LEFT JOIN public.albums a ON a.album_key = pm.album_key
    LEFT JOIN public.album_settings settings ON settings.album_key = pm.album_key
    WHERE sighting.jersey_number = btrim(p_jersey)
      AND pm.sharpness IS NOT NULL
      AND (settings.visibility IS NULL OR settings.visibility <> 'unlisted')
      AND (p_album_key IS NULL OR pm.album_key = p_album_key)
      AND (p_sport IS NULL OR a.sport = p_sport)
      AND (p_team_color IS NULL OR public.norm_color(sighting.team_color) = public.norm_color(p_team_color))
    ORDER BY pm.photo_id
  )
  SELECT hits.photo_id, hits.image_key, hits.album_key, hits.album_name,
    hits.sport_type, hits.cf_image_id, hits.quality_score,
    hits.jersey_number, hits.team_color, hits.team_side
  FROM hits
  LEFT JOIN public.photo_popularity popularity ON popularity.photo_id = hits.photo_id
  ORDER BY hits.quality_score DESC NULLS LAST,
    coalesce(popularity.trending_score, 0) DESC,
    hits.photo_id
  LIMIT p_limit OFFSET p_offset;
$$;
CREATE OR REPLACE FUNCTION public.refresh_popularity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.photo_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.album_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.album_top_photo;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_popularity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_popularity() TO service_role;
REFRESH MATERIALIZED VIEW public.albums_summary;
COMMIT;
