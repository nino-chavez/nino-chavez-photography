-- Versioned V2 classifications, provider correction controls, and bounded health.
-- Review and apply through the normal Supabase migration workflow; this file does not apply itself.
BEGIN;

ALTER TABLE public.analytics_events_v2 ADD COLUMN posthog_attempted_at timestamptz;
UPDATE public.analytics_events_v2 e SET posthog_attempted_at=coalesce(o.submitted_at,e.received_at) FROM public.analytics_posthog_outbox o WHERE o.event_id=e.event_id AND o.attempts>0;

ALTER TABLE public.analytics_posthog_outbox DROP CONSTRAINT IF EXISTS analytics_posthog_outbox_event_id_fkey;
ALTER TABLE public.analytics_posthog_outbox
  ADD COLUMN origin text NOT NULL DEFAULT 'event' CHECK (origin IN ('event','classification_control')),
  ADD COLUMN target_event_id uuid,
  ADD COLUMN last_checked_at timestamptz;
CREATE INDEX analytics_posthog_outbox_origin_claim_idx
  ON public.analytics_posthog_outbox (origin, status, next_attempt_at)
  WHERE status IN ('pending','failed');

CREATE TABLE public.analytics_event_v2_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.analytics_events_v2(event_id) ON DELETE CASCADE,
  classification_version integer NOT NULL CHECK (classification_version > 0),
  classification text NOT NULL CHECK (classification IN ('audience','operator','test','known_crawler','suspected_automation','unclassified','self_excluded')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 1000),
  corrected_by uuid NOT NULL,
  reversed boolean NOT NULL DEFAULT false,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, classification_version)
);
CREATE INDEX analytics_event_v2_classifications_latest_idx
  ON public.analytics_event_v2_classifications (event_id, classification_version DESC);
ALTER TABLE public.analytics_event_v2_classifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_event_v2_classifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_event_v2_classifications TO service_role;

