BEGIN;

CREATE OR REPLACE FUNCTION analytics_private.reconcile_current_gallery_day(p_cutoff_at timestamptz DEFAULT statement_timestamp())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,analytics_private AS $$
BEGIN
  PERFORM analytics_private.reconcile_daily_actions((p_cutoff_at AT TIME ZONE 'America/Chicago')::date,p_cutoff_at);
END $$;

CREATE OR REPLACE FUNCTION public.analytics_read_scheduled_gallery_report(
 p_start date,p_end date,p_measure text,p_scope text,p_album_keys text[],p_sport text DEFAULT NULL,
 p_category text DEFAULT NULL,p_source text DEFAULT NULL,p_event_date date DEFAULT NULL,p_season text DEFAULT NULL,
 p_album_event_type text DEFAULT NULL,p_compare text DEFAULT 'previous',p_compare_start date DEFAULT NULL,
 p_compare_end date DEFAULT NULL,p_traffic text DEFAULT 'conservative',p_public_only boolean DEFAULT false,
 p_photo_page integer DEFAULT 0,p_photo_page_size integer DEFAULT 24,p_photo_rank text DEFAULT 'popular',
 p_export boolean DEFAULT false,p_include_today boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER STABLE SET search_path=pg_catalog,public,analytics_private AS $$
DECLARE
 v_compare_start date; v_compare_end date; v_today date:=(statement_timestamp() AT TIME ZONE 'America/Chicago')::date;
 v_current_days integer; v_previous_days integer; v_result jsonb;
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end THEN RAISE EXCEPTION 'invalid report dates'; END IF;
 v_current_days:=p_end-p_start+1;
 IF v_current_days>3650 THEN RAISE EXCEPTION 'report range exceeds 3650 days'; END IF;
 IF p_measure NOT IN ('photo_opens','album_opens','downloads','favorites','shares') THEN RAISE EXCEPTION 'invalid report measure'; END IF;
 IF p_scope NOT IN ('all','album','selected') OR p_traffic NOT IN ('inclusive','conservative') OR p_compare NOT IN ('previous','custom','publication_age','none') OR p_photo_rank NOT IN ('popular','rising','recent') THEN RAISE EXCEPTION 'invalid report option'; END IF;
 IF p_photo_page<0 OR p_photo_page_size<0 OR p_photo_page_size>100 THEN RAISE EXCEPTION 'invalid photo page'; END IF;
 IF p_scope='album' AND coalesce(cardinality(p_album_keys),0)<>1 THEN RAISE EXCEPTION 'album scope requires one album'; END IF;
 IF p_scope='selected' AND coalesce(cardinality(p_album_keys),0)<2 THEN RAISE EXCEPTION 'selected scope requires two albums'; END IF;
 IF p_compare='previous' THEN v_compare_end:=p_start-1;v_compare_start:=v_compare_end-(p_end-p_start);
 ELSIF p_compare='custom' THEN
  IF p_compare_start IS NULL OR p_compare_end IS NULL THEN RAISE EXCEPTION 'custom comparison requires dates'; END IF;
  v_compare_start:=least(p_compare_start,p_compare_end);v_compare_end:=greatest(p_compare_start,p_compare_end);
  IF v_compare_end-v_compare_start+1>3650 THEN RAISE EXCEPTION 'comparison range exceeds 3650 days'; END IF;
 END IF;
 v_previous_days:=CASE WHEN v_compare_start IS NULL THEN 0 ELSE v_compare_end-v_compare_start+1 END;

 WITH visible_albums AS (
  SELECT a.album_key,a.sport::text sport,a.event_date,s.published_at FROM public.albums a
  LEFT JOIN public.album_settings s USING(album_key) WHERE NOT p_public_only OR coalesce(s.visibility,'public')<>'unlisted'
 ),eligible_catalogue AS (
  SELECT v.album_key,v.published_at FROM visible_albums v WHERE (p_scope='all' OR v.album_key=ANY(p_album_keys))
   AND (p_sport IS NULL OR v.sport=p_sport) AND (p_event_date IS NULL OR v.event_date=p_event_date)
   AND (p_season IS NULL OR coalesce(extract(year FROM v.event_date)::text,'unknown')=p_season) AND (p_album_event_type IS NULL OR p_album_event_type='unknown')
 ),days AS (
  SELECT g::date bucket_date FROM generate_series(least(p_start,coalesce(v_compare_start,p_start)),greatest(p_end,coalesce(v_compare_end,p_end)),interval '1 day') g
 ),coverage AS (
  SELECT d.bucket_date,CASE WHEN d.bucket_date>v_today THEN NULL WHEN d.bucket_date=v_today AND c.coverage_state IS NOT NULL THEN 'partial' ELSE c.coverage_state END coverage_state,c.cutoff_at,c.reconciled_at,c.catalogue_basis FROM days d LEFT JOIN public.analytics_daily_coverage c USING(bucket_date)
 ),cc AS (
  SELECT CASE WHEN bool_or(coverage_state IS NULL OR coverage_state='unavailable') THEN 'unavailable' WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'complete' END state FROM coverage WHERE bucket_date BETWEEN p_start AND p_end
 ),pc AS (
  SELECT CASE WHEN v_compare_start IS NULL THEN 'unavailable' WHEN bool_or(coverage_state IS NULL OR coverage_state='unavailable') THEN 'unavailable' WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'complete' END state FROM coverage WHERE v_compare_start IS NOT NULL AND bucket_date BETWEEN v_compare_start AND v_compare_end
 ),base AS (
  SELECT d.bucket_date,d.album_key,d.photo_id,d.event_type,d.source,d.source_kind,d.traffic_classification,d.action_count,d.latest_event_at FROM public.analytics_daily_actions d WHERE d.bucket_date BETWEEN least(p_start,coalesce(v_compare_start,p_start)) AND greatest(p_end,coalesce(v_compare_end,p_end))
   AND (p_scope='all' OR d.album_key=ANY(p_album_keys)) AND (NOT p_public_only OR EXISTS(SELECT 1 FROM visible_albums v WHERE v.album_key=d.album_key))
   AND (NOT p_public_only OR d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m JOIN visible_albums v ON v.album_key=m.album_key WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key))
   AND (p_sport IS NULL OR d.sport=p_sport) AND (p_category IS NULL OR d.photo_category=p_category) AND (p_source IS NULL OR d.source=p_source)
   AND (p_event_date IS NULL OR d.event_date=p_event_date) AND (p_season IS NULL OR coalesce(extract(year FROM d.event_date)::text,'unknown')=p_season)
   AND (p_album_event_type IS NULL OR d.album_event_type=p_album_event_type)
 ),cur_all AS (SELECT * FROM base WHERE bucket_date BETWEEN p_start AND p_end),prev_all AS (SELECT * FROM base WHERE v_compare_start IS NOT NULL AND bucket_date BETWEEN v_compare_start AND v_compare_end),
 cur AS (SELECT * FROM cur_all WHERE p_traffic='inclusive' OR traffic_classification IN('audience','unclassified')),
 prev AS (SELECT * FROM prev_all WHERE p_traffic='inclusive' OR traffic_classification IN('audience','unclassified')),
 cm AS (SELECT * FROM cur WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share')),
 pm AS (SELECT * FROM prev WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share')),
 daily_counts AS (SELECT bucket_date,sum(action_count)::bigint n FROM cm GROUP BY bucket_date),
 ca AS (SELECT album_key,sum(action_count)::bigint n,max(latest_event_at) last_at FROM cm GROUP BY album_key),
 pa AS (SELECT album_key,sum(action_count)::bigint n FROM pm GROUP BY album_key),
 am AS (SELECT album_key,sum(action_count)FILTER(WHERE event_type='view' AND photo_id<>'')::bigint po,sum(action_count)FILTER(WHERE event_type='album_open' AND photo_id='')::bigint ao,sum(action_count)FILTER(WHERE event_type='download')::bigint dl,sum(action_count)FILTER(WHERE event_type='favorite')::bigint fa,sum(action_count)FILTER(WHERE event_type='share')::bigint sh FROM cur GROUP BY album_key),
 album_keys AS (SELECT album_key,published_at FROM eligible_catalogue UNION SELECT ca.album_key,v.published_at FROM ca LEFT JOIN visible_albums v USING(album_key) UNION SELECT pa.album_key,v.published_at FROM pa LEFT JOIN visible_albums v USING(album_key)),
 albums AS (
  SELECT k.album_key,CASE WHEN ca.album_key IS NOT NULL THEN ca.n WHEN cc.state='complete' THEN 0 END n,CASE WHEN pa.album_key IS NOT NULL THEN pa.n WHEN pc.state='complete' THEN 0 END pn,ca.last_at,max(k.published_at) published_at,
   CASE WHEN cc.state='complete' THEN jsonb_build_object('photo_opens',coalesce(am.po,0),'album_opens',coalesce(am.ao,0),'downloads',coalesce(am.dl,0),'favorites',coalesce(am.fa,0),'shares',coalesce(am.sh,0)) ELSE jsonb_build_object('photo_opens',NULL,'album_opens',NULL,'downloads',NULL,'favorites',NULL,'shares',NULL) END measures
  FROM album_keys k CROSS JOIN cc CROSS JOIN pc LEFT JOIN ca USING(album_key) LEFT JOIN pa USING(album_key) LEFT JOIN am USING(album_key)
  GROUP BY k.album_key,ca.album_key,ca.n,ca.last_at,pa.album_key,pa.n,cc.state,pc.state,am.po,am.ao,am.dl,am.fa,am.sh
 ),photo_events AS (
  -- Aggregate every photo once. Joining several unindexed CTE groups can become
  -- quadratic after a burst when the planner still estimates a single row.
  SELECT b.*,bucket_date BETWEEN p_start AND p_end is_current,
   v_compare_start IS NOT NULL AND bucket_date BETWEEN v_compare_start AND v_compare_end is_previous,
   (p_measure='photo_opens' AND event_type='view') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share') matches_measure
  FROM base b WHERE photo_id<>'' AND (p_traffic='inclusive' OR traffic_classification IN('audience','unclassified'))
 ),photo_aggregates AS (
  SELECT photo_id,album_key,
   sum(action_count)FILTER(WHERE is_current AND matches_measure)::bigint n,
   sum(action_count)FILTER(WHERE is_previous AND matches_measure)::bigint pn,
   max(latest_event_at)FILTER(WHERE is_current AND matches_measure) last_at,
   sum(action_count)FILTER(WHERE is_current AND event_type='view')::bigint po,
   sum(action_count)FILTER(WHERE is_current AND event_type='download')::bigint dl,
   sum(action_count)FILTER(WHERE is_current AND event_type='favorite')::bigint fa,
   sum(action_count)FILTER(WHERE is_current AND event_type='share')::bigint sh
  FROM photo_events GROUP BY photo_id,album_key HAVING bool_or(matches_measure AND (is_current OR is_previous))
 ),photos0 AS (
  SELECT a.photo_id,a.album_key,CASE WHEN a.n IS NOT NULL THEN a.n WHEN cc.state='complete' THEN 0 END n,
   CASE WHEN a.pn IS NOT NULL THEN a.pn WHEN pc.state='complete' THEN 0 END pn,a.last_at,
   CASE WHEN cc.state='complete' THEN jsonb_build_object('photo_opens',coalesce(a.po,0),'album_opens',0,'downloads',coalesce(a.dl,0),'favorites',coalesce(a.fa,0),'shares',coalesce(a.sh,0)) ELSE jsonb_build_object('photo_opens',NULL,'album_opens',NULL,'downloads',NULL,'favorites',NULL,'shares',NULL) END measures,
   CASE WHEN cc.state='complete' AND pc.state='complete' THEN CASE WHEN v_current_days=v_previous_days THEN coalesce(a.n,0)-coalesce(a.pn,0) ELSE coalesce(a.n,0)::numeric/v_current_days-coalesce(a.pn,0)::numeric/v_previous_days END END rising
  FROM photo_aggregates a CROSS JOIN cc CROSS JOIN pc
 ),ranked AS (
  SELECT f.*,count(*)OVER()::integer total,row_number()OVER(ORDER BY CASE WHEN p_photo_rank='recent' THEN last_at END DESC NULLS LAST,CASE WHEN p_photo_rank='rising' THEN rising END DESC NULLS LAST,CASE WHEN p_photo_rank='popular' THEN n END DESC NULLS LAST,n DESC NULLS LAST,photo_id,album_key) rn FROM photos0 f
 ),page_meta AS (SELECT coalesce(max(total),0)::integer total,CASE WHEN p_export OR p_photo_page_size=0 OR coalesce(max(total),0)=0 THEN 0 ELSE least(p_photo_page,(coalesce(max(total),0)-1)/p_photo_page_size) END::integer page FROM ranked),
 page AS (SELECT r.* FROM ranked r CROSS JOIN page_meta x WHERE p_export OR (p_photo_page_size>0 AND r.rn>x.page*p_photo_page_size AND r.rn<=(x.page+1)*p_photo_page_size)),
 cao AS (SELECT album_key,sum(action_count)::bigint n,max(latest_event_at) last_at FROM cm WHERE photo_id='' GROUP BY album_key),pao AS (SELECT album_key,sum(action_count)::bigint n FROM pm WHERE photo_id='' GROUP BY album_key),aok AS (SELECT album_key FROM cao UNION SELECT album_key FROM pao),
 sources AS (SELECT source_kind,CASE WHEN source='direct' THEN 'Unknown / no tag' ELSE source END source,sum(action_count)::bigint n FROM cur GROUP BY source_kind,CASE WHEN source='direct' THEN 'Unknown / no tag' ELSE source END),
 traffic AS (SELECT traffic_classification classification,sum(action_count)::bigint n FROM cur_all WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share') GROUP BY traffic_classification),
 impact0 AS (SELECT album_key,sum(action_count)::bigint inclusive,coalesce(sum(action_count)FILTER(WHERE traffic_classification IN('audience','unclassified')),0)::bigint conservative FROM cur_all WHERE (p_measure='photo_opens' AND event_type='view' AND photo_id<>'') OR (p_measure='album_opens' AND event_type='album_open' AND photo_id='') OR (p_measure='downloads' AND event_type='download') OR (p_measure='favorites' AND event_type='favorite') OR (p_measure='shares' AND event_type='share') GROUP BY album_key),
 impact AS (SELECT i.*,row_number()OVER(ORDER BY inclusive DESC,album_key)::integer ir,row_number()OVER(ORDER BY conservative DESC,album_key)::integer cr FROM impact0 i),
 today_cov AS (SELECT cutoff_at FROM public.analytics_daily_coverage WHERE bucket_date=v_today AND coverage_state IN ('complete','partial') AND cutoff_at>=v_today::timestamp AT TIME ZONE 'America/Chicago'),
 today_actions AS (SELECT sum(d.action_count)::bigint n FROM public.analytics_daily_actions d WHERE p_include_today AND d.bucket_date=v_today AND (p_scope='all' OR d.album_key=ANY(p_album_keys)) AND (NOT p_public_only OR EXISTS(SELECT 1 FROM visible_albums v WHERE v.album_key=d.album_key)) AND (NOT p_public_only OR d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m JOIN visible_albums v ON v.album_key=m.album_key WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key)) AND (p_sport IS NULL OR d.sport=p_sport) AND (p_category IS NULL OR d.photo_category=p_category) AND (p_source IS NULL OR d.source=p_source) AND (p_event_date IS NULL OR d.event_date=p_event_date) AND (p_season IS NULL OR coalesce(extract(year FROM d.event_date)::text,'unknown')=p_season) AND (p_album_event_type IS NULL OR d.album_event_type=p_album_event_type) AND (p_traffic='inclusive' OR d.traffic_classification IN('audience','unclassified')) AND ((p_measure='photo_opens' AND d.event_type='view' AND d.photo_id<>'') OR (p_measure='album_opens' AND d.event_type='album_open' AND d.photo_id='') OR (p_measure='downloads' AND d.event_type='download') OR (p_measure='favorites' AND d.event_type='favorite') OR (p_measure='shares' AND d.event_type='share'))),
 pub_albums AS (SELECT album_key,max(published_at) published_at FROM album_keys GROUP BY album_key),
 age_days AS (SELECT p.album_key,p.published_at,g n,(p.published_at AT TIME ZONE 'America/Chicago')::date+g bucket_date FROM pub_albums p CROSS JOIN generate_series(0,v_current_days-1) g WHERE p_compare='publication_age' AND p.published_at IS NOT NULL),
 age_series AS (SELECT a.*,CASE WHEN a.bucket_date>=v_today THEN 'partial' ELSE c.coverage_state END coverage_state,CASE WHEN c.coverage_state='complete' AND a.bucket_date<v_today THEN coalesce(sum(d.action_count),0)::bigint END n_actions FROM age_days a LEFT JOIN public.analytics_daily_coverage c USING(bucket_date) LEFT JOIN public.analytics_daily_actions d ON d.bucket_date=a.bucket_date AND d.album_key=a.album_key AND (NOT p_public_only OR d.photo_id='' OR EXISTS(SELECT 1 FROM public.photo_metadata m JOIN visible_albums v ON v.album_key=m.album_key WHERE m.photo_id=d.photo_id AND m.album_key=d.album_key)) AND (p_sport IS NULL OR d.sport=p_sport) AND (p_category IS NULL OR d.photo_category=p_category) AND (p_source IS NULL OR d.source=p_source) AND (p_event_date IS NULL OR d.event_date=p_event_date) AND (p_season IS NULL OR coalesce(extract(year FROM d.event_date)::text,'unknown')=p_season) AND (p_album_event_type IS NULL OR d.album_event_type=p_album_event_type) AND (p_traffic='inclusive' OR d.traffic_classification IN('audience','unclassified')) AND ((p_measure='photo_opens' AND d.event_type='view' AND d.photo_id<>'') OR (p_measure='album_opens' AND d.event_type='album_open' AND d.photo_id='') OR (p_measure='downloads' AND d.event_type='download') OR (p_measure='favorites' AND d.event_type='favorite') OR (p_measure='shares' AND d.event_type='share')) GROUP BY a.album_key,a.published_at,a.n,a.bucket_date,c.coverage_state),
 age_albums AS (SELECT album_key,published_at,CASE WHEN bool_and(coverage_state='complete') THEN sum(n_actions) END total,CASE WHEN bool_or(coverage_state IS NULL OR coverage_state='unavailable') THEN 'unavailable' WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'complete' END coverage,jsonb_agg(to_jsonb(n_actions)ORDER BY n) series FROM age_series GROUP BY album_key,published_at)
 SELECT jsonb_build_object(
  'coverage',cc.state,'previousCoverage',pc.state,'observedTotal',coalesce((SELECT sum(action_count)FROM cm),0),'total',CASE WHEN cc.state='complete'THEN coalesce((SELECT sum(action_count)FROM cm),0)END,'previousTotal',CASE WHEN pc.state='complete'THEN coalesce((SELECT sum(action_count)FROM pm),0)END,
  'daily',(SELECT coalesce(jsonb_agg(jsonb_build_object('date',c.bucket_date,'coverage',coalesce(c.coverage_state,'unavailable'),'observed',CASE WHEN c.coverage_state IN ('complete','partial') THEN coalesce(d.n,0)END,'count',CASE WHEN c.coverage_state='complete'THEN coalesce(d.n,0)END)ORDER BY c.bucket_date),'[]')FROM coverage c LEFT JOIN daily_counts d USING(bucket_date) WHERE c.bucket_date BETWEEN p_start AND p_end),
  'albums',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',a.album_key,'count',a.n,'previousCount',a.pn,'difference',CASE WHEN cc.state='complete'AND pc.state='complete'THEN a.n-a.pn END,'risingValue',CASE WHEN cc.state='complete'AND pc.state='complete'THEN CASE WHEN v_current_days=v_previous_days THEN a.n-a.pn ELSE a.n::numeric/v_current_days-a.pn::numeric/v_previous_days END END,'measures',a.measures,'lastActivity',a.last_at,'publicationAt',a.published_at)ORDER BY a.n DESC NULLS LAST,a.album_key),'[]')FROM albums a),
  'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('photoId',p.photo_id,'albumKey',p.album_key,'count',p.n,'previousCount',p.pn,'difference',CASE WHEN cc.state='complete'AND pc.state='complete'THEN p.n-p.pn END,'risingValue',p.rising,'measures',p.measures,'lastActivity',p.last_at,'imageUrl',NULL)ORDER BY p.rn),'[]')FROM page p),
  'photoPagination',jsonb_build_object('page',x.page,'pageSize',CASE WHEN p_export THEN 0 ELSE p_photo_page_size END,'total',x.total,'pageCount',CASE WHEN p_export OR p_photo_page_size=0 THEN 0 ELSE ceil(x.total::numeric/p_photo_page_size)::integer END,'rank',p_photo_rank),
  'albumOnlyActions',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',k.album_key,'count',CASE WHEN c.album_key IS NOT NULL THEN c.n WHEN cc.state='complete'THEN 0 END,'previousCount',CASE WHEN p.album_key IS NOT NULL THEN p.n WHEN pc.state='complete'THEN 0 END,'difference',CASE WHEN cc.state='complete'AND pc.state='complete'THEN coalesce(c.n,0)-coalesce(p.n,0)END,'lastActivity',c.last_at)ORDER BY coalesce(c.n,0)DESC,k.album_key),'[]')FROM aok k LEFT JOIN cao c USING(album_key)LEFT JOIN pao p USING(album_key)),
  'sources',jsonb_build_object('arrivals',(SELECT coalesce(jsonb_agg(jsonb_build_object('source',source,'count',n)ORDER BY n DESC,source),'[]')FROM sources WHERE source_kind='tagged_arrival'),'openLocations',(SELECT coalesce(jsonb_agg(jsonb_build_object('source',source,'count',n)ORDER BY n DESC,source),'[]')FROM sources WHERE source_kind='internal_open_location'),'unknown',coalesce((SELECT sum(n)FROM sources WHERE source_kind='unknown'),0)),
  'traffic',(SELECT coalesce(jsonb_agg(jsonb_build_object('classification',classification,'count',n)ORDER BY n DESC,classification),'[]')FROM traffic),
  'trafficImpact',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',album_key,'inclusive',inclusive,'conservative',conservative,'excluded',inclusive-conservative,'inclusiveRank',ir,'conservativeRank',cr)ORDER BY ir,album_key),'[]')FROM impact),
  'today',jsonb_build_object('date',v_today,'count',CASE WHEN p_include_today AND EXISTS(SELECT 1 FROM today_cov)THEN coalesce((SELECT n FROM today_actions),0)END,'asOf',CASE WHEN p_include_today THEN(SELECT cutoff_at FROM today_cov)END),
  'dataAsOf',(SELECT max(reconciled_at)FROM coverage WHERE bucket_date BETWEEN p_start AND p_end),'preservedSince',(SELECT min(bucket_date)FROM public.analytics_daily_coverage),'catalogueBasis',coalesce((SELECT string_agg(DISTINCT catalogue_basis,', ')FROM coverage WHERE bucket_date BETWEEN p_start AND p_end),'unavailable'),
  'publicationAge',CASE WHEN p_compare='publication_age'THEN jsonb_build_object('available',EXISTS(SELECT 1 FROM age_albums),'label',CASE WHEN EXISTS(SELECT 1 FROM age_albums)THEN format('Each album uses its first %s calendar day%s after the recorded publication time. Albums with missing daily history remain unavailable.',v_current_days,CASE WHEN v_current_days=1 THEN '' ELSE 's' END)ELSE'No selected album has a recorded publication time.'END,'days',v_current_days,'albums',(SELECT coalesce(jsonb_agg(jsonb_build_object('albumKey',album_key,'publishedAt',published_at,'total',total,'coverage',coverage,'series',series)ORDER BY total DESC NULLS LAST,album_key),'[]')FROM age_albums),'missingAlbumKeys',(SELECT coalesce(jsonb_agg(album_key ORDER BY album_key),'[]')FROM pub_albums WHERE published_at IS NULL))ELSE jsonb_build_object('available',false,'label','Choose publication-age comparison to align albums from their recorded publication dates.','days',v_current_days,'albums','[]'::jsonb,'missingAlbumKeys','[]'::jsonb)END
 ) INTO v_result FROM cc CROSS JOIN pc CROSS JOIN page_meta x;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_count_scheduled_gallery_browsers(
  p_start date,
  p_end date,
  p_album_keys text[],
  p_sport text,
  p_category text,
  p_source text,
  p_event_date date,
  p_season text,
  p_album_event_type text,
  p_measure text,
  p_traffic text,
  p_public_only boolean
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  interval_start timestamptz := p_start::timestamp AT TIME ZONE 'America/Chicago';
  interval_end timestamptz := (p_end + 1)::timestamp AT TIME ZONE 'America/Chicago';
  answer bigint;
BEGIN
  IF p_start > p_end
    OR interval_start < now() - interval '90 days'
    OR interval_end > now()
  THEN RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM generate_series(p_start, p_end, interval '1 day') day
    LEFT JOIN public.analytics_daily_coverage coverage
      ON coverage.bucket_date = day::date
    WHERE coverage.bucket_date IS NULL
      OR coverage.raw_window_start > day::date::timestamp AT TIME ZONE 'America/Chicago'
      OR coverage.raw_window_end < (day::date + 1)::timestamp AT TIME ZONE 'America/Chicago'
      OR coverage.coverage_state <> 'complete'
      OR coverage.frozen_at IS NOT NULL
  ) THEN RETURN NULL;
  END IF;

  SELECT count(DISTINCT e.session_hash) INTO answer
  FROM analytics_private.effective_engagement_events e
  WHERE (e.created_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_start AND p_end
    AND e.session_hash IS NOT NULL
    AND (NOT p_public_only OR EXISTS (
      SELECT 1 FROM public.albums a LEFT JOIN public.album_settings s USING(album_key)
      WHERE a.album_key=e.resolved_album_key AND coalesce(s.visibility,'public')<>'unlisted'))
    AND (NOT p_public_only OR coalesce(e.photo_id,'')='' OR EXISTS (
      SELECT 1 FROM public.photo_metadata m WHERE m.photo_id=e.photo_id AND m.album_key=e.resolved_album_key))
    AND (coalesce(cardinality(p_album_keys), 0) = 0 OR e.resolved_album_key = ANY(p_album_keys))
    AND (p_sport IS NULL OR e.snapshot_sport = p_sport)
    AND (p_category IS NULL OR e.snapshot_photo_category = p_category)
    AND (p_source IS NULL OR coalesce(e.source, 'direct') = p_source)
    AND (p_event_date IS NULL OR e.snapshot_event_date = p_event_date)
    AND (p_season IS NULL OR coalesce(extract(year FROM e.snapshot_event_date)::text,'unknown') = p_season)
    AND (p_album_event_type IS NULL OR e.snapshot_album_event_type = p_album_event_type)
    AND (p_traffic = 'inclusive' OR e.effective_classification IN ('audience', 'unclassified'));
  RETURN answer;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_count_scheduled_gallery_browsers(date,date,text[],text,text,text,date,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_count_scheduled_gallery_browsers(date,date,text[],text,text,text,date,text,text,text,text,boolean) TO service_role;

REVOKE ALL ON FUNCTION analytics_private.reconcile_current_gallery_day(timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.analytics_read_scheduled_gallery_report(date,date,text,text,text[],text,text,text,date,text,text,text,date,date,text,boolean,integer,integer,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.reconcile_current_gallery_day(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_read_scheduled_gallery_report(date,date,text,text,text[],text,text,text,date,text,text,text,date,date,text,boolean,integer,integer,text,boolean,boolean) TO service_role;
SELECT cron.unschedule('analytics-reconcile-current-gallery-day')WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='analytics-reconcile-current-gallery-day');
SELECT cron.schedule('analytics-reconcile-current-gallery-day','*/30 * * * *',$$SELECT analytics_private.reconcile_current_gallery_day(statement_timestamp());$$);
NOTIFY pgrst,'reload schema';
COMMIT;
