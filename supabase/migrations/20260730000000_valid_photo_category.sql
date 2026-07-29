-- photo_category joins the enforced columns, and the one value that proves why.
--
-- This is the last of the four enrichment columns taxonomy.ts governs. `sport_type` has had
-- a correct CHECK for a long time; 20260729140000 and 20260729150000 gave `play_type` two.
-- `photo_category` had NONE -- not an inert one, none at all -- so nothing rejected a bad
-- value and, just as importantly, nothing reported one.
--
-- What that silence held: exactly one row, `celebr`. A `celebration` truncated by some
-- earlier writer, enriched 2026-06-08 (extraction_version NULL -- pre-#10 pipeline), on a
-- public album. Its caption reads "Two volleyball players in light blue jerseys celebrate
-- with arms raised on a red and blue court", so the intended value is not in question.
--
-- One row is the entire argument for the constraint. An unenforced vocabulary does not fail
-- loudly at scale; it produces something too small to notice, which then sits on public
-- surfaces indefinitely. This one reached three:
--   * the category facet on /explore (rendered from facet_base_counts),
--   * the category badge on its own photo card (PhotoCard.svelte),
--   * `/api/ai/stats`, which answer engines republish verbatim -- it was serving
--     `"celebr": 1` alongside `"celebration": 740` as though they were different things.
--
-- The constraint below is GENERATED from PHOTO_CATEGORIES by scripts/taxonomy-gen.ts.
-- Shape rule, same as its two siblings: `col IS NULL OR col IN (...)`, never
-- `col = ANY (ARRAY[..., NULL])` -- the latter accepts everything while reporting
-- convalidated: true, which is how valid_play_type spent its whole life inert.
--
-- NOT COVERED HERE, deliberately: 73 rows carry a play_type on a non-action category
-- (candid 60, warmup 13). ingest-extraction.ts enforces "only action photos carry a play"
-- on the write path; the database never has. Closing that gap means either nulling 73 real
-- plays or reclassifying 73 photos as action -- a judgement about the photos, not a code
-- fix, and the owner has not been asked. It is a separate decision, not a smaller piece of
-- this one.

-- Nullable: photo_category IS NULL means the extractor returned nothing usable.
ALTER TABLE photo_metadata DROP CONSTRAINT IF EXISTS valid_photo_category;
ALTER TABLE photo_metadata ADD CONSTRAINT valid_photo_category CHECK (
  photo_category IS NULL OR photo_category IN (
    'action', 'celebration', 'candid', 'portrait', 'warmup', 'ceremony'
  )
) NOT VALID;

-- Repair, not erasure: the caption states the photo shows a celebration, so the truncated
-- value is restored to the canonical one rather than nulled. This is the opposite treatment
-- from 20260729140000/150000, where the offending values named plays the photos could not
-- contain and NULL was the only honest answer.
UPDATE photo_metadata SET photo_category = 'celebration' WHERE photo_category = 'celebr';

-- Anything else outside the vocabulary would be an unknown value with no caption evidence
-- behind it; there is none today (verified: `celebr` was the only one), and this makes the
-- migration correct rather than merely sufficient for the state it was written against.
UPDATE photo_metadata SET photo_category = NULL
WHERE photo_category IS NOT NULL
  AND photo_category NOT IN ('action', 'celebration', 'candid', 'portrait', 'warmup', 'ceremony');

ALTER TABLE photo_metadata VALIDATE CONSTRAINT valid_photo_category;

-- A migration owns the read models it invalidates. facet_base_counts is what /explore reads
-- for the category filter, and it is the surface that would otherwise keep offering `celebr`
-- for up to 30 minutes (pg_cron job 5) after this ran. `/api/ai/stats` reads the base table
-- and needs no refresh. Forgetting this step on 20260729140000 is why the FAQ kept publishing
-- a vocabulary the database had already corrected.
SELECT refresh_facet_base_counts();
