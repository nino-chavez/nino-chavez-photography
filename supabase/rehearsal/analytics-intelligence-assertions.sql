-- Run after 20260930040614_analytics_intelligence_storage.sql in the local
-- rehearsal database. This harness creates no tracking or audience fixtures.
DO $$
DECLARE missing text[] := ARRAY[]::text[]; routine text;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'analytics_claim_intelligence_jobs(integer,integer,timestamp with time zone)',
    'analytics_finish_intelligence_job(uuid,text,uuid,text)',
    'analytics_prepare_intelligence_periods(date,date,jsonb,integer,integer,integer,timestamp with time zone)',
    'analytics_set_intelligence_preferences(uuid,text,integer,boolean,boolean)',
    'analytics_record_intelligence_action(uuid,text,text,text,jsonb,timestamp with time zone,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,integer,jsonb)',
    'analytics_record_intelligence_lifecycle(uuid,timestamp with time zone)',
    'analytics_claim_intelligence_deliveries(integer,integer)',
    'analytics_finish_intelligence_delivery(uuid,text,text,text)',
    'analytics_list_ambiguous_intelligence_deliveries(integer)',
    'analytics_reconcile_intelligence_delivery(uuid,text,text)'
  ] LOOP
    IF to_regprocedure('public.' || routine) IS NULL THEN missing := array_append(missing, routine); END IF;
  END LOOP;
  IF cardinality(missing) > 0 THEN RAISE EXCEPTION 'missing intelligence RPCs: %', array_to_string(missing, ', '); END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'analytics_%intelligence%' AND has_function_privilege('anon', p.oid, 'EXECUTE')) THEN RAISE EXCEPTION 'anon can execute an intelligence RPC'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('analytics_intelligence_snapshots','analytics_intelligence_snapshot_current','analytics_intelligence_jobs','analytics_intelligence_deliveries') AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'an intelligence storage table has RLS disabled'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated') AND table_schema='public' AND table_name IN ('analytics_intelligence_snapshots','analytics_intelligence_snapshot_current','analytics_intelligence_actions','analytics_intelligence_requests','analytics_intelligence_jobs','analytics_intelligence_deliveries')) THEN RAISE EXCEPTION 'browser role has direct intelligence storage access'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_intelligence_actions' AND policyname='analytics_intelligence_actions_owner_read') OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='analytics_intelligence_finding_lifecycle' AND policyname='analytics_intelligence_lifecycle_owner') THEN RAISE EXCEPTION 'owner lifecycle guard is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='analytics_intelligence_jobs_request_pending_uniq') THEN RAISE EXCEPTION 'duplicate active request jobs are not prevented'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='analytics_intelligence_jobs_scheduled_scope_uniq') THEN RAISE EXCEPTION 'scheduled jobs collapse distinct scopes'; END IF;
  IF to_regprocedure('public.analytics_finish_intelligence_job(uuid,text,text,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'obsolete job finish signature remains callable'; END IF;
END $$;

-- Negative shape checks: invalid lease arguments must fail before a row can be claimed.
DO $$ BEGIN
  PERFORM public.analytics_claim_intelligence_jobs(0, 180, clock_timestamp());
  RAISE EXCEPTION 'invalid job limit unexpectedly succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'invalid job limit unexpectedly succeeded' THEN RAISE; END IF;
END $$;
