-- Add a separate, purpose-built alt-text column — distinct from `caption`.
-- =========================================================================
-- `caption` is search retrieval metadata and MUST name every legible jersey number (ADR 0006,
-- prompt v2). Screen readers and `<img alt>` need the opposite: a sentence that never contains a
-- jersey number, a name, printed text from the frame, guessed identity, or aesthetic filler.
-- Downstream consumers that needed accessible alt text were instead stripping numbers back OUT of
-- the caption with regex — imperfectly (a broken sentence, or a missed number that shipped to a
-- published Instagram alt text). `alt_text` is written by the same single ingest extraction pass
-- (src/lib/ai/ingest-extraction.ts `extractOne`) as a second, independently-contracted field
-- (src/lib/ai/alt-text-contract.ts) — never derived from `caption` by post-processing.
--
-- ADDITIVE ONLY (ADR 0004: additive migrations are safe pre-merge on their own). This PR's app
-- code DOES select this column (PHOTO_COLUMNS, transformPhotoRow, the photo/[id] loader, and the
-- public /api/album-photos page-mode response), so per PR #145's lesson this migration is a MERGE
-- PREREQUISITE for this change, not a bare additive column landing ahead of its readers — apply it
-- to production BEFORE merging the PR that adds `alt_text` to PHOTO_COLUMNS, or every one of those
-- reads 400s with "column photo_metadata.alt_text does not exist".
--
-- `alt_text` is nullable and starts NULL for every existing row (~21,743 photos as of 2026-09-26)
-- until scripts/backfill-alt-text.ts runs; new ingests write it immediately. Every site read of
-- this column falls back to today's behavior (the caption, or the album name) when it is NULL —
-- see photoAltText ($lib/seo/photo-title.ts), PhotoCard.svelte, and PhotoDetailModal.svelte — so a
-- row without a backfilled alt_text renders exactly as it did before this column existed.

ALTER TABLE public.photo_metadata
  ADD COLUMN IF NOT EXISTS alt_text text;

COMMENT ON COLUMN public.photo_metadata.alt_text IS
  'Screen-reader / <img alt> sentence — who is doing what (team by uniform color, action, '
  'setting). Never contains a jersey number, a name, printed text from the frame, guessed '
  'identity, or aesthetic filler (src/lib/ai/alt-text-contract.ts). Distinct from `caption`, '
  'which MUST name jersey numbers for search (ADR 0006) — do not derive one from the other by '
  'post-processing. NULL until ingested under this extraction version or backfilled '
  '(scripts/backfill-alt-text.ts).';
