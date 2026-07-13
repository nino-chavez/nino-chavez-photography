-- Bot-filtered-event counter — visibility into how much crawler traffic
-- the isbot gate in $lib/analytics/tracker.ts is suppressing, now that
-- AhrefsBot/SemrushBot no longer pollute engagement_events directly.
--
-- One row per UTC day holding a running total. No per-request detail (IP/UA)
-- is stored — this is a count, not a log; keeping visitor identity out of
-- Supabase entirely matches the no-PII stance already documented on
-- engagement_events.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_filtered_events (
  day   date PRIMARY KEY,
  count bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.bot_filtered_events ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies → only service_role (which bypasses RLS) can read/write.

CREATE OR REPLACE FUNCTION public.increment_bot_filtered_count()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.bot_filtered_events (day, count)
  VALUES ((now() AT TIME ZONE 'UTC')::date, 1)
  ON CONFLICT (day) DO UPDATE SET count = public.bot_filtered_events.count + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_bot_filtered_count() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_bot_filtered_count() TO service_role;

COMMIT;
