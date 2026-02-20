# Nino Chavez Gallery
> Photography portfolio with ~20K volleyball action sports photos

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
- `src/lib/supabase/client.ts`: Browser Supabase client

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

## Boundaries
- `database/` - SQL migrations (human review required)
- `.env*` - Environment configuration (never commit)
- `svelte.config.js` - Build config (explicit approval)

## Stack Notes
- Use `$lib/supabase/server` in +page.server.ts (service_role key)
- Use `$lib/supabase/client` in components (anon key)
- NO self-fetch pattern - use server load functions directly
- Filter out `sharpness = null` for unprocessed photos
- MOTION tokens from `$lib/motion-tokens.ts` for animations

## Database
- Primary table: `photo_metadata` (~20K rows)
- Key columns: photo_id, sport_type, quality_score, cf_image_id
- See `database/performance-indexes.sql` for index documentation
