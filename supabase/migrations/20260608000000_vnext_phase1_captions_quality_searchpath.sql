-- Migration: v-next Phase 1 — text findability
-- Date: 2026-06-08
-- Spec: .agent-os/specs/vision-extraction-identity-vnext/
-- Status: PROPOSED — requires operator sign-off before apply (database/ is off-limits per CLAUDE.md)
--
-- Three changes, all on photo_metadata. All idempotent / safe to re-run.
--
--   1. UNBREAK VECTOR SEARCH (live bug). The security hardening migration
--      (fix-function-search-paths) set search_path='' on match_photos and
--      find_similar_photos. pgvector is installed in `public`, so with an empty
--      search_path the `<=>` cosine operator cannot resolve and EVERY semantic
--      query throws `operator does not exist: public.vector <=> public.vector`
--      and silently falls back to structured-only search. Pin search_path to public.
--
--   2. caption TEXT — the AI-generated natural-language sentence that powers text /
--      RAG / scene / jersey-color search (the whole point of Phase 1).
--
--   3. quality_score (generated) — restores the default "Best Photos" sort. It had
--      been ranking on emotional_impact ALONE; the real weighted blend lived only in
--      photo-scoring.ts and never drove the SQL sort. The prior quality_score column
--      was dropped in schema-v2; re-adding it as a generated column also un-breaks
--      get_albums_with_metadata(), which still does AVG(quality_score).
--
-- EMBEDDING STRATEGY (documented decision — TASKS.md left this open):
--   REPURPOSE the existing `embedding vector(768)` column for caption-derived vectors
--   instead of adding a separate caption_embedding column. Why:
--     - the existing enum-string embeddings are exactly what Phase 1 replaces (no loss);
--     - keeps the single HNSW index + the match_photos RPC (no 2nd index, no 2nd RPC);
--     - 768 dims already match the chosen embedder (OpenRouter text-embedding-3-large
--       @768), so there is NO dimension migration;
--     - graceful during backfill: every row stays a valid 768-d vector in one space, so
--       search for not-yet-backfilled rows degrades to "old relevance", never to garbage.
--   Trade-off: no A/B or instant rollback between old and new vectors. Accepted — the old
--   vectors are the known-bad baseline we are deliberately replacing.
--
-- NOTE on the embedder: TASKS.md said "standardize on gemini-embedding-001". That target
-- is dead — all direct Google keys are revoked. OpenRouter (text-embedding-3-large @768)
-- is the project's only live gateway and honors the Phase 0 "large text model" decision
-- at the existing column's dimensionality. See src/lib/ai/embeddings.ts.

-- 1. Unbreak vector search ----------------------------------------------------
ALTER FUNCTION public.match_photos(vector, double precision, integer) SET search_path = public;
ALTER FUNCTION public.find_similar_photos(text, integer, double precision) SET search_path = public;

-- 2. caption ------------------------------------------------------------------
ALTER TABLE photo_metadata ADD COLUMN IF NOT EXISTS caption TEXT;
COMMENT ON COLUMN photo_metadata.caption IS
  'AI-generated NL caption (<=30 words: visible jersey numbers/colors, action, scene). Source text for the `embedding` vector (Phase 1, vision-extraction v-next).';

-- 3. quality_score (generated) + indexes -------------------------------------
ALTER TABLE photo_metadata
  ADD COLUMN IF NOT EXISTS quality_score numeric
  GENERATED ALWAYS AS (
      COALESCE(sharpness, 0)         * 0.35
    + COALESCE(composition_score, 0) * 0.30
    + COALESCE(emotional_impact, 0)  * 0.25
    + COALESCE(exposure_accuracy, 0) * 0.10
  ) STORED;
COMMENT ON COLUMN photo_metadata.quality_score IS
  'Generated weighted quality blend (sharpness .35 / composition .30 / emotional .25 / exposure .10). Drives the default "Best Photos" sort; mirrors calculateQualityScore() in src/lib/services/photo-scoring.ts.';

CREATE INDEX IF NOT EXISTS idx_photo_metadata_quality_score
  ON photo_metadata (quality_score DESC NULLS LAST);

-- Matches the headline sort shape (album-scoped quality, deterministic tiebreak).
CREATE INDEX IF NOT EXISTS idx_photo_metadata_album_quality
  ON photo_metadata (album_key, quality_score DESC NULLS LAST, upload_date DESC);

-- 4. embedding repurpose (doc only; vectors updated by the backfill) ----------
COMMENT ON COLUMN photo_metadata.embedding IS
  '768-d vector. Phase 1: caption-derived (OpenRouter text-embedding-3-large @768) once backfilled; pre-Phase-1 rows hold enum-string-derived vectors. Query + write MUST share src/lib/ai/embeddings.ts:embedText() so vectors stay in one space.';

-- Verification ---------------------------------------------------------------
-- SELECT proname, proconfig FROM pg_proc WHERE proname IN ('match_photos','find_similar_photos');
-- SELECT column_name FROM information_schema.columns WHERE table_name='photo_metadata' AND column_name IN ('caption','quality_score');
-- SELECT ('[1,0]'::vector <=> '[0,1]'::vector);  -- should return a number, not error
-- SELECT image_key, quality_score FROM photo_metadata WHERE sharpness IS NOT NULL ORDER BY quality_score DESC NULLS LAST LIMIT 5;
