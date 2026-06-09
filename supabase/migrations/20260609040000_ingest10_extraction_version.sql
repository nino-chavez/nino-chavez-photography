-- #10 ingest rebuild — slice 1: provenance/versioning. Additive, safe (no consumer yet; NULL for
-- existing rows). The unified ingest runner will stamp each row with its extraction version
-- (model + prompt id) so future model/prompt changes re-process only stale rows, not a blind full re-run.
ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS extraction_version text;
