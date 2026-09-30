-- Immutable, aggregate-only intelligence evidence. This migration intentionally
-- creates no audience or tracking fixtures and never stores assistant questions.
BEGIN;

CREATE TABLE public.analytics_intelligence_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL CHECK (length(scope_key) BETWEEN 2 AND 12000),
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object'),
  generated_at timestamptz NOT NULL,
  cutoff_at timestamptz,
  coverage text NOT NULL CHECK (coverage IN ('complete','partial','unavailable')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  suppressions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suppressions) = 'array'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  rule_version integer NOT NULL CHECK (rule_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX analytics_intelligence_snapshots_scope_generated_idx ON public.analytics_intelligence_snapshots(scope_key, generated_at DESC, snapshot_id DESC);
ALTER TABLE public.analytics_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_snapshots TO service_role;
COMMENT ON TABLE public.analytics_intelligence_snapshots IS 'Append-only, aggregate evidence versions. No visitor identifiers, raw events, or assistant question text.';

CREATE TABLE public.analytics_intelligence_snapshot_current (
  scope_key text PRIMARY KEY CHECK (length(scope_key) BETWEEN 2 AND 12000),
  snapshot_id uuid NOT NULL REFERENCES public.analytics_intelligence_snapshots(snapshot_id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.analytics_intelligence_snapshot_current ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_snapshot_current FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_snapshot_current TO service_role;
COMMENT ON TABLE public.analytics_intelligence_snapshot_current IS 'Mutable pointer to one immutable evidence version per normalized scope.';

CREATE TABLE public.analytics_intelligence_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key text NOT NULL REFERENCES public.analytics_intelligence_snapshot_current(scope_key) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('record','dismiss','snooze','undo')),
  finding_id text,
  target jsonb,
  actual_at timestamptz,
  hypothesis text CHECK (hypothesis IS NULL OR length(hypothesis) <= 500),
  primary_measure text CHECK (primary_measure IS NULL OR primary_measure IN ('photo_opens','album_opens','downloads','favorites','shares','page_views')),
  follow_up_at timestamptz,
  note text CHECK (note IS NULL OR length(note) <= 1000),
  reverses_action_id uuid REFERENCES public.analytics_intelligence_actions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind = 'record') = (actual_at IS NOT NULL AND hypothesis IS NOT NULL AND primary_measure IS NOT NULL AND follow_up_at IS NOT NULL)),
  CHECK ((kind = 'undo') = (reverses_action_id IS NOT NULL)),
  CHECK (kind = 'undo' OR finding_id IS NOT NULL)
);
CREATE INDEX analytics_intelligence_actions_owner_scope_idx ON public.analytics_intelligence_actions(owner_id, scope_key, created_at DESC);
ALTER TABLE public.analytics_intelligence_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_actions TO service_role;
CREATE POLICY analytics_intelligence_actions_owner_read ON public.analytics_intelligence_actions FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY analytics_intelligence_actions_owner_insert ON public.analytics_intelligence_actions FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.analytics_intelligence_finding_lifecycle (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key text NOT NULL REFERENCES public.analytics_intelligence_snapshot_current(scope_key) ON DELETE CASCADE,
  finding_id text NOT NULL CHECK (length(finding_id) BETWEEN 1 AND 120),
  status text NOT NULL CHECK (status IN ('open','dismiss','snooze')),
  snoozed_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, scope_key, finding_id),
  CHECK ((status = 'snooze') = (snoozed_until IS NOT NULL))
);
ALTER TABLE public.analytics_intelligence_finding_lifecycle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_finding_lifecycle FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_finding_lifecycle TO service_role;
CREATE POLICY analytics_intelligence_lifecycle_owner ON public.analytics_intelligence_finding_lifecycle FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.analytics_intelligence_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key text NOT NULL REFERENCES public.analytics_intelligence_snapshot_current(scope_key) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('album_comparison','site_retention')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','complete','unavailable','expired')),
  answer jsonb,
  report_id uuid REFERENCES public.analytics_intelligence_snapshots(snapshot_id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (answer IS NULL OR jsonb_typeof(answer) = 'object')
);
CREATE UNIQUE INDEX analytics_intelligence_request_pending_uniq ON public.analytics_intelligence_requests(owner_id, scope_key, operation) WHERE status IN ('pending','leased');
ALTER TABLE public.analytics_intelligence_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_requests TO service_role;
CREATE POLICY analytics_intelligence_requests_owner_read ON public.analytics_intelligence_requests FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY analytics_intelligence_requests_owner_insert ON public.analytics_intelligence_requests FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.analytics_intelligence_preferences (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dashboard_enabled boolean NOT NULL DEFAULT true,
  external_enabled boolean NOT NULL DEFAULT false,
  destination_verified boolean NOT NULL DEFAULT false,
  destination text,
  sender text,
  -- Retention is an explicit owner decision. NULL deliberately means undecided.
  retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (destination IS NULL OR length(destination) <= 320),
  CHECK (sender IS NULL OR sender IN ('owned','posthog_native'))
);
ALTER TABLE public.analytics_intelligence_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.analytics_intelligence_preferences TO authenticated;
GRANT ALL ON public.analytics_intelligence_preferences TO service_role;
CREATE POLICY analytics_intelligence_preferences_owner ON public.analytics_intelligence_preferences FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.analytics_intelligence_schedules (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_enabled boolean NOT NULL DEFAULT false,
  weekly_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.analytics_intelligence_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_schedules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.analytics_intelligence_schedules TO authenticated;
GRANT ALL ON public.analytics_intelligence_schedules TO service_role;
CREATE POLICY analytics_intelligence_schedules_owner ON public.analytics_intelligence_schedules FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.analytics_intelligence_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key text NOT NULL REFERENCES public.analytics_intelligence_snapshot_current(scope_key) ON DELETE CASCADE,
  snapshot_id uuid REFERENCES public.analytics_intelligence_snapshots(snapshot_id) ON DELETE SET NULL,
  period_key date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('daily','weekly','operational')),
  late boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(owner_id, scope_key, period_key, kind)
);
ALTER TABLE public.analytics_intelligence_briefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_briefs FROM PUBLIC, anon;
GRANT SELECT ON public.analytics_intelligence_briefs TO authenticated;
GRANT ALL ON public.analytics_intelligence_briefs TO service_role;
CREATE POLICY analytics_intelligence_briefs_owner ON public.analytics_intelligence_briefs FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.analytics_intelligence_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('refresh','request','daily','weekly')),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_key text NOT NULL,
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object'),
  request_id uuid REFERENCES public.analytics_intelligence_requests(id) ON DELETE CASCADE,
  intended_period date,
  operation text CHECK (operation IS NULL OR operation IN ('album_comparison','site_retention')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','complete','retry','expired','unavailable')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  leased_until timestamptz,
  report_id uuid REFERENCES public.analytics_intelligence_snapshots(snapshot_id) ON DELETE SET NULL,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind = 'request') = (request_id IS NOT NULL)),
  CHECK ((kind IN ('daily','weekly')) = (intended_period IS NOT NULL))
);
CREATE UNIQUE INDEX analytics_intelligence_jobs_scheduled_uniq ON public.analytics_intelligence_jobs(coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, intended_period) WHERE kind IN ('daily','weekly') AND status NOT IN ('expired','unavailable');
CREATE UNIQUE INDEX analytics_intelligence_jobs_refresh_pending_uniq ON public.analytics_intelligence_jobs(scope_key) WHERE kind = 'refresh' AND status IN ('pending','leased','retry');
CREATE UNIQUE INDEX analytics_intelligence_jobs_request_pending_uniq ON public.analytics_intelligence_jobs(request_id) WHERE kind = 'request' AND status IN ('pending','leased','retry');
ALTER TABLE public.analytics_intelligence_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_jobs TO service_role;

