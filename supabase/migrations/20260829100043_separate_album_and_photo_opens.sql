-- Separate album reach from photo engagement.
--
-- `view` historically carried two different facts:
--   1. a photo was displayed (photo_id is present), and
--   2. an attributed album/photo-share arrival occurred (photo_id is null).
-- The analytics dashboard added those rows together under "Views", which made
-- album reach look like pageviews divided by visitors. Add a dedicated,
-- once-per-session/album/day album-open event and expose each unit separately.
--
-- album_open deliberately has no engagement_weights row. Merely loading an
-- album should describe reach, not vote that album up the popularity ranking.

BEGIN;

ALTER TABLE public.engagement_events
  DROP CONSTRAINT engagement_events_event_type_check;

ALTER TABLE public.engagement_events
  ADD CONSTRAINT engagement_events_event_type_check
  CHECK (event_type IN ('view', 'favorite', 'download', 'share', 'album_open'));

-- Column names change, so these views must be recreated rather than replaced.
-- No database objects depend on them; both are service-role dashboard reads.
DROP VIEW public.album_engagement_30d;

CREATE VIEW public.album_engagement_30d WITH (security_invoker = true) AS
SELECT
  e.album_key,
  count(DISTINCT e.session_hash) AS engaged_visitors,
  count(*) FILTER (WHERE e.event_type = 'album_open') AS album_opens,
  count(*) FILTER (
    WHERE e.event_type = 'view' AND e.photo_id IS NOT NULL
  ) AS photo_opens,
  count(*) FILTER (WHERE e.event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE e.event_type = 'download') AS downloads,
  count(*) FILTER (WHERE e.event_type = 'share') AS shares,
  max(e.created_at) AS last_event
FROM public.engagement_events e
WHERE e.created_at >= now() - interval '30 days'
  AND e.album_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.automated_sessions a
    WHERE a.session_hash = e.session_hash
  )
GROUP BY e.album_key;

COMMENT ON VIEW public.album_engagement_30d IS
  'Per-album 30-day reach. engaged_visitors is a privacy-preserving IP+UA estimate; album_opens and photo_opens are separate deduped events. Automated sessions are excluded.';

-- The source panel describes individual photo opens, not attributed arrivals.
CREATE OR REPLACE VIEW public.view_source_30d WITH (security_invoker = true) AS
SELECT
  coalesce(e.source, 'direct') AS source,
  count(*) AS views
FROM public.engagement_events e
WHERE e.event_type = 'view'
  AND e.photo_id IS NOT NULL
  AND e.created_at >= now() - interval '30 days'
  AND NOT EXISTS (
    SELECT 1
    FROM public.automated_sessions a
    WHERE a.session_hash = e.session_hash
  )
GROUP BY 1;

DROP VIEW public.engagement_totals_30d;

CREATE VIEW public.engagement_totals_30d WITH (security_invoker = true) AS
WITH automated AS MATERIALIZED (
  SELECT session_hash FROM public.automated_sessions
),
scoped AS MATERIALIZED (
  SELECT
    e.event_type,
    e.photo_id,
    e.session_hash,
    (a.session_hash IS NOT NULL) AS automated
  FROM public.engagement_events e
  LEFT JOIN automated a ON a.session_hash = e.session_hash
  WHERE e.created_at >= now() - interval '30 days'
)
SELECT
  count(*) FILTER (
    WHERE event_type = 'view' AND photo_id IS NOT NULL AND NOT automated
  ) AS photo_opens,
  count(DISTINCT session_hash) FILTER (WHERE NOT automated) AS engaged_visitors,
  count(*) FILTER (
    WHERE event_type = 'album_open' AND NOT automated
  ) AS album_opens,
  count(*) FILTER (
    WHERE event_type = 'view' AND photo_id IS NOT NULL AND automated
  ) AS automated_photo_opens
FROM scoped;

COMMENT ON VIEW public.engagement_totals_30d IS
  'Headline 30-day analytics totals. Album opens and individual photo opens are separate; crawler sessions are excluded from reach and disclosed as automated_photo_opens.';

COMMIT;
