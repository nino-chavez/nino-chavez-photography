-- Dedicated synthetic rehearsal database only. Every mutation rolls back.
-- Fixtures for public.analytics_read_launch (20261006180000). Dates are in February 2026 so
-- nothing here meets the September 2026 rehearsal fixtures, and they are in the past, which the live
-- report needs (it reads "today" from the clock); the as-of instant is
-- 2026-02-20T18:00:00Z, which is Chicago 2026-02-20 12:00 (today, partial).
--
--   burst    first published Feb 1 (day 0), 100 500 120 20 90 4 6 photo opens in week 1, plus
--            operator traffic, tagged arrivals, downloads and album opens
--   trickle  Feb 3, 10 9 8 7 6 5 4
--   tie      Feb 5, the same week as trickle, so day 3 and day 7 tie
--   low      first published 2026-02-09T04:30Z = Feb 8 22:30 in Chicago, so day 0 is Feb 8
--   gap      Feb 12; Feb 17 (day 5) has unavailable coverage although rows exist for it
--   young    Feb 18; two complete days and a partial today
--   oldpub   public before anything recorded it (basis unobserved): no launch date
--   draft    unlisted, never published;  noRow  has photos and no album_settings row
BEGIN;
SET LOCAL statement_timeout = '30s';

-- Only these albums are launches: no other album_settings row, no other version-2 history.
DELETE FROM public.album_settings;
DELETE FROM public.analytics_events_v2;
DELETE FROM public.analytics_v2_archived_totals;

INSERT INTO public.albums (album_key, album_name, sport, event_date)
SELECT k, initcap(k) || ' launch', 'volleyball', '2026-01-15'
FROM unnest(ARRAY['burst','trickle','tie','low','gap','young','oldpub','draft','noRow']) k;

-- draft: the row exists before its photos, as a new --unlisted ingest writes it, so its basis stays NULL.
INSERT INTO public.album_settings (album_key, visibility) VALUES ('draft', 'unlisted');
INSERT INTO public.album_settings (album_key, visibility, published_at, published_at_basis, first_published_at, first_published_at_basis) VALUES
  ('burst',   'public', '2026-02-01T16:00:00Z', 'recorded', '2026-02-01T16:00:00Z', 'recorded'),
  ('trickle', 'public', '2026-02-03T16:00:00Z', 'recorded', '2026-02-03T16:00:00Z', 'recorded'),
  ('tie',     'public', '2026-02-05T16:00:00Z', 'recorded', '2026-02-05T16:00:00Z', 'recorded'),
  ('low',     'public', '2026-02-09T04:30:00Z', 'recorded', '2026-02-09T04:30:00Z', 'recorded'),
  ('gap',     'public', '2026-02-12T16:00:00Z', 'recorded', '2026-02-12T16:00:00Z', 'recorded'),
  ('young',   'public', '2026-02-18T16:00:00Z', 'recorded', '2026-02-18T16:00:00Z', 'recorded');
INSERT INTO public.album_settings (album_key, visibility, first_published_at_basis, first_published_at_evidence)
  VALUES ('oldpub', 'public', 'unobserved', 'rehearsal: public before any publication was recorded');

INSERT INTO public.photo_metadata (photo_id, album_key, image_key, album_name, sport_type, photo_category, cf_image_id, sharpness, quality_score)
SELECT k || '-' || n, k, k || '-' || n, initcap(k) || ' launch', 'volleyball', 'action', 'fixture-' || k || '-' || n, 1, 80
FROM unnest(ARRAY['burst','trickle','tie','low','gap','young','oldpub','draft','noRow']) k, generate_series(1, 2) n;

INSERT INTO public.analytics_daily_coverage (bucket_date, raw_window_start, raw_window_end, cutoff_at, coverage_state, catalogue_basis)
SELECT d::date, d, d + interval '1 day', d + interval '1 day',
  CASE WHEN d::date = '2026-02-17' THEN 'unavailable' WHEN d::date = '2026-02-20' THEN 'partial' ELSE 'complete' END, 'event_snapshot'
FROM generate_series('2026-01-28'::date, '2026-02-20'::date, interval '1 day') d;

