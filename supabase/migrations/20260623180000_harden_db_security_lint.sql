-- Migration: Harden DB security-linter warnings (June 2026)
--
-- Addresses the Supabase database-linter SECURITY warnings that can be fixed
-- without breaking the live gallery. NOTE: the app's "supabaseServer" client
-- uses the ANON key (see src/lib/supabase/server.ts), so every public read runs
-- as the `anon` role — anything anon genuinely needs must stay anon-accessible.
--
-- FIXED here:
--   1. public.norm_color(text)                  — mutable search_path
--   2. public.update_updated_at_column()         — SECURITY DEFINER callable by anon/authenticated
--   3. public.update_curated_hero_updated_at()   — SECURITY DEFINER callable by anon/authenticated
--   4. public.refresh_popular_photos()           — refresh fn callable by anon/authenticated
--   5. public.refresh_timeline_months()          — refresh fn callable by anon/authenticated
--   6. public.timeline_months_mv                 — matview exposed to anon/authenticated (no app reads)
--
-- NOT addressed (intentional — documented, not deferred-by-laziness):
--   - find_photos_by_jersey() SECURITY DEFINER: deliberate. photo_jersey_sightings
--     is admin-only; this function is the controlled public (non-PII: jersey+photo,
--     no name/face) search surface. SECURITY INVOKER would break it (anon has no
--     direct SELECT on the table). Already pinned to `SET search_path = public`.
--   - popular_photos / videos_summary / albums_summary matviews in API: the gallery
--     reads them through the anon key. Public photo metadata; intentionally exposed
--     (consistent with 20260305000000_fix_security_lint.sql).
--   - pg_trgm / vector extensions in public schema: relocating risks breaking trgm
--     indexes and vector columns and needs downtime for a WARN-level finding. Prior
--     operator decision (20260305000000) stands.
--
-- CONFIG (not SQL — handled out of band):
--   - auth_leaked_password_protection: enable HaveIBeenPwned check via Auth config
--     (Dashboard → Authentication → Providers → Email, or Management API).

BEGIN;

-- 1. norm_color: pin search_path. Body uses only pg_catalog built-ins
--    (split_part/lower/trim/nullif), so an empty search_path is safe.
ALTER FUNCTION public.norm_color(text) SET search_path = '';

-- 2/3. updated_at trigger functions are fired by triggers, never meant to be
--      RPC-callable. Revoke EXECUTE from the API roles (triggers are unaffected).
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_curated_hero_updated_at() FROM PUBLIC, anon, authenticated;

-- 4/5. Matview refreshers are maintenance ops — restrict to service_role only
--      (mirrors the refresh_videos_summary fix in 20260305000000).
REVOKE EXECUTE ON FUNCTION public.refresh_popular_photos()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_timeline_months() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_popular_photos()  TO service_role;
GRANT  EXECUTE ON FUNCTION public.refresh_timeline_months() TO service_role;

-- 6. timeline_months_mv has no application readers (grep of src/ finds none).
--    Remove it from the Data API surface.
REVOKE SELECT ON public.timeline_months_mv FROM anon, authenticated;

COMMIT;
