-- Stored, identifier-free summaries for the public-site action report.
-- Run the private refresh once and verify it before switching application reads.
BEGIN;

ALTER TABLE public.analytics_v2_archived_totals
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION analytics_private.touch_analytics_v2_archived_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_v2_archived_totals_touch ON public.analytics_v2_archived_totals;
CREATE TRIGGER analytics_v2_archived_totals_touch
  BEFORE INSERT OR UPDATE ON public.analytics_v2_archived_totals
  FOR EACH ROW EXECUTE FUNCTION analytics_private.touch_analytics_v2_archived_totals();

CREATE TABLE public.analytics_site_action_daily (
  bucket_date date NOT NULL,
  section text NOT NULL CHECK (section IN ('profile','writing','demos','photography','other')),
  path text NOT NULL CHECK (path ~ '^/'),
  page_views bigint NOT NULL DEFAULT 0 CHECK (page_views >= 0),
  contact_clicks bigint NOT NULL DEFAULT 0 CHECK (contact_clicks >= 0),
  external_clicks bigint NOT NULL DEFAULT 0 CHECK (external_clicks >= 0),
  reading_90 bigint NOT NULL DEFAULT 0 CHECK (reading_90 >= 0),
  active_30 bigint NOT NULL DEFAULT 0 CHECK (active_30 >= 0),
  demo_last_section bigint NOT NULL DEFAULT 0 CHECK (demo_last_section >= 0),
  excluded_events bigint NOT NULL DEFAULT 0 CHECK (excluded_events >= 0),
  first_recorded_at timestamptz NOT NULL,
  last_recorded_at timestamptz NOT NULL,
  PRIMARY KEY (bucket_date, section, path)
);
ALTER TABLE public.analytics_site_action_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_site_action_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_site_action_daily TO service_role;
CREATE INDEX analytics_site_action_daily_report_idx
  ON public.analytics_site_action_daily (bucket_date, section, path);
COMMENT ON TABLE public.analytics_site_action_daily IS
  'Identifier-free UTC daily site-action counts. Stores only approved normalized path and section dimensions.';

CREATE TABLE public.analytics_site_action_summary_status (
  report_name text PRIMARY KEY CHECK (report_name = 'site_actions'),
  initialized_at timestamptz,
  last_successful_at timestamptz,
  summary_cutoff_at timestamptz,
  last_error_at timestamptz,
  last_error_code text
);
ALTER TABLE public.analytics_site_action_summary_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_site_action_summary_status FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_site_action_summary_status TO service_role;
INSERT INTO public.analytics_site_action_summary_status(report_name) VALUES ('site_actions')
ON CONFLICT (report_name) DO NOTHING;
COMMENT ON TABLE public.analytics_site_action_summary_status IS
  'Refresh receipt. last_successful_at and summary_cutoff_at advance only after the daily summary transaction succeeds.';

