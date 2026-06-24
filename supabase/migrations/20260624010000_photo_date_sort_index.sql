-- Migration: index the sport_type + photo_date DESC sort
--
-- The featured/AI-grid query (sport_type=$1 AND <quality ranges> ORDER BY photo_date DESC)
-- was the worst per-call query in pg_stat_statements: mean ~1471ms over thousands of calls.
-- Every existing sort index keys on upload_date; NONE keys on photo_date, so the planner
-- filtered to sport_type='volleyball' (~15k rows) and full-sorted them by photo_date on
-- every call. This partial index lets the planner walk sport_type then read photo_date in
-- order, turning the sort into an index scan + LIMIT.
--
-- Partial WHERE sharpness IS NOT NULL mirrors the always-applied unprocessed-photo filter
-- and keeps the index lean. 21k-row table → plain CREATE INDEX locks for milliseconds, so
-- this stays in-txn (no CONCURRENTLY) and re-runnable.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_photo_metadata_sport_photo_date
  ON public.photo_metadata (sport_type, photo_date DESC)
  WHERE sharpness IS NOT NULL;

COMMIT;