-- One call writes a day: photo opens (audience, unclassified, operator), tagged arrivals, photo
-- and album-level downloads, and album opens.
CREATE FUNCTION pg_temp.fx(k text, d date, po_a int, po_u int DEFAULT 0, dl int DEFAULT 0, ao int DEFAULT 0, po_op int DEFAULT 0, arrivals int DEFAULT 0, dl_album int DEFAULT 0)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.analytics_daily_actions (bucket_date, album_key, photo_id, event_type, source_kind, traffic_classification, catalogue_basis, coverage_state, action_count)
  SELECT d, k, pid, et, sk, cls, 'event_snapshot', 'complete', n FROM (VALUES
    (k || '-1', 'view',       'internal_open_location', 'audience',     po_a),
    (k || '-1', 'view',       'internal_open_location', 'unclassified', po_u),
    (k || '-1', 'view',       'internal_open_location', 'operator',     po_op),
    ('',        'view',       'tagged_arrival',         'audience',     arrivals),
    (k || '-2', 'download',   'action',                 'audience',     dl),
    ('',        'download',   'action',                 'audience',     dl_album),
    ('',        'album_open', 'internal_open_location', 'audience',     ao)
  ) v(pid, et, sk, cls, n) WHERE n > 0;
$$;

-- burst: week 1 audience + unclassified = 100 500 120 20 90 4 6, then a tail.
SELECT pg_temp.fx('burst', '2026-02-01', 90,  10, 0,  8, 50, 2, 0);
SELECT pg_temp.fx('burst', '2026-02-02', 480, 20, 55, 17, 0, 2, 3);
SELECT pg_temp.fx('burst', '2026-02-03', 110, 10, 4,  7, 0, 2, 0);
SELECT pg_temp.fx('burst', '2026-02-04', 15,  5,  0,  3, 0, 2, 0);
SELECT pg_temp.fx('burst', '2026-02-05', 80,  10, 0,  0, 0, 2, 0);
SELECT pg_temp.fx('burst', '2026-02-06', 3,   1,  0,  0, 0, 2, 0);
SELECT pg_temp.fx('burst', '2026-02-07', 5,   1,  0,  0, 0, 2, 0);
SELECT pg_temp.fx('burst', d::date, 2) FROM generate_series('2026-02-08'::date, '2026-02-14'::date, interval '1 day') d;
SELECT pg_temp.fx('burst', d::date, 1) FROM generate_series('2026-02-15'::date, '2026-02-19'::date, interval '1 day') d;
-- trickle and tie: the same seven days, so their totals tie at day 3 (27) and day 7 (49).
SELECT pg_temp.fx('trickle', ('2026-02-03'::date + o)::date, 10 - o) FROM generate_series(0, 6) o;
SELECT pg_temp.fx('trickle', d::date, 1) FROM generate_series('2026-02-10'::date, '2026-02-16'::date, interval '1 day') d;
SELECT pg_temp.fx('tie', ('2026-02-05'::date + o)::date, 10 - o) FROM generate_series(0, 6) o;
SELECT pg_temp.fx('tie', d::date, 1) FROM generate_series('2026-02-12'::date, '2026-02-18'::date, interval '1 day') d;
SELECT pg_temp.fx('low', d::date, 1) FROM generate_series('2026-02-08'::date, '2026-02-14'::date, interval '1 day') d;
SELECT pg_temp.fx('gap', d::date, 5) FROM generate_series('2026-02-12'::date, '2026-02-19'::date, interval '1 day') d;
SELECT pg_temp.fx('young', '2026-02-18', 7);
SELECT pg_temp.fx('young', '2026-02-19', 3);
SELECT pg_temp.fx('young', '2026-02-20', 15);  -- today, partial
SELECT pg_temp.fx('oldpub', '2026-02-04', 100);
SELECT pg_temp.fx('oldpub', d::date, 3) FROM generate_series('2026-02-05'::date, '2026-02-19'::date, interval '1 day') d;