CREATE TABLE public.analytics_intelligence_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid REFERENCES public.analytics_intelligence_briefs(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('dashboard','email')),
  sender text NOT NULL CHECK (sender IN ('owned','posthog_native')),
  destination_verified boolean NOT NULL DEFAULT false,
  preference_enabled boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 180),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','shown','accepted','suppressed','failed','ambiguous','missing','unavailable')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  leased_until timestamptz,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,80}$'),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 320),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.analytics_intelligence_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_deliveries TO service_role;

CREATE TABLE public.analytics_intelligence_incidents (
  scope_key text NOT NULL,
  finding_id text NOT NULL,
  opened_snapshot_id uuid NOT NULL REFERENCES public.analytics_intelligence_snapshots(snapshot_id) ON DELETE RESTRICT,
  last_snapshot_id uuid NOT NULL REFERENCES public.analytics_intelligence_snapshots(snapshot_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('open','acknowledged','recovered')),
  acknowledged_until timestamptz,
  recovered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(scope_key, finding_id)
);
ALTER TABLE public.analytics_intelligence_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_intelligence_incidents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_intelligence_incidents TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_claim_intelligence_jobs(p_limit integer, p_lease_seconds integer, p_now timestamptz)
RETURNS TABLE(id uuid, kind text, scope jsonb, owner_id uuid, intended_period date, request_id uuid, operation text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 OR p_lease_seconds NOT BETWEEN 30 AND 900 OR p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence job claim'; END IF;
  RETURN QUERY WITH candidates AS (
    SELECT j.id FROM public.analytics_intelligence_jobs j
    WHERE (j.status IN ('pending','retry') AND j.available_at <= p_now) OR (j.status = 'leased' AND j.leased_until < p_now)
    ORDER BY j.available_at, j.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.analytics_intelligence_jobs j SET status = 'leased', leased_until = p_now + make_interval(secs => p_lease_seconds), attempts = j.attempts + 1, updated_at = p_now
    FROM candidates c WHERE j.id = c.id RETURNING j.*
  ), request_leases AS (
    UPDATE public.analytics_intelligence_requests r SET status = 'leased', updated_at = p_now
    FROM claimed c WHERE c.request_id = r.id AND r.status = 'pending'
  ) SELECT c.id, c.kind, c.scope, c.owner_id, c.intended_period, c.request_id, c.operation FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_finish_intelligence_job(p_job_id uuid, p_status text, p_error_code text, p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_job public.analytics_intelligence_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('complete','retry') OR p_job_id IS NULL THEN RAISE EXCEPTION 'invalid intelligence job finish'; END IF;
  SELECT * INTO v_job FROM public.analytics_intelligence_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'leased' THEN RAISE EXCEPTION 'intelligence job is not leased'; END IF;
  IF p_status = 'complete' AND (p_report_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_snapshots WHERE snapshot_id = p_report_id AND scope = v_job.scope)) THEN RAISE EXCEPTION 'immutable report does not match job scope'; END IF;
  UPDATE public.analytics_intelligence_jobs SET status = CASE WHEN p_status = 'complete' THEN 'complete' ELSE 'retry' END, report_id = p_report_id, error_code = CASE WHEN p_status = 'complete' THEN NULL ELSE coalesce(p_error_code, 'intelligence_refresh_unavailable') END, leased_until = NULL, available_at = CASE WHEN p_status = 'complete' THEN available_at ELSE clock_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 6)))) END, updated_at = clock_timestamp() WHERE id = p_job_id;
  IF p_status = 'complete' AND v_job.request_id IS NOT NULL THEN UPDATE public.analytics_intelligence_requests SET status = 'complete', report_id = p_report_id, answer = jsonb_build_object('operation', v_job.operation, 'report_id', p_report_id, 'status', 'complete'), updated_at = clock_timestamp() WHERE id = v_job.request_id AND status IN ('pending','leased'); END IF;
  IF p_status = 'complete' AND v_job.kind IN ('daily','weekly') AND v_job.owner_id IS NOT NULL THEN
    INSERT INTO public.analytics_intelligence_briefs(owner_id, scope_key, snapshot_id, period_key, kind, late)
    VALUES (v_job.owner_id, v_job.scope_key, p_report_id, v_job.intended_period, v_job.kind, clock_timestamp() > (v_job.intended_period::timestamp AT TIME ZONE 'America/Chicago') + interval '8 hours 15 minutes')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.analytics_intelligence_deliveries(brief_id, channel, sender, destination_verified, preference_enabled, idempotency_key, payload)
    SELECT b.id, 'dashboard', 'owned', false, true, 'dashboard:' || b.id::text, jsonb_build_object('subject','Analytics brief','body','Open the dashboard brief for the saved aggregate evidence.')
    FROM public.analytics_intelligence_briefs b WHERE b.owner_id=v_job.owner_id AND b.scope_key=v_job.scope_key AND b.period_key=v_job.intended_period AND b.kind=v_job.kind
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_prepare_intelligence_periods(p_daily_period date, p_weekly_period date, p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_end date := (p_now AT TIME ZONE 'America/Chicago')::date - 1; v_start date := v_end - 29; v_scope jsonb;
BEGIN
  IF p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence period'; END IF;
  -- Bounded recurring refreshes are generated here, never supplied by a browser.
  FOR v_scope IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('kind','gallery','query',jsonb_build_object('start',v_start::text,'end',v_end::text,'measure','photo_opens','scope','all','albumKeys','[]'::jsonb,'compare','previous','traffic','conservative')),
    jsonb_build_object('kind','sites','period',7,'section','all'), jsonb_build_object('kind','sites','period',30,'section','all'), jsonb_build_object('kind','sites','period',90,'section','all'),
    jsonb_build_object('kind','sites','period',30,'section','profile'), jsonb_build_object('kind','sites','period',30,'section','writing'), jsonb_build_object('kind','sites','period',30,'section','demos')
  )) LOOP
    INSERT INTO public.analytics_intelligence_jobs(kind, scope_key, scope, available_at) VALUES ('refresh', v_scope::text, v_scope, p_now) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE public.analytics_intelligence_requests SET status = 'expired', updated_at = p_now WHERE status IN ('pending','leased') AND expires_at < p_now;
  INSERT INTO public.analytics_intelligence_jobs(kind, owner_id, scope_key, scope, request_id, operation, available_at)
  SELECT 'request', r.owner_id, r.scope_key, c.scope, r.id, r.operation, p_now FROM public.analytics_intelligence_requests r JOIN public.analytics_intelligence_snapshot_current c USING(scope_key) WHERE r.status = 'pending' AND r.expires_at >= p_now ON CONFLICT DO NOTHING;
  INSERT INTO public.analytics_intelligence_jobs(kind, owner_id, scope_key, scope, intended_period, available_at)
  SELECT 'daily', s.owner_id, c.scope_key, sn.scope, p_daily_period, p_now FROM public.analytics_intelligence_schedules s JOIN public.analytics_intelligence_snapshot_current c ON true JOIN public.analytics_intelligence_snapshots sn ON sn.snapshot_id = c.snapshot_id WHERE s.daily_enabled AND p_daily_period IS NOT NULL ON CONFLICT DO NOTHING;
  INSERT INTO public.analytics_intelligence_jobs(kind, owner_id, scope_key, scope, intended_period, available_at)
  SELECT 'weekly', s.owner_id, c.scope_key, sn.scope, p_weekly_period, p_now FROM public.analytics_intelligence_schedules s JOIN public.analytics_intelligence_snapshot_current c ON true JOIN public.analytics_intelligence_snapshots sn ON sn.snapshot_id = c.snapshot_id WHERE s.weekly_enabled AND p_weekly_period IS NOT NULL ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_record_intelligence_lifecycle(p_report_id uuid, p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_scope text; v_finding jsonb;
BEGIN
  SELECT scope_key INTO v_scope FROM public.analytics_intelligence_snapshots WHERE snapshot_id = p_report_id;
  IF v_scope IS NULL OR p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence lifecycle report'; END IF;
  FOR v_finding IN SELECT value FROM jsonb_array_elements((SELECT findings FROM public.analytics_intelligence_snapshots WHERE snapshot_id = p_report_id)) LOOP
    INSERT INTO public.analytics_intelligence_incidents(scope_key, finding_id, opened_snapshot_id, last_snapshot_id, status, updated_at)
    VALUES (v_scope, v_finding->>'id', p_report_id, p_report_id, 'open', p_now)
    ON CONFLICT(scope_key, finding_id) DO UPDATE SET last_snapshot_id = excluded.last_snapshot_id, status = CASE WHEN public.analytics_intelligence_incidents.status = 'acknowledged' AND public.analytics_intelligence_incidents.acknowledged_until > p_now THEN 'acknowledged' ELSE 'open' END, updated_at = p_now;
  END LOOP;
  UPDATE public.analytics_intelligence_incidents i SET status = 'recovered', recovered_at = p_now, last_snapshot_id = p_report_id, updated_at = p_now WHERE i.scope_key = v_scope AND i.status IN ('open','acknowledged') AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements((SELECT findings FROM public.analytics_intelligence_snapshots WHERE snapshot_id = p_report_id)) f WHERE f->>'id' = i.finding_id);
  INSERT INTO public.analytics_intelligence_briefs(owner_id, scope_key, snapshot_id, period_key, kind, late)
  SELECT s.owner_id, v_scope, p_report_id, (p_now AT TIME ZONE 'America/Chicago')::date, 'operational', false FROM public.analytics_intelligence_schedules s JOIN public.analytics_intelligence_preferences p ON p.owner_id=s.owner_id WHERE p.dashboard_enabled ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_claim_intelligence_deliveries(p_limit integer, p_lease_seconds integer)
