-- Dedicated synthetic rehearsal database only. Every mutation rolls back.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE service_role;

DO $$
DECLARE r jsonb; expected bigint; actual bigint; m text;
BEGIN
  r:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'previous',NULL,NULL,'inclusive',true,0,12,'popular',false,true);
  IF NOT (r?'daily' AND r?'albums' AND r?'photos' AND r?'sources' AND r?'traffic' AND r?'trafficImpact' AND r?'albumOnlyActions' AND r?'publicationAge') THEN RAISE EXCEPTION 'aggregate contract missing'; END IF;
  IF r::text~'beta-1|session_hash|anonymous_browser_id|visit_id|fingerprint' THEN RAISE EXCEPTION 'private album or identifier leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'albums')a WHERE a->>'albumKey'='gamma') THEN RAISE EXCEPTION 'eligible complete-zero album missing'; END IF;
  IF jsonb_array_length(r->'sources'->'arrivals')=0 OR jsonb_array_length(r->'sources'->'openLocations')=0 THEN RAISE EXCEPTION 'source capabilities empty'; END IF;
  IF jsonb_array_length(r->'traffic')=0 OR jsonb_array_length(r->'trafficImpact')=0 THEN RAISE EXCEPTION 'traffic capabilities empty'; END IF;
	SELECT coalesce(sum(action_count),0) INTO expected FROM public.analytics_daily_actions WHERE bucket_date BETWEEN '2026-09-27' AND '2026-09-28' AND album_key='alpha' AND event_type='view' AND photo_id<>'';
	SELECT (a->>'count')::bigint INTO actual FROM jsonb_array_elements(r->'albums')a WHERE a->>'albumKey'='alpha';
	IF actual<>expected THEN RAISE EXCEPTION 'album count multiplied by measure join: % <> %',actual,expected; END IF;

  FOREACH m IN ARRAY ARRAY['photo_opens','album_opens','downloads','favorites','shares'] LOOP
    r:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28',m,'all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,0,'popular',true,false);
    SELECT coalesce(sum(action_count),0) INTO expected FROM public.analytics_daily_actions d WHERE bucket_date BETWEEN '2026-09-27' AND '2026-09-28' AND
      ((m='photo_opens'AND event_type='view'AND photo_id<>'')OR(m='album_opens'AND event_type='album_open'AND photo_id='')OR(m='downloads'AND event_type='download')OR(m='favorites'AND event_type='favorite')OR(m='shares'AND event_type='share'));
    actual:=(r->>'observedTotal')::bigint;
    IF actual<>expected THEN RAISE EXCEPTION '% multiplied or omitted: % <> %',m,actual,expected; END IF;
		IF m='downloads' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'albumOnlyActions')a WHERE a->>'albumKey'='alpha' AND (a->>'count')::bigint>0) THEN RAISE EXCEPTION 'album-only download missing'; END IF;
  END LOOP;
END $$;

-- Historical dimensions, not today's catalogue facts, own historical filters.
DO $$ DECLARE r jsonb;
BEGIN
  UPDATE public.albums SET sport='soccer',event_date='2026-10-31' WHERE album_key='alpha';
  r:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}','volleyball',NULL,NULL,'2026-09-20',NULL,NULL,'none',NULL,NULL,'inclusive',false,0,0,'popular',true,false);
  IF (r->>'observedTotal')::bigint=0 THEN RAISE EXCEPTION 'current catalogue destroyed snapshot filtering'; END IF;
END $$;

-- Distinct browsers obey the same current photo membership boundary.
DO $$ DECLARE visible_count bigint; private_count bigint;
BEGIN
  INSERT INTO engagement_events(photo_id,album_key,event_type,session_hash,source,source_kind,created_at,event_day,traffic_context)
  VALUES('alpha-1','alpha','view','scheduled-public-boundary','scheduled-public-boundary','internal_open_location','2026-09-28T01:02:00Z','2026-09-28','audience');
  visible_count:=analytics_count_scheduled_gallery_browsers('2026-09-27','2026-09-27',ARRAY['alpha'],NULL,NULL,'scheduled-public-boundary',NULL,NULL,NULL,NULL,'conservative',true);
  IF visible_count IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'visible distinct browser not retained'; END IF;
  UPDATE photo_metadata SET album_key='beta' WHERE photo_id='alpha-1';
  visible_count:=analytics_count_scheduled_gallery_browsers('2026-09-27','2026-09-27',ARRAY['alpha'],NULL,NULL,'scheduled-public-boundary',NULL,NULL,NULL,NULL,'conservative',true);
  private_count:=analytics_count_scheduled_gallery_browsers('2026-09-27','2026-09-27',ARRAY['alpha'],NULL,NULL,'scheduled-public-boundary',NULL,NULL,NULL,NULL,'conservative',false);
  IF visible_count IS DISTINCT FROM 0 OR private_count IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'distinct browser visibility boundary failed'; END IF;
  UPDATE photo_metadata SET album_key='alpha' WHERE photo_id='alpha-1';