-- Version-2 collection starts Feb 4. Raw rows, one reclassified by a correction, and archived totals.
INSERT INTO public.analytics_events_v2 (event_id, schema_version, event_name, occurred_at, traffic_context, album_key, photo_id, properties)
SELECT gen_random_uuid(), 2, v.ev, v.at::timestamptz, v.ctx, v.album, v.photo, '{}'::jsonb FROM (VALUES
  ('photo_exposed',  '2026-02-04T15:00:00Z', 'audience',      'burst', 'burst-1'),
  ('photo_exposed',  '2026-02-04T15:01:00Z', 'audience',      'burst', 'burst-1'),
  ('photo_exposed',  '2026-02-04T15:02:00Z', 'audience',      'burst', 'burst-1'),
  ('photo_exposed',  '2026-02-04T15:03:00Z', 'audience',      'burst', 'burst-1'),
  ('photo_exposed',  '2026-02-04T15:04:00Z', 'operator',      'burst', 'burst-1'),
  ('photo_exposed',  '2026-02-04T15:05:00Z', 'test',          'burst', 'burst-1'),
  ('photo_exposed',  '2026-02-04T15:06:00Z', 'self_excluded', 'burst', 'burst-1'),
  ('photo_rendered', '2026-02-05T15:00:00Z', 'audience',      'burst', 'burst-1'),
  ('photo_rendered', '2026-02-05T15:01:00Z', 'audience',      'burst', 'burst-1'),
  ('photo_exposed',  '2026-02-19T15:00:00Z', 'audience',      'young', 'young-1'),
  ('photo_exposed',  '2026-02-19T15:01:00Z', 'audience',      'young', 'young-1'),
  ('photo_exposed',  '2026-02-19T15:02:00Z', 'audience',      'young', 'young-1'),
  ('photo_exposed',  '2026-02-19T15:03:00Z', 'audience',      'young', 'young-1'),
  ('photo_exposed',  '2026-02-20T15:00:00Z', 'audience',      'young', 'young-1')  -- today: not a complete day
) v(ev, at, ctx, album, photo);
INSERT INTO public.analytics_event_v2_classifications (event_id, classification_version, classification, note, corrected_by)
SELECT event_id, 1, 'known_crawler', 'rehearsal correction', gen_random_uuid()
FROM public.analytics_events_v2 WHERE occurred_at = '2026-02-04T15:03:00Z';
INSERT INTO public.analytics_v2_archived_totals (bucket_date, event_name, traffic_context, album_key, photo_id, event_count, export_eligible_count, last_recorded_at) VALUES
  ('2026-02-06', 'photo_exposed', 'audience', 'burst', 'burst-2', 7, 0, '2026-02-06T20:00:00Z'),
  ('2026-02-06', 'photo_exposed', 'operator', 'burst', 'burst-2', 2, 0, '2026-02-06T20:00:00Z');

SET LOCAL ROLE service_role;

-- 1. Shape, and nothing that identifies a visitor or an event.
DO $$ DECLARE r jsonb;
BEGIN
  r := public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 14, 'conservative');
  IF NOT (r ?& ARRAY['asOf','today','lastCompleteDay','days','traffic','album','launches']) THEN RAISE EXCEPTION 'top-level shape wrong: %', r - 'launches'; END IF;
  IF r->>'today' <> '2026-02-20' OR r->>'lastCompleteDay' <> '2026-02-19' THEN RAISE EXCEPTION 'as-of did not resolve to the Chicago day: % %', r->>'today', r->>'lastCompleteDay'; END IF;
  IF NOT (r->'album' ?& ARRAY['albumKey','albumName','firstPublishedAt','basis','firstPublishedAtEvidence','status','elapsedDays','series','currentDay','totals','rank','reason','window','photosInAlbum','photosWithActivity','photos','exposure']) THEN RAISE EXCEPTION 'album shape wrong: %', (SELECT jsonb_agg(k) FROM jsonb_object_keys(r->'album') k); END IF;
  IF r::text ~* 'anonymous_browser_id|visit_id|session_hash|browser_id|event_id|occurred_at|user_agent|ip_address' THEN RAISE EXCEPTION 'an identifier or raw event field leaked'; END IF;
  IF jsonb_array_length(r->'launches') <> 6 THEN RAISE EXCEPTION 'comparison set should hold the six dated public launches, got %', jsonb_array_length(r->'launches'); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'launches') l WHERE l->>'albumKey' IN ('oldpub','draft','noRow')) THEN RAISE EXCEPTION 'an undated album entered the comparison set'; END IF;
END $$;

