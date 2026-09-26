-- Keep norm_color() in step with normColor() in src/lib/identity/sightings.ts.
-- ===========================================================================
-- The TypeScript normalizer stopped truncating colors to their first word on 2026-09-25
-- ("light blue" was stored as "light"; 2,471 of 49,673 sightings carried a bare modifier).
-- Ingest now stores the full canonical color, and scripts/backfill-sighting-colors.ts repairs
-- existing rows. The SQL twin, used on BOTH sides of the jersey-search RPCs' team-color
-- comparison (find_photos_by_jersey et al.), still truncated. Both sides truncating kept
-- matches consistent but coarse, and the TS alias grey -> gray had no SQL counterpart, so a
-- stored "gray" could never equal a queried "grey".
--
-- Same rule as the TS, step for step: lowercase, trim, collapse whitespace, strip trailing
-- . , ; : punctuation, fold the word "grey" to "gray". One rule, two runtimes: change both
-- together. search_path stays pinned (see 20260623180000_harden_db_security_lint.sql).

CREATE OR REPLACE FUNCTION public.norm_color(c text) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(pg_catalog.lower(pg_catalog.btrim(c)), '\s+', ' ', 'g'),
        '[.,;:]+$', ''),
      '\mgrey\M', 'gray', 'g'),
    '');
$$;
