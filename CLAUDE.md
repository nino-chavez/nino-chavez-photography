# Nino Chavez Gallery - Development Guidelines

**Stack:** SvelteKit 2.x + Svelte 5 + Tailwind CSS 4 + Supabase
**Type:** Photography Portfolio (Volleyball Action Sports)
**Scale:** ~20K photos | Production on Vercel at photography.ninochavez.co

## Non-Obvious Rules

These cannot be inferred from code -- follow them strictly:

- **Supabase client split:** Use `$lib/supabase/server` in `+page.server.ts` (service_role key). Use `$lib/supabase/client` in components (anon key). Never mix them.
- **No self-fetch:** Use server load functions directly -- never `fetch('/api/...')` from server files.
- **Filter null sharpness:** Always exclude `sharpness = null` rows (unprocessed photos).
- **MOTION tokens:** Use `$lib/motion-tokens.ts` presets for all svelte-motion animations, not inline values.
- **Class-based stores:** Stores in `src/lib/stores/` use Svelte 5 runes inside classes (see `preferences.svelte.ts`).
- **Event handling:** Use `event.stopPropagation()` for nested interactive elements. Svelte 5 syntax: `onclick={handler}` not `on:click={handler}`.
- **Temp files:** Output reports/audits/logs to `.temp/` (git-ignored), never to `src/` or project root.

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
