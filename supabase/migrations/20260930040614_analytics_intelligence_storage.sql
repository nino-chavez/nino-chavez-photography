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
GRANT SELECT ON public.analytics_intelligence_preferences TO authenticated;
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
GRANT SELECT ON public.analytics_intelligence_schedules TO authenticated;
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

-- Final report-worker storage contract. The provisional functions above are
-- replaced below so a fresh migration exposes only this interface.
ALTER TABLE public.analytics_intelligence_preferences
  ADD COLUMN retention_policy text NOT NULL DEFAULT 'undecided' CHECK (retention_policy IN ('undecided','until_deleted','days'));
ALTER TABLE public.analytics_intelligence_actions
  ADD COLUMN change_type text CHECK (change_type IS NULL OR change_type IN ('promotion','cover','headline','cta','search_fix','download_repair','shooting','editing','other')),
  ADD COLUMN channel text CHECK (channel IS NULL OR length(channel) <= 80),
  ADD COLUMN campaign text CHECK (campaign IS NULL OR length(campaign) <= 120),
  ADD COLUMN release text CHECK (release IS NULL OR length(release) <= 120),
  ADD COLUMN variant text CHECK (variant IS NULL OR length(variant) <= 120),
  ADD COLUMN outcome text CHECK (outcome IS NULL OR outcome IN ('unknown','inquiry','booking','other')),
  ADD COLUMN outcome_count integer CHECK (outcome_count IS NULL OR outcome_count BETWEEN 0 AND 100000),
  ADD COLUMN observation_days integer CHECK (observation_days IS NULL OR observation_days BETWEEN 1 AND 365),
  ADD COLUMN target_context jsonb CHECK (target_context IS NULL OR jsonb_typeof(target_context) = 'object');
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.analytics_intelligence_actions'::regclass
      AND contype='c' AND pg_get_constraintdef(oid) LIKE '%finding_id%' LOOP
    EXECUTE format('ALTER TABLE public.analytics_intelligence_actions DROP CONSTRAINT %I',c);
  END LOOP;
END $$;
ALTER TABLE public.analytics_intelligence_actions
  ADD CONSTRAINT analytics_intelligence_action_target_contract CHECK (
    (kind='record' AND target IS NOT NULL)
    OR (kind IN ('dismiss','snooze') AND finding_id IS NOT NULL AND target IS NOT NULL)
    OR (kind='undo' AND reverses_action_id IS NOT NULL)
  );
CREATE UNIQUE INDEX analytics_intelligence_actions_undo_once_uniq
  ON public.analytics_intelligence_actions(owner_id, reverses_action_id) WHERE kind = 'undo';
ALTER TABLE public.analytics_intelligence_briefs
  ADD COLUMN body text NOT NULL DEFAULT '' CHECK (octet_length(body) <= 12000),
  ADD COLUMN findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  ADD COLUMN snapshot_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(snapshot_ids) = 'array'),
  ADD COLUMN source_windows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_windows) = 'array'),
  ADD COLUMN suppressions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suppressions) = 'array');
ALTER TABLE public.analytics_intelligence_briefs ALTER COLUMN scope_key DROP NOT NULL;
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.analytics_intelligence_briefs'::regclass
    AND contype = 'u'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.analytics_intelligence_briefs'::regclass AND attname='owner_id'),
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.analytics_intelligence_briefs'::regclass AND attname='scope_key'),
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.analytics_intelligence_briefs'::regclass AND attname='period_key'),
      (SELECT attnum FROM pg_attribute WHERE attrelid='public.analytics_intelligence_briefs'::regclass AND attname='kind')
    ];
  IF constraint_name IS NOT NULL THEN EXECUTE format('ALTER TABLE public.analytics_intelligence_briefs DROP CONSTRAINT %I', constraint_name); END IF;
