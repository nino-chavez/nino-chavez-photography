# Nino Chavez Gallery - Development Guidelines

**Stack:** SvelteKit 2.x + Svelte 5 + Tailwind CSS 4 + Supabase (Postgres + Auth)
**Deploy:** Cloudflare Pages (git integration, no GitHub Actions) + Cloudflare Worker (album-zip) + R2 + Cloudflare Images
**Adapter:** `@sveltejs/adapter-cloudflare` — `adapter-vercel` not installed
**Type:** Photography Portfolio (Volleyball Action Sports)
**Scale:** ~20K photos | Production at photography.ninochavez.co

> **Note:** `vercel.json` and `.vercel/` are stale leftovers from the pre-migration period (see commit `39485b2`). Cloudflare Pages is the live deploy. Do not re-introduce Vercel-specific config.

## Non-Obvious Rules

These cannot be inferred from code -- follow them strictly:

- **Supabase client split:** Use `$lib/supabase/server` in `+page.server.ts` (service_role key). Use `$lib/supabase/client` in components (anon key). Never mix them.
- **No self-fetch:** Use server load functions directly -- never `fetch('/api/...')` from server files.
- **Filter null sharpness:** Always exclude `sharpness = null` rows (unprocessed photos).
- **MOTION tokens:** Use `$lib/motion-tokens.ts` presets for all svelte-motion animations, not inline values.
- **Class-based stores:** Stores in `src/lib/stores/` use Svelte 5 runes inside classes (see `preferences.svelte.ts`).
- **Event handling:** Use `event.stopPropagation()` for nested interactive elements. Svelte 5 syntax: `onclick={handler}` not `on:click={handler}`.
- **Temp files:** Output reports/audits/logs to `.temp/` (git-ignored), never to `src/` or project root.

## Reader-facing text and generated captions

Read [`reader-contract.json`](reader-contract.json) before changing interface copy or AI enrichment prompts. Gallery copy should help a visitor find and act on a photo without exposing the search implementation. Search captions are factual retrieval metadata: one short sentence about visible numbers, colors, action, and scene; never aesthetic filler, guessed identity, or uncertain detection stated as fact. Verify interface copy in the built page and generated captions as actual model output.

## Off-Limits (Explicit Approval Required)

- `.env*` files
- `database/` directory (SQL migrations)
- `svelte.config.js`

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

## See Also

- `AGENTS.md` -- entry points, key directories, doc links, build commands

## Browser automation: use browse-tool, not MCP

This project previously used Playwright/Chrome DevTools MCP for interactive browser work. Prefer the Bash-based `browse-tool` CLI instead — it is on PATH when Claude Code is launched from the `cl` alias or a shell that sources `~/.zshrc`.

Full command list and usage: `/Users/nino/Workspace/dev/tools/browse-tool/README.md` (use `@README.md` after `/add-dir`) — read it fresh rather than recalling commands from memory; it changes as commands are added.

`npx playwright test` is still the right tool for running the e2e test suite — browse-tool is for ad-hoc interactive inspection and debugging, not replacing the test runner.
