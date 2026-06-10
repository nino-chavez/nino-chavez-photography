-- DEAD-COLUMN CLEANUP — ⚠️ MERGE-GATED (destructive). Do NOT apply until this branch is merged to
-- `main` AND deployed. Reason: prod runs `main`, whose PHOTO_COLUMNS still SELECTs athlete_id/event_id
-- until the deploy lands; dropping a column `main` selects 500s every gallery read (the ai_confidence
-- incident, 2026-06-08). All columns below were removed from the deployed read path (PHOTO_COLUMNS /
-- Photo type / transformPhotoRow / routes) in this branch first, so by apply-time the drop is a no-op
-- for the code.
--
-- Evidence (2026-06-09 audit — population × code-usage, both required to call a column dead):
--   athlete_id        0 / 21,247 populated   — per-photo athlete link never built (identity lives in
--                                              photo_jersey_sightings → photo_players now)
--   event_id          0 / 21,247             — events feature never built
--   player_count      145 (0.7%)             — agentic-extras vestige, no consumer
--   action_type       13,203 but 0 real consumers — legacy duplicate of play_type (the taxonomy field)
--   "ArchivedUrl"     245 (1%)               — SmugMug archive URL, unused
--   albums.event_type 0 / 264                — never used
--
-- NOT dropped (audit reversed these): camera_make/camera_model/lens_model/focal_length/aperture/
-- shutter_speed/iso and latitude/longitude were "0 populated" only because the pipeline never fed
-- them — the ingest now captures them, so they are KEPT. time_in_game (99% populated, 11 refs) stays.

ALTER TABLE photo_metadata
  DROP COLUMN IF EXISTS athlete_id,
  DROP COLUMN IF EXISTS event_id,
  DROP COLUMN IF EXISTS player_count,
  DROP COLUMN IF EXISTS action_type,
  DROP COLUMN IF EXISTS "ArchivedUrl";

ALTER TABLE albums
  DROP COLUMN IF EXISTS event_type;

-- Data fix (not a drop; latitude/longitude columns are KEPT): the legacy rows carry the (0,0)
-- null-island placeholder a broken import wrote for "no GPS" (~19,992 rows). NULL it so the columns
-- mean "no fix" honestly. The ingest now writes REAL coordinates when a Location-Info-Link fix exists.
UPDATE photo_metadata SET latitude = NULL, longitude = NULL WHERE latitude = 0 AND longitude = 0;