END $$;
CREATE UNIQUE INDEX analytics_intelligence_briefs_owner_period_kind_uniq ON public.analytics_intelligence_briefs(owner_id, period_key, kind);
DROP INDEX public.analytics_intelligence_jobs_scheduled_uniq;
CREATE UNIQUE INDEX analytics_intelligence_jobs_scheduled_scope_uniq
  ON public.analytics_intelligence_jobs(owner_id, kind, intended_period, scope_key)
  WHERE kind IN ('daily','weekly') AND status NOT IN ('expired','unavailable');

CREATE OR REPLACE FUNCTION public.analytics_intelligence_scope_key(p_scope jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$ SELECT p_scope::text $$;

CREATE OR REPLACE FUNCTION public.analytics_set_intelligence_preferences(
  p_owner_id uuid, p_retention_policy text, p_retention_days integer,
  p_daily_enabled boolean, p_weekly_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  -- This is service-only. The server route verifies the signed-in owner before
  -- this atomic preference-and-schedule write; browser roles have no EXECUTE.
  IF p_retention_policy NOT IN ('undecided','until_deleted','days')
     OR (p_retention_policy = 'days' AND (p_retention_days IS NULL OR p_retention_days NOT BETWEEN 1 AND 3650))
     OR (p_retention_policy <> 'days' AND p_retention_days IS NOT NULL) THEN RAISE EXCEPTION 'invalid intelligence retention preference'; END IF;
  INSERT INTO public.analytics_intelligence_preferences(owner_id, retention_policy, retention_days)
  VALUES (p_owner_id, p_retention_policy, p_retention_days)
  ON CONFLICT(owner_id) DO UPDATE SET retention_policy=excluded.retention_policy, retention_days=excluded.retention_days, updated_at=clock_timestamp();
  INSERT INTO public.analytics_intelligence_schedules(owner_id, daily_enabled, weekly_enabled)
  VALUES (p_owner_id, p_daily_enabled, p_weekly_enabled)
  ON CONFLICT(owner_id) DO UPDATE SET daily_enabled=excluded.daily_enabled, weekly_enabled=excluded.weekly_enabled, updated_at=clock_timestamp();
END $$;

CREATE OR REPLACE FUNCTION public.analytics_claim_intelligence_jobs(p_limit integer, p_lease_seconds integer, p_now timestamptz)
RETURNS TABLE("id" uuid,"kind" text,"scope" jsonb,"ownerId" uuid,"intendedPeriod" date,"late" boolean,"requestId" uuid,"operation" text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 4 OR p_lease_seconds NOT BETWEEN 30 AND 900 OR p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence job claim'; END IF;
  UPDATE public.analytics_intelligence_jobs SET status='unavailable',error_code='attempts_exhausted',leased_until=NULL,updated_at=p_now
    WHERE status IN ('pending','retry','leased') AND attempts >= 20;
  RETURN QUERY WITH candidates AS (
    SELECT j.id FROM public.analytics_intelligence_jobs j
    WHERE ((j.status IN ('pending','retry') AND j.available_at <= p_now) OR (j.status='leased' AND j.leased_until < p_now)) AND j.attempts < 20
    ORDER BY j.available_at,j.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.analytics_intelligence_jobs j SET status='leased',leased_until=p_now+make_interval(secs=>p_lease_seconds),attempts=j.attempts+1,updated_at=p_now
    FROM candidates c WHERE j.id=c.id RETURNING j.*
  ), request_leases AS (
    UPDATE public.analytics_intelligence_requests r SET status='leased',updated_at=p_now FROM claimed c WHERE r.id=c.request_id AND r.status='pending'
  ) SELECT c.id,c.kind,c.scope,c.owner_id,c.intended_period,
    (c.intended_period IS NOT NULL AND p_now > (c.intended_period::timestamp AT TIME ZONE 'America/Chicago')+interval '8 hours'),c.request_id,c.operation FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_finish_intelligence_job(p_job_id uuid, p_status text, p_report_id uuid, p_error_code text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE j public.analytics_intelligence_jobs%ROWTYPE; snapshot_scope text; delay_seconds integer; brief_id uuid;
BEGIN
  IF p_status NOT IN ('complete','retry') OR p_job_id IS NULL THEN RAISE EXCEPTION 'invalid intelligence job finish'; END IF;
  SELECT * INTO j FROM public.analytics_intelligence_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'leased' THEN RAISE EXCEPTION 'intelligence job is not leased'; END IF;
  SELECT scope_key INTO snapshot_scope FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id;
  IF p_status='complete' AND (p_report_id IS NULL OR snapshot_scope IS DISTINCT FROM j.scope_key) THEN RAISE EXCEPTION 'immutable report does not match job scope'; END IF;
  delay_seconds:=CASE WHEN p_error_code='provider_query_pending' THEN 300 ELSE least(3600,30*(2^least(j.attempts,6))) END;
  UPDATE public.analytics_intelligence_jobs SET status=CASE WHEN p_status='complete' THEN 'complete' WHEN attempts>=20 THEN 'unavailable' ELSE 'retry' END,
    report_id=coalesce(p_report_id,report_id),error_code=CASE WHEN p_status='complete' THEN NULL ELSE coalesce(p_error_code,'intelligence_refresh_unavailable') END,
    leased_until=NULL,available_at=CASE WHEN p_status='complete' THEN available_at ELSE clock_timestamp()+make_interval(secs=>delay_seconds) END,updated_at=clock_timestamp() WHERE id=p_job_id;
  IF p_status='complete' AND j.kind IN ('daily','weekly') AND j.owner_id IS NOT NULL THEN
    INSERT INTO public.analytics_intelligence_briefs(owner_id,scope_key,snapshot_id,period_key,kind,late,body,findings,snapshot_ids,source_windows,suppressions)
    SELECT j.owner_id,NULL,p_report_id,j.intended_period,j.kind,
      clock_timestamp() > (j.intended_period::timestamp AT TIME ZONE 'America/Chicago')+interval '8 hours',
      'Open the dashboard brief for the saved aggregate evidence.',snapshot.findings,jsonb_build_array(p_report_id),
      jsonb_build_array(jsonb_build_object('scope',snapshot.scope,'cutoff',snapshot.cutoff_at,'timezone',CASE WHEN snapshot.scope->>'kind'='gallery' THEN 'America/Chicago' ELSE 'UTC' END)),snapshot.suppressions
    FROM public.analytics_intelligence_snapshots snapshot WHERE snapshot.snapshot_id=p_report_id
    ON CONFLICT(owner_id,period_key,kind) DO UPDATE SET snapshot_id=excluded.snapshot_id,late=analytics_intelligence_briefs.late OR excluded.late,
      findings=analytics_intelligence_briefs.findings || excluded.findings,snapshot_ids=analytics_intelligence_briefs.snapshot_ids || excluded.snapshot_ids,
      source_windows=analytics_intelligence_briefs.source_windows || excluded.source_windows,suppressions=analytics_intelligence_briefs.suppressions || excluded.suppressions,created_at=clock_timestamp()
    RETURNING id INTO brief_id;
    INSERT INTO public.analytics_intelligence_deliveries(brief_id,channel,sender,destination_verified,preference_enabled,idempotency_key,payload)
    VALUES(brief_id,'dashboard','owned',false,true,'dashboard:'||brief_id::text,jsonb_build_object('subject','Analytics brief','body','Open the dashboard brief for the saved aggregate evidence.')) ON CONFLICT(idempotency_key) DO NOTHING;
  END IF;
  IF j.request_id IS NOT NULL AND p_status='retry' AND j.attempts>=20 THEN UPDATE public.analytics_intelligence_requests SET status='unavailable',updated_at=clock_timestamp() WHERE id=j.request_id AND status IN ('pending','leased'); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.analytics_prepare_intelligence_periods(p_daily_period date,p_weekly_period date,p_standard_scopes jsonb,p_refresh_cadence_seconds integer,p_provider_pending_retry_seconds integer,p_max_catchup_periods integer,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE s jsonb; k text; d date; today date; completed_day date; inserted integer:=0;
BEGIN
  IF p_now IS NULL OR jsonb_typeof(p_standard_scopes)<>'array' OR p_refresh_cadence_seconds NOT BETWEEN 60 AND 86400 OR p_provider_pending_retry_seconds NOT BETWEEN 30 AND 86400 OR p_max_catchup_periods NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'invalid intelligence period'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_standard_scopes) LOOP
    k:=public.analytics_intelligence_scope_key(s);
    IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_jobs WHERE kind='refresh' AND scope_key=k AND status IN ('pending','leased','retry'))
      AND NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_snapshot_current WHERE scope_key=k AND updated_at > p_now-make_interval(secs=>p_refresh_cadence_seconds)) THEN
      INSERT INTO public.analytics_intelligence_jobs(kind,scope_key,scope,available_at) VALUES('refresh',k,s,p_now) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  UPDATE public.analytics_intelligence_requests SET status='expired',updated_at=p_now WHERE status IN ('pending','leased') AND expires_at < p_now;
  today := (p_now AT TIME ZONE 'America/Chicago')::date;
  completed_day := today-1;
  FOR d IN SELECT generated_day::date FROM generate_series(completed_day-p_max_catchup_periods+1,completed_day,interval '1 day') AS generated_day LOOP
    EXIT WHEN inserted >= p_max_catchup_periods;
    IF p_daily_period IS NOT NULL AND d <= least(p_daily_period,completed_day) THEN
      INSERT INTO public.analytics_intelligence_jobs(kind,owner_id,scope_key,scope,intended_period,available_at)
      SELECT 'daily',schedule.owner_id,current.scope_key,snapshot.scope,d,p_now FROM public.analytics_intelligence_schedules schedule CROSS JOIN public.analytics_intelligence_snapshot_current current JOIN public.analytics_intelligence_snapshots snapshot ON snapshot.snapshot_id=current.snapshot_id WHERE schedule.daily_enabled ON CONFLICT DO NOTHING;
      inserted:=inserted+1;
    END IF;
    IF p_weekly_period IS NOT NULL AND extract(isodow FROM d)=1 AND d <= least(p_weekly_period,completed_day) THEN
      INSERT INTO public.analytics_intelligence_jobs(kind,owner_id,scope_key,scope,intended_period,available_at)
      SELECT 'weekly',schedule.owner_id,current.scope_key,snapshot.scope,d,p_now FROM public.analytics_intelligence_schedules schedule CROSS JOIN public.analytics_intelligence_snapshot_current current JOIN public.analytics_intelligence_snapshots snapshot ON snapshot.snapshot_id=current.snapshot_id WHERE schedule.weekly_enabled ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Replaces the provisional action function with the final standalone-target
-- contract. This function is service-only: the route verifies the owner before
-- calling it, and no browser role can invoke privileged writes directly.
CREATE FUNCTION public.analytics_record_intelligence_action(
  p_owner_id uuid,p_scope_key text,p_kind text,p_finding_id text,p_target jsonb,p_actual_at timestamptz,p_hypothesis text,p_primary_measure text,p_follow_up_at timestamptz,p_note text,p_reverses_action_id uuid,p_change_type text,p_channel text,p_campaign text,p_release text,p_variant text,p_outcome text,p_outcome_count integer,p_observation_days integer,p_target_context jsonb)
RETURNS public.analytics_intelligence_actions LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE original public.analytics_intelligence_actions%ROWTYPE; result public.analytics_intelligence_actions%ROWTYPE; policy text;
BEGIN
  SELECT retention_policy INTO policy FROM public.analytics_intelligence_preferences WHERE owner_id=p_owner_id FOR UPDATE;
  IF coalesce(policy,'undecided')='undecided' THEN RAISE EXCEPTION 'retention decision required before private intelligence writes'; END IF;
  IF p_kind NOT IN ('record','dismiss','snooze','undo') THEN RAISE EXCEPTION 'invalid intelligence action'; END IF;
  IF p_kind='undo' THEN
    SELECT * INTO original FROM public.analytics_intelligence_actions WHERE id=p_reverses_action_id AND owner_id=p_owner_id FOR UPDATE;
    IF NOT FOUND OR original.kind NOT IN ('dismiss','snooze') THEN RAISE EXCEPTION 'undo action is not owned or reversible'; END IF;
    IF EXISTS (SELECT 1 FROM public.analytics_intelligence_actions later WHERE later.owner_id=p_owner_id AND later.scope_key=original.scope_key AND later.finding_id=original.finding_id AND later.kind IN ('dismiss','snooze') AND later.created_at>original.created_at) THEN RAISE EXCEPTION 'undo action is no longer the active lifecycle action'; END IF;
    SELECT * INTO result FROM public.analytics_intelligence_actions WHERE owner_id=p_owner_id AND reverses_action_id=p_reverses_action_id AND kind='undo'; IF FOUND THEN RETURN result; END IF;
    INSERT INTO public.analytics_intelligence_actions(owner_id,scope_key,kind,finding_id,target,reverses_action_id,target_context)
    VALUES(p_owner_id,original.scope_key,'undo',original.finding_id,original.target,p_reverses_action_id,original.target_context) RETURNING * INTO result;
    INSERT INTO public.analytics_intelligence_finding_lifecycle(owner_id,scope_key,finding_id,status,snoozed_until,updated_at)
    VALUES(p_owner_id,original.scope_key,original.finding_id,'open',NULL,clock_timestamp())
    ON CONFLICT(owner_id,scope_key,finding_id) DO UPDATE SET status='open',snoozed_until=NULL,updated_at=excluded.updated_at;
    RETURN result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.analytics_intelligence_snapshot_current WHERE scope_key=p_scope_key) THEN RAISE EXCEPTION 'unknown intelligence scope'; END IF;
  IF p_target IS NULL OR jsonb_typeof(p_target)<>'object' OR p_target->>'kind' NOT IN ('gallery','album','photo','site','page') THEN RAISE EXCEPTION 'public action target required'; END IF;
  IF (p_target->>'kind'='album' AND nullif(p_target->>'albumKey','') IS NULL) OR (p_target->>'kind' IN ('photo','page') AND nullif(p_target->>'id','') IS NULL) THEN RAISE EXCEPTION 'invalid public action target'; END IF;
  IF p_kind='record' AND (p_actual_at IS NULL OR p_actual_at>clock_timestamp() OR nullif(p_hypothesis,'') IS NULL OR p_primary_measure NOT IN ('photo_opens','album_opens','downloads','favorites','shares','page_views') OR p_follow_up_at IS NULL OR p_follow_up_at<=p_actual_at OR p_change_type IS NULL OR p_observation_days NOT BETWEEN 1 AND 365 OR p_outcome_count NOT BETWEEN 0 AND 100000) THEN RAISE EXCEPTION 'record action context required'; END IF;
  IF p_kind IN ('dismiss','snooze') AND p_finding_id IS NULL THEN RAISE EXCEPTION 'finding reference required'; END IF;
  INSERT INTO public.analytics_intelligence_actions(owner_id,scope_key,kind,finding_id,target,actual_at,hypothesis,primary_measure,follow_up_at,note,change_type,channel,campaign,release,variant,outcome,outcome_count,observation_days,target_context)
  VALUES(p_owner_id,p_scope_key,p_kind,p_finding_id,p_target,p_actual_at,p_hypothesis,p_primary_measure,p_follow_up_at,p_note,p_change_type,p_channel,p_campaign,p_release,p_variant,p_outcome,p_outcome_count,p_observation_days,p_target_context) RETURNING * INTO result;
  IF p_kind IN ('dismiss','snooze') THEN
    INSERT INTO public.analytics_intelligence_finding_lifecycle(owner_id,scope_key,finding_id,status,snoozed_until,updated_at)
    VALUES(p_owner_id,p_scope_key,p_finding_id,p_kind,CASE WHEN p_kind='snooze' THEN clock_timestamp()+interval '7 days' END,clock_timestamp())
    ON CONFLICT(owner_id,scope_key,finding_id) DO UPDATE SET status=excluded.status,snoozed_until=excluded.snoozed_until,updated_at=excluded.updated_at;
  END IF;
  RETURN result;
END $$;

-- This aggregate reader never sees raw events, unique-browser counts, or a
-- customer/inquiry record. Gallery bucket dates are Chicago days; site summary
-- dates are UTC days and are complete only through their saved refresh cutoff.
CREATE FUNCTION public.analytics_intelligence_action_follow_up(p_target jsonb,p_primary_measure text,p_actual_at timestamptz,p_observation_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE gallery_target boolean; tz text; action_day date; before_start date; before_end date; after_start date; after_end date; after_complete_at timestamptz; before_coverage text; after_coverage text; before_count bigint; after_count bigint; site_complete_through date;
BEGIN
  IF p_target IS NULL OR jsonb_typeof(p_target)<>'object' OR p_target->>'kind' NOT IN ('gallery','album','photo','site','page') OR p_primary_measure NOT IN ('photo_opens','album_opens','downloads','favorites','shares','page_views') OR p_actual_at IS NULL OR p_observation_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'invalid action follow-up'; END IF;
  gallery_target := p_target->>'kind' IN ('gallery','album','photo');
  IF gallery_target AND p_primary_measure='page_views' THEN RAISE EXCEPTION 'site measure cannot use gallery target'; END IF;
  IF NOT gallery_target AND p_primary_measure<>'page_views' THEN RAISE EXCEPTION 'gallery measure cannot use site target'; END IF;
  tz := CASE WHEN gallery_target THEN 'America/Chicago' ELSE 'UTC' END;
  action_day := (p_actual_at AT TIME ZONE tz)::date;
  before_start := action_day-p_observation_days; before_end := action_day-1;
  after_start := action_day+1; after_end := action_day+p_observation_days;
  -- The action day is excluded. A follow-up becomes eligible only after the
  -- final complete local calendar day in the after window, including DST.
  after_complete_at := ((after_end + 1)::timestamp AT TIME ZONE tz);
  IF gallery_target THEN
    SELECT CASE WHEN bool_or(coverage_state IS NULL OR coverage_state<>'complete') THEN CASE WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'unavailable' END ELSE 'complete' END INTO before_coverage FROM generate_series(before_start,before_end,'1 day') d LEFT JOIN public.analytics_daily_coverage c ON c.bucket_date=d::date;
    SELECT CASE WHEN bool_or(coverage_state IS NULL OR coverage_state<>'complete') THEN CASE WHEN bool_or(coverage_state='partial') THEN 'partial' ELSE 'unavailable' END ELSE 'complete' END INTO after_coverage FROM generate_series(after_start,after_end,'1 day') d LEFT JOIN public.analytics_daily_coverage c ON c.bucket_date=d::date;
    IF before_coverage='complete' THEN SELECT coalesce(sum(action_count),0) INTO before_count FROM public.analytics_daily_actions d WHERE d.bucket_date BETWEEN before_start AND before_end AND (p_target->>'kind'='gallery' OR (p_target->>'kind'='album' AND d.album_key=p_target->>'albumKey') OR (p_target->>'kind'='photo' AND d.photo_id=p_target->>'id')) AND ((p_primary_measure='photo_opens' AND d.event_type='view' AND d.photo_id<>'') OR (p_primary_measure='album_opens' AND d.event_type='album_open' AND d.photo_id='') OR (p_primary_measure='downloads' AND d.event_type='download') OR (p_primary_measure='favorites' AND d.event_type='favorite') OR (p_primary_measure='shares' AND d.event_type='share')); END IF;
    IF after_coverage='complete' THEN SELECT coalesce(sum(action_count),0) INTO after_count FROM public.analytics_daily_actions d WHERE d.bucket_date BETWEEN after_start AND after_end AND (p_target->>'kind'='gallery' OR (p_target->>'kind'='album' AND d.album_key=p_target->>'albumKey') OR (p_target->>'kind'='photo' AND d.photo_id=p_target->>'id')) AND ((p_primary_measure='photo_opens' AND d.event_type='view' AND d.photo_id<>'') OR (p_primary_measure='album_opens' AND d.event_type='album_open' AND d.photo_id='') OR (p_primary_measure='downloads' AND d.event_type='download') OR (p_primary_measure='favorites' AND d.event_type='favorite') OR (p_primary_measure='shares' AND d.event_type='share')); END IF;
  ELSE
    SELECT (summary_cutoff_at AT TIME ZONE 'UTC')::date-1 INTO site_complete_through FROM public.analytics_site_action_summary_status WHERE report_name='site_actions';
    before_coverage := CASE WHEN site_complete_through IS NULL OR before_end>site_complete_through THEN 'partial' ELSE 'complete' END;
    after_coverage := CASE WHEN site_complete_through IS NULL OR after_end>site_complete_through THEN 'partial' ELSE 'complete' END;
    IF before_coverage='complete' THEN SELECT coalesce(sum(page_views),0) INTO before_count FROM public.analytics_site_action_daily d WHERE d.bucket_date BETWEEN before_start AND before_end AND (p_target->>'kind'='site' OR d.path=p_target->>'id'); END IF;
    IF after_coverage='complete' THEN SELECT coalesce(sum(page_views),0) INTO after_count FROM public.analytics_site_action_daily d WHERE d.bucket_date BETWEEN after_start AND after_end AND (p_target->>'kind'='site' OR d.path=p_target->>'id'); END IF;
  END IF;
  RETURN jsonb_build_object('before',CASE WHEN before_coverage='complete' THEN before_count END,'after',CASE WHEN after_coverage='complete' THEN after_count END,'coverage',coalesce(after_coverage,'unavailable'),'previousCoverage',coalesce(before_coverage,'unavailable'),'measure',p_primary_measure,'availableAt',after_complete_at,'window',jsonb_build_object('before',jsonb_build_object('start',before_start,'end',before_end),'after',jsonb_build_object('start',after_start,'end',after_end),'timezone',tz));
END $$;

CREATE OR REPLACE FUNCTION public.analytics_record_intelligence_lifecycle(p_report_id uuid, p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_scope text; v_coverage text; v_finding jsonb;
BEGIN
  SELECT scope_key,coverage INTO v_scope,v_coverage FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id;
  IF v_scope IS NULL OR p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence lifecycle report'; END IF;
  -- A partial or unavailable health report is never evidence that an incident recovered.
  IF v_coverage <> 'complete' THEN RETURN; END IF;
  FOR v_finding IN SELECT value FROM jsonb_array_elements((SELECT findings FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id)) LOOP
    INSERT INTO public.analytics_intelligence_incidents(scope_key,finding_id,opened_snapshot_id,last_snapshot_id,status,updated_at)
    VALUES(v_scope,v_finding->>'id',p_report_id,p_report_id,'open',p_now)
    ON CONFLICT(scope_key,finding_id) DO UPDATE SET last_snapshot_id=excluded.last_snapshot_id,status=CASE WHEN public.analytics_intelligence_incidents.status='acknowledged' AND public.analytics_intelligence_incidents.acknowledged_until>p_now THEN 'acknowledged' ELSE 'open' END,updated_at=p_now;
  END LOOP;
  UPDATE public.analytics_intelligence_incidents i SET status='recovered',recovered_at=p_now,last_snapshot_id=p_report_id,updated_at=p_now
  WHERE i.scope_key=v_scope AND i.status IN ('open','acknowledged')
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((SELECT findings FROM public.analytics_intelligence_snapshots WHERE snapshot_id=p_report_id)) f WHERE f->>'id'=i.finding_id);
END $$;

CREATE OR REPLACE FUNCTION public.analytics_claim_intelligence_deliveries(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(id uuid,channel text,sender text,destination_verified boolean,preference_enabled boolean,idempotency_key text,payload jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'invalid intelligence delivery claim'; END IF;
  -- An expired lease might have reached a provider. Preserve ambiguity for a
  -- deliberate reconciliation; never silently send it again.
  UPDATE public.analytics_intelligence_deliveries SET status='ambiguous',leased_until=NULL,error_code='lease_expired',updated_at=clock_timestamp()
  WHERE status='leased' AND leased_until<clock_timestamp();
  RETURN QUERY WITH candidates AS (
    SELECT d.id FROM public.analytics_intelligence_deliveries d WHERE d.status='pending' AND d.available_at<=clock_timestamp() ORDER BY d.available_at,d.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), claimed AS (
    UPDATE public.analytics_intelligence_deliveries d SET status='leased',leased_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempts=d.attempts+1,updated_at=clock_timestamp() FROM candidates c WHERE d.id=c.id RETURNING d.*
  ) SELECT c.id,c.channel,c.sender,c.destination_verified,c.preference_enabled,c.idempotency_key,c.payload FROM claimed c;
END $$;

CREATE FUNCTION public.analytics_cleanup_intelligence_private(p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_now IS NULL THEN RAISE EXCEPTION 'invalid intelligence cleanup time'; END IF;
  -- Only owner-selected day retention is pruned here. Until-deleted records are
  -- intentionally untouched, and aggregate snapshots have their own bounded job policy.
  DELETE FROM public.analytics_intelligence_actions a
  USING public.analytics_intelligence_preferences p
  WHERE p.owner_id=a.owner_id AND p.retention_policy='days' AND a.created_at<p_now-make_interval(days=>p.retention_days)
    AND NOT EXISTS(SELECT 1 FROM public.analytics_intelligence_actions child WHERE child.reverses_action_id=a.id);
  DELETE FROM public.analytics_intelligence_briefs b
  USING public.analytics_intelligence_preferences p
  WHERE p.owner_id=b.owner_id AND p.retention_policy='days' AND b.created_at<p_now-make_interval(days=>p.retention_days);
END $$;

REVOKE ALL ON FUNCTION public.analytics_claim_intelligence_jobs(integer,integer,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_finish_intelligence_job(uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_prepare_intelligence_periods(date,date,jsonb,integer,integer,integer,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_record_intelligence_action(uuid,text,text,text,jsonb,timestamptz,text,text,timestamptz,text,uuid,text,text,text,text,text,text,integer,integer,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_intelligence_scope_key(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_set_intelligence_preferences(uuid,text,integer,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analytics_record_intelligence_lifecycle(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_claim_intelligence_deliveries(integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_finish_intelligence_delivery(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_list_ambiguous_intelligence_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_reconcile_intelligence_delivery(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_intelligence_action_follow_up(jsonb,text,timestamptz,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_cleanup_intelligence_private(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_claim_intelligence_jobs(integer,integer,timestamptz), public.analytics_finish_intelligence_job(uuid,text,uuid,text), public.analytics_prepare_intelligence_periods(date,date,jsonb,integer,integer,integer,timestamptz), public.analytics_record_intelligence_lifecycle(uuid,timestamptz), public.analytics_record_intelligence_action(uuid,text,text,text,jsonb,timestamptz,text,text,timestamptz,text,uuid,text,text,text,text,text,text,integer,integer,jsonb), public.analytics_intelligence_action_follow_up(jsonb,text,timestamptz,integer), public.analytics_cleanup_intelligence_private(timestamptz), public.analytics_claim_intelligence_deliveries(integer,integer), public.analytics_finish_intelligence_delivery(uuid,text,text,text), public.analytics_list_ambiguous_intelligence_deliveries(integer), public.analytics_reconcile_intelligence_delivery(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.analytics_set_intelligence_preferences(uuid,text,integer,boolean,boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_set_intelligence_preferences(uuid,text,integer,boolean,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
