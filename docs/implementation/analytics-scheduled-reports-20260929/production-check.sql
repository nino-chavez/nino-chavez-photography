BEGIN READ ONLY;
SET LOCAL ROLE service_role;
DO $check$
DECLARE payload jsonb; expected bigint; days integer;
BEGIN
  FOREACH days IN ARRAY ARRAY[30,90] LOOP
    payload := public.analytics_read_scheduled_gallery_report(((now() AT TIME ZONE 'America/Chicago')::date-days),((now() AT TIME ZONE 'America/Chicago')::date-1),'photo_opens','all',ARRAY[]::text[],p_public_only=>true,p_photo_page_size=>12);
    SELECT coalesce(sum(d.action_count),0) INTO expected
    FROM public.analytics_daily_actions d
    JOIN public.albums a USING(album_key)
    LEFT JOIN public.album_settings s USING(album_key)
    WHERE d.bucket_date BETWEEN ((now() AT TIME ZONE 'America/Chicago')::date-days) AND ((now() AT TIME ZONE 'America/Chicago')::date-1)
      AND d.event_type='view' AND d.photo_id<>'' AND d.traffic_classification IN ('audience','unclassified')
      AND coalesce(s.visibility,'public')<>'unlisted'
      AND (d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key));
    IF (payload->>'observedTotal')::bigint <> expected THEN RAISE EXCEPTION 'Gallery % day total mismatch',days; END IF;
    IF jsonb_array_length(payload->'photos')>12 THEN RAISE EXCEPTION 'Gallery page over limit'; END IF;
    IF payload::text ~ '"(session_hash|anonymous_browser_id|visit_id|search_query)"' THEN RAISE EXCEPTION 'Identifier in aggregate'; END IF;
  END LOOP;
  payload := public.analytics_site_actions(30,'all',0);
  IF (payload->>'available')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Site summary unavailable'; END IF;
  IF payload->'freshness'->>'status'<>'current' THEN RAISE EXCEPTION 'Site summary stale'; END IF;
  IF jsonb_array_length(payload->'pages')>8 THEN RAISE EXCEPTION 'Site page over limit'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','analytics_private') AND p.proname IN ('analytics_read_scheduled_gallery_report','analytics_count_scheduled_gallery_browsers','analytics_site_actions','refresh_site_action_summaries','reconcile_current_gallery_day') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Public execution enabled'; END IF;
END $check$;
WITH report AS (SELECT public.analytics_read_scheduled_gallery_report(((now() AT TIME ZONE 'America/Chicago')::date-30),((now() AT TIME ZONE 'America/Chicago')::date-1),'photo_opens','all',ARRAY[]::text[],p_public_only=>true,p_photo_page_size=>12) AS r)
SELECT jsonb_build_object('checks','passed','gallery',jsonb_build_object('coverage',r->'coverage','total',r->'total','photosOnPage',jsonb_array_length(r->'photos'),'pagination',r->'photoPagination','today',r->'today','dataAsOf',r->'dataAsOf'),'sites',public.analytics_site_actions(30,'all',0)) AS verification FROM report;
ROLLBACK;
