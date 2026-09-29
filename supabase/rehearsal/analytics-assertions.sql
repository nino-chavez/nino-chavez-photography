-- Production compatibility regression: removed catalogue columns stay absent.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='albums' AND column_name='event_type') THEN
    RAISE EXCEPTION 'rehearsal must match production: albums.event_type is removed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.engagement_events WHERE catalogue_snapshot->>'album_event_type' IS NOT NULL) THEN
    RAISE EXCEPTION 'missing catalogue facts must remain unknown';
  END IF;
END $$;

-- Run after base + draft migration + fixtures. Every missing row, NULL result,
-- wrong grant, and wrong value is an explicit failure.
BEGIN;

-- The draft replaces canonical objects without changing consumer columns or
-- dropping the search function that ranks through photo_popularity.
DO $$
DECLARE columns text[];
BEGIN
  SELECT array_agg(attname::text ORDER BY attnum) INTO columns
  FROM pg_attribute
  WHERE attrelid = 'public.album_engagement_30d'::regclass
    AND attnum > 0 AND NOT attisdropped;
  IF columns IS NULL OR columns <> ARRAY[
    'album_key','engaged_visitors','album_opens','photo_opens','favorites','downloads','shares','last_event'
  ]::text[] THEN RAISE EXCEPTION 'album_engagement_30d columns drifted: %', columns; END IF;

  SELECT array_agg(attname::text ORDER BY attnum) INTO columns
  FROM pg_attribute
  WHERE attrelid = 'public.photo_popularity'::regclass
    AND attnum > 0 AND NOT attisdropped;
  IF columns IS NULL OR columns <> ARRAY[
    'photo_id','trending_score','all_time_score','views','favorites','downloads','shares','last_event'
  ]::text[] THEN RAISE EXCEPTION 'photo_popularity columns drifted: %', columns; END IF;

  SELECT array_agg(attname::text ORDER BY attnum) INTO columns
  FROM pg_attribute
  WHERE attrelid = 'public.album_popularity'::regclass
    AND attnum > 0 AND NOT attisdropped;
  IF columns IS NULL OR columns <> ARRAY[
    'album_key','trending_score','all_time_score','score_per_photo','photos_engaged','total_photos','last_event'
  ]::text[] THEN RAISE EXCEPTION 'album_popularity columns drifted: %', columns; END IF;

  IF to_regprocedure('public.find_photos_by_jersey(text,text,text,public.sport_enum,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'search-derived popularity consumer was dropped';
  END IF;
  IF to_regclass('public.albums_summary') IS NULL THEN
    RAISE EXCEPTION 'unrelated canonical albums_summary was dropped';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'photo_popularity_pkey'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%photo_id%'
  ) THEN RAISE EXCEPTION 'photo popularity unique index missing or changed'; END IF;
  IF has_table_privilege('anon', 'public.photo_popularity', 'SELECT')
    OR has_table_privilege('authenticated', 'public.photo_popularity', 'SELECT')
  THEN RAISE EXCEPTION 'private materialized view grant widened'; END IF;
  IF has_function_privilege('anon', 'public.analytics_read_report_evidence(date,date)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.analytics_read_report_evidence(date,date)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.analytics_read_report_evidence(date,date)', 'EXECUTE')
  THEN RAISE EXCEPTION 'report evidence RPC grants are wrong'; END IF;
END $$;

-- Database target consistency is a backstop for every writer. These writes are
-- rolled back after proving derivation, mismatch rejection, shape rejection,
-- album-only actions, and the trusted server-emitter arrival exception.
SAVEPOINT target_contract;
INSERT INTO public.engagement_events (
  photo_id, album_key, event_type, session_hash, source, source_kind,
  created_at, event_day, traffic_context
) VALUES
  ('alpha-1', NULL, 'view', 'shape-photo-only', 'shape', 'internal_open_location', '2026-09-27T18:00:00Z', '2026-09-27', 'audience'),
  (NULL, 'alpha', 'download', 'shape-album-download', 'shape', 'action', '2026-09-27T18:01:00Z', '2026-09-27', 'audience'),
  (NULL, NULL, 'view', 'shape-site-arrival', 'instagram', 'tagged_arrival', '2026-09-27T18:02:00Z', '2026-09-27', 'audience');