END $$;

-- Current public photo existence and exact current album membership gate the base set.
DO $$ DECLARE before_report jsonb; moved_report jsonb; exported jsonb;
BEGIN
  before_report:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',true,0,100,'popular',false,false);
  UPDATE public.photo_metadata SET album_key='beta' WHERE photo_id='alpha-1';
  moved_report:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',true,0,100,'popular',false,false);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(moved_report->'photos')p WHERE p->>'photoId'='alpha-1') THEN RAISE EXCEPTION 'moved-to-hidden photo leaked into public page'; END IF;
  exported:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',true,0,0,'popular',true,false);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(exported->'photos')p WHERE p->>'photoId'='alpha-1') THEN RAISE EXCEPTION 'moved-to-hidden photo leaked into export'; END IF;
  IF (moved_report->>'observedTotal')::bigint >= (before_report->>'observedTotal')::bigint THEN RAISE EXCEPTION 'hidden photo remained in public total'; END IF;
  IF (moved_report->'photoPagination'->>'total')::integer >= (before_report->'photoPagination'->>'total')::integer THEN RAISE EXCEPTION 'hidden photo remained in rank total'; END IF;
END $$;

DO $$ DECLARE r jsonb; total integer; listed integer; first_page jsonb; second_page jsonb;
BEGIN
  r:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,0,'popular',true,false);
  total:=(r->'photoPagination'->>'total')::integer;listed:=jsonb_array_length(r->'photos');
  IF total<=1000 OR listed<>total THEN RAISE EXCEPTION 'full export truncated: %/%',listed,total; END IF;
  first_page:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,1,'popular',false,false);
  second_page:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,1,1,'popular',false,false);
  IF first_page->'photos'->0->>'photoId'=second_page->'photos'->0->>'photoId' THEN RAISE EXCEPTION 'stable page boundary repeated row'; END IF;
END $$;

DO $$ DECLARE r jsonb; pub jsonb;
BEGIN
  r:=public.analytics_read_scheduled_gallery_report('2026-09-28','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'custom','2026-09-26','2026-09-27','inclusive',false,0,20,'rising',false,false);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'photos')p WHERE (p->>'risingValue')::numeric IS DISTINCT FROM ((p->>'count')::numeric-((p->>'previousCount')::numeric/2))) THEN RAISE EXCEPTION 'unequal-window rising did not use daily rates'; END IF;
  pub:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'publication_age',NULL,NULL,'inclusive',false,0,0,'popular',true,false);
  IF (pub->'publicationAge'->>'days')::integer<>2 OR jsonb_array_length(pub->'publicationAge'->'albums')=0 THEN RAISE EXCEPTION 'publication age missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pub->'publicationAge'->'albums')a,jsonb_array_elements(a->'series')s WHERE s.value='0'::jsonb) THEN RAISE EXCEPTION 'complete zero publication day not retained'; END IF;
END $$;

DO $$ DECLARE absent jsonb; partial jsonb; today_report jsonb; no_today jsonb; before_count bigint; after_count bigint; cutoff timestamptz:=date_trunc('minute',statement_timestamp());
BEGIN
  absent:=public.analytics_read_scheduled_gallery_report('2000-01-01','2000-01-01','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,0,'popular',true,false);
  IF absent->>'coverage'<>'unavailable' OR absent->'total'<>'null'::jsonb THEN RAISE EXCEPTION 'absent coverage fabricated zero'; END IF;
  PERFORM analytics_private.reconcile_current_gallery_day(cutoff);
  SELECT count(*) INTO before_count FROM public.analytics_daily_actions WHERE bucket_date=(cutoff AT TIME ZONE 'America/Chicago')::date;
  PERFORM analytics_private.reconcile_current_gallery_day(cutoff);
  SELECT count(*) INTO after_count FROM public.analytics_daily_actions WHERE bucket_date=(cutoff AT TIME ZONE 'America/Chicago')::date;
  IF after_count IS DISTINCT FROM before_count THEN RAISE EXCEPTION 'current refresh not idempotent: % <> %',before_count,after_count; END IF;
	IF (SELECT coverage_state FROM public.analytics_daily_coverage WHERE bucket_date=(cutoff AT TIME ZONE 'America/Chicago')::date)<>'partial' THEN RAISE EXCEPTION 'current-day ledger claimed complete'; END IF;
  UPDATE analytics_daily_coverage SET coverage_state='complete' WHERE bucket_date=(cutoff AT TIME ZONE 'America/Chicago')::date;
  partial:=public.analytics_read_scheduled_gallery_report((cutoff AT TIME ZONE 'America/Chicago')::date,(cutoff AT TIME ZONE 'America/Chicago')::date,'photo_opens','all','{}',p_compare=>'none',p_export=>true);
  IF partial->>'coverage'<>'partial' OR partial->'total'<>'null'::jsonb THEN RAISE EXCEPTION 'bad today ledger fabricated complete report'; END IF;
  today_report:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,0,'popular',true,true);
  no_today:=public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,0,'popular',true,false);
  IF today_report->'today'->>'date'<>((statement_timestamp()AT TIME ZONE'America/Chicago')::date)::text OR today_report->'today'->>'asOf' IS NULL THEN RAISE EXCEPTION 'today is not independent scheduled evidence'; END IF;
  IF no_today->'today'->'count'<>'null'::jsonb OR no_today->'today'->'asOf'<>'null'::jsonb THEN RAISE EXCEPTION 'includeToday=false ignored'; END IF;
