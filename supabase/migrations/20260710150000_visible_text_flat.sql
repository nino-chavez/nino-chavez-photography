-- Searchable projection of visible_text (jersey/banner/scoreboard transcriptions, PR #79)
-- =======================================================================================
-- The array column stores text as-printed ("LEWIS", "SIKORA", "sports imports"); PostgREST
-- array containment (cs) is exact-element + case-sensitive, so a query word can never match
-- an element like "LEWIS FLYERS MVB". A lowercased flattened projection makes the search a
-- plain ILIKE, composable inside the existing name-search or() union.
--
-- ADDITIVE ONLY: one generated column + one index. Nothing main selects changes
-- (PHOTO_COLUMNS does not include it; filters may reference non-selected columns).

-- array_to_string is only STABLE (its anyarray form depends on type-output settings), which
-- generated columns reject; for text[] it is deterministic, so an IMMUTABLE wrapper is sound.
CREATE OR REPLACE FUNCTION public.immutable_text_array_join(text[], text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT array_to_string($1, $2) $$;

ALTER TABLE public.photo_metadata
  ADD COLUMN IF NOT EXISTS visible_text_flat text
  GENERATED ALWAYS AS (lower(public.immutable_text_array_join(visible_text, ' '))) STORED;

-- pg_trgm is already installed (accepted-by-design lint); GIN keeps %term% ILIKEs from
-- seq-scanning 21K rows on every keystroke of the explore search box.
CREATE INDEX IF NOT EXISTS photo_metadata_visible_text_flat_trgm
  ON public.photo_metadata USING gin (visible_text_flat gin_trgm_ops);