-- Control rows never originate from the public collector. The transaction-local flag
-- is set only inside the service-only correction RPC below.
CREATE OR REPLACE FUNCTION analytics_private.enforce_posthog_outbox_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  -- Delivery workers update status, leases, retries, and receipts after a control
  -- has been created. Only its provenance and payload are protected here.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.origin IS NOT DISTINCT FROM OLD.origin
      AND NEW.target_event_id IS NOT DISTINCT FROM OLD.target_event_id
      AND NEW.payload IS NOT DISTINCT FROM OLD.payload THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.origin = 'classification_control' AND current_setting('analytics.classification_control_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'classification controls require the correction RPC' USING ERRCODE = '42501';
  END IF;
  IF NEW.origin = 'event' AND NEW.target_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'ordinary outbox rows cannot name a control target' USING ERRCODE = '23514';
  END IF;
  IF NEW.origin = 'classification_control' AND NEW.target_event_id IS NULL THEN
    RAISE EXCEPTION 'classification controls require a target event' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS analytics_posthog_outbox_origin_guard ON public.analytics_posthog_outbox;
CREATE TRIGGER analytics_posthog_outbox_origin_guard
  BEFORE INSERT OR UPDATE ON public.analytics_posthog_outbox
  FOR EACH ROW EXECUTE FUNCTION analytics_private.enforce_posthog_outbox_origin();

CREATE OR REPLACE FUNCTION public.analytics_record_event_v2_classification(
  p_event_id uuid, p_classification text, p_note text, p_corrected_by uuid, p_reverse boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  event_row public.analytics_events_v2%ROWTYPE;
  next_version integer;
  effective_classification text;
  control_id uuid;
  delivery_potentially_attempted boolean;
  eligible_for_export boolean;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  IF p_corrected_by IS NULL OR p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'valid correction evidence is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO event_row FROM public.analytics_events_v2 WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retained event not found' USING ERRCODE = 'P0002'; END IF;
  effective_classification := CASE WHEN p_reverse THEN event_row.traffic_context ELSE p_classification END;
  IF effective_classification NOT IN ('audience','operator','test','known_crawler','suspected_automation','unclassified','self_excluded') THEN
    RAISE EXCEPTION 'invalid classification' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(classification_version), 0) + 1 INTO next_version
    FROM public.analytics_event_v2_classifications WHERE event_id = p_event_id;
  INSERT INTO public.analytics_event_v2_classifications(event_id, classification_version, classification, note, corrected_by, reversed)
    VALUES (p_event_id, next_version, effective_classification, btrim(p_note), p_corrected_by, p_reverse);

  -- A lease means a worker may already be transmitting the original event. Capture
  -- that fact before changing queued receipts so a correction is never stranded.
  SELECT event_row.posthog_attempted_at IS NOT NULL OR EXISTS(
    SELECT 1 FROM public.analytics_posthog_outbox
    WHERE event_id = p_event_id AND origin = 'event'
      AND (status IN ('submitted','confirmed') OR attempts > 0 OR locked_until IS NOT NULL)
  ) INTO delivery_potentially_attempted;
  eligible_for_export := event_row.export_eligible
    AND event_row.traffic_context = 'audience'
    AND effective_classification IN ('audience','unclassified')
    AND event_row.anonymous_browser_id IS NOT NULL AND event_row.visit_id IS NOT NULL
    AND event_row.received_at >= now()-interval '90 days';
  IF NOT eligible_for_export THEN
    -- A queued record has not been accepted by the provider and can be suppressed.
    DELETE FROM public.analytics_posthog_outbox
      WHERE event_id = p_event_id AND origin = 'event' AND status IN ('pending','failed');
  ELSIF NOT EXISTS (SELECT 1 FROM public.analytics_posthog_outbox WHERE event_id=p_event_id AND origin='event') THEN
    -- A correction to audience/unclassified restores an eligible retained event,
    -- but never creates an export for an originally unconsented event.
    INSERT INTO public.analytics_posthog_outbox(event_id,payload)
    VALUES (event_row.event_id, jsonb_build_object(
      'event_id',event_row.event_id,'schema_version',event_row.schema_version,'event_name',event_row.event_name,
      'occurred_at',event_row.occurred_at,'received_at',event_row.received_at,'anonymous_browser_id',event_row.anonymous_browser_id,
      'visit_id',event_row.visit_id,'traffic_context',event_row.traffic_context,'export_eligible',event_row.export_eligible,'properties',event_row.properties
    ));
  END IF;
  IF delivery_potentially_attempted THEN
    control_id := gen_random_uuid();
    PERFORM set_config('analytics.classification_control_write', 'on', true);
    INSERT INTO public.analytics_posthog_outbox(event_id, payload, origin, target_event_id)
    VALUES (
      control_id,
      jsonb_build_object(
        'event_id', control_id,
        'event_name', 'analytics_classification_changed',
        'occurred_at', now(),
        'target_event_id', p_event_id,
        'classification_version', next_version,
        'classification', effective_classification,
        'server_provenance', 'classification_correction'
      ),
      'classification_control', p_event_id
    );
    PERFORM set_config('analytics.classification_control_write', 'off', true);
  END IF;
  RETURN jsonb_build_object(
    'event_id', p_event_id, 'classification_version', next_version,
    'classification', effective_classification, 'control_event_id', control_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_record_event_v2_classification(uuid,text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_record_event_v2_classification(uuid,text,text,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_claim_posthog_events(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(event_id uuid,payload jsonb,attempts integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH claimed AS (
  SELECT o.event_id FROM public.analytics_posthog_outbox o
  LEFT JOIN public.analytics_events_v2 e ON e.event_id=o.event_id
  LEFT JOIN LATERAL (
    SELECT c.classification FROM public.analytics_event_v2_classifications c
    WHERE c.event_id=e.event_id ORDER BY c.classification_version DESC LIMIT 1
  ) c ON true
  WHERE o.status IN ('pending','failed') AND o.attempts < 12 AND o.next_attempt_at<=now()
    AND (o.locked_until IS NULL OR o.locked_until<now())
    AND (
      o.origin='classification_control'
      OR (e.export_eligible AND e.traffic_context='audience' AND coalesce(c.classification,e.traffic_context) IN ('audience','unclassified'))
    )
  ORDER BY o.next_attempt_at,o.event_id FOR UPDATE OF o SKIP LOCKED
  LIMIT LEAST(GREATEST(p_limit,1),100)
 ), delivered AS (UPDATE public.analytics_posthog_outbox o
 SET locked_until=now()+make_interval(secs=>LEAST(GREATEST(p_lease_seconds,1),300)),attempts=o.attempts+1
 FROM claimed WHERE o.event_id=claimed.event_id RETURNING o.event_id,o.payload,o.attempts), marked AS (
 UPDATE public.analytics_events_v2 e SET posthog_attempted_at=coalesce(e.posthog_attempted_at,now()) FROM delivered d WHERE e.event_id=d.event_id RETURNING e.event_id
 ) SELECT d.event_id,d.payload,d.attempts FROM delivered d;
END $$;

-- A submitted receipt records the most recent provider handoff. Reconciliations
-- use this timestamp for their grace period, including after a missing retry.
CREATE OR REPLACE FUNCTION public.analytics_finish_posthog_delivery(p_event_id uuid, p_status text, p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('submitted','failed') THEN RAISE EXCEPTION 'invalid status' USING ERRCODE='22023'; END IF;
 UPDATE public.analytics_posthog_outbox
 SET status=p_status,
     locked_until=NULL,
     last_error_code=left(p_error_code,120),
     submitted_at=CASE WHEN p_status='submitted' THEN now() ELSE submitted_at END,
     next_attempt_at=CASE WHEN p_status='failed' THEN now()+make_interval(secs=>LEAST(3600,2^LEAST(attempts,10))) ELSE next_attempt_at END
 WHERE event_id=p_event_id;
END $$;
REVOKE ALL ON FUNCTION public.analytics_finish_posthog_delivery(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_finish_posthog_delivery(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_recheck_posthog_event_eligibility(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE e public.analytics_events_v2%ROWTYPE; result jsonb; effective_classification text; origin_value text;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 SELECT payload, origin INTO result, origin_value FROM public.analytics_posthog_outbox WHERE event_id=p_event_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF origin_value='classification_control' THEN
   IF result->>'server_provenance'='classification_correction' AND result ? 'target_event_id' AND result ? 'classification_version' AND result ? 'classification' THEN RETURN result; END IF;
   RETURN NULL;
 END IF;
 SELECT * INTO e FROM public.analytics_events_v2 WHERE event_id=p_event_id;
 IF NOT FOUND THEN
  DELETE FROM public.analytics_posthog_outbox WHERE event_id=p_event_id AND origin='event' AND status IN ('pending','failed');
  RETURN NULL;
 END IF;
 SELECT classification INTO effective_classification FROM public.analytics_event_v2_classifications
   WHERE event_id=p_event_id ORDER BY classification_version DESC LIMIT 1;
 IF NOT e.export_eligible OR e.traffic_context<>'audience' OR coalesce(effective_classification,e.traffic_context) NOT IN ('audience','unclassified')
   OR e.anonymous_browser_id IS NULL OR e.visit_id IS NULL OR e.received_at<now()-interval '90 days' THEN
  DELETE FROM public.analytics_posthog_outbox WHERE event_id=p_event_id AND origin='event' AND status IN ('pending','failed');
  RETURN NULL;
 END IF;
 IF (SELECT locked_until>now() FROM public.analytics_posthog_outbox WHERE event_id=p_event_id) IS NOT TRUE THEN RETURN NULL; END IF;
 RETURN result || jsonb_build_object('export_eligible',e.export_eligible,'traffic_context',coalesce(effective_classification,e.traffic_context),'properties',e.properties,'anonymous_browser_id',e.anonymous_browser_id,'visit_id',e.visit_id);
END $$;

CREATE OR REPLACE FUNCTION public.analytics_requeue_missing_posthog_events(p_event_ids uuid[])
RETURNS TABLE(event_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE requested_ids uuid[];
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(value ORDER BY value), ARRAY[]::uuid[]) INTO requested_ids
 FROM (SELECT DISTINCT value FROM unnest(coalesce(p_event_ids, ARRAY[]::uuid[])) value ORDER BY value LIMIT 100) requested;
 UPDATE public.analytics_posthog_outbox o
 SET last_checked_at=now(), last_error_code='provider_reconciliation_missing'
 WHERE o.status='submitted' AND o.event_id=ANY(requested_ids);
 RETURN QUERY WITH requested AS (
  SELECT value AS event_id FROM unnest(requested_ids) value
 ), eligible AS (
  SELECT o.event_id FROM requested r
  JOIN public.analytics_posthog_outbox o ON o.event_id=r.event_id
  LEFT JOIN public.analytics_events_v2 e ON e.event_id=o.event_id
  LEFT JOIN LATERAL (SELECT classification FROM public.analytics_event_v2_classifications c WHERE c.event_id=e.event_id ORDER BY classification_version DESC LIMIT 1) c ON true
  WHERE o.status='submitted' AND o.attempts<12 AND o.submitted_at <= now()-interval '5 minutes'
    AND (o.origin='classification_control' OR (
      e.received_at >= now()-interval '90 days' AND e.export_eligible AND e.traffic_context='audience'
      AND coalesce(c.classification,e.traffic_context) IN ('audience','unclassified')
    ))
 ) UPDATE public.analytics_posthog_outbox o
 SET status='pending', locked_until=NULL, next_attempt_at=now()+interval '30 seconds', last_error_code='provider_reconciliation_missing'
 FROM eligible WHERE o.event_id=eligible.event_id
 RETURNING o.event_id;
END $$;
REVOKE ALL ON FUNCTION public.analytics_requeue_missing_posthog_events(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_requeue_missing_posthog_events(uuid[]) TO service_role;

-- Reconcile submitted receipts fairly. Visitor events remain eligibility-gated;
-- server controls use their own minimal payload and target-retention lifecycle.
CREATE OR REPLACE FUNCTION public.analytics_list_submitted_posthog_event_ids(p_limit integer)
RETURNS TABLE(event_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.event_id FROM public.analytics_posthog_outbox o
  WHERE o.status='submitted' AND o.submitted_at <= now()-interval '5 minutes'
    AND (o.origin='classification_control' OR EXISTS (
      SELECT 1 FROM public.analytics_events_v2 e
      LEFT JOIN LATERAL (SELECT classification FROM public.analytics_event_v2_classifications c WHERE c.event_id=e.event_id ORDER BY classification_version DESC LIMIT 1) c ON true
      WHERE e.event_id=o.event_id AND e.received_at >= now()-interval '90 days'
        AND e.export_eligible AND e.traffic_context='audience'
        AND coalesce(c.classification,e.traffic_context) IN ('audience','unclassified')
    ))
  ORDER BY o.last_checked_at NULLS FIRST,o.submitted_at,o.event_id
  LIMIT LEAST(GREATEST(p_limit,1),100);
END $$;

CREATE TABLE public.analytics_collection_delivery_counters (
  bucket_date date NOT NULL,
  schema_version smallint NOT NULL CHECK (schema_version IN (1,2)),
  outcome text NOT NULL CHECK (outcome IN ('accepted','rejected','duplicate')),
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (bucket_date, schema_version, outcome)
);
ALTER TABLE public.analytics_collection_delivery_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_collection_delivery_counters FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.analytics_collection_delivery_counters TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_record_collection_delivery(p_schema_version smallint,p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
 IF p_schema_version NOT IN (1,2) OR p_outcome NOT IN ('accepted','rejected','duplicate') THEN RAISE EXCEPTION 'invalid collection counter' USING ERRCODE='22023'; END IF;
 INSERT INTO public.analytics_collection_delivery_counters(bucket_date,schema_version,outcome,count)
 VALUES ((now() AT TIME ZONE 'America/Chicago')::date,p_schema_version,p_outcome,1)
 ON CONFLICT(bucket_date,schema_version,outcome) DO UPDATE SET count=analytics_collection_delivery_counters.count+1;
END $$;
REVOKE ALL ON FUNCTION public.analytics_record_collection_delivery(smallint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_record_collection_delivery(smallint,text) TO service_role;

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

CREATE OR REPLACE FUNCTION analytics_private.prune_events_v2_at(run_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('analytics-v2-prune'));
 WITH expired AS MATERIALIZED (
  SELECT e.*,coalesce(c.classification,e.traffic_context) AS effective_classification
  FROM public.analytics_events_v2 e
  LEFT JOIN LATERAL (SELECT classification FROM public.analytics_event_v2_classifications c WHERE c.event_id=e.event_id ORDER BY classification_version DESC LIMIT 1) c ON true
  WHERE e.received_at < run_at-interval '90 days'
 ), deleted AS (
  DELETE FROM public.analytics_events_v2 e USING expired x WHERE e.event_id=x.event_id RETURNING e.event_id
 ), grouped AS (
  SELECT (occurred_at AT TIME ZONE 'America/Chicago')::date AS bucket_date,event_name,effective_classification AS traffic_context,album_key,photo_id,
   jsonb_strip_nulls(jsonb_build_object('album_sport',properties->'album_sport','event_date',properties->'event_date','photo_category',properties->'photo_category','tagged_source',properties->'tagged_source','surface',properties->'surface','mode',properties->'mode','outcome',properties->'outcome','result_count',properties->'result_count','error_code',properties->'error_code')) AS dimensions,
   count(*) AS event_count,count(*) FILTER(WHERE export_eligible) AS export_eligible_count,max(occurred_at) AS last_recorded_at
  FROM expired GROUP BY 1,2,3,4,5,6
 ) INSERT INTO public.analytics_v2_archived_totals SELECT * FROM grouped
 ON CONFLICT(bucket_date,event_name,traffic_context,album_key,photo_id,dimensions)
 DO UPDATE SET event_count=analytics_v2_archived_totals.event_count+EXCLUDED.event_count,
  export_eligible_count=analytics_v2_archived_totals.export_eligible_count+EXCLUDED.export_eligible_count,
  last_recorded_at=greatest(analytics_v2_archived_totals.last_recorded_at,EXCLUDED.last_recorded_at);

 -- Keep ordinary delivery evidence for as long as its raw event survives, so a
 -- late correction can mirror an older provider event. Controls are safe to prune
 -- seven days after confirmation, or when their target raw event expires.
 DELETE FROM public.analytics_posthog_outbox o
 WHERE o.origin='event' AND NOT EXISTS (SELECT 1 FROM public.analytics_events_v2 e WHERE e.event_id=o.event_id);
 DELETE FROM public.analytics_posthog_outbox o
 WHERE o.origin='classification_control' AND (
   (o.status='confirmed' AND o.confirmed_at<run_at-interval '7 days')
   OR NOT EXISTS (SELECT 1 FROM public.analytics_events_v2 e WHERE e.event_id=o.target_event_id)
 );
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
