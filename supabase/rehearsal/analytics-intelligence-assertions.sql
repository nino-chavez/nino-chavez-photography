-- Synthetic private-owner rehearsal. This file is run inside the migration's
-- open transaction and is followed by ROLLBACK; it never changes shared data.
DO $$
DECLARE
  v_owner_id uuid := '11111111-1111-4111-8111-111111111111';
  v_other_owner_id uuid := '22222222-2222-4222-8222-222222222222';
  snapshot_one uuid := '33333333-3333-4333-8333-333333333333';
  snapshot_two uuid := '44444444-4444-4444-8444-444444444444';
  snapshot_three uuid := '55555555-5555-4555-8555-555555555555';
  scope_one jsonb := '{"kind":"gallery","query":{"end":"2026-09-28","scope":"all","start":"2026-08-30","compare":"previous","measure":"photo_opens","traffic":"conservative","albumKeys":[]}}';
  scope_two jsonb := '{"kind":"sites","period":7,"section":"all"}';
  scope_three jsonb := '{"kind":"sites","period":30,"section":"finish-probe"}';
  key_one text; key_two text; key_three text; dismissed uuid; reversed uuid; recorded uuid; leased_job uuid; expired_job uuid; delivery_id uuid; claimed_owner uuid; expired_request uuid; follow_up jsonb;
