-- SEC-8: stop public-schema table-class objects from auto-granting anon/authenticated
-- ===================================================================================
-- ROOT CAUSE (from 20260624030000's note): Supabase configures default privileges that auto-grant
-- anon + authenticated the FULL set (arwdDxtm) on every object created in `public`. For RLS-protected
-- tables that's the intended Supabase model (RLS gates rows). For MATERIALIZED VIEWS it's a hole —
-- matviews can't carry RLS, so the auto-grant exposes their full contents over PostgREST (lint 0016).
-- Until now each new matview needed a manual REVOKE (see 20260624030000). This flips the default to
-- fail-CLOSED so future matviews (and any non-RLS table) are NOT anon-readable unless explicitly granted.
--
-- SCOPING (verified before writing):
--   * Every matview and migration/dashboard-created table in this project is owned by `postgres`
--     (pg_matviews / pg_tables checked). Default privileges are applied by the CREATING role, so only
--     postgres's defaults ever apply to app objects — supabase_admin's defaults are irrelevant here
--     (and postgres is not a member of supabase_admin, so it couldn't alter them anyway).
--   * Scoped to ON TABLES only (covers tables + views + matviews — the lint-0016 object class).
--     FUNCTIONS/SEQUENCES defaults are left intact so existing+future anon RPCs (e.g.
--     find_photos_by_jersey) keep working without per-function grants.
--   * Default privileges affect FUTURE objects only — existing tables/matviews are untouched, so this
--     has ZERO immediate functional impact.
--
-- WORKFLOW CHANGE (important for future migrations): a NEW public table that anon/authenticated must
-- read now needs an explicit `GRANT SELECT ON <table> TO anon, authenticated;` in its migration — the
-- blanket default no longer provides it. This is fail-closed (safe): a forgotten grant yields
-- "permission denied", never silent exposure. New matviews no longer need the manual REVOKE.
--
-- Rollback: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
