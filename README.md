# Nino Chavez Gallery

<img src="static/images/hero/hero-1-desktop.webp" alt="Black-and-white courtside candid: two volleyball players embrace, a blurred gym court behind them." width="100%">

**MOTION. EMOTION. Frame by Frame.**

A high-performance photography portfolio for professional volleyball action-sports work, built to scale to ~20,000 AI-enriched photos.

**Live:** [photography.ninochavez.co](https://photography.ninochavez.co)

## Features

- **Gallery & discovery** — grid gallery with filtering (sport, category, quality), timeline view, album and collection browsing, a keyboard-navigable lightbox, autocomplete search, and a localStorage favorites system.
- **AI photo enrichment** — every photo is auto-tagged by Google Gemini (`@ai-sdk/google`): sport type, category, emotion, action intensity, and a quality score that drives portfolio-worthy sorting. EXIF is read with `exif-reader`; resizing and transforms via `sharp` and Cloudflare Images.
- **SmugMug ingest** — albums are imported from SmugMug over OAuth 1.0a (`npm run ingest:album`), then enriched and indexed.
- **Album ZIP downloads** — a dedicated Cloudflare Worker (`cloudflare-worker/album-zip`) streams multi-photo ZIPs.
- **Dynamic share cards** — per-route Open Graph images rendered at the edge with `@cf-wasm/og` (charcoal + gold, hero photo + wordmark).
- **Performance-first** — SvelteKit SSR, comprehensive Postgres indexing, lazy-loaded images, and in-memory caching for expensive queries; Lighthouse target >90.
- **Accessible & responsive** — mobile-first Tailwind, dark mode, WCAG 2.1 AA components, with automated axe audits in the E2E suite.

## Tech stack

- **Frontend** — SvelteKit 2 (SSR) · Svelte 5 (runes) · Tailwind CSS 4 · Lucide
- **Data** — Supabase (Postgres + Storage) · `@tanstack/svelte-query`
- **AI & imaging** — Google Gemini (`@ai-sdk/google`) · `exif-reader` · `sharp` · Cloudflare Images
- **Platform** — Cloudflare Pages (`@sveltejs/adapter-cloudflare`) · Cloudflare Workers · R2
- **Tooling** — TypeScript (strict) · Vite · Playwright (E2E + accessibility)

## Project structure

```
src/
├── lib/
│   ├── components/     # UI: filters/, gallery/, layout/, ui/
│   ├── stores/         # Svelte 5 class-based stores (runes)
│   ├── supabase/       # server (service_role) + client (anon) split
│   ├── server/         # edge helpers, incl. OG card rendering
│   └── motion-tokens.ts
├── routes/             # albums/ collections/ explore/ favorites/ photo/[id]/ timeline/
└── types/
cloudflare-worker/album-zip/   # companion Worker for ZIP downloads
database/                      # SQL scripts and indexes
supabase/migrations/           # timestamped migrations
scripts/                       # ingest, taxonomy, utilities
docs/                          # technical documentation
```

## Getting started

### Prerequisites

- Node.js 20+
- npm
- A Supabase project ([free tier](https://supabase.com))

### Setup

```bash
git clone https://github.com/nino-chavez/nino-chavez-photography.git
cd nino-chavez-photography
npm install
cp .env.example .env.local     # then fill in your Supabase keys
npm run dev                     # http://localhost:5173
```

Environment variables live in `.env.local` locally and in the Cloudflare Pages dashboard in production. See `.env.example` for the full list; the essentials:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service-role key for server load functions (bypasses RLS) |
| `VITE_BASE_PATH` | No | Base path for reverse-proxy deployment |

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server |
| `npm run check` | `svelte-check` + taxonomy check — run before commits |
| `npm run build` | Production build (output `.svelte-kit/cloudflare`) |
| `npm run preview` | Preview the production build locally |
| `npm test` | Playwright E2E (includes axe accessibility audits) |
| `npm run ingest:album` | Import and enrich a SmugMug album |
| `npm run worker:deploy` | Deploy the `album-zip` Worker |

## Database

A single primary table, `photo_metadata`, with comprehensive indexing for filter and sort performance.

- **Identity / URLs** — `photo_id` (PK), `image_key`, `ImageUrl`, `ThumbnailUrl`, `OriginalUrl`
- **AI-derived facets** — `sport_type`, `photo_category`, `emotion`, `action_intensity`, `quality_score`, `portfolio_worthy`, `sharpness`
- **Dates** — `upload_date`, `photo_date`, `enriched_at`

Migrations live in `supabase/migrations/`; see `database/performance-indexes.sql` for the covering indexes.

> Unprocessed photos have `sharpness = null` — always exclude them in queries.

## Deployment

Deployed to **Cloudflare Pages** via `@sveltejs/adapter-cloudflare` (build output `.svelte-kit/cloudflare`); no GitHub Actions. The `album-zip` companion Worker deploys separately with `npm run worker:deploy`, and production environment variables are set in the Cloudflare Pages dashboard.

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
