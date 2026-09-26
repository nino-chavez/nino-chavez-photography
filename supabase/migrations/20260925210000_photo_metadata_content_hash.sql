-- Implement the content_hash contract that was documented but never built.
-- =========================================================================
-- blueprint/decisions/0002-know-vs-infer-domain-model.md and blueprint/prescription.yml (P1)
-- both state: `cf_image_id = '<album_key>-<image_key>'` (hyphen) + `UNIQUE(content_hash)`.
-- The cf_image_id half shipped; UNIQUE(content_hash) never did — `content_hash` did not exist
-- as a column anywhere in this schema (verified: `select * from photo_metadata limit 1` before
-- this migration has no such key). This migration is the schema half of that contract.
--
-- Purpose: catch the "same shoot exported to a second folder" duplicate class — two files with
-- identical bytes ingested under two different photo_ids (different album, or the same album
-- re-uploaded from a different export). content_hash is a sha256 of the raw file bytes, computed
-- by scripts/ingest-album.ts before it uploads to Cloudflare Images or spends a vision-model call.
--
-- ADDITIVE ONLY: one nullable column + one partial unique index. Nothing existing selects it, and
-- NULL rows (every row ingested before this migration, until reprocessed) are explicitly exempted
-- from the uniqueness check — a partial index `WHERE content_hash IS NOT NULL` is the standard
-- Postgres shape for "unique among the values that are actually known," matching how this
-- project's other nullable-until-enriched columns are handled (see ADR 0002's KNOWN/INFERRED tiers).
--
-- ORDERING: this migration must be applied BEFORE any ingest run that writes content_hash — the
-- application code assumes the column exists and does not fall back if it's absent. See the
-- ingest-pipeline-fixes work item report for the exact apply order.

ALTER TABLE public.photo_metadata
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_photo_metadata_content_hash_uniq
  ON public.photo_metadata (content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN public.photo_metadata.content_hash IS
  'sha256 hex digest of the original file bytes at ingest time. NULL for rows ingested before '
  '2026-09-25 (or any row an ingest run has not yet (re)computed it for). UNIQUE among non-null '
  'values — see supabase/migrations/20260925210000_photo_metadata_content_hash.sql.';
