-- The collector now stores `suspected_automation` as the event's own traffic context when a would-be
-- audience event comes from a hosting/cloud/crawler network (src/lib/analytics/automation-networks.ts).
-- Every report path already treats a non-audience stored context as itself and keeps it out of the
-- conservative (audience + unclassified) view, exactly as it does for operator/test.
-- Review and apply through the normal Supabase workflow; this migration is not applied locally.
BEGIN;

-- Replace only the column-level value list. The export_eligible/identity check also names
-- traffic_context, so match on the shape of the definition rather than a guessed name.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.analytics_events_v2'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%traffic_context%'
      AND pg_get_constraintdef(oid) LIKE '%self_excluded%'
      AND pg_get_constraintdef(oid) NOT LIKE '%export_eligible%'
  LOOP
    EXECUTE format('ALTER TABLE public.analytics_events_v2 DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.analytics_events_v2
  ADD CONSTRAINT analytics_events_v2_traffic_context_check
  CHECK (traffic_context IN ('audience','operator','test','self_excluded','suspected_automation'));

COMMIT;