-- 2. A burst launch: values, the photo-opens rule, status, totals and rank.
DO $$ DECLARE r jsonb; b jsonb;
BEGIN
  r := public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 14, 'conservative');
  b := r->'album';
  IF b->>'firstPublishedAt' IS NULL OR b->>'basis' <> 'recorded' OR b->>'status' <> 'finished' OR (b->>'elapsedDays')::int <> 19 THEN RAISE EXCEPTION 'burst launch facts wrong: % % % %', b->>'firstPublishedAt', b->>'basis', b->>'status', b->>'elapsedDays'; END IF;
  IF jsonb_array_length(b->'series') <> 14 THEN RAISE EXCEPTION 'series should hold days 0-13, got %', jsonb_array_length(b->'series'); END IF;
  IF (SELECT jsonb_agg(x->'photoOpens' ORDER BY (x->>'day')::int) FROM jsonb_array_elements(b->'series') x WHERE (x->>'day')::int < 7) <> '[100,500,120,20,90,4,6]'::jsonb THEN
    RAISE EXCEPTION 'photo opens by day wrong (tagged arrivals or operator traffic counted?): %', (SELECT jsonb_agg(x->'photoOpens' ORDER BY (x->>'day')::int) FROM jsonb_array_elements(b->'series') x WHERE (x->>'day')::int < 7); END IF;
  IF (SELECT jsonb_agg(x->'downloads' ORDER BY (x->>'day')::int) FROM jsonb_array_elements(b->'series') x WHERE (x->>'day')::int < 4) <> '[0,58,4,0]'::jsonb THEN RAISE EXCEPTION 'downloads by day wrong (photo and album-level)'; END IF;
  IF (SELECT jsonb_agg(x->'albumOpens' ORDER BY (x->>'day')::int) FROM jsonb_array_elements(b->'series') x WHERE (x->>'day')::int < 5) <> '[8,17,7,3,0]'::jsonb THEN RAISE EXCEPTION 'album opens by day wrong'; END IF;
  IF (b->'series'->0->>'date') <> '2026-02-01' OR (b->'series'->0->>'day') <> '0' OR (b->'series'->0->>'coverage') <> 'complete' THEN RAISE EXCEPTION 'day 0 is not the Chicago publication day'; END IF;
  IF (b->'totals'->'day3'->>'photoOpens')::int <> 720 OR (b->'totals'->'day7'->>'photoOpens')::int <> 840 THEN RAISE EXCEPTION 'totals wrong: % %', b->'totals'->'day3', b->'totals'->'day7'; END IF;
  IF (b->'totals'->'day3'->>'downloads')::int <> 62 OR (b->'totals'->'day7'->>'albumOpens')::int <> 35 THEN RAISE EXCEPTION 'download or album-open totals wrong'; END IF;
  IF (b->'rank'->'day7'->>'rank')::int <> 1 OR (b->'rank'->'day3'->>'rank')::int <> 1 THEN RAISE EXCEPTION 'burst should rank first: %', b->'rank'; END IF;
  IF (b->'rank'->'day7'->>'compared')::int <> 4 OR (b->'rank'->'day3'->>'compared')::int <> 5 THEN RAISE EXCEPTION 'compared counts wrong: %', b->'rank'; END IF;
  IF jsonb_typeof(b->'currentDay') <> 'null' THEN RAISE EXCEPTION 'burst day 19 is past the 14-day window, so there is no current day: %', b->'currentDay'; END IF;
  -- Inclusive keeps operator traffic: day 0 is 150, not 100. Arrivals stay out in both modes.
  r := public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 14, 'inclusive');
  IF (r->'album'->'series'->0->>'photoOpens')::int <> 150 THEN RAISE EXCEPTION 'inclusive day 0 should be 150: %', r->'album'->'series'->0; END IF;
  IF r->>'traffic' <> 'inclusive' THEN RAISE EXCEPTION 'traffic mode not echoed'; END IF;
END $$;

