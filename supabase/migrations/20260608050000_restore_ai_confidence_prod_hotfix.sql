-- HOTFIX: re-add ai_confidence — prod serves main, whose PHOTO_COLUMNS still SELECTs it.
-- H1 dropped it from a feature branch while prod code (main) still references it → prod reads 500.
-- Re-add nullable (data not restored; main maps row.ai_confidence ?? 0). The real drop happens
-- AFTER the branch merges to main (no consumer selects it then) — column drops are cutover work.
ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS ai_confidence numeric;
