# Deploy — photography (nino-chavez-gallery-v3)

## Host
- **Platform**: Cloudflare Pages
- **Project name**: `nino-chavez-photography`
- **Production URL**: https://photography.ninochavez.co
- **Preview URL pattern**: TODO

## Deploy trigger
- **Canonical**: TODO — verify whether git-integrated OR wrangler-only. rally-hq turned out to be wrangler-only despite similar config; check before assuming.
- **Manual fallback**: `npm run build && wrangler pages deploy .svelte-kit/cloudflare --project-name=nino-chavez-photography`
- **Build time**: TODO

## Database
- **Provider**: Supabase
- **Migrations live in**: `supabase/migrations/` (12 files)
- **Apply via**: Supabase dashboard SQL Editor (canonical) OR `supabase db push` if logged in
- **Agent can run migrations?**: NO

## Companion Worker
- `cloudflare-worker/album-zip/` — separate Worker for ZIP downloads. Deploy with `npm run worker:deploy`.

## Environment variables
- **Where they live**: Cloudflare Pages dashboard (Supabase keys, etc.)
- **Required for deploy**: TODO

## Domains
- photography.ninochavez.co

## Preflight checks
- `git status` clean
- `npm run check` passes

## Verify after deploy
- `curl -fsSL https://photography.ninochavez.co` returns 200
- Spot-check an album page loads

## Authority limits
- Cannot apply Supabase migrations via CLI without login

## Notes
- SvelteKit + adapter-cloudflare, build output `.svelte-kit/cloudflare`
