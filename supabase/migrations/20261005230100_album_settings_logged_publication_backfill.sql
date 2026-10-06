-- Write the publication times recovered from agent session logs (Nino approved 2026-10-05:
-- "approve the backfill and trigger, use logged times").
--
-- Production only: the guard below fails on any database that does not hold these seven albums
-- as public, so it never runs against the synthetic rehearsal data. Requires
-- 20261005230000_album_settings_publication_provenance.sql (columns, constraints, trigger).
--
-- Each time is the logged response to the unlisted -> public write, accurate to a few seconds.
-- Five albums had no value. DWdCET and Re7kho had times typed in by 20260926140000 that differ
-- from their logged writes; Re7kho's typed 16:00Z fell on the next Chicago day. The trigger does
-- not fire here, because visibility is not updated.

BEGIN;

-- Sources and before/after output: docs/audits/20261005-publication-time-provenance/recovered-publish-times.json.
DO $$
DECLARE written integer;
BEGIN
  UPDATE public.album_settings AS s
  SET published_at = v.published_at,
      published_at_basis = 'inferred',
      published_at_evidence = v.evidence
  FROM (VALUES
    ('jq1Rp7', '2026-07-19T21:11:43.955Z'::timestamptz, 'Agent session log: REST PATCH unlisted->public (Claude session 7562b1fd)'),
    ('1BlKk4', '2026-07-26T21:38:06.440Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Claude session 6dfacee4)'),
    ('dKe567', '2026-08-13T00:22:59Z'::timestamptz,     'Agent session log: publish-album.ts unlisted->public (Codex session 019ff836)'),
    ('eqYF0h', '2026-08-24T03:46:25.490Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Codex session 01a031cc)'),
    ('fJKdsB', '2026-08-29T02:39:40.894Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Codex session 01a04b0e)'),
    ('DWdCET', '2026-09-26T18:50:36.552Z'::timestamptz, 'Agent session log: publish:album unlisted->public (Claude session 61499efe); replaces the 19:00Z typed into 20260926140000'),
    ('Re7kho', '2026-09-26T01:10:52.556Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Claude session 505ff78b); replaces the 16:00Z typed into 20260926140000')
  ) AS v(album_key, published_at, evidence)
  WHERE s.album_key = v.album_key
    AND s.visibility = 'public';
  GET DIAGNOSTICS written = ROW_COUNT;
  IF written <> 7 THEN
    RAISE EXCEPTION 'expected to write 7 logged publication times, wrote % (an album is missing or no longer public)', written;
  END IF;
END $$;

COMMIT;
