-- Add the image-vector search column + deterministic-sharpness column.
-- =========================================================================
-- blueprint/decisions/0006-vision-prompt-v2-and-image-vector-search.md: semantic search moves to
-- IMAGE embeddings (google/gemini-embedding-2@768) — recall@10 0.82 vs 0.64 for caption-vector
-- search on a 40-query eval; image-alone beat every caption+image hybrid tried, so this ships as
-- a single new vector column, not a second column to fuse with the existing one.
--
-- ADDITIVE ONLY (ADR 0004: additive migrations are safe pre-merge). This migration does NOT touch
-- search behavior — `match_photos` / `match_photos_hybrid` still rank on `photo_metadata.embedding`
-- until the RPC migration (supabase/migrations/20260925240000_match_photos_image_embedding.sql)
-- ships in the SAME commit as the app-side query-embedder switch. Apply order:
--   1. THIS migration (column + index)
--   2. scripts/backfill-image-embeddings.ts (backfill existing rows)
--   3. the RPC migration + the app deploy that ships embedImageQuery — together
--
-- `image_embedding` is nullable and starts NULL for every existing row (20,000+ photos as of
-- 2026-09-25) until the backfill runs; new ingests (scripts/ingest-album.ts, this cycle) write it
-- immediately. A row with NULL image_embedding is excluded from semantic-search ranking by the
-- RPC migration's `WHERE image_embedding IS NOT NULL` clause — the same graceful-exclusion pattern
-- already used for `sharpness IS NOT NULL` in match_photos_hybrid. It remains findable via
-- structured filters (sport/category/play_type/date) and name/team lookup; it just won't surface
-- from a descriptive/visual search query until reprocessed or backfilled.
--
-- `sharpness_measured` is the deterministic (variance-of-Laplacian, float math — src/lib/ai/sharpness.ts)
-- companion to the existing MODEL-scored `sharpness` column. It does NOT replace `sharpness`:
-- `quality_score` (GENERATED) and every existing consumer of the model's `sharpness` column are
-- UNCHANGED by this migration and by this cycle's ingest/backfill work — see the ADR's "what this
-- does not do" note.

ALTER TABLE public.photo_metadata
  ADD COLUMN IF NOT EXISTS image_embedding vector(768),
  ADD COLUMN IF NOT EXISTS sharpness_measured double precision;

-- Same index type/params as the existing caption-embedding index (20251120000001_add_vector_similarity.sql):
-- plain HNSW + cosine ops, no explicit m/ef_construction override.
CREATE INDEX IF NOT EXISTS idx_photo_metadata_image_embedding
  ON public.photo_metadata
  USING hnsw (image_embedding vector_cosine_ops);

COMMENT ON COLUMN public.photo_metadata.image_embedding IS
  '768-dimensional image embedding (google/gemini-embedding-2, OpenRouter) for semantic search — '
  'the primary search-ranking vector as of blueprint/decisions/0006. NULL until backfilled '
  '(scripts/backfill-image-embeddings.ts) or reprocessed by ingest. Distinct from `embedding`, '
  'which stays the caption-text embedding.';

COMMENT ON COLUMN public.photo_metadata.sharpness_measured IS
  'Deterministic variance-of-Laplacian sharpness (src/lib/ai/sharpness.ts), computed in float '
  'math on a 768px greyscale resize. Companion to the model-scored `sharpness` column, not a '
  'replacement — `quality_score` and every existing `sharpness` consumer are unchanged.';
