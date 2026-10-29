-- Dedicated synthetic rehearsal database only. Rolled back with everything else.
-- A frozen, verbatim copy of public.analytics_read_launch as 20261006180000 created it (lines 75-280 of that
-- file, renamed, nothing else changed). 20261006210000 rebuilds the live function on
-- public.analytics_read_launches; launch-assertions.sql compares the two on every fixture and
-- argument. Generated from the migration: do not edit by hand. A temporary function lives only for
-- this session, so nothing here is installed anywhere.
SET LOCAL statement_timeout = '30s';
CREATE FUNCTION pg_temp.analytics_read_launch_v1(
 p_album_key text,
 p_as_of timestamptz DEFAULT now(),
 p_days integer DEFAULT 14,
 p_traffic text DEFAULT 'conservative',
 p_public_only boolean DEFAULT true,
 p_window_start date DEFAULT NULL,
 p_window_end date DEFAULT NULL,
 p_photo_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path=pg_catalog,public,analytics_private AS $$
DECLARE
 v_today date:=(p_as_of AT TIME ZONE 'America/Chicago')::date;
 v_h integer:=greatest(p_days,7);
 v_target record;
 v_dated boolean;
 v_d0 date;
 v_ws date; v_we date;
 v_exp_since date;
 v_result jsonb;
BEGIN
 IF p_album_key IS NULL OR p_as_of IS NULL THEN RAISE EXCEPTION 'album and as-of are required'; END IF;
 IF p_days IS NULL OR p_days<1 OR p_days>365 THEN RAISE EXCEPTION 'invalid launch days'; END IF;
 IF p_traffic IS NULL OR p_traffic NOT IN ('conservative','inclusive') THEN RAISE EXCEPTION 'invalid traffic option'; END IF;
 IF p_photo_limit IS NULL OR p_photo_limit<0 OR p_photo_limit>2000 THEN RAISE EXCEPTION 'invalid photo limit'; END IF;
 IF p_window_start IS NOT NULL AND p_window_end IS NOT NULL AND (p_window_end<p_window_start OR p_window_end-p_window_start+1>365) THEN RAISE EXCEPTION 'invalid window'; END IF;

 SELECT a.album_key,a.album_name,s.visibility,s.first_published_at fp,s.first_published_at_basis fb,s.first_published_at_evidence fe
  INTO v_target FROM public.albums a LEFT JOIN public.album_settings s ON s.album_key=a.album_key WHERE a.album_key=p_album_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown album' USING ERRCODE='23503'; END IF;
 v_dated:=v_target.fp IS NOT NULL;
 IF v_dated THEN
  v_d0:=(v_target.fp AT TIME ZONE 'America/Chicago')::date;
  v_ws:=v_d0; v_we:=least(v_d0+p_days-1,v_today-1);
 ELSE
  v_we:=least(coalesce(p_window_end,v_today-1),v_today);
  v_ws:=coalesce(p_window_start,coalesce(p_window_end,v_today-1)-p_days+1);
 END IF;

 -- First day version-2 exposure collection recorded anything, from raw and archived rows.
 SELECT min(d) INTO v_exp_since FROM (
  SELECT min((e.occurred_at AT TIME ZONE 'America/Chicago')::date) d FROM public.analytics_events_v2 e WHERE e.event_name IN ('photo_exposed','photo_rendered')
  UNION ALL
  SELECT min(t.bucket_date) FROM public.analytics_v2_archived_totals t WHERE t.event_name IN ('photo_exposed','photo_rendered')
 ) x;

 WITH
 launches AS (
  SELECT a.album_key,a.album_name,s.first_published_at fp,s.first_published_at_basis fb,
   (s.first_published_at AT TIME ZONE 'America/Chicago')::date d0,
   (NOT p_public_only OR s.visibility<>'unlisted') in_set
  FROM public.albums a JOIN public.album_settings s ON s.album_key=a.album_key
  WHERE s.first_published_at IS NOT NULL AND ((NOT p_public_only OR s.visibility<>'unlisted') OR a.album_key=p_album_key)
 ),
 -- One row per album and Chicago day up to today. Launch days count from day 0; an undated album
 -- has the requested window and no day number.
 grid AS (
  SELECT l.album_key,g.g AS day,l.d0+g.g AS bucket_date
  FROM launches l CROSS JOIN generate_series(0,v_h-1) AS g(g) WHERE l.d0+g.g<=v_today
  UNION ALL
  SELECT p_album_key,NULL::integer,g::date FROM generate_series(v_ws,v_we,interval '1 day') g
  WHERE NOT v_dated AND g::date<=v_today
 ),
 state AS (
  SELECT g.album_key,g.day,g.bucket_date,
   CASE WHEN g.bucket_date=v_today THEN CASE WHEN c.coverage_state IS NOT NULL THEN 'partial' ELSE 'unavailable' END
        ELSE coalesce(c.coverage_state,'unavailable') END coverage
  FROM grid g LEFT JOIN public.analytics_daily_coverage c ON c.bucket_date=g.bucket_date
 ),
 sums AS (
  SELECT g.album_key,g.bucket_date,
   sum(d.action_count) FILTER (WHERE d.event_type='view' AND d.photo_id<>'')::bigint po,
   sum(d.action_count) FILTER (WHERE d.event_type='download')::bigint dl,
   sum(d.action_count) FILTER (WHERE d.event_type='album_open' AND d.photo_id='')::bigint ao
  FROM grid g JOIN public.analytics_daily_actions d ON d.bucket_date=g.bucket_date AND d.album_key=g.album_key
  WHERE (p_traffic='inclusive' OR d.traffic_classification IN ('audience','unclassified'))
   AND (NOT p_public_only OR d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key))
  GROUP BY g.album_key,g.bucket_date
 ),
 cells AS (
  SELECT s.album_key,s.day,s.bucket_date,s.coverage,
   CASE WHEN s.coverage='complete' THEN coalesce(m.po,0) WHEN s.coverage='partial' THEN m.po END po,
   CASE WHEN s.coverage='complete' THEN coalesce(m.dl,0) WHEN s.coverage='partial' THEN m.dl END dl,
   CASE WHEN s.coverage='complete' THEN coalesce(m.ao,0) WHEN s.coverage='partial' THEN m.ao END ao
  FROM state s LEFT JOIN sums m ON m.album_key=s.album_key AND m.bucket_date=s.bucket_date
 ),
 tot AS (
  SELECT l.album_key,l.album_name,l.fp,l.fb,l.d0,l.in_set,
   v_today-l.d0 elapsed,
   (v_today-l.d0>=3) reached3,(v_today-l.d0>=7) reached7,
   (count(*) FILTER (WHERE c.day<3 AND c.bucket_date<v_today AND c.coverage='complete'))=3 ok3,
   (count(*) FILTER (WHERE c.day<7 AND c.bucket_date<v_today AND c.coverage='complete'))=7 ok7,
   sum(c.po) FILTER (WHERE c.day<3) po3,sum(c.dl) FILTER (WHERE c.day<3) dl3,sum(c.ao) FILTER (WHERE c.day<3) ao3,
   sum(c.po) FILTER (WHERE c.day<7) po7,sum(c.dl) FILTER (WHERE c.day<7) dl7,sum(c.ao) FILTER (WHERE c.day<7) ao7
  FROM launches l LEFT JOIN cells c ON c.album_key=l.album_key AND c.bucket_date<v_today
  GROUP BY l.album_key,l.album_name,l.fp,l.fb,l.d0,l.in_set
 ),
 totals AS (
  SELECT t.*,CASE WHEN ok3 THEN po3 END t_po3,CASE WHEN ok3 THEN dl3 END t_dl3,CASE WHEN ok3 THEN ao3 END t_ao3,
   CASE WHEN ok7 THEN po7 END t_po7,CASE WHEN ok7 THEN dl7 END t_dl7,CASE WHEN ok7 THEN ao7 END t_ao7
  FROM tot t
 ),
 r3 AS (
  SELECT album_key,rank() OVER (ORDER BY t_po3 DESC) rk,count(*) OVER () n,count(*) OVER (PARTITION BY t_po3) same
  FROM totals WHERE in_set AND t_po3 IS NOT NULL
 ),
 r7 AS (
  SELECT album_key,rank() OVER (ORDER BY t_po7 DESC) rk,count(*) OVER () n,count(*) OVER (PARTITION BY t_po7) same
  FROM totals WHERE in_set AND t_po7 IS NOT NULL
 ),
 launch_json AS (
  SELECT t.album_key,t.fp,t.in_set,jsonb_build_object(
   'albumKey',t.album_key,'albumName',t.album_name,'firstPublishedAt',t.fp,'basis',t.fb,
   'status',CASE WHEN t.elapsed<7 THEN 'in_progress' ELSE 'finished' END,
   'elapsedDays',greatest(t.elapsed,0),
   'series',coalesce((SELECT jsonb_agg(jsonb_build_object('day',c.day,'date',c.bucket_date,'photoOpens',c.po,'downloads',c.dl,'albumOpens',c.ao,'coverage',c.coverage) ORDER BY c.day)
     FROM cells c WHERE c.album_key=t.album_key AND c.bucket_date<v_today AND c.day<p_days),'[]'::jsonb),
   'currentDay',(SELECT jsonb_build_object('day',c.day,'date',c.bucket_date,'photoOpens',c.po,'downloads',c.dl,'albumOpens',c.ao,'coverage',c.coverage)
     FROM cells c WHERE c.album_key=t.album_key AND c.bucket_date=v_today AND c.day<p_days),
   'totals',jsonb_build_object(
    'day3',jsonb_build_object('reached',t.reached3,'complete',t.ok3,'photoOpens',t.t_po3,'downloads',t.t_dl3,'albumOpens',t.t_ao3),
    'day7',jsonb_build_object('reached',t.reached7,'complete',t.ok7,'photoOpens',t.t_po7,'downloads',t.t_dl7,'albumOpens',t.t_ao7)),
   'rank',jsonb_build_object(
    'day3',jsonb_build_object('rank',x3.rk,'compared',(SELECT count(*) FROM r3),'tied',coalesce(x3.same>1,false)),
    'day7',jsonb_build_object('rank',x7.rk,'compared',(SELECT count(*) FROM r7),'tied',coalesce(x7.same>1,false)))
  ) j
  FROM totals t LEFT JOIN r3 x3 ON x3.album_key=t.album_key LEFT JOIN r7 x7 ON x7.album_key=t.album_key
 ),
 undated_series AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('day',NULL,'date',c.bucket_date,'photoOpens',c.po,'downloads',c.dl,'albumOpens',c.ao,'coverage',c.coverage) ORDER BY c.bucket_date) FILTER (WHERE c.bucket_date<v_today),'[]'::jsonb) series,
   (SELECT jsonb_build_object('day',NULL,'date',c2.bucket_date,'photoOpens',c2.po,'downloads',c2.dl,'albumOpens',c2.ao,'coverage',c2.coverage) FROM cells c2 WHERE NOT v_dated AND c2.album_key=p_album_key AND c2.bucket_date=v_today) current_day
  FROM cells c WHERE NOT v_dated AND c.album_key=p_album_key
 ),
 -- Per-photo daily-table counts over the album's window, complete days only.
 pa AS (
  SELECT d.photo_id,
   sum(d.action_count) FILTER (WHERE d.event_type='view')::bigint opens,
   sum(d.action_count) FILTER (WHERE d.event_type='view' AND v_exp_since IS NOT NULL AND d.bucket_date>=v_exp_since)::bigint opens_exp,
   sum(d.action_count) FILTER (WHERE d.event_type='download')::bigint downloads,
   sum(d.action_count) FILTER (WHERE d.event_type='favorite')::bigint favorites
  FROM public.analytics_daily_actions d JOIN public.analytics_daily_coverage c ON c.bucket_date=d.bucket_date AND c.coverage_state='complete'
  WHERE d.album_key=p_album_key AND d.photo_id<>'' AND d.bucket_date BETWEEN v_ws AND v_we AND d.bucket_date<v_today
   AND (p_traffic='inclusive' OR d.traffic_classification IN ('audience','unclassified'))
   AND EXISTS(SELECT 1 FROM public.photo_metadata m WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key)
  GROUP BY d.photo_id
 ),
 -- Version-2 rows, counted here and never returned. Raw rows take the latest classification
 -- correction when the collector called them audience; archived totals already hold the effective one.
 v2 AS (
  SELECT r.photo_id,r.event_name,count(*)::bigint n FROM (
   SELECT e.photo_id,e.event_name,
    CASE WHEN e.traffic_context='audience' THEN coalesce((SELECT k.classification FROM public.analytics_event_v2_classifications k WHERE k.event_id=e.event_id ORDER BY k.classification_version DESC LIMIT 1),'audience') ELSE e.traffic_context END eff
   FROM public.analytics_events_v2 e
   WHERE e.album_key=p_album_key AND e.photo_id IS NOT NULL AND e.event_name IN ('photo_exposed','photo_rendered')
    AND (e.occurred_at AT TIME ZONE 'America/Chicago')::date BETWEEN v_ws AND v_we AND (e.occurred_at AT TIME ZONE 'America/Chicago')::date<v_today
  ) r WHERE (p_traffic='inclusive' AND r.eff<>'self_excluded') OR (p_traffic='conservative' AND r.eff IN ('audience','unclassified'))
  GROUP BY r.photo_id,r.event_name
  UNION ALL
  SELECT t.photo_id,t.event_name,sum(t.event_count)::bigint FROM public.analytics_v2_archived_totals t
  WHERE t.album_key=p_album_key AND t.photo_id IS NOT NULL AND t.event_name IN ('photo_exposed','photo_rendered')
   AND t.bucket_date BETWEEN v_ws AND v_we AND t.bucket_date<v_today
   AND ((p_traffic='inclusive' AND t.traffic_context<>'self_excluded') OR (p_traffic='conservative' AND t.traffic_context IN ('audience','unclassified')))
  GROUP BY t.photo_id,t.event_name
 ),
 v2p AS (
  SELECT photo_id,sum(n) FILTER (WHERE event_name='photo_exposed')::bigint exposures,sum(n) FILTER (WHERE event_name='photo_rendered')::bigint renders FROM v2 GROUP BY photo_id
 ),
 photo_rows AS (
  SELECT m.photo_id,coalesce(a.opens,0) opens,coalesce(a.opens_exp,0) opens_exp,coalesce(a.downloads,0) downloads,coalesce(a.favorites,0) favorites,
   coalesce(v.exposures,0) exposures,coalesce(v.renders,0) renders
  FROM public.photo_metadata m LEFT JOIN pa a ON a.photo_id=m.photo_id LEFT JOIN v2p v ON v.photo_id=m.photo_id
  WHERE m.album_key=p_album_key AND (a.photo_id IS NOT NULL OR v.photo_id IS NOT NULL)
 ),
 photo_json AS (
  SELECT (SELECT count(*) FROM photo_rows) with_activity,
   coalesce((SELECT jsonb_agg(jsonb_build_object('photoId',q.photo_id,'opens',q.opens,'downloads',q.downloads,'favorites',q.favorites,
     'exposureRecorded',v_exp_since IS NOT NULL AND v_exp_since<=v_we,
     'opensInExposureWindow',CASE WHEN v_exp_since IS NOT NULL AND v_exp_since<=v_we THEN q.opens_exp END,
     'exposures',CASE WHEN v_exp_since IS NOT NULL AND v_exp_since<=v_we THEN q.exposures END,
     'renders',CASE WHEN v_exp_since IS NOT NULL AND v_exp_since<=v_we THEN q.renders END) ORDER BY q.opens DESC,q.downloads DESC,q.favorites DESC,q.exposures DESC,q.photo_id)
    FROM (SELECT * FROM photo_rows ORDER BY opens DESC,downloads DESC,favorites DESC,exposures DESC,photo_id LIMIT p_photo_limit) q),'[]'::jsonb) photos
 ),
 album_json AS (
  SELECT CASE WHEN v_dated THEN
    coalesce((SELECT j FROM launch_json WHERE album_key=p_album_key),'{}'::jsonb)
   ELSE jsonb_build_object('albumKey',v_target.album_key,'albumName',v_target.album_name,'firstPublishedAt',NULL,'basis',v_target.fb,'status','no_launch_date',
     'series',(SELECT series FROM undated_series),'currentDay',(SELECT current_day FROM undated_series),'totals',NULL,'rank',NULL)
   END || jsonb_build_object(
    'firstPublishedAtEvidence',v_target.fe,
    'reason',CASE WHEN v_dated THEN NULL
      WHEN v_target.fb='unobserved' THEN jsonb_build_object('code','unobserved','text',v_target.fe)
      WHEN v_target.visibility='unlisted' THEN jsonb_build_object('code','not_published','text','Not published yet.')
      ELSE jsonb_build_object('code','no_record','text','Public with no publication on record.') END,
    'window',jsonb_build_object('start',v_ws,'end',v_we),
    'photosInAlbum',(SELECT count(*) FROM public.photo_metadata WHERE album_key=p_album_key),
    'photosWithActivity',(SELECT with_activity FROM photo_json),
    'photos',(SELECT photos FROM photo_json),
    'exposure',jsonb_build_object('since',v_exp_since,
     'coverage',CASE WHEN v_exp_since IS NULL OR v_exp_since>v_we THEN 'none' WHEN v_exp_since>v_ws THEN 'partial' ELSE 'complete' END)) j
 )
 SELECT jsonb_build_object(
  'asOf',p_as_of,'today',v_today,'lastCompleteDay',v_today-1,'days',p_days,'traffic',p_traffic,
  'album',(SELECT j FROM album_json),
  'launches',coalesce((SELECT jsonb_agg(j ORDER BY fp DESC,album_key) FROM launch_json WHERE in_set),'[]'::jsonb))
 INTO v_result;
 RETURN v_result;
END $$;