END $$;

DO $$ DECLARE r jsonb;
BEGIN
	UPDATE public.analytics_daily_coverage SET coverage_state='partial' WHERE bucket_date='2026-09-28';
	r:=public.analytics_read_scheduled_gallery_report('2026-09-28','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,20,'popular',false,false);
	IF r->>'coverage'<>'partial' OR r->'total'<>'null'::jsonb OR (r->>'observedTotal')::bigint=0 THEN RAISE EXCEPTION 'partial coverage lost observed counts or fabricated trusted total'; END IF;
	IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'photos')p WHERE (p->>'count')::bigint>0 AND p->'measures'->'photo_opens'='null'::jsonb) THEN RAISE EXCEPTION 'partial group count/measures semantics wrong'; END IF;
END $$;

-- Rising leaves out photos from albums published after the comparison window
-- (20261005200000). Same Chicago-date rule as publishedAfterComparison() in
-- report-contract.ts; Popular and the no-comparison case keep every photo.
DO $$ DECLARE target text; popular jsonb; rising_r jsonb; target_photos integer;
BEGIN
  popular:=public.analytics_read_scheduled_gallery_report('2026-09-28','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'custom','2026-09-26','2026-09-27','inclusive',false,0,0,'popular',true,false);
  target:=popular->'photos'->0->>'albumKey';
  IF target IS NULL THEN RAISE EXCEPTION 'fixture has no photo activity on 2026-09-28'; END IF;
  SELECT count(*) INTO target_photos FROM jsonb_array_elements(popular->'photos')p WHERE p->>'albumKey'=target;
  -- 15:00Z on Sep 28 is Sep 28 in Chicago: after the comparison window, so excluded.
  UPDATE public.album_settings SET published_at='2026-09-28T15:00:00Z' WHERE album_key=target;
  rising_r:=public.analytics_read_scheduled_gallery_report('2026-09-28','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'custom','2026-09-26','2026-09-27','inclusive',false,0,0,'rising',true,false);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rising_r->'photos')p WHERE p->>'albumKey'=target) THEN RAISE EXCEPTION 'rising ranked photos from an album published after the comparison window'; END IF;
  IF (rising_r->'photoPagination'->>'total')::integer<>(popular->'photoPagination'->>'total')::integer-target_photos THEN RAISE EXCEPTION 'rising total still counts new-album photos'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.analytics_read_scheduled_gallery_report('2026-09-28','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'custom','2026-09-26','2026-09-27','inclusive',false,0,0,'popular',true,false)->'photos')p WHERE p->>'albumKey'=target) THEN RAISE EXCEPTION 'popular dropped new-album photos'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.analytics_read_scheduled_gallery_report('2026-09-28','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',false,0,0,'rising',true,false)->'photos')p WHERE p->>'albumKey'=target) THEN RAISE EXCEPTION 'rising without a comparison dropped photos'; END IF;
  -- 04:30Z on Sep 28 is still Sep 27 in Chicago: inside the comparison window, so kept.
  UPDATE public.album_settings SET published_at='2026-09-28T04:30:00Z' WHERE album_key=target;
  rising_r:=public.analytics_read_scheduled_gallery_report('2026-09-28','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'custom','2026-09-26','2026-09-27','inclusive',false,0,0,'rising',true,false);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rising_r->'photos')p WHERE p->>'albumKey'=target) THEN RAISE EXCEPTION 'rising used the UTC date instead of the Chicago publication date'; END IF;
END $$;

DO $$ BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',true,0,1,'popular',false,false);
    RAISE EXCEPTION 'anon unexpectedly executed report RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM analytics_count_scheduled_gallery_browsers('2026-09-27','2026-09-27','{}',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'conservative',true);
    RAISE EXCEPTION 'anon unexpectedly executed browser estimate';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.analytics_read_scheduled_gallery_report('2026-09-27','2026-09-28','photo_opens','all','{}',NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,'inclusive',true,0,1,'popular',false,false);
    RAISE EXCEPTION 'authenticated unexpectedly executed report RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
END $$;

ROLLBACK;
