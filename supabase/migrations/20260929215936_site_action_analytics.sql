-- Public-site actions share the private collector, consent rules and durable outbox.
BEGIN;
ALTER TABLE public.analytics_events_v2 DROP CONSTRAINT analytics_events_v2_event_name_check;
ALTER TABLE public.analytics_events_v2 ADD CONSTRAINT analytics_events_v2_event_name_check CHECK(event_name IN ('gallery_page_viewed','album_exposed','album_opened','photo_exposed','photo_opened','photo_rendered','photo_load_failed','favorite_added','favorite_removed','share_action','download_requested','download_item_requested','download_item_prepared','download_prepared','download_handed_off','download_failed','download_cancelled','search_submitted','search_results_shown','search_failed','search_result_selected','filters_applied','experiment_exposed','site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed'));
CREATE INDEX analytics_site_actions_date_idx ON public.analytics_events_v2 (occurred_at, (properties->>'site_section')) WHERE event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed');
CREATE OR REPLACE FUNCTION analytics_private.prune_events_v2_at(run_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('analytics-v2-prune'));
 WITH candidates AS MATERIALIZED (
  SELECT e.*, CASE WHEN e.traffic_context <> 'audience' THEN e.traffic_context ELSE coalesce(c.classification,e.traffic_context) END AS effective_context
  FROM public.analytics_events_v2 e LEFT JOIN LATERAL (SELECT classification FROM public.analytics_event_v2_classifications c WHERE c.event_id=e.event_id ORDER BY classification_version DESC LIMIT 1) c ON true
  WHERE e.received_at < run_at-interval '90 days'
 ), removed AS (
  DELETE FROM public.analytics_events_v2 e USING candidates c WHERE e.event_id=c.event_id RETURNING e.event_id
 ), grouped AS (
  SELECT (occurred_at AT TIME ZONE CASE WHEN event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed') THEN 'UTC' ELSE 'America/Chicago' END)::date AS bucket_date,event_name,effective_context AS traffic_context,album_key,photo_id,
   jsonb_strip_nulls(jsonb_build_object('album_sport',properties->'album_sport','event_date',properties->'event_date','photo_category',properties->'photo_category','tagged_source',properties->'tagged_source','surface',properties->'surface','mode',properties->'mode','outcome',properties->'outcome','content_kind',properties->'content_kind','site_section',properties->'site_section','canonical_path',properties->'canonical_path','target_kind',properties->'target_kind','target_path',properties->'target_path','threshold',properties->'threshold','position',properties->'position','section_count',properties->'section_count')) AS dimensions,
   count(*) AS event_count,count(*) FILTER(WHERE export_eligible) AS export_eligible_count,max(occurred_at) AS last_recorded_at
  FROM candidates WHERE event_id IN (SELECT event_id FROM removed) GROUP BY 1,2,3,4,5,6
 ) INSERT INTO public.analytics_v2_archived_totals SELECT * FROM grouped
 ON CONFLICT(bucket_date,event_name,traffic_context,album_key,photo_id,dimensions)
 DO UPDATE SET event_count=analytics_v2_archived_totals.event_count+EXCLUDED.event_count,
 export_eligible_count=analytics_v2_archived_totals.export_eligible_count+EXCLUDED.export_eligible_count,
 last_recorded_at=greatest(analytics_v2_archived_totals.last_recorded_at,EXCLUDED.last_recorded_at);
 -- Outbox rows cascade with expired raw records. Confirmed delivery receipts have
 -- no further recovery job; keep seven days for inspection before removing them.
 DELETE FROM public.analytics_posthog_outbox WHERE status='confirmed' AND confirmed_at<run_at-interval '7 days';
END $$;
REVOKE ALL ON FUNCTION analytics_private.prune_events_v2_at(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.prune_events_v2_at(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_site_actions(p_period integer DEFAULT 30, p_section text DEFAULT 'all', p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE output jsonb; end_date date := (now() AT TIME ZONE 'UTC')::date - 1; start_date date;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 IF p_period NOT IN (7,30,90) OR p_section NOT IN ('all','profile','writing','demos','photography','other') OR p_page NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'invalid report scope' USING ERRCODE='22023'; END IF;
 start_date := end_date - p_period + 1;
 WITH observations AS (
  SELECT (e.occurred_at AT TIME ZONE 'UTC')::date AS day,e.event_name,e.properties AS dimensions,
    CASE WHEN e.traffic_context <> 'audience' THEN e.traffic_context ELSE coalesce(c.classification,e.traffic_context) END AS context,1::bigint AS count,e.occurred_at AS recorded_at
  FROM public.analytics_events_v2 e
  LEFT JOIN LATERAL (SELECT classification FROM public.analytics_event_v2_classifications c WHERE c.event_id=e.event_id ORDER BY classification_version DESC LIMIT 1) c ON true
  WHERE e.event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
  UNION ALL SELECT bucket_date,event_name,dimensions,traffic_context,event_count,last_recorded_at FROM public.analytics_v2_archived_totals
  WHERE event_name IN ('site_page_viewed','site_link_clicked','content_progressed','content_active_time','demo_section_viewed')
 ), scoped AS (
  SELECT *, dimensions->>'canonical_path' AS path,dimensions->>'site_section' AS section,
   CASE WHEN event_name='site_page_viewed' THEN 'page_views'
    WHEN event_name='site_link_clicked' AND dimensions->>'target_kind' IN ('email','phone') THEN 'contact_clicks'
    WHEN event_name='site_link_clicked' AND dimensions->>'target_kind'='external' THEN 'external_clicks'
    WHEN event_name='content_progressed' AND dimensions->>'threshold'='90' THEN 'reading_90'
    WHEN event_name='content_active_time' AND dimensions->>'threshold'='30' THEN 'active_30'
    WHEN event_name='demo_section_viewed' AND dimensions->>'position'=dimensions->>'section_count' THEN 'demo_last_section'
    ELSE NULL END AS metric
  FROM observations WHERE p_section='all' OR dimensions->>'site_section'=p_section
 ), counts AS (
  SELECT path,section,metric,sum(count) AS count FROM scoped WHERE context IN ('audience','unclassified') AND day BETWEEN start_date AND end_date AND metric IS NOT NULL
  GROUP BY path,section,metric
 ), pages AS (
  SELECT path,section,jsonb_object_agg(metric,count) AS measures,coalesce(sum(count) FILTER(WHERE metric='page_views'),0) AS views FROM counts GROUP BY path,section
 ), current_totals AS (SELECT metric,sum(count) AS count FROM counts GROUP BY metric), previous_totals AS (
  SELECT metric,sum(count) AS count FROM scoped WHERE context IN ('audience','unclassified') AND day BETWEEN start_date-p_period AND start_date-1 AND metric IS NOT NULL GROUP BY metric
 ) SELECT jsonb_build_object(
  'start',start_date,'end',end_date,'firstRecordedAt',(SELECT min(recorded_at) FROM scoped),
  'excludedEvents',coalesce((SELECT sum(count) FROM scoped WHERE context NOT IN ('audience','unclassified') AND day BETWEEN start_date AND end_date),0),
  'totals',coalesce((SELECT jsonb_object_agg(metric,count) FROM current_totals),'{}'),
  'previousTotals',coalesce((SELECT jsonb_object_agg(metric,count) FROM previous_totals),'{}'),
  'todayTotals',coalesce((SELECT jsonb_object_agg(metric,count) FROM (SELECT metric,sum(count) AS count FROM scoped WHERE context IN ('audience','unclassified') AND day=end_date+1 AND metric IS NOT NULL GROUP BY metric) t),'{}'),
  'recordedSections',coalesce((SELECT jsonb_agg(DISTINCT section) FROM scoped WHERE day<=end_date),'[]'),
  'page',least(p_page,greatest(0,ceil((SELECT count(*) FROM pages)/8.0)::int-1)),
  'pageCount',greatest(1,ceil((SELECT count(*) FROM pages)/8.0)::int),
  'pages',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT path,section,measures FROM pages ORDER BY views DESC,path LIMIT 8 OFFSET least(p_page,greatest(0,ceil((SELECT count(*) FROM pages)/8.0)::int-1))*8) p),'[]')
 ) INTO output;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.analytics_site_actions(integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_site_actions(integer,text,integer) TO service_role;
COMMENT ON FUNCTION public.analytics_site_actions(integer,text,integer) IS 'Identifier-free action counts, complete UTC days. Excludes operator/test/browser exclusions and latest bot classifications. Ratios of observations are not conversion funnels.';
-- The report needs distinct album/category pairs, not every photo in the library.
CREATE OR REPLACE FUNCTION public.analytics_category_facets()
RETURNS TABLE(album_key text,photo_category text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public
AS $$ SELECT DISTINCT p.album_key,p.photo_category FROM public.photo_metadata p $$;
REVOKE ALL ON FUNCTION public.analytics_category_facets() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_category_facets() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
