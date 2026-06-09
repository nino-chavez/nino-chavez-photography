-- Cutover drops — batch 1: ai_confidence.
-- Genuinely inert: no reader, no writer, no function/view/index/default dependency, and NOT in the
-- deployed code's PHOTO_COLUMNS (the rebuild removed it). Safe to drop with no redeploy. This closes
-- the H1 prod-incident loop — ai_confidence was restored earlier only because the OLD main code still
-- selected it; the live rebuild no longer does.
ALTER TABLE photo_metadata DROP COLUMN IF EXISTS ai_confidence;
