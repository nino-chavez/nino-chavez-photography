-- 20261007180000: rejection reasons. Run after collection-reasons-before.sql and the migration.
SET LOCAL ROLE service_role;
DO $$
DECLARE today date := (now() AT TIME ZONE 'America/Chicago')::date; health jsonb;
BEGIN
 -- Rows counted before the migration keep their totals; a rejection reads not_recorded, never a guessed reason.
 IF (SELECT count FROM public.analytics_collection_delivery_counters WHERE bucket_date=today-5 AND outcome='rejected' AND reason='not_recorded') IS DISTINCT FROM 24882 THEN RAISE EXCEPTION 'prior rejections were not kept as not_recorded'; END IF;
 IF EXISTS(SELECT 1 FROM public.analytics_collection_delivery_counters WHERE outcome<>'rejected' AND reason<>'none') THEN RAISE EXCEPTION 'accepted or duplicate row carries a reason'; END IF;

 -- The deployed collector's exact call, between migration and deploy: named arguments, no reason.
 PERFORM public.analytics_record_collection_delivery(p_schema_version => 2::smallint, p_outcome => 'rejected');
 PERFORM public.analytics_record_collection_delivery(p_schema_version => 2::smallint, p_outcome => 'accepted');
 PERFORM public.analytics_record_collection_delivery(p_schema_version => 2::smallint, p_outcome => 'accepted');
 IF (SELECT count FROM public.analytics_collection_delivery_counters WHERE bucket_date=today AND outcome='rejected' AND reason='not_recorded') IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'deployed rejection call not counted as not_recorded'; END IF;
 IF (SELECT count FROM public.analytics_collection_delivery_counters WHERE bucket_date=today AND outcome='accepted' AND reason='none') IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'deployed accepted call not counted once per call'; END IF;

 -- The new collector's call.
 PERFORM public.analytics_record_collection_delivery(p_schema_version => 2::smallint, p_outcome => 'rejected', p_reason => 'known_crawler');
 PERFORM public.analytics_record_collection_delivery(p_schema_version => 2::smallint, p_outcome => 'rejected', p_reason => 'known_crawler');
 PERFORM public.analytics_record_collection_delivery(p_schema_version => 2::smallint, p_outcome => 'rejected', p_reason => 'accept_failed');
 IF (SELECT count FROM public.analytics_collection_delivery_counters WHERE bucket_date=today AND reason='known_crawler') IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'crawler reason not counted per call'; END IF;

 BEGIN PERFORM public.analytics_record_collection_delivery(2::smallint,'rejected','guessed'); RAISE EXCEPTION 'unknown reason accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.analytics_record_collection_delivery(2::smallint,'accepted','known_crawler'); RAISE EXCEPTION 'reason on an accepted event accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 -- One function, so PostgREST has a single candidate for the deployed two-argument call.
 IF (SELECT count(*) FROM pg_proc WHERE proname='analytics_record_collection_delivery' AND pronamespace='public'::regnamespace) <> 1 THEN RAISE EXCEPTION 'collection counter function is overloaded'; END IF;

 health := public.analytics_posthog_delivery_health();
 IF (health->'collection'->>'rejected')::bigint IS DISTINCT FROM 24882+1+2+1 THEN RAISE EXCEPTION 'collection rejected total does not sum across reasons: %', health->'collection'; END IF;
 IF (health->'collection'->>'accepted')::bigint IS DISTINCT FROM 682+2 THEN RAISE EXCEPTION 'collection accepted total changed: %', health->'collection'; END IF;
 IF jsonb_array_length(health->'collection_rejected_days') <> 4 THEN RAISE EXCEPTION 'rejected days are not one row per day and reason: %', health->'collection_rejected_days'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(health->'collection_rejected_days') d WHERE (d->>'day')::date=today AND d->>'reason'='known_crawler' AND (d->>'count')::bigint=2) THEN RAISE EXCEPTION 'crawler day missing from health'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(health->'collection_rejected_days') d WHERE (d->>'day')::date=today-5 AND d->>'reason'='not_recorded' AND (d->>'count')::bigint=24882) THEN RAISE EXCEPTION 'prior day missing from health'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.analytics_record_collection_delivery(2::smallint,'rejected','known_crawler'); RAISE EXCEPTION 'anon counter write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.analytics_posthog_delivery_health(); RAISE EXCEPTION 'anon health read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
