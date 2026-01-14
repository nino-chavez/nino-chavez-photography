# Architecture Overview

> System architecture for Nino Chavez Gallery - a professional volleyball photography portfolio site.

## Table of Contents

1. [System Overview](#system-overview)
2. [Data Flow](#data-flow)
3. [Component Architecture](#component-architecture)
4. [Route Organization](#route-organization)
5. [Performance Architecture](#performance-architecture)
6. [Security Model](#security-model)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     SvelteKit Application                            │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │   Routes     │  │  Components  │  │   Stores     │               │    │
│  │  │  (+page)     │  │  (gallery/)  │  │  (favorites) │               │    │
│  │  └──────┬───────┘  └──────────────┘  └──────────────┘               │    │
│  └─────────┼───────────────────────────────────────────────────────────┘    │
│            │                                                                 │
└────────────┼─────────────────────────────────────────────────────────────────┘
             │ Server Load Functions
             │ (+page.server.ts)
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VERCEL EDGE                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SvelteKit Server                                  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │    │
│  │  │  Server Load │  │   Supabase   │  │    Utils     │               │    │
│  │  │  Functions   │  │   Server     │  │  (SmugMug)   │               │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────────┘               │    │
│  └─────────┼────────────────┬┼──────────────────────────────────────────┘    │
│            │                ││                                               │
└────────────┼────────────────┼┼───────────────────────────────────────────────┘
             │                ││
             ▼                ▼▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                    │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │    Supabase      │  │     SmugMug      │  │   Cloudflare     │          │
│  │   PostgreSQL     │  │      CDN         │  │   Analytics      │          │
│  │                  │  │                  │  │                  │          │
│  │  photo_metadata  │  │  Original photos │  │  Web Analytics   │          │
│  │  albums_summary  │  │  (via signed     │  │                  │          │
│  │  user_tags       │  │   URLs)          │  │                  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | SvelteKit 2.x + Svelte 5 | SSR application framework |
| **Styling** | Tailwind CSS 4 | Utility-first CSS |
| **Animation** | svelte-motion | Component animations |
| **Icons** | lucide-svelte | Icon library |
| **Database** | Supabase PostgreSQL | Photo metadata, user data |
| **Photo CDN** | SmugMug | Original photo hosting |
| **Hosting** | Vercel | Edge deployment |
| **Analytics** | Cloudflare Web Analytics | Privacy-first analytics |

---

## Data Flow

### Page Load Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. BROWSER REQUEST                                                           │
│    User navigates to /photography/explore?sport=volleyball&page=1           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. LAYOUT SERVER LOAD (+layout.server.ts)                                    │
│    Loads and caches (5 min) sports/categories distributions                  │
│    Returns: { sports: [...], categories: [...] }                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. PAGE SERVER LOAD (+page.server.ts)                                        │
│    a. Parse URL params (sport, category, page, sort)                        │
│    b. Call parent() to get cached sports/categories                         │
│    c. Fetch photos from Supabase with filters                               │
│    d. Transform rows with transformPhotoRow()                               │
│    Returns: { photos: [...], totalCount, currentPage, ... }                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. SVELTE COMPONENT RENDER                                                   │
│    a. Receive data via $props()                                             │
│    b. Derive display state ($derived)                                       │
│    c. Render PhotoGrid with optimized SmugMug URLs                          │
│    d. Hydrate for client-side interactivity                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Photo Data Flow

```
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   SmugMug     │      │   Supabase    │      │   SvelteKit   │
│   (Photos)    │      │  (Metadata)   │      │   (Display)   │
└───────┬───────┘      └───────┬───────┘      └───────┬───────┘
        │                      │                      │
        │  Upload/Sync         │                      │
        ├─────────────────────>│                      │
        │                      │                      │
        │                      │  Query metadata      │
        │                      │<─────────────────────┤
        │                      │                      │
        │                      │  Return rows         │
        │                      ├─────────────────────>│
        │                      │                      │
        │                      │  transformPhotoRow() │
        │                      │        │             │
        │                      │        ▼             │
        │                      │  Photo interface     │
        │                      │        │             │
        │                      │        ▼             │
        │  Fetch image         │  getOptimizedUrl()   │
        │<─────────────────────┼──────────────────────┤
        │                      │                      │
        │  Return JPG          │                      │
        ├─────────────────────────────────────────────>
        │                      │                      │
```

### Photo Transformation Pipeline

```typescript
// Database Row (Supabase)
PhotoMetadataRow {
  photo_id: string
  image_key: string
  ImageUrl: string | null
  ThumbnailUrl: string | null
  OriginalUrl: string | null
  sport_type: string
  photo_category: string
  sharpness: number
  // ... 30+ columns
}
        │
        │ transformPhotoRow()
        ▼
// Application Interface
Photo {
  id: string
  image_key: string
  title: string
  caption: string
  image_url: string      // Normalized URL
  thumbnail_url: string  // Normalized URL
  original_url: string   // Normalized URL
  metadata: PhotoMetadata
  smugmug?: SmugMugData
  keywords: string[]
}
        │
        │ getOptimizedSmugMugUrl()
        ▼
// Display URL (size-optimized)
"https://photos.smugmug.com/photo-XL.jpg"
```

---

## Component Architecture

### Directory Structure

```
src/lib/components/
├── filters/              # Filter UI components
│   ├── ConsolidatedFilter.svelte    # Mobile dropdown filters
│   ├── FilterSidebar.svelte         # Desktop sidebar filters
│   ├── FilterChip.svelte            # Active filter pills
│   └── FilterShareButton.svelte     # Share current filters
│
├── gallery/              # Photo display components
│   ├── PhotoGrid.svelte             # Main photo grid
│   ├── PhotoCard.svelte             # Individual photo card
│   ├── Lightbox.svelte              # Full-screen photo view
│   ├── AlbumCard.svelte             # Album preview card
│   └── RelatedPhotosCarousel.svelte # Similar photos carousel
│
├── layout/               # App-level layout
│   ├── Header.svelte                # Site header + nav
│   └── Footer.svelte                # Site footer
│
├── photo/                # Photo-specific features
│   ├── FavoriteButton.svelte        # Add to favorites
│   ├── DownloadButton.svelte        # Download photo
│   └── TagDisplay.svelte            # Player tags
│
├── search/               # Search functionality
│   └── SearchAutocomplete.svelte    # NLP-powered search
│
├── social/               # Social features
│   └── SocialShareButtons.svelte    # Share on social
│
└── ui/                   # Generic UI components
    ├── Button.svelte
    ├── Card.svelte
    ├── Loading.svelte
    ├── OptimizedImage.svelte
    ├── PhotoGridSkeleton.svelte
    ├── PaginationHybrid.svelte
    ├── TimelineV2.svelte
    └── Typography.svelte
```

### Component Hierarchy (Explore Page)

```
+page.svelte (Explore)
├── Sticky Filter Header
│   ├── FilterShareButton
│   ├── Mobile Filter Drawer Toggle
│   ├── Clear All Button
│   └── FilterPresetsPanel (lazy)
│
├── Active Filter Chips
│   └── FilterChip (per active filter)
│
├── Main Content
│   ├── FilterSidebar (desktop, lazy)
│   │   └── Filter sections (sport, category, etc.)
│   │
│   └── Gallery Content
│       ├── Sort & Count
│       ├── PhotoGrid / PhotoGridSkeleton
│       │   └── PhotoCard (per photo)
│       └── PaginationHybrid
│
├── Lightbox (modal)
│   └── Photo detail + navigation
│
└── Toast Notifications
```

---

## Route Organization

### Route Map

```
src/routes/
├── +layout.server.ts     # Root: cached sports/categories
├── +layout.svelte        # App shell: header, footer
├── +page.server.ts       # Homepage: hero photo, featured albums
├── +page.svelte          # Homepage UI
│
├── explore/              # Main gallery
│   ├── +page.server.ts   # Filtered photos, pagination
│   └── +page.svelte      # PhotoGrid + filters
│
├── albums/               # Album browsing
│   ├── +page.server.ts   # All albums
│   ├── +page.svelte
│   └── [albumKey]/       # Single album
│       ├── +page.server.ts
│       └── +page.svelte
│
├── photo/                # Photo detail
│   └── [id]/
│       ├── +page.server.ts  # Photo + related + similar
│       ├── +page.svelte     # Modal-style detail
│       └── tag/             # Player tagging
│           ├── +page.server.ts
│           └── +page.svelte
│
├── timeline/             # Timeline view
│   ├── +page.server.ts   # Photos by period
│   └── +page.svelte
│
├── collections/          # Curated collections
│   ├── +page.server.ts
│   └── +page.svelte
│
└── favorites/            # User favorites
    ├── +page.server.ts
    └── +page.svelte
```

### Data Loading Pattern

```
+layout.server.ts (Root)
│
├─ Cached data (5 min TTL):
│  • getSportDistribution()
│  • getCategoryDistribution()
│
└─ Returns: { sports, categories }
          │
          ▼ Available via parent()
┌─────────────────────────────────────┐
│ +page.server.ts (Any route)         │
│                                     │
│ const { sports, categories }        │
│   = await parent()                  │
│                                     │
│ // NO re-fetching needed!           │
└─────────────────────────────────────┘
```

---

## Performance Architecture

### Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: In-Memory (Server)                                                  │
│ • Layout data: sports/categories distributions                               │
│ • TTL: 5 minutes                                                            │
│ • Scope: Per serverless instance                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 2: SmugMug CDN                                                         │
│ • Photo images (all sizes)                                                   │
│ • Cache-Control: max-age=31536000 (1 year)                                  │
│ • Scope: Global CDN                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: Browser                                                             │
│ • localStorage: Favorites, preferences                                       │
│ • HTTP cache: Static assets                                                 │
│ • SvelteKit preloading: hover/viewport triggers                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Query Optimization

```typescript
// PATTERN: Parallelized queries
const [photos, albums, tags] = await Promise.all([
  supabaseServer.from('photo_metadata').select('*').eq('sport_type', sport),
  supabaseServer.from('albums_summary').select('*'),
  supabaseServer.from('user_tags').select('*').eq('photo_id', id)
])

// ANTI-PATTERN: Sequential queries
const photos = await fetchPhotos()      // 500ms
const albums = await fetchAlbums()      // 300ms
const tags = await fetchTags()          // 200ms
// Total: 1000ms (vs 500ms parallel)
```

### Database Indexes

Key indexes for performance (see `database/performance-indexes.sql`):

| Index | Purpose | Speedup |
|-------|---------|---------|
| `idx_photo_metadata_sport_category` | Sport + category filtering | 10x |
| `idx_photo_metadata_quality_sort` | Quality score sorting | 8x |
| `idx_photo_metadata_image_key` | Single photo lookup | 15x |
| `idx_photo_metadata_album_key` | Album photo listing | 12x |

### Image Optimization

```typescript
// SmugMug size suffixes
const SIZES = {
  'Ti': 100,   // Tiny
  'Th': 150,   // Thumbnail
  'S': 400,    // Small
  'M': 600,    // Medium
  'L': 800,    // Large
  'XL': 1024,  // Extra Large
  'X2': 1600,  // 2X
  'X3': 2048,  // 3X (download quality)
}

// Usage in components
getOptimizedSmugMugUrl(url, 'thumbnail')  // Grid thumbnails
getOptimizedSmugMugUrl(url, 'download')   // Lightbox/detail view
getSmugMugSrcSet(url)                     // Responsive srcset
```

---

## Security Model

### Authentication (Future)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PUBLIC ACCESS (Current)                                                      │
│ • All photos publicly viewable                                              │
│ • Favorites stored in localStorage                                          │
│ • No user accounts required                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ ADMIN ACCESS (Planned)                                                       │
│ • Supabase Auth (email/password)                                            │
│ • RLS policies for admin operations                                         │
│ • Photo management, tagging approval                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Protection

| Data Type | Protection |
|-----------|------------|
| Photo metadata | Supabase RLS (read-only public) |
| Photo URLs | SmugMug signed URLs |
| User favorites | localStorage (client-only) |
| Search queries | Server-side sanitization |

### Input Validation

```typescript
// URL parameter validation
import { sanitizeFilterValue } from '$lib/utils/error-handling'

const sport = sanitizeFilterValue(
  url.searchParams.get('sport'),
  ['volleyball', 'basketball', 'soccer']
)

// Query builder (no string concatenation)
const { data } = await supabaseServer
  .from('photo_metadata')
  .select('*')
  .eq('sport_type', sport)  // Safe parameterized query
```

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) — Development guidelines
- [CODE_REVIEW.md](./CODE_REVIEW.md) — Code review process
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) — Code patterns
- [database/performance-indexes.sql](../database/performance-indexes.sql) — Database optimization