CREATE OR REPLACE FUNCTION analytics_private.refresh_site_action_summaries()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private
AS $$
DECLARE
  previous_cutoff timestamptz;
  refreshed_at timestamptz;
  summary_cutoff timestamptz := clock_timestamp();
  failure_code text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('analytics-site-action-summary-refresh'));
  -- Retention hands raw rows to archives atomically relative to this rebuild.
  PERFORM pg_advisory_xact_lock(hashtext('analytics-v2-prune'));

  BEGIN
    SELECT summary_cutoff_at INTO previous_cutoff
    FROM public.analytics_site_action_summary_status
    WHERE report_name = 'site_actions'
    FOR UPDATE;

    IF current_setting('analytics.site_actions_refresh_force_failure', true) = 'on' THEN
      RAISE EXCEPTION 'scheduled-site-refresh-test-failure' USING ERRCODE = 'P0001';
    END IF;

    -- Reconcile every retained raw observation so a later classification or browser
    -- revocation changes the stored result. Archive rows are revisited only when their
    -- source row changed since the prior successful refresh.
    DELETE FROM public.analytics_site_action_daily d
    WHERE d.bucket_date IN (
      SELECT DISTINCT (e.occurred_at AT TIME ZONE 'UTC')::date
      FROM public.analytics_events_v2 e
      WHERE e.event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
        AND e.received_at <= summary_cutoff AND e.occurred_at <= summary_cutoff
      UNION
      SELECT DISTINCT a.bucket_date
      FROM public.analytics_v2_archived_totals a
      WHERE a.event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
        AND a.updated_at <= summary_cutoff
        AND (previous_cutoff IS NULL OR a.updated_at > previous_cutoff)
    );

    WITH affected_days AS (
      SELECT DISTINCT (e.occurred_at AT TIME ZONE 'UTC')::date AS bucket_date
      FROM public.analytics_events_v2 e
      WHERE e.event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
        AND e.received_at <= summary_cutoff AND e.occurred_at <= summary_cutoff
      UNION
      SELECT DISTINCT a.bucket_date
      FROM public.analytics_v2_archived_totals a
      WHERE a.event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
        AND a.updated_at <= summary_cutoff
        AND (previous_cutoff IS NULL OR a.updated_at > previous_cutoff)
    ), observations AS (
      SELECT
        (e.occurred_at AT TIME ZONE 'UTC')::date AS bucket_date,
        e.properties->>'site_section' AS section,
        e.properties->>'canonical_path' AS path,
        e.event_name,
        e.properties AS dimensions,
        CASE
          WHEN r.anonymous_browser_id IS NOT NULL THEN 'self_excluded'
          WHEN e.traffic_context <> 'audience' THEN e.traffic_context
          ELSE coalesce(c.classification, e.traffic_context)
        END AS context,
        1::bigint AS event_count,
        e.occurred_at AS first_recorded_at,
        e.occurred_at AS last_recorded_at
      FROM public.analytics_events_v2 e
      LEFT JOIN LATERAL (
        SELECT c.classification
        FROM public.analytics_event_v2_classifications c
        WHERE c.event_id = e.event_id
        ORDER BY c.classification_version DESC
        LIMIT 1
      ) c ON true
      LEFT JOIN analytics_private.analytics_v2_revoked_browsers r
        ON r.anonymous_browser_id = e.anonymous_browser_id
      WHERE e.event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
        AND e.received_at <= summary_cutoff AND e.occurred_at <= summary_cutoff
        AND (e.occurred_at AT TIME ZONE 'UTC')::date IN (SELECT bucket_date FROM affected_days)

      UNION ALL

      SELECT
        a.bucket_date,
        a.dimensions->>'site_section' AS section,
        a.dimensions->>'canonical_path' AS path,
        a.event_name,
        a.dimensions,
        a.traffic_context AS context,
        a.event_count,
        a.last_recorded_at AS first_recorded_at,
        a.last_recorded_at
      FROM public.analytics_v2_archived_totals a
      WHERE a.event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
        AND a.updated_at <= summary_cutoff
        AND a.bucket_date IN (SELECT bucket_date FROM affected_days)
    )
    INSERT INTO public.analytics_site_action_daily (
      bucket_date, section, path,
      page_views, contact_clicks, external_clicks, reading_90, active_30, demo_last_section,
      excluded_events, first_recorded_at, last_recorded_at
    )
    SELECT
      bucket_date,
      section,
      path,
      coalesce(sum(event_count) FILTER (WHERE context IN ('audience','unclassified') AND event_name = 'site_page_viewed'), 0),
      coalesce(sum(event_count) FILTER (WHERE context IN ('audience','unclassified') AND event_name = 'site_link_clicked' AND dimensions->>'target_kind' IN ('email','phone')), 0),
      coalesce(sum(event_count) FILTER (WHERE context IN ('audience','unclassified') AND event_name = 'site_link_clicked' AND dimensions->>'target_kind' = 'external'), 0),
      coalesce(sum(event_count) FILTER (WHERE context IN ('audience','unclassified') AND event_name = 'content_progressed' AND dimensions->>'threshold' = '90'), 0),
      coalesce(sum(event_count) FILTER (WHERE context IN ('audience','unclassified') AND event_name = 'content_active_time' AND dimensions->>'threshold' = '30'), 0),
      coalesce(sum(event_count) FILTER (WHERE context IN ('audience','unclassified') AND event_name = 'demo_section_viewed' AND dimensions->>'position' = dimensions->>'section_count'), 0),
      coalesce(sum(event_count) FILTER (WHERE context NOT IN ('audience','unclassified')), 0),
      min(first_recorded_at),
      max(last_recorded_at)
    FROM observations
    WHERE section IN ('profile','writing','demos','photography','other')
      AND path IS NOT NULL
    GROUP BY bucket_date, section, path;

    refreshed_at := clock_timestamp();
    UPDATE public.analytics_site_action_summary_status
    SET initialized_at = coalesce(initialized_at, refreshed_at),
        last_successful_at = refreshed_at,
        summary_cutoff_at = summary_cutoff,
        last_error_at = NULL,
        last_error_code = NULL
    WHERE report_name = 'site_actions';

    RETURN jsonb_build_object('ok', true, 'refreshed_at', refreshed_at);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS failure_code = RETURNED_SQLSTATE;
    UPDATE public.analytics_site_action_summary_status
    SET last_error_at = clock_timestamp(), last_error_code = failure_code
    WHERE report_name = 'site_actions';
    RETURN jsonb_build_object('ok', false, 'error_code', failure_code);
  END;
