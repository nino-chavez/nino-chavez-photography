-- Analytics reach views: album engagement + zero-result searches.
--
-- Why views, not row-capped fetches aggregated in TS: PostgREST can't express
-- count(distinct ...) or a GROUP BY over a REST call, and pulling a row-capped
-- slice of engagement_events/search_queries into the app to aggregate there
-- would silently undercount on an admin dashboard the moment a popular album
-- or a busy tournament weekend crosses that cap. Aggregation has to happen in
-- Postgres, where it's correct regardless of row volume.
--
-- security_invoker = true on both views (Supabase lint 0010 flags SECURITY
-- DEFINER views). No GRANTs — account default-privileges were revoked
-- project-wide (SEC-8, PR #63; see 20260624060000_default_privileges_revoke_anon_tables.sql)
-- and the analytics dashboard reads exclusively through the service-role admin
-- client (createSupabaseAdminClient()), which bypasses RLS/grants entirely.

BEGIN;

-- Per-album engagement over the trailing 30 days: unique visitors + event
-- breakdown. Answers "after I shared this album, who came and what did they do?"
CREATE OR REPLACE VIEW public.album_engagement_30d WITH (security_invoker = true) AS
SELECT
  album_key,
  count(DISTINCT session_hash) AS unique_visitors,
  count(*) FILTER (WHERE event_type = 'view')     AS views,
  count(*) FILTER (WHERE event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE event_type = 'download') AS downloads,
  count(*) FILTER (WHERE event_type = 'share')    AS shares,
  max(created_at) AS last_event
FROM public.engagement_events
WHERE created_at >= now() - interval '30 days'
  AND album_key IS NOT NULL
GROUP BY album_key;

-- Search terms that returned nothing over the trailing 30 days — the demand
-- signal for missing content or tagging gaps.
CREATE OR REPLACE VIEW public.zero_result_searches_30d WITH (security_invoker = true) AS
SELECT
  query_text,
  count(*) AS searches,
  max(searched_at) AS last_searched
FROM public.search_queries
WHERE results_count = 0
  AND searched_at >= now() - interval '30 days'
GROUP BY query_text;

COMMIT;