DO $$
DECLARE derived_album text; snapshot_album text;
BEGIN
  SELECT album_key, catalogue_snapshot->>'album_key'
  INTO derived_album, snapshot_album
  FROM public.engagement_events
  WHERE session_hash = 'shape-photo-only';
  IF NOT FOUND OR derived_album <> 'alpha' OR snapshot_album <> 'alpha' THEN
    RAISE EXCEPTION 'photo-only target was not authoritatively resolved: %, %', derived_album, snapshot_album;
  END IF;

  BEGIN
    UPDATE public.engagement_events SET source = 'rewritten'
    WHERE session_hash = 'shape-photo-only';
    RAISE EXCEPTION 'original engagement facts were mutable';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.engagement_events (
      photo_id, album_key, event_type, session_hash, source_kind, created_at, event_day
    ) VALUES ('alpha-1', 'beta', 'share', 'shape-mismatch', 'action', '2026-09-27T18:03:00Z', '2026-09-27');
    RAISE EXCEPTION 'mismatched photo and album was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.engagement_events (
      photo_id, event_type, session_hash, source_kind, created_at, event_day
    ) VALUES ('missing-photo', 'view', 'shape-missing', 'internal_open_location', '2026-09-27T18:04:00Z', '2026-09-27');
    RAISE EXCEPTION 'missing photo target was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.engagement_events (
      album_key, event_type, session_hash, source_kind, created_at, event_day
    ) VALUES ('alpha', 'view', 'shape-untrusted-arrival', 'unknown', '2026-09-27T18:05:00Z', '2026-09-27');
    RAISE EXCEPTION 'untrusted null-photo view was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.engagement_events (
      photo_id, album_key, event_type, session_hash, source_kind, created_at, event_day
    ) VALUES ('alpha-1', 'alpha', 'album_open', 'shape-album-open', 'internal_open_location', '2026-09-27T18:06:00Z', '2026-09-27');
    RAISE EXCEPTION 'album_open with photo was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK TO SAVEPOINT target_contract;
RELEASE SAVEPOINT target_contract;

-- Reconciliation is idempotent; Chicago dates and provenance are independent
-- from the historical UTC dedup day.
SELECT analytics_private.reconcile_daily_actions('2026-09-27', '2026-09-29T12:00:00Z');
SELECT analytics_private.reconcile_daily_actions('2026-09-27', '2026-09-29T12:00:00Z');
SELECT analytics_private.reconcile_daily_actions('2026-09-26', '2026-09-29T12:00:00Z');
DO $$
DECLARE n bigint; visitors_a bigint; visitors_b bigint; state text; basis text;
BEGIN
  SELECT count(*) INTO n
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-09-27';
  IF n IS NULL OR n <> 10 THEN
    RAISE EXCEPTION 'expected ten stable daily dimensions, got %', n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.analytics_daily_actions
    WHERE bucket_date = '2026-09-27' AND source_kind = 'tagged_arrival' AND photo_id = ''
  ) THEN RAISE EXCEPTION 'tagged arrival was not preserved separately'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.analytics_daily_actions
    WHERE bucket_date = '2026-09-27' AND album_key = 'legacy'
      AND event_date IS NULL AND catalogue_basis = 'backfill_current_catalogue'
  ) THEN RAISE EXCEPTION 'legacy first-backfill facts moved after catalogue edit'; END IF;

  SELECT coverage_state, catalogue_basis INTO state, basis
  FROM public.analytics_daily_coverage WHERE bucket_date = '2026-09-27';
  IF NOT FOUND OR state <> 'complete' OR basis <> 'mixed' THEN
    RAISE EXCEPTION 'complete mixed coverage was not derived: %, %', state, basis;
  END IF;
  SELECT coverage_state INTO state
  FROM public.analytics_daily_coverage WHERE bucket_date = '2026-09-26';
  IF NOT FOUND OR state <> 'complete' THEN
    RAISE EXCEPTION 'empty retained day was not recorded complete: %', state;
  END IF;
  SELECT count(*) INTO n
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-09-26';
  IF n IS NULL OR n <> 0 THEN RAISE EXCEPTION 'empty day gained action rows: %', n; END IF;

  SELECT analytics_private.count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY[]::text[], NULL, NULL, NULL,
    NULL, NULL, NULL, 'photo_opens', 'conservative'
  ) INTO visitors_a;
  SELECT analytics_private.count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY[]::text[], NULL, NULL, NULL,
    NULL, NULL, NULL, 'downloads', 'conservative'
  ) INTO visitors_b;
  IF visitors_a IS NULL OR visitors_b IS NULL OR visitors_a <> 7 OR visitors_b <> visitors_a THEN
    RAISE EXCEPTION 'any-action visitor contract drifted: %, %', visitors_a, visitors_b;
  END IF;

  SELECT analytics_private.count_distinct_visitors(
    '2026-03-01', '2026-09-27', ARRAY[]::text[], NULL, NULL, NULL,
    NULL, NULL, NULL, 'photo_opens', 'conservative'
  ) INTO visitors_a;
  IF visitors_a IS NOT NULL THEN
    RAISE EXCEPTION 'expired interval returned a partial exact visitor count: %', visitors_a;
  END IF;