BEGIN
  IF to_regprocedure('public.analytics_record_intelligence_action(uuid,text,text,text,jsonb,timestamp with time zone,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,integer,integer,jsonb)') IS NULL
    OR to_regprocedure('public.analytics_intelligence_action_follow_up(jsonb,text,timestamp with time zone,integer)') IS NULL
    OR to_regprocedure('public.analytics_cleanup_intelligence_private(timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'final intelligence lifecycle RPCs are missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'analytics_%intelligence%' AND has_function_privilege('anon',p.oid,'EXECUTE')) THEN
    RAISE EXCEPTION 'anon can execute an intelligence RPC';
  END IF;
  IF has_function_privilege('authenticated','public.analytics_set_intelligence_preferences(uuid,text,integer,boolean,boolean)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'browser role can write private intelligence preferences';
  END IF;
  IF NOT has_function_privilege('service_role','public.analytics_claim_intelligence_jobs(integer,integer,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('service_role','public.analytics_finish_intelligence_job(uuid,text,uuid,text)'::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('service_role','public.analytics_prepare_intelligence_periods(date,date,jsonb,integer,integer,integer,timestamp with time zone)'::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('service_role','public.analytics_record_intelligence_action(uuid,text,text,text,jsonb,timestamp with time zone,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,integer,integer,jsonb)'::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('service_role','public.analytics_intelligence_action_follow_up(jsonb,text,timestamp with time zone,integer)'::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('service_role','public.analytics_cleanup_intelligence_private(timestamp with time zone)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'service role is missing a final intelligence RPC grant';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('analytics_intelligence_snapshots','analytics_intelligence_snapshot_current','analytics_intelligence_actions','analytics_intelligence_requests','analytics_intelligence_jobs','analytics_intelligence_deliveries') AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'an intelligence storage table has RLS disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants g WHERE g.grantee IN ('anon','authenticated') AND g.table_schema='public' AND g.table_name IN ('analytics_intelligence_snapshots','analytics_intelligence_snapshot_current','analytics_intelligence_actions','analytics_intelligence_requests','analytics_intelligence_jobs','analytics_intelligence_deliveries','analytics_intelligence_incidents','analytics_intelligence_finding_lifecycle')) THEN
    RAISE EXCEPTION 'browser role has direct intelligence storage access';
  END IF;

  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  VALUES(v_owner_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','intelligence-owner@example.test','not-a-login',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp()),
        (v_other_owner_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','intelligence-other@example.test','not-a-login',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp());
  key_one := public.analytics_intelligence_scope_key(scope_one); key_two := public.analytics_intelligence_scope_key(scope_two); key_three := public.analytics_intelligence_scope_key(scope_three);
  INSERT INTO public.analytics_intelligence_snapshots(snapshot_id,scope_key,scope,generated_at,coverage,findings,suppressions,evidence,rule_version)
  VALUES(snapshot_one,key_one,scope_one,'2026-09-29T12:00:00Z','complete','[{"id":"f-one","target":{"kind":"album","albumKey":"alpha"}}]','[]','{}',2),
        (snapshot_two,key_two,scope_two,'2026-09-29T12:00:00Z','complete','[]','[]','{}',2),
        (snapshot_three,key_three,scope_three,'2026-09-29T12:00:00Z','complete','[]','[]','{}',2);
  INSERT INTO public.analytics_intelligence_snapshot_current(scope_key,snapshot_id) VALUES(key_one,snapshot_one),(key_two,snapshot_two);

  -- Retention must be decided, never reported as generic authorization failure.
  BEGIN
    PERFORM public.analytics_record_intelligence_action(v_owner_id,key_one,'record',NULL,'{"kind":"album","albumKey":"alpha"}','2026-09-01T12:00:00Z','test','album_opens','2026-09-08T12:00:00Z',NULL,NULL,'promotion',NULL,NULL,NULL,NULL,'unknown',0,7,'{}');
    RAISE EXCEPTION 'undecided retention unexpectedly wrote private history';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'retention decision required before private intelligence writes' THEN RAISE EXCEPTION 'expected retention decision error, got: %', SQLERRM; END IF;
  END;
  PERFORM public.analytics_set_intelligence_preferences(v_owner_id,'days',90,true,true);
  PERFORM public.analytics_set_intelligence_preferences(v_other_owner_id,'until_deleted',NULL,false,false);
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_preferences p WHERE p.owner_id=v_owner_id AND p.retention_policy='days' AND p.retention_days=90)
    OR NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_schedules s WHERE s.owner_id=v_owner_id AND s.daily_enabled AND s.weekly_enabled) THEN RAISE EXCEPTION 'preference and schedule were not saved atomically'; END IF;
  SELECT id INTO recorded FROM public.analytics_record_intelligence_action(v_owner_id,key_one,'record',NULL,'{"kind":"album","albumKey":"alpha"}','2026-09-01T12:00:00Z','test','album_opens','2026-09-08T12:00:00Z','private note',NULL,'promotion','instagram','fall','r1','a','inquiry',0,7,'{"scope":"test"}');
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_actions WHERE id=recorded AND target->>'albumKey'='alpha' AND channel='instagram' AND campaign='fall' AND release='r1' AND variant='a' AND outcome='inquiry' AND outcome_count=0 AND observation_days=7) THEN RAISE EXCEPTION 'standalone action context was discarded'; END IF;
  BEGIN
    PERFORM public.analytics_record_intelligence_action(v_owner_id,key_one,'record',NULL,'{"kind":"album","albumKey":"alpha"}',clock_timestamp()+interval '1 day','test','album_opens',clock_timestamp()+interval '8 days',NULL,NULL,'promotion',NULL,NULL,NULL,NULL,'unknown',0,7,'{}');
    RAISE EXCEPTION 'future actual time unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'record action context required' THEN RAISE EXCEPTION 'expected future-action rejection, got: %', SQLERRM; END IF;
  END;
  SELECT id INTO dismissed FROM public.analytics_record_intelligence_action(v_owner_id,key_one,'dismiss','f-one','{"kind":"album","albumKey":"alpha"}',NULL,NULL,NULL,NULL,'reason',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}');
  SELECT id INTO reversed FROM public.analytics_record_intelligence_action(v_owner_id,key_two,'undo',NULL,NULL,NULL,NULL,NULL,NULL,NULL,dismissed,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}');
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_finding_lifecycle lifecycle WHERE lifecycle.owner_id=v_owner_id AND lifecycle.scope_key=key_one AND lifecycle.finding_id='f-one' AND lifecycle.status='open') THEN RAISE EXCEPTION 'owned undo did not restore original lifecycle scope'; END IF;
  IF (SELECT id FROM public.analytics_record_intelligence_action(v_owner_id,key_two,'undo',NULL,NULL,NULL,NULL,NULL,NULL,NULL,dismissed,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}')) <> reversed THEN RAISE EXCEPTION 'repeated undo is not idempotent'; END IF;
  BEGIN
    PERFORM public.analytics_record_intelligence_action(v_other_owner_id,key_one,'undo',NULL,NULL,NULL,NULL,NULL,NULL,NULL,dismissed,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}');
    RAISE EXCEPTION 'unowned undo unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'undo action is not owned or reversible' THEN RAISE EXCEPTION 'expected cross-owner undo denial, got: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.analytics_record_intelligence_action(v_owner_id,key_one,'undo',NULL,NULL,NULL,NULL,NULL,NULL,NULL,recorded,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{}');
    RAISE EXCEPTION 'record action was treated as reversible lifecycle action';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'undo action is not owned or reversible' THEN RAISE EXCEPTION 'expected record undo denial, got: %', SQLERRM; END IF;
  END;

  -- The copied fixture has no fixed complete before/after window for this
  -- targeted aggregate calculation. These rows exist only in this disposable
  -- transaction and prove zero data differs from missing coverage.
  INSERT INTO public.analytics_daily_coverage(bucket_date,raw_window_start,raw_window_end,cutoff_at,coverage_state,catalogue_basis)
  SELECT d, d::timestamptz, d::timestamptz + interval '1 day', d::timestamptz + interval '1 day', 'complete', 'event_snapshot'
  FROM generate_series(date '2026-01-13',date '2026-01-17',interval '1 day') d;
  INSERT INTO public.analytics_daily_actions(bucket_date,album_key,photo_id,event_type,source,source_kind,sport,album_event_type,photo_category,traffic_classification,catalogue_basis,coverage_state,action_count)
  VALUES
    (date '2026-01-13','alpha','follow-up-photo','view','synthetic','internal_open_location','volleyball','unknown','action','audience','event_snapshot','complete',5),
    (date '2026-01-14','alpha','follow-up-photo','view','synthetic','internal_open_location','volleyball','unknown','action','audience','event_snapshot','complete',7);
  SELECT public.analytics_intelligence_action_follow_up('{"kind":"photo","id":"follow-up-photo"}','photo_opens','2026-01-15T12:00:00Z',2) INTO follow_up;
  IF follow_up->>'before' <> '12' OR follow_up->>'after' <> '0' OR follow_up->>'coverage' <> 'complete' OR follow_up->>'previousCoverage' <> 'complete'
    OR follow_up#>>'{window,timezone}' <> 'America/Chicago' OR follow_up#>>'{window,before,start}' <> '2026-01-13' OR follow_up#>>'{window,after,end}' <> '2026-01-17' THEN
    RAISE EXCEPTION 'aggregate follow-up did not preserve target, date, window, measure, or zero result';
  END IF;
  SELECT public.analytics_intelligence_action_follow_up('{"kind":"photo","id":"follow-up-photo"}','photo_opens','2025-01-15T12:00:00Z',1) INTO follow_up;
  IF follow_up->>'coverage' <> 'unavailable' OR follow_up->>'previousCoverage' <> 'unavailable' OR follow_up->'before' <> 'null'::jsonb OR follow_up->'after' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'aggregate follow-up treated missing coverage as zero';
  END IF;

  -- Two distinct scheduler scopes survive, stale snapshots are cadence-gated, and no current/future local day is queued.
  UPDATE public.analytics_intelligence_snapshot_current SET updated_at=clock_timestamp()-interval '1 hour' WHERE scope_key IN (key_one,key_two);
  PERFORM public.analytics_prepare_intelligence_periods((clock_timestamp() AT TIME ZONE 'America/Chicago')::date,(clock_timestamp() AT TIME ZONE 'America/Chicago')::date,jsonb_build_array(scope_one,scope_two),900,300,4,clock_timestamp());
  IF (SELECT count(DISTINCT scope_key) FROM public.analytics_intelligence_jobs WHERE kind='refresh' AND scope_key IN(key_one,key_two)) <> 2 THEN RAISE EXCEPTION 'scheduled scopes collapsed'; END IF;
  IF EXISTS(SELECT 1 FROM public.analytics_intelligence_jobs WHERE kind IN('daily','weekly') AND intended_period >= (clock_timestamp() AT TIME ZONE 'America/Chicago')::date) THEN RAISE EXCEPTION 'future catchup was scheduled'; END IF;
  UPDATE public.analytics_intelligence_snapshot_current SET updated_at=clock_timestamp() WHERE scope_key=key_one;
  PERFORM public.analytics_prepare_intelligence_periods(NULL,NULL,jsonb_build_array(scope_one),900,300,4,clock_timestamp());
  IF (SELECT count(*) FROM public.analytics_intelligence_jobs WHERE kind='refresh' AND scope_key=key_one AND status IN('pending','leased','retry')) > 1 THEN RAISE EXCEPTION 'refresh cadence created duplicate work'; END IF;
  INSERT INTO public.analytics_intelligence_jobs(kind,scope_key,scope,status,attempts,available_at,leased_until)
  VALUES('refresh','lease-expiry-probe','{"kind":"sites","period":30,"section":"lease-probe"}','leased',0,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute') RETURNING id INTO expired_job;
  PERFORM public.analytics_claim_intelligence_jobs(1,120,clock_timestamp());
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_jobs job WHERE job.id=expired_job AND job.status='leased' AND job.attempts=1 AND job.leased_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'expired job lease was not reclaimed exactly once';
  END IF;
  INSERT INTO public.analytics_intelligence_jobs(kind,owner_id,scope_key,scope,status,available_at) VALUES('refresh',v_owner_id,'owner-claim-probe','{"kind":"sites","period":30,"section":"owner-claim-probe"}','pending',clock_timestamp());
  SELECT "ownerId" INTO claimed_owner FROM public.analytics_claim_intelligence_jobs(4,120,clock_timestamp()) WHERE "ownerId"=v_owner_id LIMIT 1;
  IF claimed_owner IS DISTINCT FROM v_owner_id THEN RAISE EXCEPTION 'claim payload did not preserve camel-case ownerId'; END IF;
  INSERT INTO public.analytics_intelligence_requests(id,owner_id,scope_key,operation,status,report_id,expires_at) VALUES(gen_random_uuid(),v_owner_id,key_one,'album_comparison','pending',snapshot_one,clock_timestamp()-interval '1 minute') RETURNING id INTO expired_request;
  PERFORM public.analytics_prepare_intelligence_periods(NULL,NULL,'[]',900,300,4,clock_timestamp());
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_requests WHERE id=expired_request AND status='expired') THEN RAISE EXCEPTION 'expired request was left pending'; END IF;
  INSERT INTO public.analytics_intelligence_jobs(kind,scope_key,scope,status,attempts,available_at) VALUES('refresh','exhaustion-probe','{"kind":"sites","period":30,"section":"exhaustion-probe"}','pending',20,clock_timestamp());
  PERFORM public.analytics_claim_intelligence_jobs(4,120,clock_timestamp());
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_jobs WHERE attempts=20 AND status='unavailable') THEN RAISE EXCEPTION 'exhausted job was not made unavailable'; END IF;

  INSERT INTO public.analytics_intelligence_jobs(id,kind,scope_key,scope,status,leased_until) VALUES(gen_random_uuid(),'refresh',key_three,scope_three,'leased',clock_timestamp()+interval '2 minutes') RETURNING id INTO leased_job;
  BEGIN
    PERFORM public.analytics_finish_intelligence_job(leased_job,'complete',snapshot_two,NULL);
    RAISE EXCEPTION 'wrong-scope snapshot unexpectedly finished leased job';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'immutable report does not match job scope' THEN RAISE EXCEPTION 'expected wrong-scope finish denial, got: %', SQLERRM; END IF;
  END;
  PERFORM public.analytics_finish_intelligence_job(leased_job,'complete',snapshot_three,NULL);
  BEGIN
    PERFORM public.analytics_finish_intelligence_job(leased_job,'complete',snapshot_three,NULL);
    RAISE EXCEPTION 'completed job unexpectedly finished twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'intelligence job is not leased' THEN RAISE EXCEPTION 'expected second-finish denial, got: %', SQLERRM; END IF;
  END;

  INSERT INTO public.analytics_intelligence_jobs(kind,owner_id,scope_key,scope,intended_period,status,leased_until) VALUES('daily',v_owner_id,key_one,scope_one,current_date-10,'leased',clock_timestamp()+interval '2 minutes');
  PERFORM public.analytics_finish_intelligence_job((SELECT job.id FROM public.analytics_intelligence_jobs job WHERE job.kind='daily' AND job.owner_id=v_owner_id AND job.intended_period=current_date-10),'complete',snapshot_one,NULL);
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_briefs brief WHERE brief.owner_id=v_owner_id AND brief.kind='daily' AND brief.body<>'' AND jsonb_array_length(brief.snapshot_ids)>0)
    OR NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_deliveries d JOIN public.analytics_intelligence_briefs brief ON brief.id=d.brief_id WHERE brief.owner_id=v_owner_id AND d.channel='dashboard') THEN RAISE EXCEPTION 'daily brief and dashboard delivery were not stored'; END IF;
  INSERT INTO public.analytics_intelligence_jobs(kind,owner_id,scope_key,scope,intended_period,status,leased_until) VALUES('weekly',v_owner_id,key_one,scope_one,current_date-16,'leased',clock_timestamp()+interval '2 minutes');
  PERFORM public.analytics_finish_intelligence_job((SELECT job.id FROM public.analytics_intelligence_jobs job WHERE job.kind='weekly' AND job.owner_id=v_owner_id AND job.intended_period=current_date-16),'complete',snapshot_one,NULL);
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_briefs brief WHERE brief.owner_id=v_owner_id AND brief.kind='weekly' AND brief.body<>'' AND jsonb_array_length(brief.snapshot_ids)>0) THEN RAISE EXCEPTION 'weekly brief content was not stored'; END IF;

  PERFORM public.analytics_record_intelligence_lifecycle(snapshot_one,clock_timestamp());
  UPDATE public.analytics_intelligence_incidents SET status='acknowledged',acknowledged_until=clock_timestamp()+interval '1 hour' WHERE scope_key=key_one AND finding_id='f-one';
  INSERT INTO public.analytics_intelligence_snapshots(snapshot_id,scope_key,scope,generated_at,coverage,findings,suppressions,evidence,rule_version) VALUES(gen_random_uuid(),key_one,scope_one,clock_timestamp(),'partial','[]','[]','{}',2) RETURNING snapshot_id INTO snapshot_two;
  PERFORM public.analytics_record_intelligence_lifecycle(snapshot_two,clock_timestamp());
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_incidents incident WHERE incident.scope_key=key_one AND incident.finding_id='f-one' AND incident.status='acknowledged') THEN RAISE EXCEPTION 'partial health report falsely recovered incident'; END IF;
  INSERT INTO public.analytics_intelligence_deliveries(channel,sender,destination_verified,preference_enabled,idempotency_key,status,leased_until,payload) VALUES('dashboard','owned',false,true,'lease-proof-11111111','leased',clock_timestamp()-interval '1 minute','{}') RETURNING id INTO delivery_id;
  PERFORM public.analytics_claim_intelligence_deliveries(1,120);
  IF NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_deliveries delivery WHERE delivery.id=delivery_id AND delivery.status='ambiguous' AND delivery.attempts=0 AND delivery.error_code='lease_expired') THEN RAISE EXCEPTION 'expired delivery lease was silently re-sent'; END IF;
END $$;

-- Deliberate negative controls prove that these gates can fail.
DO $$ BEGIN
  PERFORM public.analytics_claim_intelligence_jobs(0,120,clock_timestamp());
  RAISE EXCEPTION 'invalid job limit unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'invalid intelligence job claim' THEN RAISE EXCEPTION 'expected invalid job limit rejection, got: %', SQLERRM; END IF;
END $$;