-- 3. The read model agrees with the live report, day by day, for every measure and both traffic modes.
DO $$ DECLARE r jsonb; rep jsonb; m text; t text; measure_key text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conservative','inclusive'] LOOP
    r := public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 14, t);
    FOREACH m IN ARRAY ARRAY['photo_opens','downloads','album_opens'] LOOP
      measure_key := CASE m WHEN 'photo_opens' THEN 'photoOpens' WHEN 'downloads' THEN 'downloads' ELSE 'albumOpens' END;
      rep := public.analytics_read_scheduled_gallery_report('2026-02-01','2026-02-14',m,'album',ARRAY['burst'],NULL,NULL,NULL,NULL,NULL,NULL,'none',NULL,NULL,t,true,0,0,'popular',false,false);
      IF (SELECT jsonb_agg(d->'count' ORDER BY d->>'date') FROM jsonb_array_elements(rep->'daily') d)
         IS DISTINCT FROM (SELECT jsonb_agg(x->measure_key ORDER BY x->>'date') FROM jsonb_array_elements(r->'album'->'series') x) THEN
        RAISE EXCEPTION 'launch series differs from the live report for % / %: % vs %', t, m,
          (SELECT jsonb_agg(d->'count' ORDER BY d->>'date') FROM jsonb_array_elements(rep->'daily') d),
          (SELECT jsonb_agg(x->measure_key ORDER BY x->>'date') FROM jsonb_array_elements(r->'album'->'series') x);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 4. A trickle launch and a tie. Competition ranking: 1, 2, 2, then 4 and 5 at day 3.
DO $$ DECLARE r jsonb; l jsonb; k text;
BEGIN
  r := public.analytics_read_launch('trickle', '2026-02-20T18:00:00Z', 14, 'conservative');
  l := r->'album';
  IF (SELECT jsonb_agg(x->'photoOpens' ORDER BY (x->>'day')::int) FROM jsonb_array_elements(l->'series') x WHERE (x->>'day')::int < 7) <> '[10,9,8,7,6,5,4]'::jsonb THEN RAISE EXCEPTION 'trickle series wrong'; END IF;
  IF (l->'totals'->'day3'->>'photoOpens')::int <> 27 OR (l->'totals'->'day7'->>'photoOpens')::int <> 49 THEN RAISE EXCEPTION 'trickle totals wrong'; END IF;
  FOR k IN SELECT unnest(ARRAY['trickle','tie']) LOOP
    l := (SELECT x FROM jsonb_array_elements(r->'launches') x WHERE x->>'albumKey' = k);
    IF (l->'rank'->'day7'->>'rank')::int <> 2 OR (l->'rank'->'day3'->>'rank')::int <> 2 OR NOT (l->'rank'->'day7'->>'tied')::boolean OR NOT (l->'rank'->'day3'->>'tied')::boolean THEN RAISE EXCEPTION 'tie not shared for %: %', k, l->'rank'; END IF;
  END LOOP;
  l := (SELECT x FROM jsonb_array_elements(r->'launches') x WHERE x->>'albumKey' = 'low');
  IF (l->'rank'->'day7'->>'rank')::int <> 4 THEN RAISE EXCEPTION 'the rank after a two-way tie should skip to 4, got %', l->'rank'->'day7'; END IF;
  IF (l->'rank'->'day3'->>'rank')::int <> 5 THEN RAISE EXCEPTION 'low should be fifth at day 3 (gap is fourth), got %', l->'rank'->'day3'; END IF;
  IF (l->'rank'->'day7'->>'tied')::boolean THEN RAISE EXCEPTION 'low is not tied'; END IF;
  IF (l->'series'->0->>'date') <> '2026-02-08' THEN RAISE EXCEPTION 'a publication at 22:30 Chicago on Feb 8 (04:30Z Feb 9) must be day 0 = Feb 8, got %', l->'series'->0->>'date'; END IF;
  IF (SELECT jsonb_agg(x->>'albumKey' ORDER BY (x->'rank'->'day7'->>'rank')::int, x->>'albumKey') FROM jsonb_array_elements(r->'launches') x WHERE (x->'rank'->'day7'->>'rank') IS NOT NULL) <> '["burst","tie","trickle","low"]'::jsonb THEN RAISE EXCEPTION 'day 7 order wrong'; END IF;
END $$;

-- 5. Missing coverage is unknown, not zero, and it blocks a total instead of shrinking it.
DO $$ DECLARE r jsonb; g jsonb; cell jsonb;
BEGIN
  r := public.analytics_read_launch('gap', '2026-02-20T18:00:00Z', 14, 'conservative');
  g := r->'album';
  cell := (SELECT x FROM jsonb_array_elements(g->'series') x WHERE x->>'date' = '2026-02-17');
  IF cell->>'coverage' <> 'unavailable' OR jsonb_typeof(cell->'photoOpens') <> 'null' THEN RAISE EXCEPTION 'an unavailable day must show null counts, not the rows that exist for it: %', cell; END IF;
  IF (g->'totals'->'day7'->>'complete')::boolean OR jsonb_typeof(g->'totals'->'day7'->'photoOpens') <> 'null' OR (g->'totals'->'day7'->>'reached')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'day 7 reached but incomplete should be null: %', g->'totals'->'day7'; END IF;
  IF (g->'totals'->'day3'->>'photoOpens')::int <> 15 OR (g->'rank'->'day3'->>'rank')::int <> 4 THEN RAISE EXCEPTION 'day 3 is complete for gap: %', g->'totals'->'day3'; END IF;
  IF jsonb_typeof(g->'rank'->'day7'->'rank') <> 'null' THEN RAISE EXCEPTION 'a launch with no day 7 total has no day 7 rank'; END IF;
  IF g->>'status' <> 'finished' THEN RAISE EXCEPTION 'status follows elapsed days: %', g->>'status'; END IF;