RETURNS TABLE(id uuid, channel text, sender text, destination_verified boolean, preference_enabled boolean, idempotency_key text, payload jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'invalid intelligence delivery claim'; END IF;
  RETURN QUERY WITH candidates AS (SELECT d.id FROM public.analytics_intelligence_deliveries d WHERE (d.status = 'pending' AND d.available_at <= clock_timestamp()) OR (d.status = 'leased' AND d.leased_until < clock_timestamp()) ORDER BY d.available_at,d.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit), claimed AS (UPDATE public.analytics_intelligence_deliveries d SET status='leased',leased_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=d.attempts+1,updated_at=clock_timestamp() FROM candidates c WHERE d.id=c.id RETURNING d.*) SELECT c.id,c.channel,c.sender,c.destination_verified,c.preference_enabled,c.idempotency_key,c.payload FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_finish_intelligence_delivery(p_delivery_id uuid, p_status text, p_error_code text, p_provider_message_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_status NOT IN ('shown','accepted','suppressed','failed','ambiguous') THEN RAISE EXCEPTION 'invalid intelligence delivery status'; END IF;
  UPDATE public.analytics_intelligence_deliveries SET status=p_status, error_code=p_error_code, provider_message_id=p_provider_message_id, leased_until=NULL, available_at=CASE WHEN p_status='failed' THEN clock_timestamp()+interval '5 minutes' ELSE available_at END, updated_at=clock_timestamp() WHERE id=p_delivery_id AND status='leased';
  IF NOT FOUND THEN RAISE EXCEPTION 'intelligence delivery is not leased'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_list_ambiguous_intelligence_deliveries(p_limit integer)
RETURNS TABLE(id uuid) LANGUAGE sql SECURITY INVOKER STABLE SET search_path = pg_catalog, public AS $$ SELECT d.id FROM public.analytics_intelligence_deliveries d WHERE d.status='ambiguous' ORDER BY d.updated_at LIMIT least(greatest(p_limit,1),50) $$;

CREATE OR REPLACE FUNCTION public.analytics_reconcile_intelligence_delivery(p_delivery_id uuid, p_state text, p_provider_message_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_state NOT IN ('accepted','missing','unavailable') THEN RAISE EXCEPTION 'invalid intelligence delivery reconciliation'; END IF;
  UPDATE public.analytics_intelligence_deliveries SET status=CASE WHEN p_state='accepted' THEN 'accepted' WHEN p_state='missing' THEN 'pending' ELSE 'unavailable' END, provider_message_id=coalesce(p_provider_message_id,provider_message_id), leased_until=NULL, available_at=CASE WHEN p_state='missing' THEN clock_timestamp() ELSE available_at END, updated_at=clock_timestamp() WHERE id=p_delivery_id AND status='ambiguous';
  IF NOT FOUND THEN RAISE EXCEPTION 'intelligence delivery is not ambiguous'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.analytics_claim_intelligence_jobs(integer,integer,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_finish_intelligence_job(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_prepare_intelligence_periods(date,date,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_record_intelligence_lifecycle(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_claim_intelligence_deliveries(integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_finish_intelligence_delivery(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_list_ambiguous_intelligence_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_reconcile_intelligence_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_claim_intelligence_jobs(integer,integer,timestamptz), public.analytics_finish_intelligence_job(uuid,text,text,uuid), public.analytics_prepare_intelligence_periods(date,date,timestamptz), public.analytics_record_intelligence_lifecycle(uuid,timestamptz), public.analytics_claim_intelligence_deliveries(integer,integer), public.analytics_finish_intelligence_delivery(uuid,text,text,text), public.analytics_list_ambiguous_intelligence_deliveries(integer), public.analytics_reconcile_intelligence_delivery(uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
