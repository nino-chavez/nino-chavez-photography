-- One list of launches, one copy of the launch rules.
--
-- public.analytics_read_launches is the launch list on its own: every launch with a first
-- publication, each with its daily series, totals, and rank at day 3 and day 7. Home and the album
-- index need that list and nothing about any one album, and had to ask for it through an arbitrary
-- album's launch read. public.analytics_read_launch (20261006180000) now builds its `launches`
-- array, and the requested album's own launch, from this function, so the rules (daily table
-- source, traffic words, photo-opens rule, coverage, the clock, status, competition ranking) exist
-- once. Its output is unchanged for every album and every argument: the rehearsal compares it, as a
-- jsonb value and as text, with a frozen copy of the function as 20261006180000 created it.
--
-- WHAT STAYS THE SAME, for every launch in `launches`: the exact keys and values the older function
-- returned. WHAT IS NEW: this function takes no album, so it has no "requested album" to add when
-- that album is unlisted. analytics_read_launch handles that case itself: for a requested launch
-- outside the public-only comparison set it reads the launch from this function with p_public_only
-- false and sets its ranks to null, with `compared` counting the launches that were compared.
--
-- NO LAUNCHES is an empty array, not an error. A bad days or traffic argument fails with the same
-- messages as analytics_read_launch. Service role only; returns no visitor, browser, visit or event
-- identifier.
--
-- APPLY ORDER. This migration must be applied before the application that calls
-- analytics_read_launches is deployed; the album index reads it and shows an error until it exists.
-- Applying it first changes nothing for the deployed application: analytics_read_launch returns the same
-- bytes as before.

BEGIN;

