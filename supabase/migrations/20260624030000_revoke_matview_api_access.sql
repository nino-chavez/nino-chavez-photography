-- Migration: revoke anon/authenticated SELECT on the public matviews (least privilege)
--
-- Fixes Supabase linter 0016_materialized_view_in_api for all 8 public matviews. Matviews
-- can't carry RLS, so any anon/authenticated SELECT grant exposes their full contents over
-- PostgREST (/rest/v1/<matview>) with no row gate.
--
-- Verified safe: EVERY app read of these matviews goes through the service_role client
-- (`supabaseServer` / admin client), which bypasses grants entirely — no browser/anon-key
-- read exists in the codebase (grep of $lib/supabase/client + all .svelte = none). The
-- popularity matviews were originally granted anon "for public discovery", but that surface
-- was actually built as the server-side /api/top-photos endpoint (reads via service_role),
-- so the direct-anon-read path was never used. Revoking is correct least-privilege with
-- zero functional impact.
--
-- These were granted the FULL privilege set (arwdDxtm), not just SELECT — Supabase's
-- default privileges auto-grant anon/authenticated on every object created in `public`
-- (which is why facet_base_counts shows the full set despite only `GRANT SELECT` in its
-- migration). REVOKE ALL clears the lint and the misleading write grants in one shot.
--
-- ROOT-CAUSE NOTE: the default-privilege grant means any FUTURE matview created in public
-- will re-trip linter 0016. Addressing that (ALTER DEFAULT PRIVILEGES, or a dedicated
-- unexposed schema for matviews) is a broader change deliberately left out of this fix.
--
-- REFRESH MATERIALIZED VIEW does not alter grants, so this is durable across the ingest /
-- pg_cron refreshes.

BEGIN;

REVOKE ALL ON public.photo_popularity   FROM anon, authenticated;
REVOKE ALL ON public.album_popularity   FROM anon, authenticated;
REVOKE ALL ON public.popular_photos     FROM anon, authenticated;
REVOKE ALL ON public.videos_summary     FROM anon, authenticated;
REVOKE ALL ON public.albums_summary     FROM anon, authenticated;
REVOKE ALL ON public.album_top_photo    FROM anon, authenticated;
REVOKE ALL ON public.facet_base_counts  FROM anon, authenticated;

COMMIT;
