# Nino Chavez Gallery
> Photography portfolio with ~20K volleyball action sports photos

**Stack:** SvelteKit 2.x + Svelte 5 + Tailwind CSS 4 + Supabase (Postgres + Auth)
**Deploy:** Cloudflare Pages (git integration, no GitHub Actions) + Cloudflare Worker (album-zip) + R2 + Cloudflare Images
**Adapter:** `@sveltejs/adapter-cloudflare` — `adapter-vercel` not installed
**Type:** Photography Portfolio (Volleyball Action Sports)
**Scale:** ~20K photos | Production at photography.ninochavez.co

> **Note:** `vercel.json` and `.vercel/` are stale leftovers from the pre-migration period (see commit `39485b2`). Cloudflare Pages is the live deploy. Do not re-introduce Vercel-specific config.

## Brand artwork

Create and revise Nino Chavez logos, watermarks, apparel and reusable brand graphics
in the private `nino-chavez/brand-assets` repository (`tools/brand-assets` under the
workspace root). Read its `AGENTS.md` before creating assets; it owns naming,
versioning and cleanup. If the checkout is missing, obtain it before design work.
This repo owns gallery code and deployed copies of selected exports. Record the
library's export path/version when updating a copy. Photo ingest and original media
stay in their existing workflow.

## Data-model invariants — read before touching the data model or AI pipeline
The data model and AI ingest were rebuilt to the north-star contract in
`.agent-os/specs/vision-extraction-identity-vnext/NORTH-STAR-REDESIGN.md` (the #10 ingest
cutover, 2026-06). These are standing invariants, not an in-flight migration:
Core rule: **sport/event/team/date are KNOWN facts set at the album level — never guessed
per photo.** `albums.sport` is the sport authority; a trigger forces
`photo_metadata.sport_type` to mirror it. Enums come from `src/lib/ai/taxonomy.ts` (single
source; `npm run check` runs the drift guard).
**No-cruft principle (operator directive):** the committed system must read as if this design
was always there — no transitional/legacy artifacts survive a commit. Remaining deprecations
(e.g. the merge-gated `players[]` JSONB drop) are tracked to removal in
`.agent-os/specs/vision-extraction-identity-vnext/DEPRECATED.md`. If you find a
deprecated/legacy path still live, REMOVE it per the ledger — never revive it.

## Non-Obvious Rules

These cannot be inferred from code -- follow them strictly:

