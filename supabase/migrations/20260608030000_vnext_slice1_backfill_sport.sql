-- Migration: v-next Slice 1 (part 2) — backfill photo_metadata.sport_type from albums + validate
-- Date: 2026-06-08
-- Status: PROPOSED — apply ONLY after scripts/load-album-sports.ts has populated albums.sport from
--   the operator-confirmed sheet. Apply via `supabase db push` after copying into supabase/migrations/.
--
-- Forces every existing photo's sport_type to mirror its album's authoritative sport (fixing the
-- 18 mislabeled albums + nulling the 23 non-sport ones in one pass), then VALIDATEs the constraint
-- so the corrupt values can never reappear. The trigger keeps it true for all future writes.

UPDATE photo_metadata p
SET sport_type = a.sport::text
FROM albums a
WHERE a.album_key = p.album_key
  AND p.sport_type IS DISTINCT FROM a.sport::text;

ALTER TABLE photo_metadata VALIDATE CONSTRAINT valid_sport_type;

-- Verification:
-- SELECT count(*) FROM photo_metadata p JOIN albums a USING(album_key)
--   WHERE p.sport_type IS DISTINCT FROM a.sport::text;   -- expect 0
-- SELECT sport_type, count(*) FROM photo_metadata GROUP BY 1 ORDER BY 2 DESC;  -- valid sports + NULL only