END;
$$;
REVOKE ALL ON FUNCTION analytics_private.refresh_site_action_summaries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.refresh_site_action_summaries() TO service_role;
COMMENT ON FUNCTION analytics_private.refresh_site_action_summaries() IS
  'Fixed-path atomic reconciliation. The status receipt advances only after stored summaries are rebuilt.';

CREATE OR REPLACE FUNCTION public.analytics_site_actions(
  p_period integer DEFAULT 30,
  p_section text DEFAULT 'all',
  p_page integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  output jsonb;
  status_row public.analytics_site_action_summary_status%ROWTYPE;
  end_date date := (now() AT TIME ZONE 'UTC')::date - 1;
  start_date date;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_period NOT IN (7,30,90)
    OR p_section NOT IN ('all','profile','writing','demos','photography','other')
    OR p_page NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'invalid report scope' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO status_row
  FROM public.analytics_site_action_summary_status
  WHERE report_name = 'site_actions';
  IF NOT FOUND OR status_row.last_successful_at IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'Action summaries have not completed their first refresh. This is not a report of zero activity.'
    );
  END IF;

  -- A snapshot from before midnight cannot certify the rest of that day.
  end_date := least(end_date, (status_row.summary_cutoff_at AT TIME ZONE 'UTC')::date - 1);
  start_date := end_date - p_period + 1;
  WITH scoped AS (
    SELECT *
    FROM public.analytics_site_action_daily
    WHERE p_section = 'all' OR section = p_section
  ), current_pages AS (
    SELECT
      path,
      section,
      coalesce(sum(page_views), 0) AS views,
      jsonb_strip_nulls(jsonb_build_object(
        'page_views', nullif(sum(page_views), 0),
        'contact_clicks', nullif(sum(contact_clicks), 0),
        'external_clicks', nullif(sum(external_clicks), 0),
        'reading_90', nullif(sum(reading_90), 0),
        'active_30', nullif(sum(active_30), 0),
        'demo_last_section', nullif(sum(demo_last_section), 0)
      )) AS measures
    FROM scoped
    WHERE bucket_date BETWEEN start_date AND end_date
      AND page_views + contact_clicks + external_clicks + reading_90 + active_30 + demo_last_section > 0
    GROUP BY path, section
  ), page_info AS (
    SELECT greatest(1, ceil(count(*) / 8.0)::integer) AS page_count
    FROM current_pages
  ), page_window AS (
    SELECT least(p_page, greatest(0, page_count - 1)) AS page, page_count
    FROM page_info
  ), current_totals AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'page_views', nullif(sum(page_views), 0),
      'contact_clicks', nullif(sum(contact_clicks), 0),
      'external_clicks', nullif(sum(external_clicks), 0),
      'reading_90', nullif(sum(reading_90), 0),
      'active_30', nullif(sum(active_30), 0),
      'demo_last_section', nullif(sum(demo_last_section), 0)
    )) AS totals
    FROM scoped WHERE bucket_date BETWEEN start_date AND end_date
  ), previous_totals AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'page_views', nullif(sum(page_views), 0),
      'contact_clicks', nullif(sum(contact_clicks), 0),
      'external_clicks', nullif(sum(external_clicks), 0),
      'reading_90', nullif(sum(reading_90), 0),
      'active_30', nullif(sum(active_30), 0),
      'demo_last_section', nullif(sum(demo_last_section), 0)
    )) AS totals
    FROM scoped WHERE bucket_date BETWEEN start_date - p_period AND start_date - 1
  ), today_totals AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'page_views', nullif(sum(page_views), 0),
      'contact_clicks', nullif(sum(contact_clicks), 0),
      'external_clicks', nullif(sum(external_clicks), 0),
      'reading_90', nullif(sum(reading_90), 0),
      'active_30', nullif(sum(active_30), 0),
      'demo_last_section', nullif(sum(demo_last_section), 0)
    )) AS totals
    FROM scoped WHERE bucket_date = (now() AT TIME ZONE 'UTC')::date
      AND (status_row.summary_cutoff_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
  )
  SELECT jsonb_build_object(
    'available', true,
    'start', start_date,
    'end', end_date,
    'firstRecordedAt', (SELECT min(first_recorded_at) FROM scoped),
    'excludedEvents', coalesce((SELECT sum(excluded_events) FROM scoped WHERE bucket_date BETWEEN start_date AND end_date), 0),
    'totals', coalesce((SELECT totals FROM current_totals), '{}'::jsonb),
    'previousTotals', coalesce((SELECT totals FROM previous_totals), '{}'::jsonb),
    'todayTotals', coalesce((SELECT totals FROM today_totals), '{}'::jsonb),
    'recordedSections', coalesce((SELECT jsonb_agg(DISTINCT section ORDER BY section) FROM scoped WHERE bucket_date <= end_date), '[]'::jsonb),
    'page', (SELECT page FROM page_window),
    'pageCount', (SELECT page_count FROM page_window),
    'pages', coalesce((
      SELECT jsonb_agg(jsonb_build_object('path', path, 'section', section, 'measures', measures) ORDER BY views DESC, path, section)
      FROM (
        SELECT p.path, p.section, p.measures, p.views
        FROM current_pages p CROSS JOIN page_window w
        ORDER BY p.views DESC, p.path, p.section
        LIMIT 8 OFFSET ((SELECT page FROM page_window) * 8)
      ) page_rows
    ), '[]'::jsonb),
    'freshness', jsonb_build_object(
      'status', CASE WHEN status_row.last_error_at > status_row.last_successful_at
        OR status_row.last_successful_at < statement_timestamp() - interval '45 minutes' THEN 'stale' ELSE 'current' END,
      'refreshedAt', status_row.last_successful_at,
      'todayAvailable', (status_row.summary_cutoff_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date,
      'completedThrough', end_date,
      'summaryCutoffAt', status_row.summary_cutoff_at,
      'lastFailureAt', CASE WHEN status_row.last_error_at > status_row.last_successful_at THEN status_row.last_error_at ELSE NULL END
    )
  ) INTO output;
  RETURN output;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_site_actions(integer,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_site_actions(integer,text,integer) TO service_role;
COMMENT ON FUNCTION public.analytics_site_actions(integer,text,integer) IS
  'Reads only identifier-free stored UTC summaries. The refresh cutoff, not the current time, bounds today partial totals.';

SELECT cron.unschedule('analytics-site-action-summary-refresh')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-site-action-summary-refresh');
SELECT cron.schedule(
  'analytics-site-action-summary-refresh',
  '7,37 * * * *',
  $$SELECT analytics_private.refresh_site_action_summaries();$$
);

NOTIFY pgrst, 'reload schema';
COMMIT;