END $$;

-- 6. A partial current day, a launch younger than three days, and days after as-of are absent.
DO $$ DECLARE r jsonb; y jsonb;
BEGIN
  r := public.analytics_read_launch('young', '2026-02-20T18:00:00Z', 14, 'conservative');
  y := r->'album';
  IF y->>'status' <> 'in_progress' OR (y->>'elapsedDays')::int <> 2 THEN RAISE EXCEPTION 'young launch status wrong: % %', y->>'status', y->>'elapsedDays'; END IF;
  IF jsonb_array_length(y->'series') <> 2 OR (SELECT jsonb_agg(x->'photoOpens' ORDER BY (x->>'day')::int) FROM jsonb_array_elements(y->'series') x) <> '[7,3]'::jsonb THEN RAISE EXCEPTION 'young series should be the two complete days, got %', y->'series'; END IF;
  IF (y->'currentDay'->>'date') <> '2026-02-20' OR y->'currentDay'->>'coverage' <> 'partial' OR (y->'currentDay'->>'photoOpens')::int <> 15 OR (y->'currentDay'->>'day')::int <> 2 THEN RAISE EXCEPTION 'today should be returned apart as a partial day: %', y->'currentDay'; END IF;
  IF (y->'totals'->'day3'->>'reached')::boolean OR jsonb_typeof(y->'totals'->'day3'->'photoOpens') <> 'null' THEN RAISE EXCEPTION 'a launch younger than 3 days has no day 3 total: %', y->'totals'->'day3'; END IF;
  IF jsonb_typeof(y->'rank'->'day3'->'rank') <> 'null' OR jsonb_typeof(y->'rank'->'day7'->'rank') <> 'null' THEN RAISE EXCEPTION 'a young launch is not ranked: %', y->'rank'; END IF;
  -- The partial day never enters another launch's totals either: nothing in any series is today or later.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'launches') l, jsonb_array_elements(l->'series') s WHERE (s->>'date')::date >= '2026-02-20') THEN RAISE EXCEPTION 'a series holds today or a later day'; END IF;
  -- An earlier as-of: the same launch, one day younger. Feb 19 is now the partial day, and Feb 20 does not exist.
  r := public.analytics_read_launch('young', '2026-02-19T18:00:00Z', 14, 'conservative');
  y := r->'album';
  IF jsonb_array_length(y->'series') <> 1 OR (y->'currentDay'->>'date') <> '2026-02-19' OR (y->'currentDay'->>'photoOpens')::int <> 3 THEN RAISE EXCEPTION 'as-of one day earlier: %', y; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'launches') l, jsonb_array_elements(l->'series') s WHERE (s->>'date')::date >= '2026-02-19') THEN RAISE EXCEPTION 'a series holds a day on or after the earlier as-of'; END IF;
  -- Before the album was published: no days at all, not a row of zeros.
  r := public.analytics_read_launch('young', '2026-02-17T18:00:00Z', 14, 'conservative');
  y := r->'album';
  IF jsonb_array_length(y->'series') <> 0 OR jsonb_typeof(y->'currentDay') <> 'null' OR (y->>'elapsedDays')::int <> 0 THEN RAISE EXCEPTION 'a launch that has not started must have no days: %', y; END IF;
  IF jsonb_array_length(r->'launches') <> 6 THEN RAISE EXCEPTION 'the comparison set does not depend on as-of for membership'; END IF;
  -- At as-of Feb 10 the burst has 9 complete days and its day 7 is reached; trickle's day 7 (Feb 9) is too, tie's is not.
  r := public.analytics_read_launch('burst', '2026-02-10T18:00:00Z', 14, 'conservative');
  IF (r->'album'->>'status') <> 'finished' OR jsonb_array_length(r->'album'->'series') <> 9 OR (r->'album'->'rank'->'day7'->>'compared')::int <> 2 THEN RAISE EXCEPTION 'as-of Feb 10: %', r->'album'->'rank'; END IF;
