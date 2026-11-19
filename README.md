# Nino Chavez Gallery

<img src="static/images/hero/hero-1-desktop.webp" alt="Black-and-white courtside candid: two volleyball players embrace, a blurred gym court behind them." width="100%">

**MOTION. EMOTION. Frame by Frame.**

A high-performance photography portfolio for professional volleyball action-sports work, built to scale to ~20,000 AI-enriched photos.

**Live:** [photography.ninochavez.co](https://photography.ninochavez.co)

## Features

- **Gallery & discovery** — grid gallery with filtering (sport, category, quality), timeline view, album and collection browsing, a keyboard-navigable lightbox, autocomplete search, and a localStorage favorites system.
- **AI photo enrichment** — `npm run ingest:album` walks a local photo directory. Per photo: upload to Cloudflare Images, one structured vision pass (`google/gemini-2.5-flash-lite` via OpenRouter — caption, category, quality sub-scores, jersey/color sightings), embed the caption, then write `photo_metadata` + `photo_jersey_sightings`. Sport is set once per album, never guessed per photo. EXIF comes from `exif-reader`. No SmugMug or OAuth round-trip — see `ENRICHMENT_WORKFLOW.md`.
- **Album ZIP downloads** — a dedicated Cloudflare Worker (`cloudflare-worker/album-zip`) streams multi-photo ZIPs.
- **Dynamic share cards** — per-route Open Graph images rendered at the edge with `@cf-wasm/og` (charcoal + gold, hero photo + wordmark).
- **Performance-first** — SvelteKit SSR, comprehensive Postgres indexing, lazy-loaded images, and in-memory caching for expensive queries; Lighthouse target >90.
- **Accessible & responsive** — mobile-first Tailwind, dark mode, WCAG 2.1 AA components, with automated axe audits in the E2E suite.

## Tech stack

- **Frontend** — SvelteKit 2 (SSR) · Svelte 5 (runes) · Tailwind CSS 4 · Lucide
- **Data** — Supabase (Postgres + Storage) · `@tanstack/svelte-query`
- **AI & imaging** — `google/gemini-2.5-flash-lite` via OpenRouter (structured vision extraction) · `exif-reader` · `sharp` · Cloudflare Images
- **Platform** — Cloudflare Pages (`@sveltejs/adapter-cloudflare`) · Cloudflare Workers · R2
- **Tooling** — TypeScript (strict) · Vite · Playwright (E2E + accessibility)

## Project structure

```
src/
├── lib/
│   ├── components/     # UI: filters/, gallery/, layout/, ui/
│   ├── stores/         # Svelte 5 class-based stores (runes)
│   ├── supabase/       # server load (anon, RLS-gated) + browser client (anon) + service_role admin factory
│   ├── server/         # edge helpers, incl. OG card rendering
│   └── motion-tokens.ts
├── routes/             # albums/ collections/ explore/ favorites/ photo/[id]/ timeline/
└── types/
cloudflare-worker/             # album-zip (ZIP downloads), analytics-intelligence, analytics-relay
database/                      # SQL scripts and indexes
supabase/schema.sql            # the whole database structure, no rows (see Database)
supabase/migrations/           # timestamped migrations
scripts/                       # ingest, taxonomy, utilities
docs/                          # technical documentation
```

## Getting started

### Prerequisites

- Node.js 22.22.0 or newer (`.nvmrc` pins 22.22.0, the version Cloudflare Pages builds with)
- npm
- A Supabase project ([free tier](https://supabase.com)), and the [Supabase CLI](https://supabase.com/docs/guides/cli) to record its migration history

### Setup

```bash
git clone https://github.com/nino-chavez/nino-chavez-photography.git
cd nino-chavez-photography
npm install
cp .env.example .env.local     # then fill in your Supabase keys
npm run dev                     # http://localhost:5173
```

A new Supabase project starts empty. Build its database from `supabase/schema.sql` first (see [Database](#database)).

Environment variables live in `.env.local` locally and in the Cloudflare Pages dashboard in production. See `.env.example` for the full list; the essentials:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service-role key for ingest scripts and admin/matview reads (bypasses RLS). NOT used by ordinary server load functions, which read as anon (RLS-gated) — see `CLAUDE.md`. |
| `VITE_BASE_PATH` | No | Base path for reverse-proxy deployment |

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server |
| `npm run check` | `svelte-check` + taxonomy check — run before commits |
| `npm run build` | Production build (output `.svelte-kit/cloudflare`) |
| `npm run preview` | Preview the production build locally |
| `npm test` | Playwright E2E (includes axe accessibility audits) |
| `npm run ingest:album` | Ingest a local photo directory (upload, extract, embed, write) |
| `npm run worker:deploy` | Deploy the `album-zip` Worker |

## Database

A single primary table, `photo_metadata`, with comprehensive indexing for filter and sort performance.

- **Identity / URLs** — `photo_id` (PK), `image_key`, `ImageUrl`, `ThumbnailUrl`, `OriginalUrl`
- **AI-derived facets** — `sport_type` (mirrors `albums.sport`), `photo_category`, `play_type`, `quality_score` (generated from `sharpness`/`composition_score`/`exposure_accuracy`/`emotional_impact`)
- **Dates** — `upload_date`, `photo_date`, `enriched_at`

`supabase/schema.sql` holds the whole structure with no rows: extensions, the `public` and `analytics_private` schemas, and the scheduled jobs. It is current to the newest file in `supabase/migrations/`. The migrations alone cannot build the database, because the first of them changes tables that existed before the folder did.

To build a new Supabase project:

1. Apply the file with `psql "<the new project's connection string>" -f supabase/schema.sql`, or paste it into the project's SQL editor.
2. Record the existing migrations as applied in that project, so `supabase db push` sends only later ones. Do this in a separate clone, because `supabase link` replaces the checkout's existing link: `supabase link --project-ref <new project ref>`, then `supabase migration repair --status applied $(ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1)`.
3. Add albums with `npm run ingest:album` ([ENRICHMENT_WORKFLOW.md](./ENRICHMENT_WORKFLOW.md)). Photos, albums and analytics rows are not in the file; neither are Auth settings or the Pages environment.

After a migration reaches production, run `npm run db:schema` and commit the new `supabase/schema.sql` in the same PR (DEPLOY.md, "Database"). See `database/performance-indexes.sql` for the covering indexes.

> Unprocessed photos have `sharpness = null` — always exclude them in queries.

## Deployment

The app deploys to **Cloudflare Pages** via `@sveltejs/adapter-cloudflare` (build output `.svelte-kit/cloudflare`) through Pages git integration: a push to `main` deploys it. Production environment variables are set in the Cloudflare Pages dashboard. Three Workers deploy separately:

| Worker | What it does | How it deploys |
|---|---|---|
| `cloudflare-worker/album-zip` | Builds album ZIP downloads at `zip.ninochavez.co` | By hand, `npm run worker:deploy` |
| `cloudflare-worker/analytics-intelligence` | Every minute, asks the app to run queued report jobs | GitHub Actions, on a push to `main` that changes its folder (`.github/workflows/deploy-analytics-intelligence.yml`) |
| `cloudflare-worker/analytics-relay` | Every five minutes, asks the app to send queued PostHog exports | GitHub Actions, on a push to `main` that changes its folder (`.github/workflows/deploy-analytics-relay.yml`) |

See **[DEPLOY.md](./DEPLOY.md)** for the canonical deploy procedure, Supabase migration steps, and preflight checks.

## Performance targets

- Lighthouse > 90
- First Contentful Paint < 1.5s · Largest Contentful Paint < 2.5s · Time to Interactive < 3.5s

## Coding standards & docs

Strict TypeScript (no `any`), Svelte 5 runes (`$state`/`$derived`/`$effect`/`$props`), and WCAG 2.1 AA. Project references:

- [docs/CODING_STANDARDS.md](./docs/CODING_STANDARDS.md) · [docs/EVENT_HANDLING.md](./docs/EVENT_HANDLING.md) · [docs/COMPONENT_PATTERNS.md](./docs/COMPONENT_PATTERNS.md)
- [CLAUDE.md](./CLAUDE.md) · [AGENTS.md](./AGENTS.md) · [DEPLOY.md](./DEPLOY.md)

## Architecture notes

- **SvelteKit over Next.js/React** — smaller bundles, faster hydration, runes reactivity, strong TypeScript integration. React remains only for edge OG-card rendering via Satori.
- **Supabase** — Postgres with first-class tooling, storage with image transforms, and headroom for RLS and realtime.
- **Cloudflare** — Pages, Workers, R2, and Images keep delivery, ZIP streaming, and edge OG generation on one platform.

## License

Private and proprietary. All rights reserved.

## Contact

**Nino Chavez** — [photography.ninochavez.co](https://photography.ninochavez.co) · [@nino-chavez](https://github.com/nino-chavez)
