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

## Domains
- ninochavez.co/photography (apex router to Pages)
- analytics.ninochavez.co/photography/analytics/operator (same Pages project). The proxied
  `analytics` CNAME points to `nino-chavez-photography.pages.dev`, and the hostname is attached
  as a Pages custom domain. Cloudflare Page Rule `4abee86fac06ab509ec6e74a93c4019e` forwards
  the subdomain root to the report because SvelteKit is built with the `/photography` base path.
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
- Spot-check an album page loads

## Authority limits
- Supabase migrations via CLI require the project linked + DB password cached (keychain) or
  in 1Password; agent runs `supabase db push --linked` (dry-run first). Login alone is not
  sufficient — it authenticates the Management API, not the Postgres connection.

## Notes
- SvelteKit + adapter-cloudflare, build output `.svelte-kit/cloudflare`
