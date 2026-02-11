# Nino Chavez Gallery - Coding Standards

**Version:** 2.0.0
**Last Updated:** 2025-10-28
**Stack:** SvelteKit 2.x + Svelte 5 + TypeScript + Tailwind CSS 4

> **For generic patterns, see shared indices:**
> - `.shared/agents-indices/sveltekit-svelte5.md` - Svelte 5 runes, SvelteKit patterns
> - `.shared/agents-indices/supabase.md` - Supabase client patterns
> - `.shared/agents-indices/typescript-patterns.md` - TypeScript conventions
> - `.shared/agents-indices/tailwind4.md` - Tailwind CSS utilities

This document covers **gallery-specific** coding standards.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Navigation and Prefetch Patterns](#navigation-and-prefetch-patterns)
- [Performance Optimization](#performance-optimization)
- [Gallery-Specific Patterns](#gallery-specific-patterns)

---

## Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── filters/          # Filter components
│   │   ├── gallery/          # Photo grid, cards, lightbox
│   │   ├── layout/           # Header, Footer
│   │   ├── photo/            # Photo-specific components
│   │   ├── search/           # Search components
│   │   ├── social/           # Social sharing
│   │   └── ui/               # Reusable UI primitives
│   ├── stores/
│   │   └── *.svelte.ts       # Class-based stores with runes
│   ├── supabase/
│   │   ├── client.ts         # Browser client
│   │   └── server.ts         # Server client
│   ├── utils/
│   │   ├── event-handlers.ts # Event handling utilities
│   │   ├── gestures.ts       # Touch gesture utilities
│   │   └── *.ts              # Other utilities
│   ├── motion-tokens.ts      # Animation presets
│   └── utils.ts              # General utilities
├── routes/
│   └── [route]/
│       ├── +page.svelte      # Page component
│       ├── +page.server.ts   # Server load function
│       └── +page.ts          # Client load function (rare)
└── types/
    └── *.ts                  # Type definitions
```

### File Naming

- Components: `PascalCase.svelte` (e.g., `PhotoCard.svelte`)
- Utilities: `kebab-case.ts` (e.g., `event-handlers.ts`)
- Types: `kebab-case.ts` (e.g., `photo.ts`)
- Routes: `kebab-case` (e.g., `photo/[id]/+page.svelte`)

---

## Navigation and Prefetch Patterns

**CRITICAL:** Always use `<a>` tags for navigation, never `<button>` with `goto()`.

### Why Anchor Tags Matter

SvelteKit's prefetch only works on `<a>` tags. Using buttons prevents:
- Route preloading (adds 1-2 second delay)
- SEO benefits (search engines can't crawl buttons)
- Keyboard navigation (tab key doesn't focus buttons-as-links)
- Right-click "Open in new tab"

### Prefetch Strategies

**Use `data-sveltekit-preload="tap"` for navigation headers:**
- Preloads on touchstart (mobile) or mousedown (desktop)
- Best for frequently accessed routes
- Used in: Main navigation, primary CTAs

```svelte
<!-- Main navigation with tap prefetch -->
<nav>
  <a href="/explore" data-sveltekit-preload="tap">
    Explore
  </a>
</nav>
```

**Use `data-sveltekit-preload="hover"` for secondary links:**
- Preloads when user hovers (200-500ms before click)
- Good balance of performance and bandwidth
- Used in: Album cards, collection cards, footer links

```svelte
<!-- Album card with hover prefetch -->
<a
  href="/albums/{album.albumKey}"
  data-sveltekit-preload="hover"
  class="album-card"
>
  {album.name}
</a>
```

**Use `data-sveltekit-preload="viewport"` for high-priority visible links:**
- Preloads as soon as link enters viewport
- Most aggressive, uses more bandwidth
- Used in: Homepage hero CTA, featured content

```svelte
<!-- Hero CTA with viewport prefetch -->
<a
  href="/explore"
  data-sveltekit-preload="viewport"
  class="cta-button"
>
  Browse Gallery
</a>
```

### When NOT to Prefetch

**Disable prefetch for:**
- External links (SmugMug, social media)
- Links with side effects (logout, delete actions)
- Low-priority links (legal pages, help docs)

```svelte
<!-- External link - no prefetch -->
<a
  href="https://smugmug.com/..."
  data-sveltekit-reload
  target="_blank"
>
  View on SmugMug
</a>

<!-- Photo detail - prefetch data causes layout shift -->
<a
  href="/photo/{id}"
  data-sveltekit-preload-data="false"
>
  View Photo
</a>
```

### Anti-Patterns

```svelte
<!-- BAD - Button with goto() prevents prefetch -->
<button onclick={() => goto('/explore')}>
  Explore
</button>

<!-- BAD - Div with click handler, no prefetch -->
<div role="button" onclick={handleNavigate}>
  Browse Gallery
</div>

<!-- GOOD - Anchor with prefetch -->
<a href="/explore" data-sveltekit-preload="tap">
  Explore
</a>
```

---

## Performance Optimization

### Bundle Size Optimization

**Lazy load heavy components with dynamic imports:**

```svelte
<script>
  // Lazy load filter sidebar (27KB)
  const FilterSidebarPromise = import('$lib/components/filters/FilterSidebar.svelte');
</script>

<!-- Render with skeleton loading state -->
{#await FilterSidebarPromise}
  <div class="w-64 h-96 bg-charcoal-900/50 rounded-lg animate-pulse" />
{:then FilterSidebarModule}
  <FilterSidebarModule.default {...props} />
{/await}
```

**Benefits:**
- Reduces initial page load by 30-40%
- Mobile users don't load desktop-only components
- Improves Time to Interactive (TTI)

### Image Loading

Use `priority` prop for above-fold images:

```svelte
<PhotoCard {photo} {index} priority={index < 8} />
```

### Server-Side Caching

Use in-memory caching for expensive operations:

```typescript
const CACHE_DURATION_MS = 5 * 60 * 1000;
let sportsCache: CachedData<Sport[]> | null = null;

export const load: LayoutServerLoad = async () => {
  const now = Date.now();
  if (!sportsCache || now - sportsCache.timestamp > CACHE_DURATION_MS) {
    const sports = await getSportDistribution();
    sportsCache = { data: sports, timestamp: now };
  }
  return { sports: sportsCache.data };
};
```

---

## Gallery-Specific Patterns

### Motion Tokens

Use centralized MOTION tokens (`src/lib/motion-tokens.ts`):

```svelte
<script>
  import { Motion } from 'svelte-motion';
  import { MOTION } from '$lib/motion-tokens';
</script>

<Motion
  let:motion
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={MOTION.spring.gentle}
>
  <div use:motion>Content</div>
</Motion>
```

### Class-Based Stores with Runes

```typescript
class GalleryPreferencesStore {
  private prefs = $state<GalleryPreferences>(loadPreferences());

  get sortBy(): SortOption {
    return this.prefs.sortBy;
  }

  setSortBy(value: SortOption): void {
    this.prefs.sortBy = value;
    savePreferences(this.prefs);
  }
}

export const preferences = new GalleryPreferencesStore();
```

### Event Propagation for Nested Elements

See [EVENT_HANDLING.md](./EVENT_HANDLING.md) for proper patterns when handling clicks on buttons inside cards.

---

## Code Review Checklist

Before submitting code:

- [ ] TypeScript compiles with no errors (`npm run check`)
- [ ] Proper event propagation handling (see EVENT_HANDLING.md)
- [ ] Navigation uses `<a>` tags with appropriate prefetch strategy
- [ ] Lazy loading for heavy components
- [ ] Priority loading for above-fold images
- [ ] Accessibility attributes present (aria-label, role, etc.)
- [ ] No console.log statements (unless intentional debug logging)

---

## References

- [Event Handling Conventions](./EVENT_HANDLING.md)
- [Component Patterns](./COMPONENT_PATTERNS.md)
- [CLAUDE.md](../CLAUDE.md) - Full development guide

---

**Version History:**
- **2.0.0** (2025-10-28): Trimmed generic patterns, focused on gallery-specific standards
- **1.0.0** (2025-10-27): Initial coding standards documentation
