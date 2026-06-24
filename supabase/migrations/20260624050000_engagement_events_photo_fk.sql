-- engagement_events.photo_id → photo_metadata FK (SEC-7)
-- =====================================================
-- engagement_events feeds the public popularity ranking but had no FK on photo_id, so events could
-- reference deleted/phantom photos and accrue popularity to rows that no longer exist. Add a FK with
-- ON DELETE CASCADE. photo_id is nullable (album-level events) — NULLs are exempt from FK checks.
--
-- Clean any pre-existing orphans first so ADD CONSTRAINT succeeds (verified 0 orphans at write time;
-- the DELETE is a defensive no-op). DROP IF EXISTS keeps the migration idempotent.
--
-- NOTE: this does NOT address the dedup-bypass abuse vector (per-IP+UA hashing is defeatable by UA
-- rotation to inflate rankings). Hardening that needs a rate-limit rule / captcha / auth — a product
-- decision, deliberately out of scope here.

DELETE FROM public.engagement_events e
WHERE e.photo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.photo_metadata pm WHERE pm.photo_id = e.photo_id
  );

ALTER TABLE public.engagement_events
  DROP CONSTRAINT IF EXISTS engagement_events_photo_id_fkey;

ALTER TABLE public.engagement_events
  ADD CONSTRAINT engagement_events_photo_id_fkey
  FOREIGN KEY (photo_id) REFERENCES public.photo_metadata (photo_id) ON DELETE CASCADE;