END $$;

-- 7. Undated albums: no invented date, the reason, and the requested window.
DO $$ DECLARE r jsonb; a jsonb;
BEGIN
  r := public.analytics_read_launch('oldpub', '2026-02-20T18:00:00Z', 14, 'conservative');
  a := r->'album';
  IF a->>'status' <> 'no_launch_date' OR jsonb_typeof(a->'firstPublishedAt') <> 'null' OR a->>'basis' <> 'unobserved' THEN RAISE EXCEPTION 'unobserved album facts wrong: %', a - 'photos' - 'series'; END IF;
  IF a->'reason'->>'code' <> 'unobserved' OR a->'reason'->>'text' NOT LIKE 'rehearsal: public before%' OR a->>'firstPublishedAtEvidence' IS NULL THEN RAISE EXCEPTION 'reason missing: %', a->'reason'; END IF;
  IF jsonb_typeof(a->'totals') <> 'null' OR jsonb_typeof(a->'rank') <> 'null' THEN RAISE EXCEPTION 'an undated album has no totals or rank'; END IF;
  IF jsonb_array_length(a->'series') <> 14 OR a->'series'->0->>'date' <> '2026-02-06' OR a->'series'->13->>'date' <> '2026-02-19' OR jsonb_typeof(a->'series'->0->'day') <> 'null' THEN RAISE EXCEPTION 'default window should be the last 14 complete days: %', a->'series'->0; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(a->'series') x WHERE (x->>'photoOpens')::int <> 3) THEN RAISE EXCEPTION 'undated activity wrong'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'launches') l WHERE l->>'albumKey' = 'oldpub') THEN RAISE EXCEPTION 'an undated album was ranked'; END IF;
  r := public.analytics_read_launch('oldpub', '2026-02-20T18:00:00Z', 14, 'conservative', true, '2026-02-04', '2026-02-05');
  IF (SELECT jsonb_agg(x->'photoOpens' ORDER BY x->>'date') FROM jsonb_array_elements(r->'album'->'series') x) <> '[100,3]'::jsonb THEN RAISE EXCEPTION 'requested window wrong: %', r->'album'->'series'; END IF;
  r := public.analytics_read_launch('draft', '2026-02-20T18:00:00Z', 14, 'conservative');
  IF r->'album'->'reason'->>'code' <> 'not_published' OR r->'album'->>'status' <> 'no_launch_date' THEN RAISE EXCEPTION 'draft should say not published: %', r->'album'->'reason'; END IF;
  r := public.analytics_read_launch('noRow', '2026-02-20T18:00:00Z', 14, 'conservative');
  IF r->'album'->'reason'->>'code' <> 'no_record' THEN RAISE EXCEPTION 'an album with no settings row should say no record: %', r->'album'->'reason'; END IF;
END $$;

