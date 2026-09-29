-- Photography analytics north star: durable, private reporting.
--
-- Release authorized September 28, 2026 after synthetic rehearsal and live
-- schema inspection. The raw-event privacy promise remains 90 days. A failed
-- preservation attempt is recorded, then raw evidence still expires on time.

-- albums.event_type was deliberately removed in June. Keep this dimension
-- unknown until authoritative catalogue data exists; do not revive the column.
BEGIN;

ALTER TABLE public.engagement_events
  ADD COLUMN IF NOT EXISTS traffic_context text NOT NULL DEFAULT 'audience'
    CHECK (traffic_context IN ('audience', 'operator', 'test')),
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'unknown'
    CHECK (source_kind IN ('tagged_arrival', 'internal_open_location', 'action', 'unknown')),
  ADD COLUMN IF NOT EXISTS catalogue_snapshot jsonb;

ALTER TABLE public.search_queries
  ADD COLUMN IF NOT EXISTS traffic_context text NOT NULL DEFAULT 'audience'
    CHECK (traffic_context IN ('audience', 'operator', 'test'));

-- event_day is the existing UTC deduplication contract. Reporting buckets use
-- America/Chicago independently. Historical rows are not deleted or silently
-- reinterpreted merely to make those two concepts share a boundary.
DROP INDEX IF EXISTS public.engagement_events_dedup_idx;
CREATE UNIQUE INDEX engagement_events_dedup_idx
  ON public.engagement_events (session_hash, photo_id, event_type, event_day, traffic_context)
  WHERE photo_id IS NOT NULL;
DROP INDEX IF EXISTS public.engagement_events_album_dedup_idx;
CREATE UNIQUE INDEX engagement_events_album_dedup_idx
  ON public.engagement_events (session_hash, coalesce(album_key, ''), event_type, event_day, traffic_context)
  WHERE photo_id IS NULL;
COMMENT ON INDEX public.engagement_events_dedup_idx IS
  'Historical UTC-day deduplication contract. Reporting uses America/Chicago calendar buckets.';
COMMENT ON INDEX public.engagement_events_album_dedup_idx IS
  'Historical UTC-day deduplication contract for album/site events. Reporting uses America/Chicago calendar buckets.';

