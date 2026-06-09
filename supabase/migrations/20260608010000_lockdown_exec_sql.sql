-- Migration: lock down exec_sql (close the anon/authenticated arbitrary-read RLS bypass)
-- Date: 2026-06-08
--
-- exec_sql is SECURITY DEFINER and was granted to PUBLIC + anon + authenticated, so any
-- anonymous web client could run arbitrary SELECT that BYPASSES RLS — reading any table
-- (faces/PII, unpublished albums, user data). SELECT-only, but full read exposure.
--
-- Server-side callers (aggregations in src/lib/supabase/server.ts) use service_role, which
-- holds its own explicit EXECUTE grant (proacl: service_role=X/postgres), so revoking the
-- others is safe and does not touch the server path.
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated;

-- Verify: SELECT proacl::text FROM pg_proc WHERE proname='exec_sql';  -- expect only postgres + service_role
