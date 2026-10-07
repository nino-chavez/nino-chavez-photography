-- Launch recaps replace the daily and weekly briefs (decided 2026-10-06; docs/ANALYTICS_PLAN.md, workstream E).
-- A recap is a row in analytics_intelligence_briefs. This adds the one kind it needs, and the identity that makes it
-- one recap per owner, launch and checkpoint: the key `launch:<albumKey>:day<N>` goes in the existing incident_key
-- column, which has no foreign key and already carries a dedupe key for the operational kind.
--
-- It changes nothing else: the daily and weekly kinds stay in the constraint because the functions that wrote them
-- are still installed (the scheduler stopped asking for them), and no row, grant, policy or function is touched.
-- Apply this before deploying the application code that writes the kind. Until it is applied the application stores
-- no recap, logs it, and keeps refreshing everything else.
BEGIN;

ALTER TABLE public.analytics_intelligence_briefs DROP CONSTRAINT analytics_intelligence_briefs_kind_check;
ALTER TABLE public.analytics_intelligence_briefs ADD CONSTRAINT analytics_intelligence_briefs_kind_check
  CHECK (kind IN ('daily','weekly','operational','launch_recap'));

-- A recap without its key could be stored twice, so the key is required for the kind and unique per owner.
ALTER TABLE public.analytics_intelligence_briefs ADD CONSTRAINT analytics_intelligence_briefs_launch_recap_key_check
  CHECK (kind <> 'launch_recap' OR incident_key IS NOT NULL);
CREATE UNIQUE INDEX analytics_intelligence_briefs_owner_launch_recap_uniq
  ON public.analytics_intelligence_briefs(owner_id, incident_key) WHERE kind = 'launch_recap';

COMMENT ON COLUMN public.analytics_intelligence_briefs.incident_key IS
  'Dedupe key. operational: the opening snapshot and state. launch_recap: launch:<albumKey>:day<3|7>, one recap per owner, launch and checkpoint.';

NOTIFY pgrst, 'reload schema';
COMMIT;
