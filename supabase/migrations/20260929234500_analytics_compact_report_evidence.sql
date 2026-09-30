-- Compact wire format for the existing evidence contract. Counts, snapshots,
-- traffic classifications and Chicago coverage semantics are unchanged.
-- Review and rehearse before applying to production.
BEGIN;
CREATE OR REPLACE FUNCTION public.analytics_read_report_evidence_compact(
  p_start date,
  p_end date
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER STABLE
SET search_path = pg_catalog, public, analytics_private AS $$
  WITH clock AS (
    SELECT statement_timestamp() AS cutoff,
      (statement_timestamp() AT TIME ZONE 'America/Chicago')::date AS today
  ), live_rows AS (
    SELECT min(e.id) AS id, clock.today AS bucket_date,
      coalesce(e.resolved_album_key, '') AS album_key, coalesce(e.photo_id, '') AS photo_id,
      e.event_type, coalesce(e.source, 'direct') AS source, e.resolved_source_kind AS source_kind,
      e.snapshot_sport AS sport, e.snapshot_event_date AS event_date,
      e.snapshot_album_event_type AS album_event_type, e.snapshot_publication_at AS publication_at,
      e.snapshot_photo_category AS photo_category, e.effective_classification AS traffic_classification,
      e.effective_classification_version AS classification_version, e.catalogue_basis,
      1 AS definition_version, 'partial'::text AS coverage_state, count(*) AS action_count,
      max(e.created_at) AS latest_event_at, clock.cutoff AS reconciled_at
    FROM analytics_private.effective_engagement_events e CROSS JOIN clock
    WHERE clock.today BETWEEN p_start AND p_end
      AND e.created_at >= clock.today::timestamp AT TIME ZONE 'America/Chicago'
      AND e.created_at < clock.cutoff
    GROUP BY clock.today, clock.cutoff, e.resolved_album_key, e.photo_id, e.event_type,
      e.source, e.resolved_source_kind, e.snapshot_sport, e.snapshot_event_date,
      e.snapshot_album_event_type, e.snapshot_publication_at, e.snapshot_photo_category,
      e.effective_classification, e.effective_classification_version, e.catalogue_basis
  ), evidence_rows AS (
    SELECT actions.bucket_date, actions.album_key, actions.photo_id, actions.event_type, actions.source, actions.source_kind, actions.sport, actions.event_date, actions.album_event_type, actions.publication_at, actions.photo_category, actions.traffic_classification, actions.action_count, actions.coverage_state, actions.latest_event_at FROM public.analytics_daily_actions actions CROSS JOIN clock
    WHERE actions.bucket_date BETWEEN p_start AND p_end AND actions.bucket_date <> clock.today
    UNION ALL SELECT live_rows.bucket_date, live_rows.album_key, live_rows.photo_id, live_rows.event_type, live_rows.source, live_rows.source_kind, live_rows.sport, live_rows.event_date, live_rows.album_event_type, live_rows.publication_at, live_rows.photo_category, live_rows.traffic_classification, live_rows.action_count, live_rows.coverage_state, live_rows.latest_event_at FROM live_rows
  ), evidence_coverage AS (
    SELECT to_jsonb(coverage)-'notes' AS payload FROM public.analytics_daily_coverage coverage CROSS JOIN clock
    WHERE coverage.bucket_date BETWEEN p_start AND p_end AND coverage.bucket_date <> clock.today
    UNION ALL
    SELECT jsonb_build_object('bucket_date',clock.today,'cutoff_at',clock.cutoff,
      'raw_window_start',clock.today::timestamp AT TIME ZONE 'America/Chicago',
      'raw_window_end',clock.cutoff,'coverage_state','partial','definition_version',1,
      'reconciled_at',clock.cutoff,'frozen_at',NULL,
      'catalogue_basis',CASE WHEN (SELECT count(DISTINCT catalogue_basis) FROM live_rows)>1 THEN 'mixed'
        ELSE coalesce((SELECT min(catalogue_basis) FROM live_rows),'event_snapshot') END)
    FROM clock WHERE clock.today BETWEEN p_start AND p_end
  )
  SELECT jsonb_build_object(
    'columns',jsonb_build_array('bucket_date', 'album_key', 'photo_id', 'event_type', 'source', 'source_kind', 'sport', 'event_date', 'album_event_type', 'publication_at', 'photo_category', 'traffic_classification', 'action_count', 'coverage_state', 'latest_event_at'),
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_array(bucket_date, album_key, photo_id, event_type, source, source_kind, sport, event_date, album_event_type, publication_at, photo_category, traffic_classification, action_count, coverage_state, latest_event_at) ORDER BY bucket_date,album_key,photo_id,event_type,source,traffic_classification) FROM evidence_rows),'[]'::jsonb),
    'coverage',coalesce((SELECT jsonb_agg(payload ORDER BY payload->>'bucket_date') FROM evidence_coverage),'[]'::jsonb)
  ) WHERE p_start <= p_end;
$$;
REVOKE ALL ON FUNCTION public.analytics_read_report_evidence_compact(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_read_report_evidence_compact(date,date) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