-- 8. Photos and exposure. Counts from the daily table, exposure from version-2 collection.
DO $$ DECLARE r jsonb; p1 jsonb; p2 jsonb;
BEGIN
  r := public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 14, 'conservative');
  p1 := (SELECT x FROM jsonb_array_elements(r->'album'->'photos') x WHERE x->>'photoId' = 'burst-1');
  p2 := (SELECT x FROM jsonb_array_elements(r->'album'->'photos') x WHERE x->>'photoId' = 'burst-2');
  IF (p1->>'opens')::int <> 854 OR (p1->>'downloads')::int <> 0 THEN RAISE EXCEPTION 'burst-1 counts wrong: %', p1; END IF;
  IF (p2->>'downloads')::int <> 59 OR (p2->>'opens')::int <> 0 THEN RAISE EXCEPTION 'burst-2 downloads are photo-level only (55 + 4): %', p2; END IF;
  IF r->'album'->'exposure'->>'since' <> '2026-02-04' OR r->'album'->'exposure'->>'coverage' <> 'partial' THEN RAISE EXCEPTION 'version-2 began Feb 4, mid-launch: %', r->'album'->'exposure'; END IF;
  IF NOT (p1->>'exposureRecorded')::boolean OR (p1->>'exposures')::int <> 3 OR (p1->>'renders')::int <> 2 THEN RAISE EXCEPTION 'conservative exposure for burst-1 should be 3 exposed, 2 rendered (operator, test, self-excluded and the reclassified crawler out): %', p1; END IF;
  IF (p2->>'exposures')::int <> 7 THEN RAISE EXCEPTION 'archived totals must count: %', p2; END IF;
  IF (r->'album'->>'photosInAlbum')::int <> 2 OR (r->'album'->>'photosWithActivity')::int <> 2 THEN RAISE EXCEPTION 'photo counts wrong'; END IF;
  IF (SELECT jsonb_agg(x->>'photoId') FROM jsonb_array_elements(r->'album'->'photos') x) <> '["burst-1","burst-2"]'::jsonb THEN RAISE EXCEPTION 'photos should be ordered by opens'; END IF;
  r := public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 14, 'inclusive');
  p1 := (SELECT x FROM jsonb_array_elements(r->'album'->'photos') x WHERE x->>'photoId' = 'burst-1');
  IF (p1->>'exposures')::int <> 6 THEN RAISE EXCEPTION 'inclusive exposure should be 3 audience + the reclassified crawler + operator + test = 6 (self-excluded stays out): %', p1; END IF;
  IF (SELECT (x->>'exposures')::int FROM jsonb_array_elements(r->'album'->'photos') x WHERE x->>'photoId' = 'burst-2') <> 9 THEN RAISE EXCEPTION 'inclusive archived exposure should be 9'; END IF;
  -- A window that ends before version-2 collection began: exposure was not recorded, so it is null, not zero.
  r := public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 3, 'conservative');
  p1 := (SELECT x FROM jsonb_array_elements(r->'album'->'photos') x WHERE x->>'photoId' = 'burst-1');
  IF r->'album'->'exposure'->>'coverage' <> 'none' OR (p1->>'exposureRecorded')::boolean OR jsonb_typeof(p1->'exposures') <> 'null' OR jsonb_typeof(p1->'renders') <> 'null' THEN RAISE EXCEPTION 'exposure before collection began must be null with exposureRecorded false: %', p1; END IF;
  IF (p1->>'opens')::int <> 720 THEN RAISE EXCEPTION 'opens are still counted when exposure is not recorded: %', p1; END IF;
  -- A window wholly after collection began, with no exposure rows for the photo: recorded, and zero.
  r := public.analytics_read_launch('oldpub', '2026-02-20T18:00:00Z', 14, 'conservative');
  IF r->'album'->'exposure'->>'coverage' <> 'complete' OR (r->'album'->'photos'->0->>'exposureRecorded')::boolean IS NOT TRUE OR (r->'album'->'photos'->0->>'exposures')::int <> 0 THEN RAISE EXCEPTION 'recorded exposure with no rows is zero: %', r->'album'->'photos'->0; END IF;
  -- Today's version-2 rows are not a complete day.
  r := public.analytics_read_launch('young', '2026-02-20T18:00:00Z', 14, 'conservative');
  IF (r->'album'->'photos'->0->>'exposures')::int <> 4 THEN RAISE EXCEPTION 'exposure counts complete days only (4, not 5): %', r->'album'->'photos'->0; END IF;
END $$;

-- 9. Only the service role may call it, and a bad request fails loudly.
DO $$ BEGIN
  BEGIN PERFORM public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 0); RAISE EXCEPTION 'zero days accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid launch days' THEN RAISE; END IF; END;
  BEGIN PERFORM public.analytics_read_launch('burst', '2026-02-20T18:00:00Z', 14, 'everything'); RAISE EXCEPTION 'unknown traffic accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid traffic option' THEN RAISE; END IF; END;
  BEGIN PERFORM public.analytics_read_launch('no-such-album'); RAISE EXCEPTION 'unknown album accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
DO $$ BEGIN
  BEGIN SET LOCAL ROLE anon; PERFORM public.analytics_read_launch('burst'); RAISE EXCEPTION 'anon unexpectedly executed the launch read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  BEGIN SET LOCAL ROLE authenticated; PERFORM public.analytics_read_launch('burst'); RAISE EXCEPTION 'authenticated unexpectedly executed the launch read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
END $$;

ROLLBACK;
