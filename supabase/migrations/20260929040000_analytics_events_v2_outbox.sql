-- Version-2 analytics: explicit observations, no IP/UA or legacy fingerprint.
-- Review and apply through the normal Supabase migration workflow; this file does not apply itself.
BEGIN;

-- The visible exclusion preference applies to legacy first-party records too.
ALTER TABLE public.engagement_events DROP CONSTRAINT IF EXISTS engagement_events_traffic_context_check;
ALTER TABLE public.engagement_events ADD CONSTRAINT engagement_events_traffic_context_check CHECK (traffic_context IN ('audience','operator','test','self_excluded'));
ALTER TABLE public.search_queries DROP CONSTRAINT IF EXISTS search_queries_traffic_context_check;
ALTER TABLE public.search_queries ADD CONSTRAINT search_queries_traffic_context_check CHECK (traffic_context IN ('audience','operator','test','self_excluded'));
ALTER TABLE public.analytics_collection_diagnostics DROP CONSTRAINT IF EXISTS analytics_collection_diagnostics_traffic_context_check;
ALTER TABLE public.analytics_collection_diagnostics ADD CONSTRAINT analytics_collection_diagnostics_traffic_context_check CHECK (traffic_context IN ('audience','operator','test','self_excluded'));

CREATE TABLE public.analytics_events_v2 (
  event_id uuid PRIMARY KEY,
  schema_version smallint NOT NULL CHECK (schema_version = 2),
  event_name text NOT NULL CHECK (event_name IN (
    'gallery_page_viewed','album_exposed','album_opened','photo_exposed','photo_opened','photo_rendered','photo_load_failed',
    'favorite_added','favorite_removed','share_action','download_requested','download_item_requested','download_item_prepared',
    'download_prepared','download_handed_off','download_failed','download_cancelled','search_submitted','search_results_shown',
    'search_failed','search_result_selected','filters_applied','experiment_exposed'
  )),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  anonymous_browser_id uuid,
  visit_id uuid,
  traffic_context text NOT NULL CHECK (traffic_context IN ('audience','operator','test','self_excluded')),
  export_eligible boolean NOT NULL DEFAULT false,
  album_key text REFERENCES public.albums(album_key),
  photo_id text REFERENCES public.photo_metadata(photo_id),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK ((anonymous_browser_id IS NULL) = (visit_id IS NULL)),
  CHECK (NOT export_eligible OR (traffic_context = 'audience' AND anonymous_browser_id IS NOT NULL AND visit_id IS NOT NULL))
);
CREATE INDEX analytics_events_v2_report_idx ON public.analytics_events_v2 (occurred_at DESC, event_name, album_key, photo_id, traffic_context);
ALTER TABLE public.analytics_events_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_events_v2 FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_events_v2 TO service_role;

CREATE TABLE public.analytics_posthog_outbox (
  event_id uuid PRIMARY KEY REFERENCES public.analytics_events_v2(event_id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','confirmed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 120),
  submitted_at timestamptz,
  confirmed_at timestamptz
);
CREATE INDEX analytics_posthog_outbox_claim_idx ON public.analytics_posthog_outbox (status, next_attempt_at) WHERE status IN ('pending','failed');
ALTER TABLE public.analytics_posthog_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_posthog_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_posthog_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_accept_event_v2(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  event_row public.analytics_events_v2%ROWTYPE;
  received timestamptz := now();
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.analytics_events_v2 (
    event_id, schema_version, event_name, occurred_at, received_at, anonymous_browser_id, visit_id,
    traffic_context, export_eligible, album_key, photo_id, properties
  ) VALUES (
    (p_event->>'event_id')::uuid, (p_event->>'schema_version')::smallint, p_event->>'event_name',
    (p_event->>'occurred_at')::timestamptz, received, NULLIF(p_event->>'anonymous_browser_id','')::uuid,
    NULLIF(p_event->>'visit_id','')::uuid, p_event->>'traffic_context', COALESCE((p_event->>'export_eligible')::boolean,false),
    NULLIF(p_event->'properties'->>'album_key',''), NULLIF(p_event->'properties'->>'photo_id',''), COALESCE(p_event->'properties','{}'::jsonb)
  ) RETURNING * INTO event_row;
  IF event_row.export_eligible THEN
    INSERT INTO public.analytics_posthog_outbox(event_id,payload) VALUES (event_row.event_id,
      jsonb_build_object('event_id',event_row.event_id,'schema_version',event_row.schema_version,'event_name',event_row.event_name,
        'occurred_at',event_row.occurred_at,'received_at',event_row.received_at,'anonymous_browser_id',event_row.anonymous_browser_id,
        'visit_id',event_row.visit_id,'traffic_context',event_row.traffic_context,'export_eligible',event_row.export_eligible,'properties',event_row.properties));
  END IF;
  RETURN jsonb_build_object('accepted',true,'duplicate',false,'event_id',event_row.event_id,'export_eligible',event_row.export_eligible);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('accepted',false,'duplicate',true,'event_id',p_event->>'event_id','export_eligible',false);
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_accept_event_v2(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_accept_event_v2(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_claim_posthog_events(p_limit integer, p_lease_seconds integer)
RETURNS TABLE(event_id uuid, payload jsonb, attempts integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY WITH claimed AS (
    SELECT o.event_id FROM public.analytics_posthog_outbox o
    WHERE o.status IN ('pending','failed') AND o.next_attempt_at <= now() AND (o.locked_until IS NULL OR o.locked_until < now())
    ORDER BY o.next_attempt_at, o.event_id FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),100)
  ) UPDATE public.analytics_posthog_outbox o SET locked_until = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds,1),300)), status = 'submitted', submitted_at = now(), attempts = o.attempts + 1
  FROM claimed WHERE o.event_id = claimed.event_id RETURNING o.event_id, o.payload, o.attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_claim_posthog_events(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_claim_posthog_events(integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_finish_posthog_delivery(p_event_id uuid, p_status text, p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('submitted','failed') THEN RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023'; END IF;
  UPDATE public.analytics_posthog_outbox SET status = p_status, locked_until = NULL, last_error_code = left(p_error_code,120),
    next_attempt_at = CASE WHEN p_status = 'failed' THEN now() + make_interval(secs => LEAST(3600, 2 ^ LEAST(attempts,10))) ELSE next_attempt_at END
  WHERE event_id = p_event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_finish_posthog_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_finish_posthog_delivery(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_confirm_posthog_events(p_event_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  UPDATE public.analytics_posthog_outbox SET status = 'confirmed', locked_until = NULL, confirmed_at = now() WHERE event_id = ANY(p_event_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_confirm_posthog_events(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_confirm_posthog_events(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_posthog_delivery_health()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('pending',count(*) FILTER (WHERE status = 'pending'),'submitted',count(*) FILTER (WHERE status = 'submitted'),
    'failed',count(*) FILTER (WHERE status = 'failed'),'oldest_pending_at',min(next_attempt_at) FILTER (WHERE status IN ('pending','failed')),
    'oldest_submitted_at',min(submitted_at) FILTER (WHERE status = 'submitted')) FROM public.analytics_posthog_outbox;
$$;
REVOKE ALL ON FUNCTION public.analytics_posthog_delivery_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_posthog_delivery_health() TO service_role;

COMMIT;