- **Supabase clients — three, and only one is privileged.** `supabaseServer` (`$lib/supabase/server`) is the gallery read client and uses the **ANON key**, not service_role: it is RLS-gated like any visitor, and its own comment says so. This file claimed service_role until 2026-07-30, which is the dangerous direction to be wrong in — an agent trusting it would assume RLS was already bypassed.
  - `supabaseServer` — anon, RLS-gated. Server load functions and API routes.
  - `matviewClient()` / `createSupabaseAdminClient()` — **service_role**, bypasses RLS. Required for materialized views (anon is REVOKE'd) and privileged writes. Anything read through these MUST apply `excludeUnlisted()` by hand.
  - `$lib/supabase/client` — browser anon client. Currently imported by **nothing**; every Supabase read in this app is server-side. Check before adding a browser read that a server load function isn't the right seam.
- **No self-fetch:** Use server load functions directly -- never `fetch('/api/...')` from server files.
- **Filter null sharpness:** Always exclude `sharpness = null` rows (unprocessed photos).
- **MOTION tokens:** Use `$lib/motion-tokens.ts` presets for all svelte-motion animations, not inline values.
- **Class-based stores:** Stores in `src/lib/stores/` use Svelte 5 runes inside classes (see `preferences.svelte.ts`).
- **Event handling:** Use `event.stopPropagation()` for nested interactive elements. Svelte 5 syntax: `onclick={handler}` not `on:click={handler}`.
- **Temp files:** Output reports/audits/logs to `.temp/` (git-ignored), never to `src/` or project root.

## Reader-facing text and generated captions

Read [`reader-contract.json`](reader-contract.json) before changing interface copy or AI enrichment prompts. Gallery copy should help a visitor find and act on a photo without exposing the search implementation. Search captions are factual retrieval metadata: one short sentence about visible numbers, colors, action, and scene; never aesthetic filler, guessed identity, or uncertain detection stated as fact. Verify interface copy in the built page and generated captions as actual model output.

**Any edit under `src/routes` or `src/lib/components` fails the production build until a new review receipt is recorded.** `npm run build` ends with `reader:check:gallery`. That check hashes the interface source and compares it with `docs/reader-audits/gallery-interface.json`. `npm run check` does not run it. Walk the changed screens, then record the receipt in the same PR with `node tools/lib/encounter-audit.mjs --root=. --record-manual="gallery interface" --reviewed-by=... --method=... --scope="a|b"`. Run the full `npm run build` before merging. In the method text, say who reviewed and what the walk did not cover. This failed twice on 2026-10-05: #181, fixed by #183, and #184, fixed by #185. Each time the merged change sat undeployed until the receipt PR merged.

## Off-Limits (Explicit Approval Required)

- `.env*` files
- `database/` directory (SQL migrations)
- `svelte.config.js`

## Boundaries
- `database/` - SQL migrations (human review required)
- `.env*` - Environment configuration (never commit)
- `svelte.config.js` - Build config (explicit approval)

## Environment Variables

**Browser-safe (VITE_ prefix):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
**Server-only:** `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)

## Reference Guides

Consult before implementing common patterns -- these are tested, proven approaches:

- `.agent-os/guides/supabase-integration.md` -- query patterns, error handling
- `.agent-os/guides/typescript-patterns.md` -- project-specific TS and Svelte 5 patterns
- `.agent-os/guides/embeddings-similarity-search.md` -- pgvector, semantic search

## Coding Standards

- `docs/CODING_STANDARDS.md` -- TypeScript, Svelte 5, styling, accessibility
- `docs/EVENT_HANDLING.md` -- event propagation (critical for nested interactives)
- `docs/COMPONENT_PATTERNS.md` -- reusable component templates

## Docs Index

### Framework
- [SvelteKit](https://svelte.dev/docs/kit): Routing, load functions, SSR
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/reactivity): $state, $derived, $effect, $props

### Data
- [Supabase JS](https://supabase.com/docs/reference/javascript): @supabase/supabase-js v2
- [pgvector](https://github.com/pgvector/pgvector): Vector similarity search for photo recommendations

### Styling
- [Tailwind CSS 4](https://tailwindcss.com/docs): Utility classes
- [svelte-motion](https://github.com/micha-lmxt/svelte-motion): Animation library

## Project Index

### Entry Points
- `src/routes/+layout.svelte`: App shell with navigation
- `src/routes/+layout.server.ts`: Root data loading with caching
- `src/routes/explore/+page.server.ts`: Main gallery with filtering
- `src/lib/supabase/server.ts`: Server-side Supabase client
- `src/lib/supabase/client.ts`: Browser Supabase client (no importers today)

### Key Directories
- `src/lib/components/gallery/`: PhotoGrid, PhotoCard, Lightbox
- `src/lib/components/filters/`: SportFilter, CategoryFilter
- `src/lib/stores/`: preferences.svelte.ts, favorites.svelte.ts
- `src/lib/motion-tokens.ts`: Animation presets (MOTION.spring.*)

### Guides (Read Before Implementing)
- `.agent-os/guides/supabase-integration.md`: Query patterns
- `.agent-os/guides/embeddings-similarity-search.md`: pgvector usage

## Quick Commands
```bash
npm run check && npm run build   # Verify before commit
npm run dev                      # Development server
npm test                         # Playwright E2E tests
```

## Stack Notes
- Use `$lib/supabase/server` in +page.server.ts — ANON key, RLS-gated (NOT service_role)
- `matviewClient()` / `createSupabaseAdminClient()` are the service_role clients; they bypass RLS, so apply `excludeUnlisted()` by hand
- `$lib/supabase/client` is the browser anon client and currently has no importers
- NO self-fetch pattern - use server load functions directly
- Filter out `sharpness = null` for unprocessed photos
- MOTION tokens from `$lib/motion-tokens.ts` for animations

## Album Management Pipeline
- `ENRICHMENT_WORKFLOW.md` - One-command album ingest (`npm run ingest:album`, direct-to-DB; the legacy enrich→sync→EXIF chain was removed in the #10 cutover)
- `scripts/ALBUM_NORMALIZATION_README.md` - Canonical naming and drift analysis
- `.agent-os/implementation/ALBUM_NORMALIZATION_WORKFLOW.md` - Naming standard format
- `.agent-os/implementation/ENRICHMENT_PIPELINE_INTEGRATION.md` - Naming integration

### Album ingest secrets
- Read runtime tokens from 1Password before ingest; do not trust a cached `.env.local` token over the vault.
- `OPENROUTER_API_KEY` → `op://Developer Secrets/OpenRouter photography/credential`
- `CF_ACCOUNT_ID` → `op://Developer Secrets/Cloudflare photography/account_id`
- `CF_IMAGES_API_TOKEN` → `op://Developer Secrets/Cloudflare photography/images_api_token`
- If an item read fails, inspect field labels first. Do not assume every item uses `credential`.

### Serving a build under wrangler
- Start `wrangler pages dev` with `node scripts/wrangler-pages-dev.mjs <cwd> [pages dev args]`. It writes `.env.local` to a 0600 `.dev.vars` in `<cwd>` (found from a linked worktree too) and removes it on exit.
- Never pass a secret as `--binding KEY=value`: argv is printed by `ps` and `pgrep -fl`, and two sessions leaked this project's credentials into transcripts that way on 2026-10-07. The launcher refuses that form.

## Database
- Primary table: `photo_metadata` (~20K rows)
- Key columns: photo_id, sport_type, quality_score, cf_image_id
- See `database/performance-indexes.sql` for index documentation

## Browser automation: use browse-tool, not MCP

This project previously used Playwright/Chrome DevTools MCP for interactive browser work. Prefer the Bash-based `browse-tool` CLI instead — it is on PATH when Claude Code or Codex is launched from the `cl` alias or a shell that sources `~/.zshrc`.

Full command list and usage: `/Users/nino/Workspace/dev/tools/browse-tool/README.md` (use `@README.md` after `/add-dir`) — read it fresh rather than recalling commands from memory; it changes as commands are added.

`npx playwright test` is still the right tool for running the e2e test suite — browse-tool is for ad-hoc interactive inspection and debugging, not replacing the test runner.
