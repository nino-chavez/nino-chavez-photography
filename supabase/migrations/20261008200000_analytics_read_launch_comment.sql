-- The day-7 and day-3 ranks compare every launch whose window was complete at the read date, not only
-- launches published earlier: the r3/r7 windows in 20261006210000_analytics_read_launches.sql rank over
-- `totals WHERE t_po7 IS NOT NULL`, and launch-recap.ts says so ("launches published since can move a
-- rank"). The function's COMMENT described the median's comparison set instead. Comment only; no
-- behaviour changes. Found by the 2026-10-08 dashboard probe (docs/audits/20261008-launch-dashboard-probe).

COMMENT ON FUNCTION public.analytics_read_launch(text,timestamptz,integer,text,boolean,date,date,integer) IS
 'Launch read model: an album''s days since first publication, totals at day 3 and day 7, and its rank at each age among every launch whose window was complete at the read date (a launch published since can move a rank), per-photo counts, and version-2 exposure where recorded. The median sentence on the report compares earlier launches only. Service role only. Returns no identifiers.';
