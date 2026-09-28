# Deploy — photography (nino-chavez-gallery-v3)

## Host
- **Platform**: Cloudflare Pages
- **Project name**: `nino-chavez-photography`
- **Production URL**: https://photography.ninochavez.co
- **Preview URL pattern**: TODO

## Deploy trigger
- **Canonical**: Cloudflare Pages is Git-integrated on this repo. A merge (or push) to
  `main` starts a Pages build and, on success, deploys production. There is no GitHub
  Actions deploy workflow for the site.
- **Local preflight** (does not deploy): `npm run check && npm run build`
- **Build time**: confirm in the CF Pages dashboard for a given deployment

## When a merge is not live yet
Do **not** assume the Git integration is broken and jump to a manual Wrangler deploy.

1. **Check the Cloudflare Pages build first** — on the merge commit, look for the
   GitHub check named `Cloudflare Pages`, or open the matching deployment in the
   Pages dashboard (`nino-chavez-photography`).
2. If the check/build **failed**, read those hosted logs and fix the failure (or Retry
   after a platform flake). A green local `npm run build` does **not** clear a failed
   Pages build; production stays on the last successful deployment until Pages succeeds.
3. If the check/build is still **running**, wait for it.
4. If the check/build **succeeded** but production still looks old, then investigate
   caching / which deployment is marked Production — not a parallel deploy path.

## Manual Wrangler (operator escape hatch only)
Use only when Git-integrated Pages cannot run (broken integration, emergency hotfix
with explicit operator intent) — never as the default response to “merge isn’t live”:

```bash
npm run build && wrangler pages deploy .svelte-kit/cloudflare --project-name=nino-chavez-photography
```

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

## Domains
- photography.ninochavez.co

## Preflight checks
- `git status` clean
- `npm run check && npm run build`

## Verify after deploy
- GitHub check `Cloudflare Pages` on the merge commit is **success**
- `curl -fsSL https://photography.ninochavez.co` returns 200
- Spot-check an album page loads

## Authority limits
- Supabase migrations via CLI require the project linked + DB password cached (keychain) or
  in 1Password; agent runs `supabase db push --linked` (dry-run first). Login alone is not
  sufficient — it authenticates the Management API, not the Postgres connection.

## Notes
- SvelteKit + adapter-cloudflare, build output `.svelte-kit/cloudflare`