END $$;

-- Explicit JSON null remains null; changing beta's event date after capture does
-- not mutate the historical row. Private distinct visibility includes unlisted.
SELECT analytics_private.reconcile_daily_actions('2026-09-27', '2026-09-29T12:00:00Z');
DO $$
DECLARE row_count bigint; sport_value text; event_value date; basis text; visitors bigint;
BEGIN
  SELECT count(*) INTO row_count
  FROM public.analytics_daily_actions
  WHERE bucket_date = '2026-09-27' AND album_key = 'beta';
  IF row_count IS NULL OR row_count <> 1 THEN
    RAISE EXCEPTION 'expected one beta summary row, got %', row_count;
  END IF;
  SELECT sport, event_date, catalogue_basis
  INTO sport_value, event_value, basis
  FROM public.analytics_daily_actions
  WHERE bucket_date = '2026-09-27' AND album_key = 'beta';
  IF NOT FOUND OR sport_value <> 'unknown' OR event_value IS NOT NULL OR basis <> 'event_snapshot' THEN
    RAISE EXCEPTION 'event snapshot null mutated: %, %, %', sport_value, event_value, basis;
  END IF;
  SELECT analytics_private.count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY['beta'], NULL, NULL, NULL,
    NULL, NULL, NULL, 'photo_opens', 'conservative'
  ) INTO visitors;
  IF visitors IS NULL OR visitors <> 1 THEN
    RAISE EXCEPTION 'authorized private distinct excluded unlisted beta: %', visitors;
  END IF;
END $$;

-- The scalar report crosses 1,000 rows and contains one snapshot-consistent,
-- duplicate-free set of action rows plus safe full coverage metadata.
SELECT analytics_private.reconcile_daily_actions('2026-09-28', '2026-09-29T12:00:00Z');
DO $$
DECLARE evidence jsonb; n bigint; unique_n bigint; coverage_n bigint;
BEGIN
  SELECT public.analytics_read_report_evidence('2026-09-28', '2026-09-28') INTO evidence;
  IF evidence IS NULL THEN RAISE EXCEPTION 'report evidence RPC returned NULL'; END IF;
  SELECT count(*), count(DISTINCT (row->>'id')::bigint)
  INTO n, unique_n FROM jsonb_array_elements(evidence->'rows') row;
  SELECT count(*) INTO coverage_n FROM jsonb_array_elements(evidence->'coverage');
  IF n IS NULL OR n <= 1000 OR unique_n <> n THEN
    RAISE EXCEPTION 'scalar report was capped or duplicated: %, %', n, unique_n;
  END IF;
  IF coverage_n IS NULL OR coverage_n <> 1 THEN
    RAISE EXCEPTION 'scalar report coverage missing or duplicated: %', coverage_n;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(evidence->'coverage') row WHERE row ? 'notes'
  ) THEN RAISE EXCEPTION 'private coverage notes leaked through report RPC'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(evidence->'rows') row
    WHERE row ? 'session_hash' OR row ? 'query_text' OR row ? 'note'
  ) THEN RAISE EXCEPTION 'protected evidence leaked through report RPC'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.analytics_daily_actions
    WHERE bucket_date = '2026-09-28'
      AND traffic_classification = 'suspected_automation'
  ) THEN RAISE EXCEPTION 'heuristic session was not labeled suspected automation'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.automated_sessions WHERE session_hash = 'burst-session'
  ) THEN RAISE EXCEPTION 'canonical suspected automation view is stale'; END IF;
