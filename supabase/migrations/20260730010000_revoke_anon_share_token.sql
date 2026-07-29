-- Take `album_settings.share_token` away from anon and authenticated.
--
-- The token IS the capability: whoever holds it can view a private album at /share/<token>.
-- `album_settings` grants the Supabase default privilege set to anon, and its only SELECT policy
-- is `Allow public read` with `USING (true)`, so anon could read the token for all 13 unlisted
-- client albums — family portraits, senior sessions, a marriage proposal. Row-level security was
-- doing nothing here, because RLS gates ROWS and the exposure was a COLUMN.
--
-- Not currently reachable from a browser: nothing imports $lib/supabase/client, so the anon key
-- is not in any deployed chunk and every Supabase read in this app is server-side. That is a
-- property of today's import graph, not a guarantee — one browser-side read would publish both
-- the key and this column at once.
--
-- ORDER MATTERS, and the wrong order fails OPEN. `getAlbumSettings` used `.select('*')`, which
-- expands server-side, so this revoke landing before that code change makes the query error and
-- return null — and null is what the album page's unlisted gate treats as "public". Every one of
-- the 13 private albums would have gone public. The narrowing shipped and deployed first;
-- `getAlbumByShareToken` moved to service_role in the same change, because Postgres requires
-- SELECT on any column a query REFERENCES and that one filters on the token.
--
-- A column-level REVOKE cannot subtract from a table-level grant, so the table grant goes and the
-- five safe columns are granted back explicitly. Anything added to this table later is NOT
-- readable by anon until it is named here — which is the correct default for a table that holds
-- one secret already.
--
-- Write privileges are deliberately left alone. anon holds the stock Supabase
-- INSERT/UPDATE/DELETE grants on every table in this schema and RLS is what denies them; this
-- table has write policies for service_role only, so they are inert. Carving out one table would
-- be a silent deviation from the pattern the other tables follow.

REVOKE SELECT ON public.album_settings FROM anon, authenticated;

GRANT SELECT (album_key, visibility, gallery_scope, created_at, updated_at)
  ON public.album_settings TO anon, authenticated;

-- Verification (run as anon, e.g. with the VITE_SUPABASE_ANON_KEY via PostgREST):
--   select share_token from album_settings limit 1;  -- expect: permission denied for table
--   select album_key, visibility from album_settings limit 1;  -- expect: rows
-- And both routes must still work: /albums/<unlisted-slug> 404s, /share/<token> 200s.
