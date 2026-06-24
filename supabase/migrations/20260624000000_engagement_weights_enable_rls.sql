-- Migration: Enable RLS on engagement_weights
--
-- Fixes Supabase linter 0013_rls_disabled_in_public: engagement_weights is in the
-- PostgREST-exposed public schema with RLS off. It was the only popularity table
-- that missed ENABLE ROW LEVEL SECURITY in 20260623190000_popularity_engine.sql
-- (its sibling engagement_events has it on).
--
-- Mirrors the engagement_events pattern: RLS on, no anon/authenticated policies →
-- only service_role (bypasses RLS) can read/write directly. The lookup is read
-- exclusively inside photo_popularity / album_popularity at refresh time, where the
-- matview owner bypasses RLS, so discovery surfaces are unaffected.

BEGIN;

ALTER TABLE public.engagement_weights ENABLE ROW LEVEL SECURITY;

COMMIT;