END $$;

-- A failed reconcile statement rolls back its delete/insert and keeps the last
-- complete generation. This is the local interruption proof.
CREATE OR REPLACE FUNCTION pg_temp.fail_sep28_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bucket_date = '2026-09-28' THEN RAISE EXCEPTION 'synthetic interruption'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fail_sep28_summary
  BEFORE INSERT ON public.analytics_daily_actions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_sep28_summary();
DO $$
DECLARE before_count bigint; after_count bigint;
BEGIN
  SELECT count(*) INTO before_count
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-09-28';
  BEGIN
    PERFORM analytics_private.reconcile_daily_actions('2026-09-28', '2026-09-29T12:00:00Z');
    RAISE EXCEPTION 'synthetic interruption did not fire';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'synthetic interruption did not fire' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO after_count
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-09-28';
  IF before_count IS NULL OR after_count IS NULL OR before_count <> after_count THEN
    RAISE EXCEPTION 'failed reconcile damaged completed generation: %, %', before_count, after_count;
  END IF;
END $$;
DROP TRIGGER fail_sep28_summary ON public.analytics_daily_actions;

-- Before/after/reversal are identical across private summaries, public views,
-- popularity, top-photo selection, and the jersey search ranking consumer.
SELECT public.refresh_popularity();
DO $$
DECLARE event_id bigint; first_photo text; private_class text; public_views bigint; visitors bigint; public_shares bigint; album_score numeric;
BEGIN
  SELECT id INTO event_id FROM public.engagement_events
  WHERE session_hash = 'correction-a' AND event_type = 'share';
  IF NOT FOUND OR event_id IS NULL THEN RAISE EXCEPTION 'correction fixture missing'; END IF;
  SELECT traffic_classification INTO private_class
  FROM public.analytics_daily_actions
  WHERE bucket_date = '2026-09-27' AND photo_id = 'alpha-correction' AND event_type = 'share';
  IF NOT FOUND OR private_class <> 'audience' THEN
    RAISE EXCEPTION 'private pre-correction class wrong: %', private_class;
  END IF;
  SELECT shares INTO public_views FROM public.photo_popularity WHERE photo_id = 'alpha-correction';
  IF NOT FOUND OR public_views <> 1 THEN RAISE EXCEPTION 'public pre-correction popularity wrong: %', public_views; END IF;
  SELECT shares INTO public_shares FROM public.album_engagement_30d WHERE album_key = 'alpha';
  IF NOT FOUND OR public_shares <> 1 THEN RAISE EXCEPTION 'public pre-correction view wrong: %', public_shares; END IF;
  SELECT all_time_score INTO album_score FROM public.album_popularity WHERE album_key = 'alpha';
  IF NOT FOUND OR album_score <> 1129 THEN RAISE EXCEPTION 'album popularity pre-correction wrong: %', album_score; END IF;
  SELECT photo_id INTO first_photo FROM public.find_photos_by_jersey('99') LIMIT 1;
  IF NOT FOUND OR first_photo <> 'alpha-correction' THEN RAISE EXCEPTION 'search pre-correction ranking wrong: %', first_photo; END IF;
  SELECT public.analytics_count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY['alpha'], NULL, NULL, NULL,
    NULL, NULL, NULL, 'downloads', 'conservative'
  ) INTO visitors;
  IF visitors IS NULL OR visitors <> 5 THEN RAISE EXCEPTION 'distinct pre-correction wrong: %', visitors; END IF;
END $$;

