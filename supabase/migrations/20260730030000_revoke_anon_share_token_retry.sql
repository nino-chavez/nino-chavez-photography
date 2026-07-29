-- Retry of 20260730010000: take `album_settings.share_token` away from anon and authenticated.
--
-- Same statements, same reasons (see 20260730010000 for the full rationale: the token IS the
-- capability for a private album, the table's only SELECT policy is `USING (true)`, and RLS gates
-- rows while this exposure is a column).
--
-- The first attempt failed open and was rolled back by 20260730020000. It was not an ordering
-- mistake — the narrowing had shipped and deployed — it was that Cloudflare rolls a Pages version
-- across the edge gradually, so one isolate still ran `.select('*')`, and `getAlbumSettings`
-- turned its 42501 into the null its callers read as "public".
--
-- The prerequisite for THIS attempt is not a deploy, it is a gate that fails closed:
-- `getAlbumSettings` returns `{ok:false}` on a failed read, distinct from `{ok:true, settings:null}`
-- for an album with no row, and both callers handle it — the album page 503s, og.png 404s. So the
-- worst a mid-rollout disagreement can now do is make one album page temporarily unavailable.
--
-- Applied by hand after that change is live, and re-verified by pointing an anon PostgREST client
-- at the column while the two routes are polled.

REVOKE SELECT ON public.album_settings FROM anon, authenticated;

GRANT SELECT (album_key, visibility, gallery_scope, created_at, updated_at)
  ON public.album_settings TO anon, authenticated;
