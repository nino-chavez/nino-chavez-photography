-- Synthetic only. Run after analytics_scheduled_site_reports; all data rolls back.
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  profile_before jsonb;
  profile_after jsonb;
  writing_after jsonb;
  demos_after jsonb;
  current_page bigint;
  previous_page bigint;
  today_page bigint;
  summary_once jsonb;
  summary_twice jsonb;
  failed_refresh jsonb;
  success_before_failure timestamptz;
  suffix text := 'scheduled-site-summary';
  browser_id uuid := gen_random_uuid();
  visit_id uuid := gen_random_uuid();
  classified_id uuid := gen_random_uuid();
  revoked_id uuid := gen_random_uuid();
  expired_id uuid := gen_random_uuid();
  i integer;
BEGIN
  PERFORM analytics_private.refresh_site_action_summaries();
  profile_before := public.analytics_site_actions(7, 'profile', 0);

  -- Raw fixtures cover every site metric; archived fixture proves the refresh
  -- reconciles both sources without making request-time reads scan either source.
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', gen_random_uuid(), 'schema_version', 2, 'event_name', 'site_page_viewed',
    'occurred_at', now() - interval '1 day', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','profile','canonical_path','/work/' || suffix || '-profile','view_id',gen_random_uuid(),'layout_class','wide','content_kind','page')
  ));
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', gen_random_uuid(), 'schema_version', 2, 'event_name', 'site_link_clicked',
    'occurred_at', now() - interval '1 day', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','profile','canonical_path','/work/' || suffix || '-profile','view_id',gen_random_uuid(),'target_kind','email')
  ));
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', gen_random_uuid(), 'schema_version', 2, 'event_name', 'site_link_clicked',
    'occurred_at', now() - interval '1 day', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','profile','canonical_path','/work/' || suffix || '-profile','view_id',gen_random_uuid(),'target_kind','external','target_path','/links')
  ));
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', gen_random_uuid(), 'schema_version', 2, 'event_name', 'content_progressed',
    'occurred_at', now() - interval '1 day', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','writing','canonical_path','/blog/' || suffix,'view_id',gen_random_uuid(),'threshold',90)
  ));
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', gen_random_uuid(), 'schema_version', 2, 'event_name', 'content_active_time',
    'occurred_at', now() - interval '1 day', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','writing','canonical_path','/blog/' || suffix,'view_id',gen_random_uuid(),'threshold',30)
  ));
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', gen_random_uuid(), 'schema_version', 2, 'event_name', 'demo_section_viewed',
    'occurred_at', now() - interval '1 day', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','demos','canonical_path','/demos/' || suffix,'view_id',gen_random_uuid(),'position',3,'section_count',3)
  ));
  INSERT INTO public.analytics_v2_archived_totals(
    bucket_date,event_name,traffic_context,album_key,photo_id,dimensions,event_count,export_eligible_count,last_recorded_at
  ) VALUES (
    ((now() AT TIME ZONE 'UTC')::date - 2), 'site_page_viewed', 'audience', NULL, NULL,
    jsonb_build_object('site_section','profile','canonical_path','/work/' || suffix || '-profile','content_kind','page','layout_class','wide'),
    3, 0, now() - interval '2 days'
  );
  PERFORM analytics_private.refresh_site_action_summaries();
  profile_after := public.analytics_site_actions(7, 'profile', 0);
  writing_after := public.analytics_site_actions(7, 'writing', 0);
  demos_after := public.analytics_site_actions(7, 'demos', 0);
  IF coalesce((profile_after->'totals'->>'page_views')::bigint, 0) <> coalesce((profile_before->'totals'->>'page_views')::bigint, 0) + 4
    OR coalesce((profile_after->'totals'->>'contact_clicks')::bigint, 0) <> coalesce((profile_before->'totals'->>'contact_clicks')::bigint, 0) + 1
    OR coalesce((profile_after->'totals'->>'external_clicks')::bigint, 0) <> coalesce((profile_before->'totals'->>'external_clicks')::bigint, 0) + 1
    OR coalesce((writing_after->'totals'->>'reading_90')::bigint, 0) < 1
    OR coalesce((writing_after->'totals'->>'active_30')::bigint, 0) < 1
    OR coalesce((demos_after->'totals'->>'demo_last_section')::bigint, 0) < 1 THEN
    RAISE EXCEPTION 'stored summary lost one of the six site metrics or archived parity';
  END IF;

  -- Current/prior/today boundaries are UTC dates, and today stops at the refresh cutoff.
  SELECT coalesce(sum(page_views), 0) INTO current_page
  FROM public.analytics_site_action_daily
  WHERE section = 'profile'
    AND bucket_date BETWEEN ((now() AT TIME ZONE 'UTC')::date - 7) AND ((now() AT TIME ZONE 'UTC')::date - 1);
  SELECT coalesce(sum(page_views), 0) INTO previous_page
  FROM public.analytics_site_action_daily
  WHERE section = 'profile'
    AND bucket_date BETWEEN ((now() AT TIME ZONE 'UTC')::date - 14) AND ((now() AT TIME ZONE 'UTC')::date - 8);
  SELECT coalesce(sum(page_views), 0) INTO today_page
  FROM public.analytics_site_action_daily
  WHERE section = 'profile' AND bucket_date = (now() AT TIME ZONE 'UTC')::date;
  IF coalesce((profile_after->'totals'->>'page_views')::bigint, 0) <> current_page
    OR coalesce((profile_after->'previousTotals'->>'page_views')::bigint, 0) <> previous_page
    OR coalesce((profile_after->'todayTotals'->>'page_views')::bigint, 0) <> today_page THEN
    RAISE EXCEPTION 'UTC period boundary changed';
  END IF;

  -- A later classification and a consent revocation remove retained audience rows.
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', classified_id, 'schema_version', 2, 'event_name', 'site_page_viewed',
    'occurred_at', now() - interval '1 day', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','profile','canonical_path','/work/' || suffix || '-classified','view_id',gen_random_uuid(),'layout_class','wide','content_kind','page')
  ));
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', revoked_id, 'schema_version', 2, 'event_name', 'site_page_viewed',
    'occurred_at', now() - interval '1 day', 'anonymous_browser_id', browser_id, 'visit_id', visit_id,
    'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','profile','canonical_path','/work/' || suffix || '-revoked','view_id',gen_random_uuid(),'layout_class','wide','content_kind','page')
  ));
  PERFORM analytics_private.refresh_site_action_summaries();
  PERFORM public.analytics_record_event_v2_classification(classified_id, 'suspected_automation', 'Synthetic refresh correction', gen_random_uuid());
  PERFORM public.analytics_revoke_browser_exports_v2(browser_id);
  PERFORM analytics_private.refresh_site_action_summaries();
  IF EXISTS (
    SELECT 1 FROM public.analytics_site_action_daily
    WHERE path IN ('/work/' || suffix || '-classified','/work/' || suffix || '-revoked') AND page_views <> 0
  ) OR (SELECT coalesce(sum(excluded_events), 0) FROM public.analytics_site_action_daily WHERE path IN ('/work/' || suffix || '-classified','/work/' || suffix || '-revoked')) <> 2 THEN
    RAISE EXCEPTION 'latest correction or consent revocation was not reflected';
  END IF;

  -- Raw expiry moves an observation to archive exactly once; retrying prune and refresh does not add it again.
  PERFORM public.analytics_accept_event_v2(jsonb_build_object(
    'event_id', expired_id, 'schema_version', 2, 'event_name', 'site_page_viewed',
    'occurred_at', now() - interval '91 days', 'traffic_context', 'audience', 'export_eligible', false,
    'properties', jsonb_build_object('site_section','profile','canonical_path','/work/' || suffix || '-expired','view_id',gen_random_uuid(),'layout_class','wide','content_kind','page')
  ));
  UPDATE public.analytics_events_v2 SET received_at = now() - interval '91 days' WHERE event_id = expired_id;
  PERFORM analytics_private.prune_events_v2_at(now());
  PERFORM analytics_private.refresh_site_action_summaries();
  IF (SELECT page_views FROM public.analytics_site_action_daily WHERE path = '/work/' || suffix || '-expired') <> 1 THEN
    RAISE EXCEPTION 'raw expiry did not preserve stored page count';
  END IF;
  PERFORM analytics_private.prune_events_v2_at(now());
  PERFORM analytics_private.refresh_site_action_summaries();
  IF (SELECT page_views FROM public.analytics_site_action_daily WHERE path = '/work/' || suffix || '-expired') <> 1 THEN
    RAISE EXCEPTION 'prune or refresh retry duplicated a stored observation';
  END IF;

  -- Nine equal high-count pages exercise page size, stable path tie-breaks and clamping.
  FOR i IN 1..9 LOOP
    INSERT INTO public.analytics_v2_archived_totals(
      bucket_date,event_name,traffic_context,album_key,photo_id,dimensions,event_count,export_eligible_count,last_recorded_at
    ) VALUES (
      ((now() AT TIME ZONE 'UTC')::date - 2), 'site_page_viewed', 'audience', NULL, NULL,
      jsonb_build_object('site_section','other','canonical_path',format('/work/%s-page-%s',suffix,lpad(i::text,2,'0')),'content_kind','page','layout_class','wide'),
      100000, 0, now() - interval '2 days'
    );
  END LOOP;
  PERFORM analytics_private.refresh_site_action_summaries();
  profile_after := public.analytics_site_actions(7, 'other', 0);
  IF jsonb_array_length(profile_after->'pages') <> 8
    OR profile_after->'pages'->0->>'path' <> '/work/' || suffix || '-page-01'
    OR profile_after->'pages'->7->>'path' <> '/work/' || suffix || '-page-08'
    OR (public.analytics_site_actions(7, 'other', 1000)->>'page')::integer <> (profile_after->>'pageCount')::integer - 1 THEN
    RAISE EXCEPTION 'stored page ordering, size, or clamp changed';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.bucket_date,d.section,d.path), '[]'::jsonb) INTO summary_once
  FROM public.analytics_site_action_daily d WHERE d.path LIKE '/work/' || suffix || '%';
  PERFORM analytics_private.refresh_site_action_summaries();
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.bucket_date,d.section,d.path), '[]'::jsonb) INTO summary_twice
  FROM public.analytics_site_action_daily d WHERE d.path LIKE '/work/' || suffix || '%';
  IF summary_once <> summary_twice THEN RAISE EXCEPTION 'second refresh changed unchanged source rows'; END IF;

  SELECT last_successful_at INTO success_before_failure
  FROM public.analytics_site_action_summary_status WHERE report_name = 'site_actions';
  PERFORM set_config('analytics.site_actions_refresh_force_failure', 'on', true);
  failed_refresh := analytics_private.refresh_site_action_summaries();
  PERFORM set_config('analytics.site_actions_refresh_force_failure', 'off', true);
  IF (failed_refresh->>'ok')::boolean
    OR (SELECT last_successful_at FROM public.analytics_site_action_summary_status WHERE report_name = 'site_actions') <> success_before_failure
    OR (SELECT last_error_at > last_successful_at FROM public.analytics_site_action_summary_status WHERE report_name = 'site_actions') IS NOT TRUE THEN
    RAISE EXCEPTION 'failed refresh advanced freshness or did not leave stale status';
  END IF;

  IF profile_after::text ~ '(view_id|visit_id|anonymous_browser_id|event_id)' THEN
    RAISE EXCEPTION 'site summary payload leaked an identifier';
  END IF;
  UPDATE public.analytics_site_action_summary_status
  SET initialized_at = NULL, last_successful_at = NULL, summary_cutoff_at = NULL, last_error_at = NULL, last_error_code = NULL
  WHERE report_name = 'site_actions';
  IF (public.analytics_site_actions(7, 'profile', 0)->>'available')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'absent initial summary appeared as measured zeros';
  END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM * FROM public.analytics_site_action_daily LIMIT 1; RAISE EXCEPTION 'anonymous summary table access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.analytics_site_action_summary_status LIMIT 1; RAISE EXCEPTION 'anonymous summary status access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.analytics_site_actions(); RAISE EXCEPTION 'anonymous site summary RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM analytics_private.refresh_site_action_summaries(); RAISE EXCEPTION 'anonymous refresh allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE report jsonb; wall_today date := (now() AT TIME ZONE 'UTC')::date; BEGIN
 UPDATE analytics_site_action_summary_status SET summary_cutoff_at=wall_today::timestamp AT TIME ZONE 'UTC' - interval '1 hour', last_successful_at=now()-interval '2 hours',last_error_at=NULL WHERE report_name='site_actions';
 report:=analytics_site_actions(7,'profile',0);
 IF (report->>'end')::date<>wall_today-2 OR (report->'freshness'->>'todayAvailable')::boolean OR report->'freshness'->>'status'<>'stale' THEN RAISE EXCEPTION 'midnight or overdue freshness is false'; END IF;
 IF report->'todayTotals'<>'{}'::jsonb THEN RAISE EXCEPTION 'yesterday snapshot reported a today zero'; END IF;
END $$;
ROLLBACK;