DO $$
DECLARE event_id bigint; version_value integer; class_value text; first_photo text; visitors bigint; public_shares bigint; album_score numeric;
BEGIN
  SELECT id INTO STRICT event_id FROM public.engagement_events
  WHERE session_hash = 'correction-a' AND event_type = 'share';
  SELECT classification, classification_version INTO class_value, version_value
  FROM public.analytics_record_classification_correction(
    event_id, 'operator', 'Synthetic correction rehearsal', NULL, false
  );
  IF class_value <> 'operator' OR version_value <> 2 THEN
    RAISE EXCEPTION 'correction did not create operator version 2: %, %', class_value, version_value;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.analytics_daily_actions
    WHERE bucket_date = '2026-09-27' AND photo_id = 'alpha-correction'
      AND event_type = 'share' AND traffic_classification = 'operator'
  ) THEN RAISE EXCEPTION 'private summary did not apply correction'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.photo_popularity
    WHERE photo_id = 'alpha-correction'
  ) THEN RAISE EXCEPTION 'public popularity retained corrected view'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.album_top_photo WHERE photo_id = 'alpha-correction'
  ) THEN RAISE EXCEPTION 'top-photo consumer retained corrected event'; END IF;
  SELECT shares INTO public_shares FROM public.album_engagement_30d WHERE album_key = 'alpha';
  IF NOT FOUND OR public_shares <> 0 THEN RAISE EXCEPTION 'public view ignored correction: %', public_shares; END IF;
  SELECT all_time_score INTO album_score FROM public.album_popularity WHERE album_key = 'alpha';
  IF NOT FOUND OR album_score <> 1121 THEN RAISE EXCEPTION 'album popularity ignored correction: %', album_score; END IF;
  SELECT photo_id INTO first_photo FROM public.find_photos_by_jersey('99') LIMIT 1;
  IF NOT FOUND OR first_photo <> 'alpha-control' THEN
    RAISE EXCEPTION 'search ranking ignored corrected popularity: %', first_photo;
  END IF;
  SELECT public.analytics_count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY['alpha'], NULL, NULL, NULL,
    NULL, NULL, NULL, 'photo_opens', 'conservative'
  ) INTO visitors;
  IF visitors IS NULL OR visitors <> 4 THEN RAISE EXCEPTION 'distinct ignored correction: %', visitors; END IF;

  SELECT classification, classification_version INTO class_value, version_value
  FROM public.analytics_record_classification_correction(
    event_id, 'audience', 'Synthetic reversal rehearsal', NULL, true
  );
  IF class_value <> 'audience' OR version_value <> 3 THEN
    RAISE EXCEPTION 'reversal did not restore audience version 3: %, %', class_value, version_value;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.analytics_daily_actions
    WHERE bucket_date = '2026-09-27' AND photo_id = 'alpha-correction'
      AND event_type = 'share' AND traffic_classification = 'audience'
  ) THEN RAISE EXCEPTION 'private summary did not apply reversal'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.photo_popularity
    WHERE photo_id = 'alpha-correction' AND shares = 1
  ) THEN RAISE EXCEPTION 'public popularity did not apply reversal'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.album_top_photo WHERE photo_id = 'alpha-correction'
  ) THEN RAISE EXCEPTION 'top-photo consumer did not apply reversal'; END IF;
  SELECT shares INTO public_shares FROM public.album_engagement_30d WHERE album_key = 'alpha';
  IF NOT FOUND OR public_shares <> 1 THEN RAISE EXCEPTION 'public view ignored reversal: %', public_shares; END IF;
  SELECT all_time_score INTO album_score FROM public.album_popularity WHERE album_key = 'alpha';
  IF NOT FOUND OR album_score <> 1129 THEN RAISE EXCEPTION 'album popularity ignored reversal: %', album_score; END IF;
  SELECT photo_id INTO first_photo FROM public.find_photos_by_jersey('99') LIMIT 1;
  IF NOT FOUND OR first_photo <> 'alpha-correction' THEN
    RAISE EXCEPTION 'search ranking did not apply reversal: %', first_photo;
  END IF;
  SELECT public.analytics_count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY['alpha'], NULL, NULL, NULL,
    NULL, NULL, NULL, 'shares', 'conservative'
  ) INTO visitors;
  IF visitors IS NULL OR visitors <> 5 THEN RAISE EXCEPTION 'distinct ignored reversal: %', visitors; END IF;
END $$;

