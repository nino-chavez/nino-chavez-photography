-- Cut semantic search over to the image-vector column.
-- =========================================================================
-- blueprint/decisions/0006-vision-prompt-v2-and-image-vector-search.md.
--
-- ATOMIC WITH THE APP DEPLOY: this migration must ship in the SAME commit/deploy as the
-- src/lib/supabase/server.ts change that switches the query-side embedder from `embedText`
-- (caption-text space) to `embedImageQuery` (image space) — never apply this migration alone.
-- The function SIGNATURES are unchanged (`query_embedding vector`), so old app code would not
-- error against the new body; it would silently rank by a caption-space query vector against an
-- image-space column and get back nonsense-ordered (or empty, once image_embedding is populated
-- and embedding is not filtered) results. That's a correctness regression, not a crash, which is
-- exactly the failure mode ADR 0004's merge-gating rule exists to prevent for anything `main`
-- still reads — apply this only as part of the deploy that also ships the app-side switch.
--
-- APPLY ORDER (full sequence, see 20260925230000 for the column migration):
--   1. 20260925230000_photo_metadata_image_embedding.sql (column + index)
--   2. scripts/backfill-image-embeddings.ts (backfill existing rows)
--   3. THIS migration + the app deploy shipping embedImageQuery — together, last
--
-- NULL image_embedding rows: both functions already excluded NULL-embedding rows before this
-- change (`WHERE pm.embedding IS NOT NULL`); the same clause now reads `pm.image_embedding IS NOT
-- NULL`. A row backfilled/ingested before this ships is unaffected; a row NOT yet backfilled
-- simply doesn't surface from semantic search until it is (see the column migration's comment —
-- it stays reachable via structured/name search in the meantime).
--
-- match_photos' default threshold is LOWERED from 0.5 to 0.25 — measured, not carried over. Text-
-- query-to-image-vector cosine similarity for a TRUE match runs ~0.30-0.48 (mean ~0.40) against
-- the eval's cached 40-query/65-photo vectors (recomputed locally from .temp/eval/vectors.json +
-- queries-40.json in the eval worktree, not re-embedded — zero additional spend). At 0.5 this RPC
-- would reject every real match, not just weak ones. 0.25 sits below every measured true-match
-- score with margin; relevant and irrelevant scores overlap substantially in this space (this is
-- a measured floor, not a clean separator — see blueprint/decisions/0006), so ranking + match_count
-- does the real work of surfacing the best matches, same as before. Every live caller (searchPhotos,
-- the chat tool) already passes an explicit match_threshold, so this default only matters for a
-- caller that omits it — kept consistent with those measured call sites regardless.
--
-- match_photos_hybrid's default (0.15) is UNCHANGED: it was already below the measured
-- irrelevant-score floor for this space (structured facets do most of the narrowing there by
-- design), so the caption-space value happens to still be safe — this was checked, not assumed.

CREATE OR REPLACE FUNCTION match_photos(query_embedding vector, match_threshold double precision DEFAULT 0.25, match_count integer DEFAULT 10)
RETURNS TABLE(image_key text, sport_type text, photo_category text, play_type text, similarity double precision)
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT pm.image_key::text, pm.sport_type::text, pm.photo_category::text, pm.play_type::text,
         (1 - (pm.image_embedding <=> query_embedding))::double precision AS similarity
  FROM public.photo_metadata pm
  WHERE pm.image_embedding IS NOT NULL
    AND 1 - (pm.image_embedding <=> query_embedding) >= match_threshold
  ORDER BY pm.image_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_photos_hybrid(
  query_embedding vector,
  match_count integer DEFAULT 24,
  match_threshold double precision DEFAULT 0.15,
  p_sport text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_play_type text DEFAULT NULL,
  p_album_key text DEFAULT NULL,
  p_date_from timestamp DEFAULT NULL,
  p_date_to timestamp DEFAULT NULL
)
RETURNS TABLE(image_key text, similarity double precision)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT pm.image_key::text,
         (1 - (pm.image_embedding <=> query_embedding))::double precision AS similarity
  FROM public.photo_metadata pm
  WHERE pm.image_embedding IS NOT NULL
    AND pm.sharpness IS NOT NULL
    AND (p_sport     IS NULL OR pm.sport_type     = p_sport)
    AND (p_category  IS NULL OR pm.photo_category  = p_category)
    AND (p_play_type IS NULL OR pm.play_type       = p_play_type)
    AND (p_album_key IS NULL OR pm.album_key       = p_album_key)
    AND (p_date_from IS NULL OR pm.photo_date      >= p_date_from)
    AND (p_date_to   IS NULL OR pm.photo_date      <= p_date_to)
    AND (1 - (pm.image_embedding <=> query_embedding)) >= match_threshold
  ORDER BY pm.image_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grants are unchanged (already applied to both functions), restated here for completeness since
-- CREATE OR REPLACE does not alter existing grants but a fresh reader of this file should see them.
GRANT EXECUTE ON FUNCTION match_photos(vector, double precision, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_photos_hybrid(vector, integer, double precision, text, text, text, text, timestamp, timestamp)
  TO anon, authenticated;

-- NOTE: find_similar_photos (photo-to-photo "similar photos" feature) is NOT changed by this
-- migration — it still ranks on the caption-text `embedding` column. It was out of scope for this
-- cycle's evaluation (which scored TEXT-query -> photo retrieval, not photo -> photo similarity);
-- see the ADR's "what this does not do" note before assuming it should be switched too.
