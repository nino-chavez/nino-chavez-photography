-- Fix: engagement_totals_30d timed out (>8s, statement-timeout cancel) on first read.
--
-- The view wrapped engagement_events in a plain CTE and tested each row with a
-- correlated `EXISTS (SELECT … FROM automated_sessions …)`. Postgres inlines a
-- non-MATERIALIZED CTE, so automated_sessions — itself a GROUP BY over the whole
-- event table — was re-planned inside the per-row subquery instead of being
-- evaluated once. album_engagement_30d and view_source_30d survive the same
-- pattern (100-160ms) because the planner turns their single NOT EXISTS into a
-- hash anti-join; the totals view's three aggregate FILTER clauses plus a
-- count(DISTINCT) denied it that shape. Left those two alone rather than churning
-- views that are correct and fast.
--
-- Fix: materialize the automated-session set once and anti-join it. automated_sessions
-- is SELECT DISTINCT, so the LEFT JOIN cannot duplicate event rows.

BEGIN;

CREATE OR REPLACE VIEW public.engagement_totals_30d WITH (security_invoker = true) AS
WITH automated AS MATERIALIZED (
  SELECT session_hash FROM public.automated_sessions
),
scoped AS MATERIALIZED (
  SELECT
    e.event_type,
    e.session_hash,
    (a.session_hash IS NOT NULL) AS automated
  FROM public.engagement_events e
  LEFT JOIN automated a ON a.session_hash = e.session_hash
  WHERE e.created_at >= now() - interval '30 days'
)
SELECT
  count(*) FILTER (WHERE event_type = 'view' AND NOT automated)  AS views,
  count(DISTINCT session_hash) FILTER (WHERE NOT automated)      AS visitors,
  count(*) FILTER (WHERE event_type = 'view' AND automated)      AS automated_views
FROM scoped;

COMMENT ON VIEW public.engagement_totals_30d IS
  'Headline 30-day totals for the analytics dashboard. Crawler sessions (see automated_sessions) are excluded from views/visitors and reported separately as automated_views, so filtered volume is disclosed rather than silently dropped.';

COMMIT;