-- Current visibility applies only to public/discovery outputs.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.album_engagement_30d WHERE album_key = 'beta') THEN
    RAISE EXCEPTION 'unlisted beta leaked into public album engagement';
  END IF;
  UPDATE public.album_settings SET visibility = 'unlisted' WHERE album_key = 'alpha';
  IF EXISTS (SELECT 1 FROM public.album_engagement_30d WHERE album_key = 'alpha') THEN
    RAISE EXCEPTION 'current unlisted alpha leaked into public album engagement';
  END IF;
  UPDATE public.album_settings SET visibility = 'public' WHERE album_key = 'alpha';
END $$;

-- Full-day preservation, an initial intersected boundary, all physically
-- present boundary events, fully expired-but-present rows, failed-summary
-- privacy behavior, freezing, retry, and later deletion are all distinct cases.
SELECT analytics_private.reconcile_daily_actions('2026-06-27', '2026-06-28T12:00:00Z');
SELECT analytics_private.reconcile_daily_actions('2026-06-29', '2026-09-27T12:00:00Z');
DO $$
DECLARE actions bigint; state text; window_start timestamptz;
BEGIN
  SELECT coalesce(sum(action_count), 0) INTO actions
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-06-29';
  SELECT coverage_state, raw_window_start INTO state, window_start
  FROM public.analytics_daily_coverage WHERE bucket_date = '2026-06-29';
  IF NOT FOUND OR actions <> 2 OR state <> 'partial'
    OR window_start <> '2026-06-29T12:00:00Z'::timestamptz
  THEN RAISE EXCEPTION 'boundary preservation wrong: %, %, %', actions, state, window_start; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.fail_jun28_summary()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bucket_date = '2026-06-28' THEN RAISE EXCEPTION 'synthetic preservation failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fail_jun28_summary
  BEFORE INSERT ON public.analytics_daily_actions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_jun28_summary();
SELECT analytics_private.prune_engagement_events_at('2026-09-27T12:00:00Z');
DROP TRIGGER fail_jun28_summary ON public.analytics_daily_actions;

DO $$
DECLARE actions bigint; raw_count bigint; state text; frozen timestamptz;
BEGIN
  SELECT coalesce(sum(action_count), 0) INTO actions
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-06-27';
  SELECT coverage_state, frozen_at INTO state, frozen
  FROM public.analytics_daily_coverage WHERE bucket_date = '2026-06-27';
  IF NOT FOUND OR actions <> 1 OR state <> 'complete' OR frozen IS NULL THEN
    RAISE EXCEPTION 'fully expired present day was not preserved/frozen: %, %, %', actions, state, frozen;
  END IF;

  SELECT coverage_state, frozen_at INTO state, frozen
  FROM public.analytics_daily_coverage WHERE bucket_date = '2026-06-28';
  SELECT count(*) INTO raw_count FROM public.engagement_events
  WHERE (created_at AT TIME ZONE 'America/Chicago')::date = '2026-06-28';
  IF NOT FOUND OR state <> 'unavailable' OR frozen IS NULL OR raw_count <> 0 THEN
    RAISE EXCEPTION 'failed summary changed retention policy: %, %, %', state, frozen, raw_count;
  END IF;

  SELECT coalesce(sum(action_count), 0) INTO actions
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-06-29';
  SELECT count(*) INTO raw_count FROM public.engagement_events
  WHERE (created_at AT TIME ZONE 'America/Chicago')::date = '2026-06-29';
  SELECT coverage_state, frozen_at INTO state, frozen
  FROM public.analytics_daily_coverage WHERE bucket_date = '2026-06-29';
  IF NOT FOUND OR actions <> 2 OR raw_count <> 1 OR state <> 'partial' OR frozen IS NULL THEN
    RAISE EXCEPTION 'boundary freeze lost a physical event: %, %, %, %', actions, raw_count, state, frozen;
  END IF;
END $$;

