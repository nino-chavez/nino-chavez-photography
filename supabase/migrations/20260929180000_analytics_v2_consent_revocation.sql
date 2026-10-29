-- Consent withdrawal revokes only queued exports proven to belong to this browser.
-- Review and apply through the normal Supabase workflow; this migration is not applied locally.
BEGIN;

CREATE TABLE analytics_private.analytics_v2_revoked_browsers (
  anonymous_browser_id uuid PRIMARY KEY,
  revoked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE analytics_private.analytics_v2_revoked_browsers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON analytics_private.analytics_v2_revoked_browsers FROM PUBLIC, anon, authenticated;
GRANT ALL ON analytics_private.analytics_v2_revoked_browsers TO service_role;

-- A revoked browser cannot race a cross-tab preference update back into the outbox.
CREATE OR REPLACE FUNCTION public.analytics_accept_event_v2(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  event_row public.analytics_events_v2%ROWTYPE;
  received timestamptz := now();
  browser_id uuid := NULLIF(p_event->>'anonymous_browser_id','')::uuid;
  visit_id uuid := NULLIF(p_event->>'visit_id','')::uuid;
  may_export boolean := COALESCE((p_event->>'export_eligible')::boolean,false);
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  IF browser_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM analytics_private.analytics_v2_revoked_browsers r WHERE r.anonymous_browser_id = browser_id
  ) THEN
    browser_id := NULL;
    visit_id := NULL;
    may_export := false;
  END IF;
  INSERT INTO public.analytics_events_v2 (
    event_id, schema_version, event_name, occurred_at, received_at, anonymous_browser_id, visit_id,
    traffic_context, export_eligible, album_key, photo_id, properties
  ) VALUES (
    (p_event->>'event_id')::uuid, (p_event->>'schema_version')::smallint, p_event->>'event_name',
    (p_event->>'occurred_at')::timestamptz, received, browser_id, visit_id,
    p_event->>'traffic_context', may_export,
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

CREATE OR REPLACE FUNCTION public.analytics_revoke_browser_exports_v2(p_browser_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, analytics_private AS $$
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  INSERT INTO analytics_private.analytics_v2_revoked_browsers(anonymous_browser_id) VALUES (p_browser_id)
  ON CONFLICT (anonymous_browser_id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at;
  -- Preserve submitted/confirmed rows: a provider may already have received them. They are not
  -- a claim that this function deleted provider data. Pending/failed rows have not been accepted
  -- by the provider and are removed before any future claim can deliver them.
  DELETE FROM public.analytics_posthog_outbox o
  USING public.analytics_events_v2 e
  WHERE o.event_id = e.event_id
    AND e.anonymous_browser_id = p_browser_id
    AND o.status IN ('pending','failed');
  UPDATE public.analytics_events_v2
  SET export_eligible = false
  WHERE anonymous_browser_id = p_browser_id AND export_eligible;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_revoke_browser_exports_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_revoke_browser_exports_v2(uuid) TO service_role;

CREATE OR REPLACE FUNCTION analytics_private.prune_revoked_analytics_browsers_at(run_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, analytics_private AS $$
  DELETE FROM analytics_private.analytics_v2_revoked_browsers WHERE revoked_at < run_at - interval '90 days';
$$;
REVOKE ALL ON FUNCTION analytics_private.prune_revoked_analytics_browsers_at(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.prune_revoked_analytics_browsers_at(timestamptz) TO service_role;
SELECT cron.unschedule('analytics-v2-revoked-browser-prune') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='analytics-v2-revoked-browser-prune');
SELECT cron.schedule('analytics-v2-revoked-browser-prune','29 3 * * *',$$SELECT analytics_private.prune_revoked_analytics_browsers_at(now());$$);
NOTIFY pgrst, 'reload schema';
COMMIT;
