-- Make album_settings.published_at trustworthy: say how each value was obtained, and let the
-- database stamp it at the one moment that counts.
--
-- Two problems, both measured on 2026-10-05
-- (docs/audits/20261005-publication-time-provenance/README.md):
--
-- 1. Values could not be told apart. The two existing values (DWdCET, Re7kho) were typed into
--    20260926140000 after the fact, and neither matches the logged publish write (Re7kho's lands
--    on the wrong Chicago day). Five more albums have a logged write and no value; the next
--    migration, 20261005230100, writes all seven from the logs. A value recovered from a log must
--    stay distinguishable from one the database stamped, so every non-null published_at now
--    carries published_at_basis:
--      recorded = stamped by this trigger at the unlisted -> public write
--      inferred = recovered afterwards from a log of that write; published_at_evidence names it
--
-- 2. Stamping lived in application code (src/lib/albums/publish-target.ts), so any writer that
--    skipped it left no time. The 2026-07-19 REST PATCH that published jq1Rp7 is the measured
--    case. The trigger below stamps every unlisted -> public update, whoever issues it.
--
-- Only `unlisted -> public` is a publication. A missing album_settings row already reads as
-- public everywhere (getAlbumSettings, getUnlistedAlbumKeys), so inserting a public row for an
-- album with no row, such as a gallery_scope change on a legacy album, publishes nothing and
-- stamps nothing. Unpublishing leaves the last publication time in place. Republishing replaces
-- it, which is what the "latest gallery" ranking (src/lib/albums/latest.ts) sorts on.
--
-- This file holds only schema and labels, so it also applies to the synthetic analytics rehearsal
-- database. The production-only values live in 20261005230100.
--
-- ORDERING: apply this and 20261005230100 before deploying the matching code. That code no longer stamps
-- published_at itself, and it selects published_at_basis, which fails loudly until this exists.
--
-- New columns get no anon/authenticated grant: album_settings' anon SELECT is column-level
-- (20260730030000) and only the service-role operator page reads provenance.

BEGIN;

ALTER TABLE public.album_settings
  ADD COLUMN IF NOT EXISTS published_at_basis text,
  ADD COLUMN IF NOT EXISTS published_at_evidence text;

-- Label every value that already exists, so the constraints below hold. Two were typed into
-- 20260926140000 from the operator's account rather than stamped at the write; they are inferred
-- until 20261005230100 replaces them with the logged write times. Anything else was stamped by
-- publish-target.ts at the write itself between 2026-09-26 and this migration, so it is recorded.
UPDATE public.album_settings
SET published_at_basis = 'inferred',
    published_at_evidence = 'Typed into migration 20260926140000 from the operator''s account; not stamped at the write'
WHERE (album_key, published_at) IN (('DWdCET', '2026-09-26T19:00:00Z'::timestamptz), ('Re7kho', '2026-09-26T16:00:00Z'::timestamptz));

UPDATE public.album_settings
SET published_at_basis = 'recorded'
WHERE published_at IS NOT NULL AND published_at_basis IS NULL;

ALTER TABLE public.album_settings
  ADD CONSTRAINT album_settings_published_at_basis_check
    CHECK (published_at_basis IN ('recorded', 'inferred')),
  ADD CONSTRAINT album_settings_published_at_basis_present
    CHECK ((published_at IS NULL) = (published_at_basis IS NULL)),
  ADD CONSTRAINT album_settings_published_at_evidence_present
    CHECK ((published_at_basis = 'inferred') = (published_at_evidence IS NOT NULL));

CREATE OR REPLACE FUNCTION public.album_settings_stamp_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.visibility = 'unlisted' AND NEW.visibility = 'public' THEN
    NEW.published_at := now();
    NEW.published_at_basis := 'recorded';
    NEW.published_at_evidence := NULL;
  END IF;
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.album_settings_stamp_published_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS album_settings_stamp_published_at ON public.album_settings;
CREATE TRIGGER album_settings_stamp_published_at
  BEFORE UPDATE OF visibility ON public.album_settings
  FOR EACH ROW EXECUTE FUNCTION public.album_settings_stamp_published_at();

COMMENT ON COLUMN public.album_settings.published_at IS
  'When this album last went from unlisted to public. Stamped by the album_settings_stamp_published_at '
  'trigger for every writer. NULL when no publication was ever observed: legacy albums public before '
  'any record existed, and albums whose row was inserted already public. See published_at_basis.';
COMMENT ON COLUMN public.album_settings.published_at_basis IS
  'How published_at was obtained. recorded = stamped by the trigger at the write. inferred = recovered '
  'afterwards from a log of the write (see published_at_evidence). NULL exactly when published_at is NULL.';
COMMENT ON COLUMN public.album_settings.published_at_evidence IS
  'For an inferred published_at: the log that observed the unlisted -> public write. NULL otherwise.';

COMMIT;