SELECT analytics_private.reconcile_daily_actions('2026-06-29', '2026-09-28T12:00:00Z');
SELECT analytics_private.prune_engagement_events_at('2026-09-28T12:00:00Z');
DO $$
DECLARE actions bigint; raw_count bigint;
BEGIN
  SELECT coalesce(sum(action_count), 0) INTO actions
  FROM public.analytics_daily_actions WHERE bucket_date = '2026-06-29';
  SELECT count(*) INTO raw_count FROM public.engagement_events
  WHERE (created_at AT TIME ZONE 'America/Chicago')::date = '2026-06-29';
  IF actions <> 2 OR raw_count <> 0 THEN
    RAISE EXCEPTION 'frozen boundary rewrote history or retained raw rows: %, %', actions, raw_count;
  END IF;
END $$;

-- No public role can call protected RPCs. The service role can read both scalar
-- contracts, including the unlisted private scope.
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.analytics_read_report_evidence('2026-09-27', '2026-09-27');
  RAISE EXCEPTION 'anon unexpectedly called protected report function';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.analytics_count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY[]::text[], NULL, NULL, NULL,
    NULL, NULL, NULL, 'photo_opens', 'inclusive'
  );
  RAISE EXCEPTION 'anon unexpectedly called protected distinct function';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE evidence jsonb; visitors bigint;
BEGIN
  SELECT public.analytics_read_report_evidence('2026-09-27', '2026-09-27') INTO evidence;
  IF evidence IS NULL OR jsonb_array_length(evidence->'coverage') <> 1 THEN
    RAISE EXCEPTION 'service report wrapper failed';
  END IF;
  SELECT public.analytics_count_distinct_visitors(
    '2026-09-27', '2026-09-27', ARRAY[]::text[], NULL, NULL, NULL,
    NULL, NULL, NULL, 'shares', 'conservative'
  ) INTO visitors;
  IF visitors IS NULL OR visitors <> 7 THEN
    RAISE EXCEPTION 'service distinct wrapper returned wrong any-action count: %', visitors;
  END IF;
END $$;
RESET ROLE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-reconcile-daily') THEN
    RAISE EXCEPTION 'reconciliation job was not scheduled';
  END IF;
END $$;

-- Live partial evidence agrees with the same raw snapshot and exposes no notes.
DO $$
DECLARE today date := (statement_timestamp() AT TIME ZONE 'America/Chicago')::date;
 evidence jsonb; actual bigint; expected bigint; first_seen timestamptz; diagnostic_id bigint;
BEGIN
 evidence := public.analytics_read_report_evidence(today,today);
 IF evidence->'coverage'->0->>'coverage_state' IS DISTINCT FROM 'partial' THEN
  RAISE EXCEPTION 'today must remain partial';
 END IF;
 SELECT coalesce(sum((row->>'action_count')::bigint),0) INTO actual
 FROM jsonb_array_elements(evidence->'rows') row
 WHERE row->>'event_type'='view' AND row->>'photo_id'<>''
 AND row->>'traffic_classification' IN ('audience','unclassified');
 SELECT count(*) INTO expected FROM analytics_private.effective_engagement_events e
 WHERE e.created_at >= today::timestamp AT TIME ZONE 'America/Chicago'
 AND e.created_at < statement_timestamp() AND e.event_type='view' AND e.photo_id IS NOT NULL
 AND e.effective_classification IN ('audience','unclassified');
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'live report differs from raw snapshot: % <> %',actual,expected;END IF;
 evidence:=public.analytics_read_report_evidence('2026-09-27','2026-09-28');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(evidence->'coverage') row WHERE row ? 'notes') THEN
  RAISE EXCEPTION 'coverage notes leaked for historical rows';END IF;
 INSERT INTO public.analytics_collection_diagnostics(diagnostic_type,status,traffic_context)
 VALUES('download','requested','test') RETURNING id INTO diagnostic_id;
 SELECT first_recorded_at INTO first_seen FROM public.analytics_diagnostic_coverage WHERE diagnostic_type='download';
 DELETE FROM public.analytics_collection_diagnostics WHERE id=diagnostic_id;
 IF first_seen IS NULL OR NOT EXISTS(SELECT 1 FROM public.analytics_diagnostic_coverage WHERE diagnostic_type='download' AND first_recorded_at=first_seen) THEN
  RAISE EXCEPTION 'diagnostic start was lost with detailed evidence';END IF;
END $$;

COMMIT;
