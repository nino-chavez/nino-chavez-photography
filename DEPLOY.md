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

### Launch recaps: apply order

Migration `20261007120000_analytics_launch_recaps.sql` creates the public recap table (`analytics_launch_recaps`, no owner) and widens the brief
kind for queued recap emails. **Apply it before the deploy that contains the recap code.** Until it is applied the scheduler stores no recap and
logs the missing table, and keeps refreshing everything else, so deploying first is harmless but silent. Rehearsal: `npm run analytics:recap:rehearse`
(synthetic database, rolled back).

Recaps are written for every launch whether or not an owner exists. Email needs an owner with email on, a verified destination and a retention choice,
and the existing `ANALYTICS_INTELLIGENCE_DELIVERY_*` settings; none of them changes with this release.

The 7 launches that predate recaps have no recap to show. After the migration is applied, run `scripts/backfill-launch-recaps.ts --dry-run` and read it,
then with Nino's approval `--write` (see the header of the script). It is idempotent and never sends anything.

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
  the album pages and the photo explorer. Missing or invalid access shows an explicit unavailable state.

## Domains
- ninochavez.co/photography (apex router to Pages)
- analytics.ninochavez.co/ (same Pages project). The proxied
  `analytics` CNAME points to `nino-chavez-photography.pages.dev`, and the hostname is attached
  as a Pages custom domain. The bare root `/` is served by the app as Home. SvelteKit
  reroutes `/`, `/albums`, `/albums/<key>`, `/albums/export.csv`, `/photos`, `/photos/export.csv`,
  `/sites`, `/data`, and `/settings` internally while keeping clean public URLs. The gallery build base
  remains `/photography`. `/gallery` and `/gallery/export.csv` (the retired gallery report) are rerouted
  too, but only so that the old-address redirect runs: SvelteKit answers 404 to any path outside
  `/photography` before `handle`, so without that reroute the redirect would never fire.
- One Cloudflare Page Rule acts on this host: `49cd0626a9c5fe0e70031b988f948c2c` matches
  `analytics.ninochavez.co/?*` (the root with a query string) and forwards it with a 301 to
  `https://analytics.ninochavez.co/photography/analytics/sites?$1` (the internal path, which the app
  then redirects again to `/sites`: two hops). Page Rules run at the edge before the app, so a rule on
  a path the app serves hides that page.
  **The rule becomes redundant once this release deploys.** `src/lib/analytics/old-addresses.ts`
  (`oldRootTarget`) now sends a root address whose query carries something the old site report read
  (`period`, `section`, `page`, `actionsPage`, `view`) to `/sites` with just those parameters, in one
  308; a bare root or any other root query stays on Home. Until the rule is deleted the edge still
  answers first, which is harmless because both end at `/sites`. The app's redirect cannot be seen on
  this host while the rule exists, so the coordinator will ask Nino to delete the rule and then check
  `curl -sI 'https://analytics.ninochavez.co/?period=30'`: it should answer `308` to
  `https://analytics.ninochavez.co/sites?period=30` with `x-frame-options: DENY`. Do not change
  Cloudflare as part of the deploy.
  The bare-root rule `4abee86fac06ab509ec6e74a93c4019e` (`analytics.ninochavez.co/` → the site
  report) was deleted on 2026-10-06 so the root reaches Home. Browsers that followed its 301
  may have cached it; a private window shows the current behaviour.
- Old analytics GET/HEAD URLs redirect to this hostname. Old-host analytics writes return 404.
  The retired gallery report's addresses (`/gallery`, `/gallery/export.csv`, `/photography/analytics`
  and `/photography/analytics/operator[/export.csv]`) redirect once, with a 308, to the page that took
  over (`src/lib/analytics/old-addresses.ts`); a POST to one is a 404.
  The report remains public; the hostname is an access-control boundary for a future
  Cloudflare Access policy, not authentication by itself.

## Preflight checks
- `git status` clean
- `npm run check` passes

## Verify after deploy
- `curl -fsSL https://ninochavez.co/photography` returns 200
- `curl -s https://analytics.ninochavez.co/` returns 200 and a page titled "Home · Photography
  reports", and `curl -I 'https://analytics.ninochavez.co/?period=30'` redirects to the site
  report (that is Page Rule `49cd0626`, so the response has no `x-frame-options`).
- The retired gallery report redirects once. Each of these must answer `308` with this `Location`,
  and the response must carry `x-frame-options: DENY` (it comes from the app, not from a Page Rule):

  | Request (`curl -sI`) | Location |
  | --- | --- |
  | `https://analytics.ninochavez.co/gallery` | `https://analytics.ninochavez.co/` |
  | `https://analytics.ninochavez.co/gallery?section=photos&period=7` | `https://analytics.ninochavez.co/photos?period=7` |
  | `https://analytics.ninochavez.co/gallery?section=measurement&period=7` | `https://analytics.ninochavez.co/data?period=7` |
  | `https://analytics.ninochavez.co/gallery/export.csv?period=7` | `https://analytics.ninochavez.co/photos/export.csv?period=7` |
  | `https://analytics.ninochavez.co/photography/analytics/operator` | `https://analytics.ninochavez.co/` |
  | `https://analytics.ninochavez.co/gallery?section=albums&albums=Re7kho` | `https://analytics.ninochavez.co/albums/Re7kho` |

  Following any of them once must not redirect again. A POST to `/gallery` answers 404.
- Root addresses (only once Page Rule `49cd0626` is deleted; until then the edge answers them with a
  301): `/?period=30` answers `308` to `/sites?period=30`; `/?period=7&section=writing` to
  `/sites?period=7&section=writing`; `/` and `/?x=1` answer 200 (Home) with no redirect.
- `/photos` on the analytics subdomain returns 200 with a page titled "Photos · Photography
  reports", and `/photos/export.csv?period=7` returns 200 with `content-type: text/csv`. Before this
  release both returned a bare 404 with no `x-frame-options` (checked 2026-10-07).
- `/data` and `/settings` on the analytics subdomain return 200. Page Rule `49cd0626` matches only
  `analytics.ninochavez.co/?*`, so neither path is caught (checked 2026-10-06 through the API; both
  returned the app's own 404 before this release, not a 301).
- `/albums` and `/albums/<key>` on the analytics subdomain return 200; an unlisted or unknown
  album key returns 404.
- Check `/sites` on the analytics subdomain for nonzero page loads,
  a section-specific trend, and a paginated page list. Private share paths must not appear.
- Spot-check an album page loads

## Authority limits
- Supabase migrations via CLI require the project linked + DB password cached (keychain) or
  in 1Password; agent runs `supabase db push --linked` (dry-run first). Login alone is not
  sufficient — it authenticates the Management API, not the Postgres connection.

## Notes
- SvelteKit + adapter-cloudflare, build output `.svelte-kit/cloudflare`
