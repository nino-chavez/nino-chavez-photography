-- Synthetic-only regression for one fingerprint flagged on multiple days.
BEGIN;
INSERT INTO public.engagement_events (
 photo_id, album_key, event_type, session_hash, source, source_kind,
 created_at, event_day, traffic_context
)
SELECT 'alpha-bulk-' || n, 'alpha', 'view', 'multi-day-burst',
 'multiplicity-regression', 'internal_open_location',
 day::timestamptz + interval '18 hours' + (n || ' milliseconds')::interval,
 day::date, 'audience'
FROM generate_series(1,501) n CROSS JOIN (VALUES ('2026-09-24'),('2026-09-25')) days(day);
DO $$ DECLARE raw_count bigint; effective_count bigint; durable_count bigint; BEGIN
 SELECT count(*) INTO raw_count FROM public.engagement_events WHERE source='multiplicity-regression';
 SELECT count(*) INTO effective_count FROM analytics_private.effective_engagement_events WHERE source='multiplicity-regression';
 IF raw_count <> 1002 OR effective_count <> raw_count THEN
  RAISE EXCEPTION 'classification join multiplied events: raw %, effective %', raw_count, effective_count;
 END IF;
 PERFORM analytics_private.reconcile_daily_actions('2026-09-24','2026-09-28T12:00:00Z');
 PERFORM analytics_private.reconcile_daily_actions('2026-09-25','2026-09-28T12:00:00Z');
 SELECT sum(action_count) INTO durable_count FROM public.analytics_daily_actions WHERE source='multiplicity-regression';
 IF durable_count <> raw_count THEN RAISE EXCEPTION 'durable totals multiplied events: % vs %',durable_count,raw_count; END IF;
END $$;
ROLLBACK;
