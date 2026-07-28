-- Correction to the empirical justification recorded on automated_sessions.
--
-- 20260728090000 described the threshold as sitting in "the empty 5x gap between
-- the p95 human session-day (104) and the lowest crawler session (490)". That
-- mixed two different distributions: 104 and 490 are session-DAY values pooled
-- across all sessions, and 490 is not a distinct session at all — it is a quiet
-- day belonging to a session already excluded on a louder one.
--
-- Re-derived per session (peak single-day distinct-photo views, 67 sessions over
-- 30 days): 19,046 / 10,014 / 1,241 / 576, then a drop to 270, 83, 78, 56, 55.
-- Four sessions clear 500; the busiest retained session peaks at 270. The gap the
-- threshold sits in is 2.1x, not 5x — still unambiguous (nothing lands between
-- 270 and 576), but the number in the record should be the one the data supports.
--
-- The threshold itself is unchanged and still correct: any value in 271-576
-- selects the same four sessions. Comment-only; no behavior changes.

BEGIN;

COMMENT ON VIEW public.automated_sessions IS
  'Session hashes that viewed >500 distinct photos in a single day — crawlers the UA gate misses. Excluded from every engagement aggregate. Empirical basis (30d, 67 sessions): peak session-days run 19,046 / 10,014 / 1,241 / 576, then drop to 270 for the busiest retained session; any threshold in 271-576 selects the same four sessions.';

COMMIT;
