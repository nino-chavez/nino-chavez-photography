-- The collector records why it refused an event. Every refusal used to count as one bare 'rejected', so the
-- Oct 2, 2026 surge (Meta's crawler began running gallery JavaScript, about 25,000 refusals a day) looked the
-- same as visitor events that could not be stored.
--
-- Accepted and duplicate rows carry the reason 'none'. Rejected rows counted before this migration read
-- 'not_recorded': their reason was never kept, and a guess would be worse than saying so.
--
-- Deploy order: apply this migration, then deploy the collector that passes p_reason. The collector deployed
-- today calls (p_schema_version, p_outcome) by name; that call resolves to the single function below and records
-- 'not_recorded'. There is deliberately one function, not an overload: two candidates for a two-argument call
-- would make PostgREST refuse to choose.
BEGIN;
ALTER TABLE public.analytics_collection_delivery_counters ADD COLUMN reason text NOT NULL DEFAULT 'none';
UPDATE public.analytics_collection_delivery_counters SET reason = 'not_recorded' WHERE outcome = 'rejected';
ALTER TABLE public.analytics_collection_delivery_counters ALTER COLUMN reason DROP DEFAULT;
ALTER TABLE public.analytics_collection_delivery_counters
  ADD CONSTRAINT analytics_collection_delivery_counters_reason_check CHECK (
    (outcome = 'rejected' AND reason IN ('known_crawler','invalid_json','invalid_event','unknown_target','target_lookup_failed','album_lookup_failed','accept_failed','not_recorded'))
    OR (outcome <> 'rejected' AND reason = 'none')),
  DROP CONSTRAINT analytics_collection_delivery_counters_pkey,
  ADD PRIMARY KEY (bucket_date, schema_version, outcome, reason);

COMMENT ON COLUMN public.analytics_collection_delivery_counters.reason IS
  'Why the collector refused the event; none for accepted and duplicate. not_recorded marks rejections counted before 2026-10-07, when no reason was kept. target_lookup_failed, album_lookup_failed and accept_failed answered 503: the event was not stored, and the browser retries it once.';

DROP FUNCTION public.analytics_record_collection_delivery(smallint, text);
CREATE FUNCTION public.analytics_record_collection_delivery(p_schema_version smallint, p_outcome text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_reason text := CASE WHEN p_outcome = 'rejected' THEN coalesce(p_reason, 'not_recorded') ELSE coalesce(p_reason, 'none') END;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 IF p_schema_version NOT IN (1,2) OR p_outcome NOT IN ('accepted','rejected','duplicate')
  OR (p_outcome = 'rejected' AND v_reason NOT IN ('known_crawler','invalid_json','invalid_event','unknown_target','target_lookup_failed','album_lookup_failed','accept_failed','not_recorded'))
  OR (p_outcome <> 'rejected' AND v_reason <> 'none')
 THEN RAISE EXCEPTION 'invalid collection counter' USING ERRCODE='22023'; END IF;
 INSERT INTO public.analytics_collection_delivery_counters(bucket_date,schema_version,outcome,reason,count)
 VALUES ((now() AT TIME ZONE 'America/Chicago')::date,p_schema_version,p_outcome,v_reason,1)
 ON CONFLICT(bucket_date,schema_version,outcome,reason) DO UPDATE SET count=analytics_collection_delivery_counters.count+1;
END $$;
REVOKE ALL ON FUNCTION public.analytics_record_collection_delivery(smallint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_record_collection_delivery(smallint,text,text) TO service_role;

-- Unchanged from 20260929190000 except the added 'collection_rejected_days': rejected counts by Chicago day and
-- reason for the last 30 days, so a page can compare a day against the usual rate and say what the refusals were.
-- 'collection' keeps its outcome-to-total shape for the readers that already parse it.
CREATE OR REPLACE FUNCTION public.analytics_posthog_delivery_health()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object(
  'schema_version',2,
  'pending',count(*) FILTER (WHERE status='pending' AND origin='event'),
  'submitted',count(*) FILTER (WHERE status='submitted' AND origin='event'),
  'confirmed',count(*) FILTER (WHERE status='confirmed' AND origin='event'),
  'failed',count(*) FILTER (WHERE status='failed' AND origin='event'),
  'control_pending',count(*) FILTER (WHERE status IN ('pending','failed') AND origin='classification_control'),
  'terminal_reconciliation_gap',count(*) FILTER (WHERE status='submitted' AND attempts>=12 AND last_error_code='provider_reconciliation_missing'),
  'oldest_pending_at',min(next_attempt_at) FILTER (WHERE status IN ('pending','failed')),
  'oldest_submitted_at',min(submitted_at) FILTER (WHERE status='submitted'),
  'confirmed_watermark',max(confirmed_at) FILTER (WHERE status='confirmed'),
  'collection',coalesce((SELECT jsonb_object_agg(outcome,total) FROM (
    SELECT outcome,sum(count)::bigint AS total FROM public.analytics_collection_delivery_counters
    WHERE bucket_date >= (now() AT TIME ZONE 'America/Chicago')::date-29 GROUP BY outcome
  ) c),'{}'::jsonb),
  'collection_rejected_days',coalesce((SELECT jsonb_agg(jsonb_build_object('day',bucket_date,'reason',reason,'count',total) ORDER BY bucket_date,reason) FROM (
    SELECT bucket_date,reason,sum(count)::bigint AS total FROM public.analytics_collection_delivery_counters
    WHERE outcome='rejected' AND bucket_date >= (now() AT TIME ZONE 'America/Chicago')::date-29 GROUP BY bucket_date,reason
  ) r),'[]'::jsonb),
  'eligible_observations_14d',coalesce((SELECT count(*) FROM public.analytics_events_v2 e
    LEFT JOIN LATERAL (SELECT classification FROM public.analytics_event_v2_classifications c WHERE c.event_id=e.event_id ORDER BY classification_version DESC LIMIT 1) c ON true
    WHERE e.received_at >= now()-interval '14 days' AND e.export_eligible AND coalesce(c.classification,e.traffic_context) IN ('audience','unclassified')),0),
  'eligible_days_observed',coalesce((SELECT count(DISTINCT (received_at AT TIME ZONE 'America/Chicago')::date) FROM public.analytics_events_v2 e
    LEFT JOIN LATERAL (SELECT classification FROM public.analytics_event_v2_classifications c WHERE c.event_id=e.event_id ORDER BY classification_version DESC LIMIT 1) c ON true
    WHERE e.received_at >= now()-interval '14 days' AND e.export_eligible AND coalesce(c.classification,e.traffic_context) IN ('audience','unclassified')),0),
  'quota_billing_state','unknown'
 ) FROM public.analytics_posthog_outbox;
$$;
REVOKE ALL ON FUNCTION public.analytics_posthog_delivery_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_posthog_delivery_health() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
