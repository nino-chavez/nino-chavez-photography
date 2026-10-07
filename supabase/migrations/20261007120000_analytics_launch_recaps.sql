-- Launch recaps (decided 2026-10-06; docs/ANALYTICS_PLAN.md, workstream E). Replaces the daily and weekly briefs.
--
-- SHAPE, AND WHY. A recap is a public, launch-scoped record: one per album and checkpoint (day 3, day 7), written for
-- the launch itself. Anyone who can open the album report reads it, so it must not depend on an owner existing and must
-- not be deleted when an owner's private-record retention runs. It therefore gets its own table, with no owner column
-- and no link to any private table, rather than a row in analytics_intelligence_briefs. A brief belongs to an owner;
-- analytics_cleanup_intelligence_private deletes an owner's briefs after their retention days and
-- analytics_delete_intelligence_private_history deletes them all, so a recap kept there would vanish from public album
-- reports the day an owner chose 90 days. Neither function touches the new table (the rehearsal asserts it).
--
-- EMAIL STAYS OWNER-GATED, AND REUSES THE EXISTING PATH UNCHANGED. A delivery row points at a brief, and
-- analytics_claim_intelligence_deliveries re-reads the brief's owner preferences at claim time and suppresses a queued
-- email whose owner has opted out, changed destination or lost verification. To keep that proven check as it is, an
-- email for a recap is queued as a private per-owner brief of the new kind launch_recap (the message that was queued),
-- keyed launch:<albumKey>:day<N> under a unique index so one owner can never be queued the same recap twice. That row is a
-- send record, so private retention and delete-history are right for it. It is written only for an owner with a verified
-- destination, and never for a backfilled recap.
--
-- The daily and weekly kinds stay in the brief CHECK: rows of those kinds may exist, and the functions that wrote them
-- are still installed (see docs/audits/20261006-analytics-site-rethink/README.md for exactly what still calls them).
--
-- Apply this before deploying the application code that writes recaps. Until it is applied the scheduler stores no
-- recap, logs the failure, and keeps refreshing everything else.
BEGIN;

CREATE TABLE public.analytics_launch_recaps (
  album_key text NOT NULL CHECK (album_key ~ '^[A-Za-z0-9_-]{1,64}$'),
  checkpoint smallint NOT NULL CHECK (checkpoint IN (3, 7)),
  -- The Chicago morning it was due, and the 08:00 instant. Its figures are read as of that instant.
  due_date date NOT NULL,
  due_at timestamptz NOT NULL,
  -- Written more than 15 minutes after due_at by the scheduler.
  late boolean NOT NULL DEFAULT false,
  -- scheduled: written by the scheduler after it came due. backfill: written afterwards, once, for a launch that
  -- predates recaps, from the records for those days. A backfilled recap says so in its own text.
  source text NOT NULL DEFAULT 'scheduled' CHECK (source IN ('scheduled', 'backfill')),
  evidence text NOT NULL CHECK (evidence IN ('complete', 'partial', 'unavailable')),
  missing jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing) = 'array'),
  -- The Chicago days its figures cover; both null for a recap that states none.
  covers_start date,
  covers_end date,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 300),
  body text NOT NULL CHECK (octet_length(body) BETWEEN 1 AND 12000),
  finding_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(finding_ids) = 'array'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (album_key, checkpoint),
  CHECK ((covers_start IS NULL) = (covers_end IS NULL)),
  CHECK (covers_start IS NULL OR covers_start <= covers_end)
);
ALTER TABLE public.analytics_launch_recaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_launch_recaps FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.analytics_launch_recaps TO service_role;
COMMENT ON TABLE public.analytics_launch_recaps IS
  'One public recap per album and checkpoint. No owner, no private data, outside private retention and delete-history. Read through the server, which rechecks album visibility.';

-- The email envelope: a private per-owner brief of the new kind, unique per owner and recap.
ALTER TABLE public.analytics_intelligence_briefs DROP CONSTRAINT analytics_intelligence_briefs_kind_check;
ALTER TABLE public.analytics_intelligence_briefs ADD CONSTRAINT analytics_intelligence_briefs_kind_check
  CHECK (kind IN ('daily','weekly','operational','launch_recap'));
ALTER TABLE public.analytics_intelligence_briefs ADD CONSTRAINT analytics_intelligence_briefs_launch_recap_key_check
  CHECK (kind <> 'launch_recap' OR incident_key IS NOT NULL);
CREATE UNIQUE INDEX analytics_intelligence_briefs_owner_launch_recap_uniq
  ON public.analytics_intelligence_briefs(owner_id, incident_key) WHERE kind = 'launch_recap';
COMMENT ON COLUMN public.analytics_intelligence_briefs.incident_key IS
  'Dedupe key. operational: the opening snapshot and state. launch_recap: launch:<albumKey>:day<3|7>, the email queued to one owner for one recap.';

NOTIFY pgrst, 'reload schema';
COMMIT;