CREATE OR REPLACE FUNCTION public.analytics_read_launches(
 p_as_of timestamptz DEFAULT now(),
 p_days integer DEFAULT 14,
 p_traffic text DEFAULT 'conservative',
 p_public_only boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path=pg_catalog,public,analytics_private AS $$
DECLARE
 v_today date:=(p_as_of AT TIME ZONE 'America/Chicago')::date;
 v_h integer:=greatest(p_days,7);
 v_result jsonb;
BEGIN
 IF p_as_of IS NULL THEN RAISE EXCEPTION 'as-of is required'; END IF;
 IF p_days IS NULL OR p_days<1 OR p_days>365 THEN RAISE EXCEPTION 'invalid launch days'; END IF;
 IF p_traffic IS NULL OR p_traffic NOT IN ('conservative','inclusive') THEN RAISE EXCEPTION 'invalid traffic option'; END IF;

 WITH
 launches AS (
  SELECT a.album_key,a.album_name,s.first_published_at fp,s.first_published_at_basis fb,
   (s.first_published_at AT TIME ZONE 'America/Chicago')::date d0
  FROM public.albums a JOIN public.album_settings s ON s.album_key=a.album_key
  WHERE s.first_published_at IS NOT NULL AND (NOT p_public_only OR s.visibility<>'unlisted')
 ),
 -- One row per launch and Chicago day up to today, counted from day 0.
 grid AS (
  SELECT l.album_key,g.g AS day,l.d0+g.g AS bucket_date
  FROM launches l CROSS JOIN generate_series(0,v_h-1) AS g(g) WHERE l.d0+g.g<=v_today
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
  SELECT l.album_key,l.album_name,l.fp,l.fb,l.d0,
   v_today-l.d0 elapsed,
   (v_today-l.d0>=3) reached3,(v_today-l.d0>=7) reached7,
   (count(*) FILTER (WHERE c.day<3 AND c.bucket_date<v_today AND c.coverage='complete'))=3 ok3,
   (count(*) FILTER (WHERE c.day<7 AND c.bucket_date<v_today AND c.coverage='complete'))=7 ok7,
   sum(c.po) FILTER (WHERE c.day<3) po3,sum(c.dl) FILTER (WHERE c.day<3) dl3,sum(c.ao) FILTER (WHERE c.day<3) ao3,
   sum(c.po) FILTER (WHERE c.day<7) po7,sum(c.dl) FILTER (WHERE c.day<7) dl7,sum(c.ao) FILTER (WHERE c.day<7) ao7
  FROM launches l LEFT JOIN cells c ON c.album_key=l.album_key AND c.bucket_date<v_today
  GROUP BY l.album_key,l.album_name,l.fp,l.fb,l.d0
 ),
 totals AS (
  SELECT t.*,CASE WHEN ok3 THEN po3 END t_po3,CASE WHEN ok3 THEN dl3 END t_dl3,CASE WHEN ok3 THEN ao3 END t_ao3,
   CASE WHEN ok7 THEN po7 END t_po7,CASE WHEN ok7 THEN dl7 END t_dl7,CASE WHEN ok7 THEN ao7 END t_ao7
  FROM tot t
 ),
 r3 AS (
  SELECT album_key,rank() OVER (ORDER BY t_po3 DESC) rk,count(*) OVER () n,count(*) OVER (PARTITION BY t_po3) same
  FROM totals WHERE t_po3 IS NOT NULL
 ),
 r7 AS (
  SELECT album_key,rank() OVER (ORDER BY t_po7 DESC) rk,count(*) OVER () n,count(*) OVER (PARTITION BY t_po7) same
  FROM totals WHERE t_po7 IS NOT NULL
 ),
 launch_json AS (
  SELECT t.album_key,t.fp,jsonb_build_object(
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
 )
 SELECT jsonb_build_object(
  'asOf',p_as_of,'today',v_today,'lastCompleteDay',v_today-1,'days',p_days,'traffic',p_traffic,
  'launches',coalesce((SELECT jsonb_agg(j ORDER BY fp DESC,album_key) FROM launch_json),'[]'::jsonb))
 INTO v_result;
 RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.analytics_read_launches(timestamptz,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_read_launches(timestamptz,integer,text,boolean) TO service_role;

COMMENT ON FUNCTION public.analytics_read_launches(timestamptz,integer,text,boolean) IS
 'Every launch with a first publication, each with its daily series, totals and rank at day 3 and day 7 against the others. The one copy of the launch rules: analytics_read_launch returns this list unchanged. Service role only. Returns no identifiers.';

CREATE OR REPLACE FUNCTION public.analytics_read_launch(
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
 v_launches jsonb;
 v_launch jsonb;
 v_all jsonb;
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


 -- The launch list comes from the one copy of the launch rules.
 v_all:=public.analytics_read_launches(p_as_of,p_days,p_traffic,p_public_only);
 v_launches:=v_all->'launches';
 IF v_dated THEN
  v_launch:=(SELECT x FROM jsonb_array_elements(v_launches) x WHERE x->>'albumKey'=p_album_key);
  IF v_launch IS NULL THEN
   -- The requested album is outside the comparison set (currently unlisted, public-only on): it still
   -- answers with its own series and totals, but it is not ranked, and the counts say how many were compared.
   v_launch:=(SELECT x FROM jsonb_array_elements(public.analytics_read_launches(p_as_of,p_days,p_traffic,false)->'launches') x WHERE x->>'albumKey'=p_album_key)
    || jsonb_build_object('rank',jsonb_build_object(
      'day3',jsonb_build_object('rank',NULL::integer,'compared',coalesce(v_launches->0->'rank'->'day3'->'compared','0'::jsonb),'tied',false),
      'day7',jsonb_build_object('rank',NULL::integer,'compared',coalesce(v_launches->0->'rank'->'day7'->'compared','0'::jsonb),'tied',false)));
  END IF;
 END IF;

 WITH
 -- An undated album has the requested window and no day number. A launch needs no grid here: its
 -- series comes from analytics_read_launches.
 grid AS (
  SELECT p_album_key AS album_key,NULL::integer AS day,g::date AS bucket_date FROM generate_series(v_ws,v_we,interval '1 day') g
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
    coalesce(v_launch,'{}'::jsonb)
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
  'launches',v_launches)
 INTO v_result;
 RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.analytics_read_launch(text,timestamptz,integer,text,boolean,date,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_read_launch(text,timestamptz,integer,text,boolean,date,date,integer) TO service_role;

COMMENT ON FUNCTION public.analytics_read_launch(text,timestamptz,integer,text,boolean,date,date,integer) IS
 'Launch read model: an album''s days since first publication, totals and rank at day 3 and day 7 against every earlier launch, per-photo counts, and version-2 exposure where recorded. Service role only. Returns no identifiers.';

NOTIFY pgrst,'reload schema';
COMMIT;
