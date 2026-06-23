-- Add consent tracking to user_tags table.
--
-- Context: The app now requires explicit consent from taggers affirming they have
-- permission from the athlete (or parent/guardian if under 18) before accepting a tag.
-- This column persists that consent signal.
--
-- Change is additive: new tags require consent_obtained=true; old tags default to false
-- for audit purposes (they were tagged before this requirement existed).
--
-- The API (src/routes/api/tags/+server.ts) rejects POST requests where consent_obtained
-- is not explicitly true (400 Bad Request).

ALTER TABLE public.user_tags
ADD COLUMN consent_obtained boolean NOT NULL DEFAULT false;
