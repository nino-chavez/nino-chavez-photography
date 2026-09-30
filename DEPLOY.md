# Deploy — photography (nino-chavez-gallery-v3)

## Host
- **Platform**: Cloudflare Pages
- **Project name**: `nino-chavez-photography`
- **Production URL**: https://ninochavez.co/photography
- **Preview builds**: disabled in the Pages project configuration.

## Deploy trigger
- **Canonical**: Cloudflare Pages git integration builds `main` with `npm run build` and
  publishes `.svelte-kit/cloudflare`. Verified through the Pages API on September 28, 2026:
  production deployments enabled; preview branches disabled. A push to `main` deploys.
- **Manual fallback**: `npm run build && wrangler pages deploy .svelte-kit/cloudflare --project-name=nino-chavez-photography`
- **Build time**: TODO — confirm in the CF Pages dashboard

## Database
- **Provider**: Supabase — project `skywzpcekhntecegyjoj`, **already linked** (`supabase/.temp/`).
- **Migrations live in**: `supabase/migrations/` (timestamped `<ts>_name.sql` files).
- **Apply via** (preferred): `supabase db push --linked` from a checkout that contains the
  migration file. Always `--dry-run` first to confirm only the intended migration is pending
  (the remote history is in sync; a clean run lists just your new file).
- **Agent can run migrations?**: **YES** — but note `db push` opens a direct Postgres
  connection, so it needs the **database password** (the `supabase login` access token only
  authenticates the Management API, not the DB connection). The password is supplied one of:
  1. **Cached in the macOS keychain** after an operator runs `supabase login` + `supabase link`
     (entering the DB password once). Subsequent `supabase db push --linked` then runs with no
     prompt. This is the current state.
  2. **1Password** — add the DB password to the `Supabase photography` item and
     `op read` it into `supabase db push --linked -p "$PW"` for a fully headless run.
- **Fallback**: Supabase Dashboard → SQL Editor (paste the migration SQL).
- **Tip**: run from an isolated `git worktree` (copy `supabase/.temp` into it) when another
  session holds the main checkout, so the push doesn't depend on the working branch.

## Companion Worker
- `cloudflare-worker/album-zip/` — separate Worker for ZIP downloads. Deploy with `npm run worker:deploy`.

## Environment variables
- **Where they live**: Cloudflare Pages dashboard (set as Pages secrets)
- **Required at runtime** (see `.env.example` for the full set): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS), and
  `OPENROUTER_API_KEY` (runtime embeddings for semantic search). Ingest/upload tooling also
  needs `CF_ACCOUNT_ID` + `CF_IMAGES_API_TOKEN`.
- **Analytics test markers**: `ANALYTICS_TEST_TOKEN` signs short-lived test requests.
  Missing or invalid signatures are rejected. Operator exclusion separately uses the verified
  Supabase identity and `ADMIN_EMAILS`; no client-supplied traffic classification is trusted.
- **Cross-site traffic report**: `CLOUDFLARE_ACCOUNT_ID` is a non-secret Pages variable in
  `wrangler.toml`. The report requires the server-only `CLOUDFLARE_ANALYTICS_TOKEN`.
  Use the account token `nino-site-analytics-read`, with only Account Analytics Read permission.
  Its vault reference is `op://Developer Secrets/Cloudflare photography/analytics_api_token`.
  Set it as a Pages secret; new deployments receive the updated value. Images and account-ops
  credentials must not be used for this report. The report at
  `/sites` reads Cloudflare Web Analytics page-load groups for
  `ninochavez.co`. It groups the profile, writing, demos, and photography paths, as a separate traffic source. The opt-in first-party tracker measures actions and linked views across public sections. Gallery actions remain in
  the separate gallery report. Missing or invalid access shows an explicit unavailable state.

## Domains
- ninochavez.co/photography (apex router to Pages)
- analytics.ninochavez.co/ (same Pages project). The proxied
  `analytics` CNAME points to `nino-chavez-photography.pages.dev`, and the hostname is attached
  as a Pages custom domain. Cloudflare Page Rules `4abee86fac06ab509ec6e74a93c4019e` and
  `49cd0626a9c5fe0e70031b988f948c2c` forward the subdomain root and root with query
  to `/sites`. SvelteKit reroutes `/sites`, `/gallery`, and `/gallery/export.csv` internally while keeping clean public URLs. The gallery build base remains `/photography`.
- Old analytics GET/HEAD URLs redirect to this hostname. Old-host analytics writes return 404.
  The report remains public; the hostname is an access-control boundary for a future
  Cloudflare Access policy, not authentication by itself.

## Preflight checks
- `git status` clean
- `npm run check` passes

## Verify after deploy
- `curl -fsSL https://ninochavez.co/photography` returns 200
- `curl -I https://analytics.ninochavez.co/` redirects to the report. The report returns 200,
  while the old gallery analytics URL redirects to the new host.
- Check `/sites` on the analytics subdomain for nonzero page loads,
  a section-specific trend, and a paginated page list. Private share paths must not appear.
- Spot-check an album page loads

## Authority limits
- Supabase migrations via CLI require the project linked + DB password cached (keychain) or
  in 1Password; agent runs `supabase db push --linked` (dry-run first). Login alone is not
  sufficient — it authenticates the Management API, not the Postgres connection.

## Notes
- SvelteKit + adapter-cloudflare, build output `.svelte-kit/cloudflare`
