-- Service-only functions already have table grants; use caller identity.
-- A SECURITY DEFINER current_user check rejects service_role as the owner.
BEGIN;
ALTER FUNCTION public.analytics_accept_event_v2(jsonb) SECURITY INVOKER;
ALTER FUNCTION public.analytics_claim_posthog_events(integer,integer) SECURITY INVOKER;
ALTER FUNCTION public.analytics_finish_posthog_delivery(uuid,text,text) SECURITY INVOKER;
ALTER FUNCTION public.analytics_confirm_posthog_events(uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.analytics_posthog_delivery_health() SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.analytics_claim_posthog_events(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(event_id uuid,payload jsonb,attempts integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH claimed AS (
  SELECT o.event_id FROM public.analytics_posthog_outbox o
  JOIN public.analytics_events_v2 e USING(event_id)
  WHERE o.status IN ('pending','failed') AND e.export_eligible AND e.traffic_context='audience'
    AND o.attempts < 12 AND o.next_attempt_at<=now()
    AND (o.locked_until IS NULL OR o.locked_until<now())
  ORDER BY o.next_attempt_at,o.event_id FOR UPDATE OF o SKIP LOCKED
  LIMIT LEAST(GREATEST(p_limit,1),100)
 ) UPDATE public.analytics_posthog_outbox o
 SET locked_until=now()+make_interval(secs=>LEAST(GREATEST(p_lease_seconds,1),300)),attempts=o.attempts+1
 FROM claimed WHERE o.event_id=claimed.event_id RETURNING o.event_id,o.payload,o.attempts;
END $$;
CREATE OR REPLACE FUNCTION public.analytics_recheck_posthog_event_eligibility(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e public.analytics_events_v2%ROWTYPE; result jsonb;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.analytics_events_v2 WHERE event_id=p_event_id FOR UPDATE;
 IF NOT FOUND OR NOT e.export_eligible OR e.traffic_context<>'audience' OR e.anonymous_browser_id IS NULL OR e.visit_id IS NULL OR e.received_at<now()-interval '90 days' THEN
  DELETE FROM public.analytics_posthog_outbox WHERE event_id=p_event_id AND status IN ('pending','failed');
  RETURN NULL;
 END IF;
 SELECT payload INTO result FROM public.analytics_posthog_outbox WHERE event_id=p_event_id AND status IN ('pending','failed') AND locked_until>now();
 IF result IS NULL THEN RETURN NULL; END IF;
 RETURN result || jsonb_build_object('export_eligible',e.export_eligible,'traffic_context',e.traffic_context,'properties',e.properties,'anonymous_browser_id',e.anonymous_browser_id,'visit_id',e.visit_id);
END $$;
REVOKE ALL ON FUNCTION public.analytics_recheck_posthog_event_eligibility(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_recheck_posthog_event_eligibility(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_list_submitted_posthog_event_ids(p_limit integer)
RETURNS TABLE(event_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.event_id FROM public.analytics_posthog_outbox o WHERE o.status='submitted' ORDER BY o.submitted_at,o.event_id LIMIT LEAST(GREATEST(p_limit,1),100);
END $$;
REVOKE ALL ON FUNCTION public.analytics_list_submitted_posthog_event_ids(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_list_submitted_posthog_event_ids(integer) TO service_role;

-- Leased records remain pending/failed until acknowledgment. A killed worker's
-- lease expires and the next worker reclaims the exact same event UUID.

CREATE TABLE public.analytics_v2_archived_totals (
 bucket_date date NOT NULL,event_name text NOT NULL,traffic_context text NOT NULL,
 album_key text,photo_id text,dimensions jsonb NOT NULL DEFAULT '{}',
 event_count bigint NOT NULL CHECK(event_count>=0),
 export_eligible_count bigint NOT NULL CHECK(export_eligible_count>=0),
 last_recorded_at timestamptz NOT NULL,
 UNIQUE NULLS NOT DISTINCT(bucket_date,event_name,traffic_context,album_key,photo_id,dimensions)
);
ALTER TABLE public.analytics_v2_archived_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_v2_archived_totals FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.analytics_v2_archived_totals TO service_role;
COMMENT ON TABLE public.analytics_v2_archived_totals IS 'V2 observed actions preserved at 90-day raw expiry. No browser, visit, request, view or search identifiers. Classification and catalogue facts are those known at expiry; distinct visits cannot be recovered.';

CREATE OR REPLACE FUNCTION analytics_private.prune_events_v2_at(run_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('analytics-v2-prune'));
 WITH expired AS (
  DELETE FROM public.analytics_events_v2 WHERE received_at < run_at-interval '90 days' RETURNING *
 ), grouped AS (
  SELECT (occurred_at AT TIME ZONE 'America/Chicago')::date AS bucket_date,event_name,traffic_context,album_key,photo_id,
   jsonb_strip_nulls(jsonb_build_object('album_sport',properties->'album_sport','event_date',properties->'event_date','photo_category',properties->'photo_category','tagged_source',properties->'tagged_source','surface',properties->'surface','mode',properties->'mode','outcome',properties->'outcome')) AS dimensions,
   count(*) AS event_count,count(*) FILTER(WHERE export_eligible) AS export_eligible_count,max(occurred_at) AS last_recorded_at
  FROM expired GROUP BY 1,2,3,4,5,6
 ) INSERT INTO public.analytics_v2_archived_totals SELECT * FROM grouped
 ON CONFLICT(bucket_date,event_name,traffic_context,album_key,photo_id,dimensions)
 DO UPDATE SET event_count=analytics_v2_archived_totals.event_count+EXCLUDED.event_count,
 export_eligible_count=analytics_v2_archived_totals.export_eligible_count+EXCLUDED.export_eligible_count,
 last_recorded_at=greatest(analytics_v2_archived_totals.last_recorded_at,EXCLUDED.last_recorded_at);
 -- Outbox rows cascade with expired raw records. Confirmed delivery receipts have
 -- no further recovery job; keep seven days for inspection before removing them.
 DELETE FROM public.analytics_posthog_outbox WHERE status='confirmed' AND confirmed_at<run_at-interval '7 days';
END $$;
REVOKE ALL ON FUNCTION analytics_private.prune_events_v2_at(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.prune_events_v2_at(timestamptz) TO service_role;
SELECT cron.unschedule('analytics-v2-prune') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='analytics-v2-prune');
SELECT cron.schedule('analytics-v2-prune','23 3 * * *',$$SELECT analytics_private.prune_events_v2_at(now());$$);
NOTIFY pgrst,'reload schema';
COMMIT;