CREATE TABLE IF NOT EXISTS public.engagement_event_classifications (
  engagement_event_id bigint PRIMARY KEY REFERENCES public.engagement_events(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (classification IN (
    'audience', 'operator', 'test', 'known_crawler', 'suspected_automation', 'unclassified'
  )),
  reason_flags text[] NOT NULL DEFAULT '{}',
  classification_version integer NOT NULL DEFAULT 1 CHECK (classification_version = 1),
  classified_at timestamptz NOT NULL DEFAULT now(),
  classified_by text NOT NULL DEFAULT 'collector'
);
ALTER TABLE public.engagement_event_classifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.engagement_classification_corrections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engagement_event_id bigint NOT NULL REFERENCES public.engagement_events(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (classification IN (
    'audience', 'operator', 'test', 'known_crawler', 'suspected_automation', 'unclassified'
  )),
  reason_flags text[] NOT NULL DEFAULT '{}',
  classification_version integer NOT NULL CHECK (classification_version > 1),
  note text NOT NULL CHECK (char_length(trim(note)) BETWEEN 1 AND 1000),
  corrected_at timestamptz NOT NULL DEFAULT now(),
  corrected_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS engagement_classification_corrections_version_idx
  ON public.engagement_classification_corrections (engagement_event_id, classification_version);
CREATE INDEX IF NOT EXISTS engagement_classification_corrections_event_idx
  ON public.engagement_classification_corrections
  (engagement_event_id, classification_version DESC, corrected_at DESC, id DESC);
ALTER TABLE public.engagement_classification_corrections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_daily_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket_date date NOT NULL,
  album_key text NOT NULL DEFAULT '',
  photo_id text NOT NULL DEFAULT '',
  event_type text NOT NULL CHECK (event_type IN ('view', 'favorite', 'download', 'share', 'album_open')),
  source text NOT NULL DEFAULT 'direct',
  source_kind text NOT NULL DEFAULT 'unknown'
    CHECK (source_kind IN ('tagged_arrival', 'internal_open_location', 'action', 'unknown')),
  sport text NOT NULL DEFAULT 'unknown',
  event_date date,
  album_event_type text NOT NULL DEFAULT 'unknown',
  publication_at timestamptz,
  photo_category text NOT NULL DEFAULT 'unknown',
  traffic_classification text NOT NULL CHECK (traffic_classification IN (
    'audience', 'operator', 'test', 'known_crawler', 'suspected_automation', 'unclassified'
  )),
  classification_version integer NOT NULL DEFAULT 1,
  catalogue_basis text NOT NULL CHECK (catalogue_basis IN (
    'event_snapshot', 'backfill_current_catalogue', 'mixed'
  )),
  definition_version integer NOT NULL DEFAULT 1,
  coverage_state text NOT NULL CHECK (coverage_state IN ('complete', 'partial', 'unavailable')),
  action_count bigint NOT NULL CHECK (action_count >= 0),
  latest_event_at timestamptz,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_daily_actions_bucket_unique
  ON public.analytics_daily_actions (
    bucket_date, album_key, photo_id, event_type, source, source_kind, sport,
    coalesce(event_date, '-infinity'::date), album_event_type,
    coalesce(publication_at, '-infinity'::timestamptz), photo_category,
    traffic_classification, classification_version, catalogue_basis, definition_version
  );
CREATE INDEX IF NOT EXISTS analytics_daily_actions_report_idx
  ON public.analytics_daily_actions
  (bucket_date, album_key, event_type, traffic_classification, id);
ALTER TABLE public.analytics_daily_actions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_daily_coverage (
  bucket_date date PRIMARY KEY,
  raw_window_start timestamptz NOT NULL,
  raw_window_end timestamptz NOT NULL,
  cutoff_at timestamptz NOT NULL,
  coverage_state text NOT NULL CHECK (coverage_state IN ('complete', 'partial', 'unavailable')),
  catalogue_basis text NOT NULL CHECK (catalogue_basis IN (
    'event_snapshot', 'backfill_current_catalogue', 'mixed'
  )),
  definition_version integer NOT NULL DEFAULT 1,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  frozen_at timestamptz,
  preserved_row_count bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.analytics_daily_coverage ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_reconciliation_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  from_day date NOT NULL,
  through_day date NOT NULL,
  cutoff_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  error_message text
);
ALTER TABLE public.analytics_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_collection_diagnostics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  diagnostic_type text NOT NULL CHECK (diagnostic_type IN ('search', 'download')),
  status text NOT NULL CHECK (status IN ('requested', 'accepted', 'failed', 'completed')),
  album_key text,
  photo_id text,
  source text NOT NULL DEFAULT 'direct',
  traffic_context text NOT NULL CHECK (traffic_context IN ('audience', 'operator', 'test')),
  result_count integer CHECK (result_count >= 0),
  error_code text CHECK (char_length(error_code) <= 120),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_collection_diagnostics_report_idx
  ON public.analytics_collection_diagnostics
  (occurred_at DESC, diagnostic_type, status, traffic_context);
ALTER TABLE public.analytics_collection_diagnostics ENABLE ROW LEVEL SECURITY;

-- Preserve the first observed diagnostic timestamp even when detailed rows expire.
-- This proves when evidence was first recorded, not uninterrupted delivery.
CREATE TABLE IF NOT EXISTS public.analytics_diagnostic_coverage (
  diagnostic_type text PRIMARY KEY CHECK (diagnostic_type IN ('search','download')),
  first_recorded_at timestamptz NOT NULL
);
ALTER TABLE public.analytics_diagnostic_coverage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_diagnostic_coverage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_diagnostic_coverage TO service_role;
CREATE OR REPLACE FUNCTION public.analytics_capture_diagnostic_start()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.analytics_diagnostic_coverage(diagnostic_type,first_recorded_at)
 VALUES(NEW.diagnostic_type,NEW.occurred_at)
 ON CONFLICT(diagnostic_type) DO NOTHING;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.analytics_capture_diagnostic_start() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS analytics_diagnostic_start ON public.analytics_collection_diagnostics;
CREATE TRIGGER analytics_diagnostic_start AFTER INSERT ON public.analytics_collection_diagnostics
 FOR EACH ROW EXECUTE FUNCTION public.analytics_capture_diagnostic_start();
INSERT INTO public.analytics_diagnostic_coverage(diagnostic_type,first_recorded_at)
 SELECT diagnostic_type,min(occurred_at) FROM public.analytics_collection_diagnostics GROUP BY diagnostic_type
 ON CONFLICT(diagnostic_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.analytics_saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  query jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_saved_reports_owner_idx
  ON public.analytics_saved_reports(owner_id, updated_at DESC);
ALTER TABLE public.analytics_saved_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_sharing_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_key text NOT NULL,
  activity_date date NOT NULL,
  channel text NOT NULL CHECK (char_length(trim(channel)) BETWEEN 1 AND 64),
  note text NOT NULL CHECK (char_length(trim(note)) BETWEEN 1 AND 2000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_sharing_annotations_album_date_idx
  ON public.analytics_sharing_annotations(album_key, activity_date DESC);
ALTER TABLE public.analytics_sharing_annotations ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS analytics_private;
REVOKE ALL ON SCHEMA analytics_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA analytics_private TO service_role;

-- New writes resolve a photo's authoritative album before any snapshot is
-- captured. The public route never forwards source_kind, so a null-photo view
-- can only be a tagged arrival written by a trusted server-side emitter.
CREATE OR REPLACE FUNCTION analytics_private.prepare_engagement_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  authoritative_album text;
  target_exists boolean;
  snapshot jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.photo_id, NEW.album_key, NEW.event_type, NEW.session_hash,
      NEW.source, NEW.created_at, NEW.event_day, NEW.traffic_context, NEW.source_kind
    ) IS DISTINCT FROM ROW(
      OLD.photo_id, OLD.album_key, OLD.event_type, OLD.session_hash,
      OLD.source, OLD.created_at, OLD.event_day, OLD.traffic_context, OLD.source_kind
    ) OR (
      OLD.catalogue_snapshot IS NOT NULL
      AND NEW.catalogue_snapshot IS DISTINCT FROM OLD.catalogue_snapshot
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'engagement event facts and attached catalogue snapshot are immutable';
    END IF;
    -- The migration's one allowed attachment is NULL -> first backfill snapshot.
    IF OLD.catalogue_snapshot IS NULL AND NEW.catalogue_snapshot IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.photo_id IS NOT NULL THEN
    SELECT pm.album_key INTO authoritative_album
    FROM public.photo_metadata pm
    WHERE pm.photo_id = NEW.photo_id;
    IF NOT FOUND OR authoritative_album IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'unknown photo target';
    END IF;
    IF NEW.album_key IS NOT NULL AND NEW.album_key <> authoritative_album THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'photo and album targets do not match';
    END IF;
    NEW.album_key := authoritative_album;
  ELSIF NEW.album_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.albums a WHERE a.album_key = NEW.album_key
    ) INTO target_exists;
    IF NOT target_exists THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'unknown album target';
    END IF;
  END IF;

  CASE NEW.event_type
    WHEN 'view' THEN
      IF NEW.photo_id IS NULL AND NEW.source_kind <> 'tagged_arrival' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'photo view requires a photo unless emitted as a tagged arrival';
      END IF;
      IF NEW.photo_id IS NOT NULL AND NEW.source_kind = 'unknown' THEN
        NEW.source_kind := 'internal_open_location';
      END IF;
    WHEN 'album_open' THEN
      IF NEW.photo_id IS NOT NULL OR NEW.album_key IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'album_open requires an album and no photo';
      END IF;
      IF NEW.source_kind = 'unknown' THEN NEW.source_kind := 'internal_open_location'; END IF;
    WHEN 'favorite', 'download', 'share' THEN
      IF NEW.photo_id IS NULL AND NEW.album_key IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'action requires a photo or album';
      END IF;
      IF NEW.source_kind = 'unknown' THEN NEW.source_kind := 'action'; END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unsupported engagement event type';
  END CASE;

  IF NEW.catalogue_snapshot IS NULL THEN
    SELECT jsonb_build_object(
      '_basis', 'event_snapshot',
      'album_key', NEW.album_key,
      'sport', a.sport::text,
      'event_date', a.event_date,
      'album_event_type', NULL::text,
      'publication_at', settings.published_at,
      'photo_category', pm.photo_category
    ) INTO snapshot
    FROM (SELECT 1) seed
    LEFT JOIN public.albums a ON a.album_key = NEW.album_key
    LEFT JOIN public.album_settings settings ON settings.album_key = NEW.album_key
    LEFT JOIN public.photo_metadata pm ON pm.photo_id = NEW.photo_id;
    NEW.catalogue_snapshot := snapshot;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION analytics_private.record_initial_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
BEGIN
  INSERT INTO public.engagement_event_classifications (
    engagement_event_id, classification, reason_flags, classified_by
  ) VALUES (
    NEW.id,
    CASE NEW.traffic_context
      WHEN 'operator' THEN 'operator'
      WHEN 'test' THEN 'test'
      ELSE 'audience'
    END,
    CASE WHEN NEW.traffic_context = 'audience' THEN ARRAY['collector_accepted']::text[]
      ELSE ARRAY['trusted_context']::text[] END,
    'collector'
  ) ON CONFLICT (engagement_event_id) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS analytics_capture_catalogue_snapshot ON public.engagement_events;
DROP TRIGGER IF EXISTS analytics_prepare_engagement_event ON public.engagement_events;
CREATE TRIGGER analytics_prepare_engagement_event
  BEFORE INSERT OR UPDATE OF photo_id, album_key, event_type, session_hash,
    source, created_at, event_day, traffic_context, source_kind, catalogue_snapshot
  ON public.engagement_events
  FOR EACH ROW EXECUTE FUNCTION analytics_private.prepare_engagement_event();
DROP TRIGGER IF EXISTS analytics_record_initial_classification ON public.engagement_events;
CREATE TRIGGER analytics_record_initial_classification
  AFTER INSERT ON public.engagement_events
  FOR EACH ROW EXECUTE FUNCTION analytics_private.record_initial_classification();

-- Existing raw facts remain unchanged. This attaches the first catalogue facts
-- once and labels their basis. A photo's authoritative album is used for the
-- attached grouping without rewriting the original album_key/action/hash/time.
UPDATE public.engagement_events e
SET catalogue_snapshot = (
  SELECT jsonb_build_object(
    '_basis', 'backfill_current_catalogue',
    'album_key', resolved.album_key,
    'sport', a.sport::text,
    'event_date', a.event_date,
    'album_event_type', NULL::text,
    'publication_at', settings.published_at,
    'photo_category', pm.photo_category
  )
  FROM (
    SELECT coalesce(
      (SELECT p.album_key FROM public.photo_metadata p WHERE p.photo_id = e.photo_id),
      e.album_key
    ) AS album_key
  ) resolved
  LEFT JOIN public.albums a ON a.album_key = resolved.album_key
  LEFT JOIN public.album_settings settings ON settings.album_key = resolved.album_key
  LEFT JOIN public.photo_metadata pm ON pm.photo_id = e.photo_id
)
WHERE e.catalogue_snapshot IS NULL;

-- Rows that predate this contract cannot be promoted to verified audience.
-- New rows receive an explicit base classification from the AFTER INSERT trigger.
INSERT INTO public.engagement_event_classifications (
  engagement_event_id, classification, reason_flags, classified_by
)
SELECT e.id,
  CASE e.traffic_context WHEN 'operator' THEN 'operator' WHEN 'test' THEN 'test' ELSE 'unclassified' END,
  CASE WHEN e.traffic_context = 'audience' THEN ARRAY['pre_contract_event']::text[]
    ELSE ARRAY['trusted_context']::text[] END,
  'migration_backfill'
FROM public.engagement_events e
ON CONFLICT (engagement_event_id) DO NOTHING;

-- The >500 UTC-day rule is a suspected-automation heuristic, not proof of a bot
-- or a human. Corrections take precedence over it in the effective relation.
CREATE OR REPLACE VIEW analytics_private.suspected_automation_sessions
WITH (security_invoker = true) AS
SELECT e.session_hash
FROM public.engagement_events e
WHERE e.event_type = 'view'
  AND e.photo_id IS NOT NULL
  AND e.session_hash IS NOT NULL
  AND e.traffic_context = 'audience'
GROUP BY e.session_hash, e.event_day
HAVING count(*) > 500;

CREATE OR REPLACE VIEW analytics_private.effective_engagement_events
WITH (security_invoker = true) AS
WITH latest_correction AS (
  SELECT DISTINCT ON (correction.engagement_event_id)
    correction.engagement_event_id,
    correction.classification,
    correction.classification_version,
    correction.reason_flags
  FROM public.engagement_classification_corrections correction
  ORDER BY correction.engagement_event_id,
    correction.classification_version DESC,
    correction.corrected_at DESC,
    correction.id DESC
)
SELECT
  e.*,
  coalesce(nullif(e.catalogue_snapshot->>'album_key', ''), e.album_key) AS resolved_album_key,
  coalesce(e.catalogue_snapshot->>'_basis', 'backfill_current_catalogue') AS catalogue_basis,
  coalesce(e.catalogue_snapshot->>'sport', 'unknown') AS snapshot_sport,
  (e.catalogue_snapshot->>'event_date')::date AS snapshot_event_date,
  coalesce(e.catalogue_snapshot->>'album_event_type', 'unknown') AS snapshot_album_event_type,
  (e.catalogue_snapshot->>'publication_at')::timestamptz AS snapshot_publication_at,
  coalesce(e.catalogue_snapshot->>'photo_category', 'unknown') AS snapshot_photo_category,
  CASE
    WHEN e.source_kind <> 'unknown' THEN e.source_kind
    WHEN e.event_type = 'view' AND e.photo_id IS NULL AND coalesce(e.source, 'direct') <> 'direct'
      THEN 'tagged_arrival'
    WHEN e.event_type IN ('view', 'album_open') THEN 'internal_open_location'
    WHEN e.event_type IN ('favorite', 'download', 'share') THEN 'action'
    ELSE 'unknown'
  END AS resolved_source_kind,
  CASE
    WHEN latest.classification IS NOT NULL THEN latest.classification
    WHEN e.traffic_context = 'operator' THEN 'operator'
    WHEN e.traffic_context = 'test' THEN 'test'
    WHEN suspected.session_hash IS NOT NULL THEN 'suspected_automation'
    WHEN base.classification IS NOT NULL THEN base.classification
    ELSE 'unclassified'
  END AS effective_classification,
  coalesce(latest.classification_version, base.classification_version, 1) AS effective_classification_version,
  coalesce(latest.reason_flags, base.reason_flags, ARRAY['unclassified']::text[]) AS effective_reason_flags
FROM public.engagement_events e
LEFT JOIN public.engagement_event_classifications base
  ON base.engagement_event_id = e.id
LEFT JOIN latest_correction latest
  ON latest.engagement_event_id = e.id
LEFT JOIN analytics_private.suspected_automation_sessions suspected
  ON suspected.session_hash = e.session_hash;

GRANT SELECT ON analytics_private.suspected_automation_sessions,
  analytics_private.effective_engagement_events TO service_role;

-- Aggregation reads every event that is physically present for the reporting
-- day. raw_window_* records what portion can truthfully be claimed complete;
-- that coverage boundary is deliberately not the aggregation lower bound.
CREATE OR REPLACE FUNCTION analytics_private.reconcile_daily_actions(
  target_day date,
  cutoff_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  day_start timestamptz := target_day::timestamp AT TIME ZONE 'America/Chicago';
  full_day_end timestamptz := (target_day + 1)::timestamp AT TIME ZONE 'America/Chicago';
  aggregate_end timestamptz := least(full_day_end, cutoff_at);
  retention_floor timestamptz := cutoff_at - interval '90 days';
  evidence_start timestamptz;
  evidence_end timestamptz;
  state text;
  day_basis text;
  has_backfill boolean;
  has_snapshot boolean;
  existing public.analytics_daily_coverage%ROWTYPE;
  preserved_count bigint;
BEGIN
  IF cutoff_at <= day_start THEN
    RAISE EXCEPTION 'cutoff must be after the reporting day starts';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('analytics-reconcile:' || target_day::text));

  SELECT * INTO existing
  FROM public.analytics_daily_coverage
  WHERE bucket_date = target_day
  FOR UPDATE;
  IF FOUND AND existing.frozen_at IS NOT NULL THEN RETURN; END IF;

  -- A retry or correction never uses an older cutoff than the generation it
  -- replaces, even when a test invokes the function with a time-travel value.
  aggregate_end := greatest(
    aggregate_end,
    least(coalesce(existing.cutoff_at, aggregate_end), full_day_end)
  );

  evidence_start := CASE
    WHEN existing.bucket_date IS NOT NULL THEN existing.raw_window_start
    ELSE greatest(day_start, least(retention_floor, full_day_end))
  END;
  evidence_end := greatest(
    coalesce(existing.raw_window_end, evidence_start),
    aggregate_end
  );
  evidence_end := least(evidence_end, full_day_end);
  state := CASE
    WHEN evidence_start = day_start AND evidence_end = full_day_end THEN 'complete'
    ELSE 'partial'
  END;

  DELETE FROM public.analytics_daily_actions
  WHERE bucket_date = target_day AND definition_version = 1;

  INSERT INTO public.analytics_daily_actions (
    bucket_date, album_key, photo_id, event_type, source, source_kind, sport,
    event_date, album_event_type, publication_at, photo_category,
    traffic_classification, classification_version, catalogue_basis,
    definition_version, coverage_state, action_count, latest_event_at
  )
  SELECT
    target_day,
    coalesce(e.resolved_album_key, ''),
    coalesce(e.photo_id, ''),
    e.event_type,
    coalesce(e.source, 'direct'),
    e.resolved_source_kind,
    e.snapshot_sport,
    e.snapshot_event_date,
    e.snapshot_album_event_type,
    e.snapshot_publication_at,
    e.snapshot_photo_category,
    e.effective_classification,
    e.effective_classification_version,
    e.catalogue_basis,
    1,
    state,
    count(*),
    max(e.created_at)
  FROM analytics_private.effective_engagement_events e
  WHERE e.created_at >= day_start AND e.created_at < aggregate_end
  GROUP BY e.resolved_album_key, e.photo_id, e.event_type, e.source,
    e.resolved_source_kind, e.snapshot_sport, e.snapshot_event_date,
    e.snapshot_album_event_type, e.snapshot_publication_at,
    e.snapshot_photo_category, e.effective_classification,
    e.effective_classification_version, e.catalogue_basis;

  GET DIAGNOSTICS preserved_count = ROW_COUNT;

  SELECT
    coalesce(bool_or(e.catalogue_basis = 'backfill_current_catalogue'), false),
    coalesce(bool_or(e.catalogue_basis = 'event_snapshot'), false)
  INTO has_backfill, has_snapshot
  FROM analytics_private.effective_engagement_events e
  WHERE e.created_at >= day_start AND e.created_at < aggregate_end;

  day_basis := CASE
    WHEN has_backfill AND has_snapshot THEN 'mixed'
    WHEN has_backfill THEN 'backfill_current_catalogue'
    ELSE 'event_snapshot'
  END;

  INSERT INTO public.analytics_daily_coverage (
    bucket_date, raw_window_start, raw_window_end, cutoff_at, coverage_state,
    catalogue_basis, definition_version, notes, preserved_row_count
  ) VALUES (
    target_day, evidence_start, evidence_end, cutoff_at, state, day_basis, 1,
    CASE WHEN state = 'partial'
      THEN 'Preserved every physically present event; missing hours remain unavailable, not zero.'
    END,
    preserved_count
  )
  ON CONFLICT (bucket_date) DO UPDATE SET
    raw_window_start = EXCLUDED.raw_window_start,
    raw_window_end = EXCLUDED.raw_window_end,
    cutoff_at = EXCLUDED.cutoff_at,
    coverage_state = EXCLUDED.coverage_state,
    catalogue_basis = EXCLUDED.catalogue_basis,
    reconciled_at = now(),
    notes = EXCLUDED.notes,
    preserved_row_count = EXCLUDED.preserved_row_count;
END;
$$;

CREATE OR REPLACE FUNCTION analytics_private.reconcile_due_days(
  cutoff_at timestamptz DEFAULT now()
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  first_day date := ((cutoff_at - interval '90 days') AT TIME ZONE 'America/Chicago')::date;
  last_day date := ((cutoff_at AT TIME ZONE 'America/Chicago')::date - 1);
  day_cursor date;
  run_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('analytics-reconcile-batch'));
  IF last_day < first_day THEN RETURN; END IF;

  INSERT INTO public.analytics_reconciliation_runs (
    from_day, through_day, cutoff_at, status
  ) VALUES (first_day, last_day, cutoff_at, 'running')
  RETURNING id INTO run_id;

  BEGIN
    day_cursor := first_day;
    WHILE day_cursor <= last_day LOOP
      PERFORM analytics_private.reconcile_daily_actions(day_cursor, cutoff_at);
      day_cursor := day_cursor + 1;
    END LOOP;
    UPDATE public.analytics_reconciliation_runs
    SET status = 'complete', completed_at = now()
    WHERE id = run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.analytics_reconciliation_runs
    SET status = 'failed', completed_at = now(), error_message = SQLERRM
    WHERE id = run_id;
    RAISE WARNING 'analytics reconciliation run % failed: %', run_id, SQLERRM;
    RETURN;
  END;
END;
$$;

-- Freeze each expiring Chicago day before deleting any of its raw rows. A
-- failed summary does not extend raw retention: existing durable evidence is
-- frozen as-is, or the day is frozen unavailable, and raw rows still expire.
CREATE OR REPLACE FUNCTION analytics_private.prune_engagement_events_at(
  run_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  prune_cutoff timestamptz := run_at - interval '90 days';
  expiring_day date;
  day_start timestamptz;
  day_end timestamptz;
  reconcile_error text;
  existing public.analytics_daily_coverage%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('analytics-reconcile-batch'));
  LOCK TABLE public.engagement_events IN SHARE ROW EXCLUSIVE MODE;

  FOR expiring_day IN
    SELECT DISTINCT (created_at AT TIME ZONE 'America/Chicago')::date
    FROM public.engagement_events
    WHERE created_at < prune_cutoff
    ORDER BY 1
  LOOP
    day_start := expiring_day::timestamp AT TIME ZONE 'America/Chicago';
    day_end := (expiring_day + 1)::timestamp AT TIME ZONE 'America/Chicago';
    reconcile_error := NULL;

    BEGIN
      PERFORM analytics_private.reconcile_daily_actions(expiring_day, run_at);
    EXCEPTION WHEN OTHERS THEN
      reconcile_error := SQLERRM;
      INSERT INTO public.analytics_reconciliation_runs (
        from_day, through_day, cutoff_at, status, completed_at, error_message
      ) VALUES (
        expiring_day, expiring_day, run_at, 'failed', run_at, reconcile_error
      );
    END;

    SELECT * INTO existing
    FROM public.analytics_daily_coverage
    WHERE bucket_date = expiring_day
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.analytics_daily_coverage (
        bucket_date, raw_window_start, raw_window_end, cutoff_at,
        coverage_state, catalogue_basis, definition_version, notes,
        frozen_at, preserved_row_count
      ) VALUES (
        expiring_day,
        greatest(day_start, least(prune_cutoff, day_end)),
        day_end,
        run_at,
        'unavailable',
        'event_snapshot',
        1,
        'Preservation failed before the 90-day privacy cutoff: ' ||
          coalesce(reconcile_error, 'no durable result was produced'),
        run_at,
        0
      );
    ELSE
      UPDATE public.analytics_daily_coverage
      SET frozen_at = coalesce(frozen_at, run_at),
        cutoff_at = run_at,
        reconciled_at = run_at,
        notes = CASE
          WHEN reconcile_error IS NULL THEN notes
          ELSE coalesce(notes || ' ', '') ||
            'Final preservation failed before raw expiry: ' || reconcile_error
        END
      WHERE bucket_date = expiring_day;
    END IF;
  END LOOP;

  DELETE FROM public.engagement_events WHERE created_at < prune_cutoff;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_engagement_events()
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
  SELECT analytics_private.prune_engagement_events_at(now());
$$;

-- Exact distinct fingerprints cover ANY accepted action in the selected scope
-- and period. p_measure remains for call compatibility but does not narrow the
-- population. The private operator contract includes unlisted albums; public
-- views apply current visibility separately. Exactness requires complete raw
-- evidence for every selected Chicago day.
CREATE OR REPLACE FUNCTION analytics_private.count_distinct_visitors(
  p_start date,
  p_end date,
  p_album_keys text[],
  p_sport text,
  p_category text,
  p_source text,
  p_event_date date,
  p_season text,
  p_album_event_type text,
  p_measure text,
  p_traffic text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  interval_start timestamptz := p_start::timestamp AT TIME ZONE 'America/Chicago';
  interval_end timestamptz := (p_end + 1)::timestamp AT TIME ZONE 'America/Chicago';
  answer bigint;
BEGIN
  IF p_start > p_end
    OR interval_start < now() - interval '90 days'
    OR interval_end > now()
  THEN RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM generate_series(p_start, p_end, interval '1 day') day
    LEFT JOIN public.analytics_daily_coverage coverage
      ON coverage.bucket_date = day::date
    WHERE coverage.bucket_date IS NULL
      OR coverage.raw_window_start > day::date::timestamp AT TIME ZONE 'America/Chicago'
      OR coverage.raw_window_end < (day::date + 1)::timestamp AT TIME ZONE 'America/Chicago'
      OR coverage.coverage_state <> 'complete'
      OR coverage.frozen_at IS NOT NULL
  ) THEN RETURN NULL;
  END IF;

  SELECT count(DISTINCT e.session_hash) INTO answer
  FROM analytics_private.effective_engagement_events e
  WHERE (e.created_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_start AND p_end
    AND e.session_hash IS NOT NULL
    AND (coalesce(cardinality(p_album_keys), 0) = 0 OR e.resolved_album_key = ANY(p_album_keys))
    AND (p_sport IS NULL OR e.snapshot_sport = p_sport)
    AND (p_category IS NULL OR e.snapshot_photo_category = p_category)
    AND (p_source IS NULL OR coalesce(e.source, 'direct') = p_source)
    AND (p_event_date IS NULL OR e.snapshot_event_date = p_event_date)
    AND (p_season IS NULL OR coalesce(extract(year FROM e.snapshot_event_date)::text,'unknown') = p_season)
    AND (p_album_event_type IS NULL OR e.snapshot_album_event_type = p_album_event_type)
    AND (p_traffic = 'inclusive' OR e.effective_classification IN ('audience', 'unclassified'));
  RETURN answer;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_count_distinct_visitors(
  p_start date,
  p_end date,
  p_album_keys text[],
  p_sport text,
  p_category text,
  p_source text,
  p_event_date date,
  p_season text,
  p_album_event_type text,
  p_measure text,
  p_traffic text
) RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, analytics_private AS $$
  SELECT analytics_private.count_distinct_visitors(
    p_start, p_end, p_album_keys, p_sport, p_category, p_source,
    p_event_date, p_season, p_album_event_type, p_measure, p_traffic
  );
$$;

-- One SQL statement means rows and coverage share one PostgreSQL snapshot. A
-- scalar jsonb return avoids PostgREST's 1,000-row response cap. The payload has
-- no fingerprints, raw queries, correction notes, or private annotations.
CREATE OR REPLACE FUNCTION public.analytics_read_report_evidence(
  p_start date,
  p_end date
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, analytics_private AS $$
  WITH clock AS (
    SELECT statement_timestamp() AS cutoff,
      (statement_timestamp() AT TIME ZONE 'America/Chicago')::date AS today
  ), live_rows AS (
    SELECT min(e.id) AS id, clock.today AS bucket_date,
      coalesce(e.resolved_album_key, '') AS album_key, coalesce(e.photo_id, '') AS photo_id,
      e.event_type, coalesce(e.source, 'direct') AS source, e.resolved_source_kind AS source_kind,
      e.snapshot_sport AS sport, e.snapshot_event_date AS event_date,
      e.snapshot_album_event_type AS album_event_type, e.snapshot_publication_at AS publication_at,
      e.snapshot_photo_category AS photo_category, e.effective_classification AS traffic_classification,
      e.effective_classification_version AS classification_version, e.catalogue_basis,
      1 AS definition_version, 'partial'::text AS coverage_state, count(*) AS action_count,
      max(e.created_at) AS latest_event_at, clock.cutoff AS reconciled_at
    FROM analytics_private.effective_engagement_events e CROSS JOIN clock
    WHERE clock.today BETWEEN p_start AND p_end
      AND e.created_at >= clock.today::timestamp AT TIME ZONE 'America/Chicago'
      AND e.created_at < clock.cutoff
    GROUP BY clock.today, clock.cutoff, e.resolved_album_key, e.photo_id, e.event_type,
      e.source, e.resolved_source_kind, e.snapshot_sport, e.snapshot_event_date,
      e.snapshot_album_event_type, e.snapshot_publication_at, e.snapshot_photo_category,
      e.effective_classification, e.effective_classification_version, e.catalogue_basis
  ), evidence_rows AS (
    SELECT to_jsonb(actions) AS payload FROM public.analytics_daily_actions actions CROSS JOIN clock
    WHERE actions.bucket_date BETWEEN p_start AND p_end AND actions.bucket_date <> clock.today
    UNION ALL SELECT to_jsonb(live_rows) FROM live_rows
  ), evidence_coverage AS (
    SELECT to_jsonb(coverage)-'notes' AS payload FROM public.analytics_daily_coverage coverage CROSS JOIN clock
    WHERE coverage.bucket_date BETWEEN p_start AND p_end AND coverage.bucket_date <> clock.today
    UNION ALL
    SELECT jsonb_build_object('bucket_date',clock.today,'cutoff_at',clock.cutoff,
      'raw_window_start',clock.today::timestamp AT TIME ZONE 'America/Chicago',
      'raw_window_end',clock.cutoff,'coverage_state','partial','definition_version',1,
      'reconciled_at',clock.cutoff,'frozen_at',NULL,
      'catalogue_basis',CASE WHEN (SELECT count(DISTINCT catalogue_basis) FROM live_rows)>1 THEN 'mixed'
        ELSE coalesce((SELECT min(catalogue_basis) FROM live_rows),'event_snapshot') END)
    FROM clock WHERE clock.today BETWEEN p_start AND p_end
  )
  SELECT jsonb_build_object(
    'rows',coalesce((SELECT jsonb_agg(payload ORDER BY payload->>'bucket_date',payload->>'id') FROM evidence_rows),'[]'::jsonb),
    'coverage',coalesce((SELECT jsonb_agg(payload ORDER BY payload->>'bucket_date') FROM evidence_coverage),'[]'::jsonb)
  ) WHERE p_start <= p_end;
$$;

-- Existing public/discovery views keep their canonical output columns, but all
-- now read the same latest-correction-first classification. Current unlisted
-- albums are excluded here and retained in the authorized private summaries.
CREATE OR REPLACE VIEW public.automated_sessions
WITH (security_invoker = true) AS
SELECT DISTINCT e.session_hash
FROM analytics_private.effective_engagement_events e
WHERE e.session_hash IS NOT NULL
  AND e.effective_classification = 'suspected_automation';
COMMENT ON VIEW public.automated_sessions IS
  'Sessions meeting the >500 UTC-day heuristic after latest correction precedence. This is suspected automation, not proof of a bot or a human.';

CREATE OR REPLACE VIEW public.album_engagement_30d
WITH (security_invoker = true) AS
SELECT e.resolved_album_key AS album_key,
  count(DISTINCT e.session_hash) AS engaged_visitors,
  count(*) FILTER (WHERE e.event_type = 'album_open') AS album_opens,
  count(*) FILTER (WHERE e.event_type = 'view' AND e.photo_id IS NOT NULL) AS photo_opens,
  count(*) FILTER (WHERE e.event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE e.event_type = 'download') AS downloads,
  count(*) FILTER (WHERE e.event_type = 'share') AS shares,
  max(e.created_at) AS last_event
FROM analytics_private.effective_engagement_events e
LEFT JOIN public.album_settings settings ON settings.album_key = e.resolved_album_key
WHERE e.created_at >= now() - interval '30 days'
  AND e.resolved_album_key IS NOT NULL
  AND e.effective_classification IN ('audience', 'unclassified')
  AND coalesce(settings.visibility, 'public') <> 'unlisted'
GROUP BY e.resolved_album_key;

CREATE OR REPLACE VIEW public.view_source_30d
WITH (security_invoker = true) AS
SELECT coalesce(e.source, 'direct') AS source, count(*) AS views
FROM analytics_private.effective_engagement_events e
LEFT JOIN public.album_settings settings ON settings.album_key = e.resolved_album_key
WHERE e.event_type = 'view'
  AND e.photo_id IS NOT NULL
  AND e.created_at >= now() - interval '30 days'
  AND e.effective_classification IN ('audience', 'unclassified')
  AND coalesce(settings.visibility, 'public') <> 'unlisted'
GROUP BY 1;

CREATE OR REPLACE VIEW public.engagement_totals_30d
WITH (security_invoker = true) AS
WITH scoped AS MATERIALIZED (
  SELECT e.event_type, e.photo_id, e.session_hash, e.effective_classification
  FROM analytics_private.effective_engagement_events e
  LEFT JOIN public.album_settings settings ON settings.album_key = e.resolved_album_key
  WHERE e.created_at >= now() - interval '30 days'
    AND coalesce(settings.visibility, 'public') <> 'unlisted'
)
SELECT
  count(*) FILTER (
    WHERE event_type = 'view' AND photo_id IS NOT NULL
      AND effective_classification IN ('audience', 'unclassified')
  ) AS photo_opens,
  count(DISTINCT session_hash) FILTER (
    WHERE effective_classification IN ('audience', 'unclassified')
  ) AS engaged_visitors,
  count(*) FILTER (
    WHERE event_type = 'album_open'
      AND effective_classification IN ('audience', 'unclassified')
  ) AS album_opens,
  count(*) FILTER (
    WHERE event_type = 'view' AND photo_id IS NOT NULL
      AND effective_classification = 'suspected_automation'
  ) AS automated_photo_opens
FROM scoped;

DROP MATERIALIZED VIEW IF EXISTS public.album_top_photo;
DROP MATERIALIZED VIEW IF EXISTS public.photo_popularity;
DROP MATERIALIZED VIEW IF EXISTS public.album_popularity;

CREATE MATERIALIZED VIEW public.photo_popularity AS
SELECT e.photo_id,
  sum(w.weight * exp(-extract(epoch FROM (now() - e.created_at)) / 604800.0)) AS trending_score,
  sum(w.weight) AS all_time_score,
  count(*) FILTER (WHERE e.event_type = 'view') AS views,
  count(*) FILTER (WHERE e.event_type = 'favorite') AS favorites,
  count(*) FILTER (WHERE e.event_type = 'download') AS downloads,
  count(*) FILTER (WHERE e.event_type = 'share') AS shares,
  max(e.created_at) AS last_event
FROM analytics_private.effective_engagement_events e
JOIN public.engagement_weights w ON w.event_type = e.event_type
LEFT JOIN public.album_settings settings ON settings.album_key = e.resolved_album_key
WHERE e.photo_id IS NOT NULL
  AND e.effective_classification IN ('audience', 'unclassified')
  AND coalesce(settings.visibility, 'public') <> 'unlisted'
GROUP BY e.photo_id
WITH NO DATA;
CREATE UNIQUE INDEX photo_popularity_pkey ON public.photo_popularity(photo_id);
REVOKE ALL ON public.photo_popularity FROM anon, authenticated;
COMMENT ON COLUMN public.photo_popularity.all_time_score IS
  'Weighted sum over retained events (<=90d), after effective classification and current visibility.';

CREATE MATERIALIZED VIEW public.album_popularity AS
WITH album_events AS (
  SELECT e.resolved_album_key AS album_key, e.photo_id, e.event_type,
    e.created_at, w.weight
  FROM analytics_private.effective_engagement_events e
  JOIN public.engagement_weights w ON w.event_type = e.event_type
  LEFT JOIN public.album_settings settings ON settings.album_key = e.resolved_album_key
  WHERE e.resolved_album_key IS NOT NULL
    AND e.effective_classification IN ('audience', 'unclassified')
    AND coalesce(settings.visibility, 'public') <> 'unlisted'
), sizes AS (
  SELECT album_key, count(*)::numeric AS total_photos
  FROM public.photo_metadata
  WHERE sharpness IS NOT NULL
  GROUP BY album_key
)
SELECT ae.album_key,
  sum(ae.weight * exp(-extract(epoch FROM (now() - ae.created_at)) / 604800.0)) AS trending_score,
  sum(ae.weight) AS all_time_score,
  sum(ae.weight) / nullif(s.total_photos, 0) AS score_per_photo,
  count(DISTINCT ae.photo_id) AS photos_engaged,
  s.total_photos,
  max(ae.created_at) AS last_event
FROM album_events ae
LEFT JOIN sizes s ON s.album_key = ae.album_key
GROUP BY ae.album_key, s.total_photos
WITH NO DATA;
CREATE UNIQUE INDEX album_popularity_pkey ON public.album_popularity(album_key);
REVOKE ALL ON public.album_popularity FROM anon, authenticated;
COMMENT ON COLUMN public.album_popularity.all_time_score IS
  'Weighted sum over retained events (<=90d), after effective classification and current visibility.';

CREATE MATERIALIZED VIEW public.album_top_photo AS
SELECT DISTINCT ON (pm.album_key)
  pm.album_key, pm.photo_id, pm.cf_image_id, popularity.trending_score
FROM public.photo_popularity popularity
JOIN public.photo_metadata pm ON pm.photo_id = popularity.photo_id
WHERE pm.album_key IS NOT NULL
  AND pm.cf_image_id IS NOT NULL
  AND pm.sharpness IS NOT NULL
ORDER BY pm.album_key, popularity.trending_score DESC NULLS LAST, pm.photo_id
WITH NO DATA;
CREATE UNIQUE INDEX album_top_photo_pkey ON public.album_top_photo(album_key);
REVOKE ALL ON public.album_top_photo FROM anon, authenticated;

REFRESH MATERIALIZED VIEW public.photo_popularity;
REFRESH MATERIALIZED VIEW public.album_popularity;
REFRESH MATERIALIZED VIEW public.album_top_photo;

CREATE OR REPLACE FUNCTION public.refresh_popularity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.photo_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.album_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.album_top_photo;
END;
$$;

-- Versions and the affected day are serialized. Corrections are append-only,
-- unavailable after a day freezes, and refresh every direct and discovery
-- consumer before the transaction commits.
CREATE OR REPLACE FUNCTION public.analytics_record_classification_correction(
  p_event_id bigint,
  p_classification text,
  p_note text,
  p_corrected_by uuid,
  p_reverse boolean DEFAULT false
) RETURNS TABLE (
  correction_id bigint,
  classification text,
  classification_version integer
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private AS $$
DECLARE
  event_row public.engagement_events%ROWTYPE;
  event_day_chicago date;
  current_version integer;
  target_classification text;
  inserted_id bigint;
BEGIN
  IF char_length(trim(p_note)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'an auditable reason is required';
  END IF;
  IF p_classification NOT IN (
    'audience', 'operator', 'test', 'known_crawler', 'suspected_automation', 'unclassified'
  ) THEN RAISE EXCEPTION 'unsupported classification';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('analytics-classification:' || p_event_id::text));
  SELECT * INTO event_row
  FROM public.engagement_events
  WHERE id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retained event is unavailable'; END IF;

  event_day_chicago := (event_row.created_at AT TIME ZONE 'America/Chicago')::date;
  IF EXISTS (
    SELECT 1 FROM public.analytics_daily_coverage
    WHERE bucket_date = event_day_chicago AND frozen_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'that day is frozen after raw expiry';
  END IF;

  SELECT greatest(
    coalesce((
      SELECT max(correction.classification_version)
      FROM public.engagement_classification_corrections correction
      WHERE correction.engagement_event_id = p_event_id
    ), 1),
    coalesce((
      SELECT base.classification_version
      FROM public.engagement_event_classifications base
      WHERE base.engagement_event_id = p_event_id
    ), 1)
  ) INTO current_version;

  IF p_reverse THEN
    SELECT prior.classification INTO target_classification
    FROM (
      SELECT correction.classification,
        row_number() OVER (
          ORDER BY correction.classification_version DESC,
            correction.corrected_at DESC, correction.id DESC
        ) AS position
      FROM public.engagement_classification_corrections correction
      WHERE correction.engagement_event_id = p_event_id
    ) prior
    WHERE prior.position = 2;

    IF target_classification IS NULL THEN
      SELECT effective.effective_classification INTO target_classification
      FROM analytics_private.effective_engagement_events effective
      WHERE effective.id = p_event_id;
      -- The current latest correction is what the view exposes. With no prior
      -- correction, reconstruct the base/heuristic state explicitly.
      IF EXISTS (
        SELECT 1 FROM public.engagement_classification_corrections
        WHERE engagement_event_id = p_event_id
      ) THEN
        SELECT CASE
          WHEN event_row.traffic_context = 'operator' THEN 'operator'
          WHEN event_row.traffic_context = 'test' THEN 'test'
          WHEN EXISTS (
            SELECT 1 FROM analytics_private.suspected_automation_sessions suspected
            WHERE suspected.session_hash = event_row.session_hash
          ) THEN 'suspected_automation'
          ELSE coalesce(base.classification, 'unclassified')
        END INTO target_classification
        FROM (SELECT 1) seed
        LEFT JOIN public.engagement_event_classifications base
          ON base.engagement_event_id = p_event_id;
      END IF;
    END IF;
  ELSE
    target_classification := p_classification;
  END IF;

  INSERT INTO public.engagement_classification_corrections (
    engagement_event_id, classification, classification_version,
    note, corrected_by, reason_flags
  ) VALUES (
    p_event_id, target_classification, current_version + 1,
    trim(p_note), p_corrected_by,
    CASE WHEN p_reverse THEN ARRAY['manual_reversal']::text[]
      ELSE ARRAY['manual_correction']::text[] END
  ) RETURNING id INTO inserted_id;

  PERFORM analytics_private.reconcile_daily_actions(event_day_chicago, now());
  REFRESH MATERIALIZED VIEW public.photo_popularity;
  REFRESH MATERIALIZED VIEW public.album_popularity;
  REFRESH MATERIALIZED VIEW public.album_top_photo;

  RETURN QUERY SELECT inserted_id, target_classification, current_version + 1;
END;
$$;

REVOKE ALL ON FUNCTION analytics_private.prepare_engagement_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics_private.record_initial_classification() FROM PUBLIC;
REVOKE ALL ON FUNCTION analytics_private.reconcile_daily_actions(date, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_private.reconcile_due_days(timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_private.prune_engagement_events_at(timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION analytics_private.count_distinct_visitors(
  date, date, text[], text, text, text, date, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_count_distinct_visitors(
  date, date, text[], text, text, text, date, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_read_report_evidence(date, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_record_classification_correction(
  bigint, text, text, uuid, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_engagement_events()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_popularity()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION analytics_private.reconcile_daily_actions(date, timestamptz),
  analytics_private.reconcile_due_days(timestamptz),
  analytics_private.prune_engagement_events_at(timestamptz),
  analytics_private.count_distinct_visitors(
    date, date, text[], text, text, text, date, text, text, text, text
  ) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_count_distinct_visitors(
  date, date, text[], text, text, text, date, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_read_report_evidence(date, date)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_record_classification_correction(
  bigint, text, text, uuid, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_engagement_events(),
  public.refresh_popularity() TO service_role;

-- Retry retained and empty days before the existing 03:17 UTC privacy prune.
SELECT cron.unschedule('analytics-reconcile-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-reconcile-daily');
SELECT cron.schedule(
  'analytics-reconcile-daily',
  '*/30 * * * *',
  $$SELECT analytics_private.reconcile_due_days(now());$$
);

COMMIT;
