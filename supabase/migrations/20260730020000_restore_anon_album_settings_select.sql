-- Emergency rollback of 20260730010000, applied to production ~2 minutes after it.
--
-- The revoke was correctly ordered behind its code change — `getAlbumSettings` had already been
-- narrowed off `.select('*')`, merged, deployed, and the deployment reported Active — and it
-- still failed OPEN. Cloudflare rolls a Pages version across the edge gradually, so at least one
-- isolate was still running `.select('*')`. That query started returning 42501, the caught error
-- returned null, and the album page's gate read null as "public": the private album page answered
-- 200, and its OG card answered 200 carrying the client's cover photo. og.png was observed
-- flipping between 200 and 404 on consecutive requests, which is the mixed-version signature.
--
-- All 13 unlisted albums were verified 404 again after this ran.
--
-- What this proves is not "the revoke was wrong" but "the gate was". `getAlbumSettings` folded a
-- failed read into the same null that legitimately means "no settings row, therefore public" — a
-- gate whose error path is allow. Fixed before retrying: it returns a discriminated result now and
-- both callers treat "could not determine" as its own case (the album page 503s, og.png 404s), so
-- a mid-rollout disagreement costs a 503 on one album page instead of publishing every private
-- one. The retry is 20260730030000.

GRANT SELECT ON public.album_settings TO anon, authenticated;
