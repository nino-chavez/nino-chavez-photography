-- Private operator outcomes are append-only observations. They intentionally
-- contain no contact identity, audience record, or raw event data.
BEGIN;

CREATE TABLE public.analytics_intelligence_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.analytics_intelligence_actions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('unknown','inquiry','booking','other')),
  outcome_count integer CHECK (outcome_count IS NULL OR outcome_count BETWEEN 0 AND 100000),
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX analytics_intelligence_outcomes_owner_action_created_idx
  ON public.analytics_intelligence_outcomes(owner_id, action_id, created_at DESC, id DESC);
ALTER TABLE public.analytics_intelligence_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_outcomes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.analytics_intelligence_outcomes TO authenticated;
GRANT ALL ON public.analytics_intelligence_outcomes TO service_role;
CREATE POLICY analytics_intelligence_outcomes_owner_read
  ON public.analytics_intelligence_outcomes FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.analytics_record_intelligence_outcome(
  p_owner_id uuid,
  p_action_id uuid,
  p_outcome text,
  p_outcome_count integer,
  p_note text
)
RETURNS public.analytics_intelligence_outcomes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result public.analytics_intelligence_outcomes;
BEGIN
  IF p_owner_id IS NULL OR p_action_id IS NULL
    OR p_outcome NOT IN ('unknown','inquiry','booking','other')
    OR (p_outcome_count IS NOT NULL AND p_outcome_count NOT BETWEEN 0 AND 100000)
    OR (p_note IS NOT NULL AND (length(p_note) = 0 OR length(p_note) > 500)) THEN
    RAISE EXCEPTION 'invalid intelligence outcome';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.analytics_intelligence_preferences p
    WHERE p.owner_id = p_owner_id AND p.retention_policy <> 'undecided'
  ) THEN
    RAISE EXCEPTION 'intelligence retention decision required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.analytics_intelligence_actions a
    WHERE a.id = p_action_id AND a.owner_id = p_owner_id AND a.kind = 'record'
  ) THEN
    RAISE EXCEPTION 'recorded intelligence action not found for owner';
  END IF;

  INSERT INTO public.analytics_intelligence_outcomes(action_id, owner_id, outcome, outcome_count, note)
  VALUES (p_action_id, p_owner_id, p_outcome, p_outcome_count, p_note)
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

-- This returns at most one newest append for each explicitly supplied action.
-- It is service-only: the calling route already verified p_owner_id, and the
-- explicit predicate remains necessary because service_role bypasses RLS.
CREATE FUNCTION public.analytics_latest_intelligence_outcomes(
  p_owner_id uuid,
  p_action_ids uuid[]
)
RETURNS TABLE(
  id uuid,
  action_id uuid,
  outcome text,
  outcome_count integer,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_owner_id IS NULL
    OR coalesce(cardinality(p_action_ids), 0) NOT BETWEEN 1 AND 20
    OR EXISTS (SELECT 1 FROM unnest(p_action_ids) AS requested(id) WHERE requested.id IS NULL) THEN
    RAISE EXCEPTION 'invalid intelligence outcome query';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (stored.action_id)
    stored.id, stored.action_id, stored.outcome, stored.outcome_count,
    stored.note, stored.created_at
  FROM public.analytics_intelligence_outcomes AS stored
  WHERE stored.owner_id = p_owner_id
    AND stored.action_id = ANY(p_action_ids)
  ORDER BY stored.action_id, stored.created_at DESC, stored.id DESC;
END;
$$;

-- Keep the established action and brief retention behavior, while giving
-- appended outcomes their own creation-time retention boundary.
CREATE OR REPLACE FUNCTION public.analytics_cleanup_intelligence_private(p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence cleanup time'; END IF;
  DELETE FROM public.analytics_intelligence_outcomes o
  USING public.analytics_intelligence_preferences p
  WHERE p.owner_id = o.owner_id AND p.retention_policy = 'days'
    AND o.created_at < p_now - make_interval(days => p.retention_days);
  DELETE FROM public.analytics_intelligence_actions a
  USING public.analytics_intelligence_preferences p
  WHERE p.owner_id = a.owner_id AND p.retention_policy = 'days'
    AND a.created_at < p_now - make_interval(days => p.retention_days);
  DELETE FROM public.analytics_intelligence_finding_lifecycle l USING public.analytics_intelligence_preferences p
  WHERE p.owner_id=l.owner_id AND p.retention_policy='days' AND l.updated_at < p_now-make_interval(days=>p.retention_days);
  DELETE FROM public.analytics_intelligence_jobs j USING public.analytics_intelligence_requests r
  WHERE j.request_id=r.id AND r.expires_at<p_now;
  DELETE FROM public.analytics_intelligence_requests WHERE expires_at<p_now;
  DELETE FROM public.analytics_intelligence_jobs j USING public.analytics_intelligence_preferences p
  WHERE p.owner_id=j.owner_id AND p.retention_policy='days' AND j.created_at < p_now-make_interval(days=>p.retention_days);
  DELETE FROM public.analytics_intelligence_briefs b
  USING public.analytics_intelligence_preferences p
  WHERE p.owner_id = b.owner_id AND p.retention_policy = 'days'
    AND b.created_at < p_now - make_interval(days => p.retention_days);
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_delete_intelligence_private_history(p_owner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'invalid intelligence history owner'; END IF;

  -- Deliveries, requests, jobs, and action children are removed before their
  -- private parents. Aggregate snapshots and visitor/audience data are absent
  -- from this transaction by design.
  DELETE FROM public.analytics_intelligence_outcomes WHERE owner_id = p_owner_id;

  LOOP
    DELETE FROM public.analytics_intelligence_actions a
    WHERE a.owner_id = p_owner_id
      AND NOT EXISTS (
        SELECT 1 FROM public.analytics_intelligence_actions child
        WHERE child.reverses_action_id = a.id AND child.owner_id = p_owner_id
      );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    EXIT WHEN v_deleted = 0;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.analytics_intelligence_actions WHERE owner_id = p_owner_id) THEN
    RAISE EXCEPTION 'intelligence action history cannot be safely removed';
  END IF;

  DELETE FROM public.analytics_intelligence_finding_lifecycle WHERE owner_id = p_owner_id;
  DELETE FROM public.analytics_intelligence_deliveries d
  USING public.analytics_intelligence_briefs b
  WHERE d.brief_id = b.id AND b.owner_id = p_owner_id;
  DELETE FROM public.analytics_intelligence_briefs WHERE owner_id = p_owner_id;
  DELETE FROM public.analytics_intelligence_jobs WHERE owner_id = p_owner_id;
  DELETE FROM public.analytics_intelligence_requests WHERE owner_id = p_owner_id;

  -- Preferences remain. Turning schedules and external delivery off prevents
  -- a deleted history from being immediately recreated.
  UPDATE public.analytics_intelligence_preferences
  SET external_enabled = false, updated_at = clock_timestamp()
  WHERE owner_id = p_owner_id;
  INSERT INTO public.analytics_intelligence_schedules(owner_id, daily_enabled, weekly_enabled)
  VALUES (p_owner_id, false, false)
  ON CONFLICT(owner_id) DO UPDATE
    SET daily_enabled = false, weekly_enabled = false, updated_at = clock_timestamp();
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_record_intelligence_outcome(uuid,uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_record_intelligence_outcome(uuid,uuid,text,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.analytics_latest_intelligence_outcomes(uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_latest_intelligence_outcomes(uuid,uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.analytics_delete_intelligence_private_history(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_delete_intelligence_private_history(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.analytics_cleanup_intelligence_private(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_cleanup_intelligence_private(timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
