<!-- 4bcf4dcc-93a6-4e78-8931-7d99e575d9ab 6a777f53-8791-41da-a37e-dd878081671b -->
# AEO (Answer Engine Optimization) Implementation Plan

## Overview

This plan implements comprehensive AEO features to make the photography gallery discoverable by AI-powered answer engines (Google SGE, Perplexity, ChatGPT, Bing Chat, etc.). Focus areas: AI.txt file, public APIs, enhanced Schema.org markup, and auto-generated FAQ content.

---

## Feature 1: AI.txt File

### Standard Format (Emerging Convention)

**Location:** `static/ai.txt` (served at `/ai.txt`)

**Structure (following emerging standards):**

```
# AI.txt for Nino Chavez Photography Gallery
# Version: 1.0
# Last Updated: 2025-10-28

# About
This file provides information for AI crawlers and answer engines about this photography portfolio.

# APIs
/api/ai/photos - Get photos with metadata (JSON)
/api/ai/albums - Get albums with metadata (JSON)
/api/ai/search?q={query} - Semantic photo search
/api/ai/stats - Gallery statistics
/api/ai/faq - Auto-generated FAQ content

# Structured Data
All pages include Schema.org markup:
- Photograph schema on photo pages
- FAQPage schema on FAQ pages
- Person schema on about page
- ImageGallery schema on collection pages

# Metadata
- Total photos: 20,000+
- Sports: volleyball (70%), basketball, soccer, track, baseball
- Coverage: 2020-present
- AI-enriched: Yes (12 semantic dimensions per photo)

# Contact
For licensing inquiries: https://photography.ninochavez.co/about
```

**Implementation:**

- Create `static/ai.txt` file
- Served automatically by SvelteKit at `/ai.txt`
- Reference in robots.txt
- Link from homepage footer

---

## Feature 2: Public AI-Friendly APIs

### 2.1 Photos API

**Location:** `src/routes/api/ai/photos/+server.ts`

**Endpoint:** `GET /api/ai/photos`

**Query Parameters:**

- `limit` (default: 50, max: 100)
- `offset` (for pagination)
- `sport` (filter by sport type)
- `category` (filter by photo category)
- `play_type` (filter by play type)
- `format` (`json` or `jsonld` - JSON-LD structured data)

**Response Format:**

```json
{
  "photos": [
    {
      "id": "image_key",
      "url": "https://photography.ninochavez.co/photo/{image_key}",
      "image_url": "https://...",
      "thumbnail_url": "https://...",
      "title": "Album Name",
      "description": "AI-generated description",
      "metadata": {
        "sport_type": "volleyball",
        "photo_category": "action",
        "play_type": "spike",
        "action_intensity": "peak",
        "composition": "rule_of_thirds",
        "time_of_day": "evening",
        "lighting": "artificial"
      },
      "date": "2025-11-02",
      "album": {
        "key": "album_key",
        "name": "Album Name",
        "url": "https://photography.ninochavez.co/albums/{album_key}"
      }
    }
  ],
  "total": 20000,
  "limit": 50,
  "offset": 0
}
```

**JSON-LD Format:**

- When `format=jsonld`, include full Schema.org Photograph objects
- Each photo includes complete structured data

### 2.2 Albums API

**Location:** `src/routes/api/ai/albums/+server.ts`

**Endpoint:** `GET /api/ai/albums`

**Query Parameters:**

- `limit`, `offset`
- `sport` (filter by sport)
- `year` (filter by year)

**Response Format:**

```json
{
  "albums": [
    {
      "key": "album_key",
      "name": "Album Name",
      "url": "https://photography.ninochavez.co/albums/{album_key}",
      "photo_count": 125,
      "sport": "volleyball",
      "date_range": {
        "start": "2025-11-02",
        "end": "2025-11-02"
      },
      "cover_image": "https://..."
    }
  ],
  "total": 253,
  "limit": 50,
  "offset": 0
}
```

### 2.3 Search API

**Location:** `src/routes/api/ai/search/+server.ts`

**Endpoint:** `GET /api/ai/search?q={query}`

**Query Parameters:**

- `q` (required) - Search query
- `limit` (default: 20)
- `format` (`json` or `jsonld`)

**Response Format:**

```json
{
  "query": "volleyball spike action photos",
  "results": [
    {
      "id": "image_key",
      "url": "https://...",
      "title": "...",
      "relevance_score": 0.95,
      "match_reasons": ["sport: volleyball", "play_type: spike", "category: action"]
    }
  ],
  "total_results": 1420,
  "limit": 20
}
```

**Search Logic:**

- Semantic matching on metadata fields
- Supports natural language queries
- Returns relevance scores

### 2.4 Statistics API

**Location:** `src/routes/api/ai/stats/+server.ts`

**Endpoint:** `GET /api/ai/stats`

**Response Format:**

```json
{
  "total_photos": 20000,
  "total_albums": 253,
  "sports": {
    "volleyball": 14000,
    "basketball": 3000,
    "soccer": 2000,
    "track": 800,
    "baseball": 200
  },
  "categories": {
    "action": 12000,
    "celebration": 4000,
    "candid": 3000,
    "portrait": 1000
  },
  "date_range": {
    "earliest": "2020-01-15",
    "latest": "2025-11-02"
  },
  "ai_enriched": true,
  "enrichment_dimensions": 12
}
```

### 2.5 FAQ API

**Location:** `src/routes/api/ai/faq/+server.ts`

**Endpoint:** `GET /api/ai/faq`

**Query Parameters:**

- `format` (`json` or `jsonld`)

**Response Format:**

- Auto-generated FAQ content (see Feature 3)

---

## Feature 3: Auto-Generated FAQ Content

### 3.1 FAQ Generation Logic

**Location:** `src/lib/aeo/faq-generator.ts` (new file)

**Function:** Generate FAQ content from metadata

**FAQ Categories:**

1. **General Questions:**

   - "How many photos are in the gallery?"
   - "What sports do you cover?"
   - "What time period does the gallery cover?"

2. **Photo-Specific Questions:**

   - "How many volleyball photos are there?"
   - "How many action photos vs celebration photos?"
   - "What play types are available? (spikes, blocks, digs, etc.)"

3. **Search/Discovery Questions:**

   - "How do I search for specific photos?"
   - "Can I filter by sport, category, or play type?"
   - "Are photos AI-enriched with metadata?"

4. **Album Questions:**

   - "How many albums are there?"
   - "How are albums organized?"
   - "Can I browse by album?"

5. **Technical Questions:**

   - "What metadata is available for each photo?"
   - "What AI enrichment dimensions are used?"
   - "Are photos optimized for web viewing?"

**Generation Algorithm:**

```typescript
async function generateFAQs(): Promise<FAQ[]> {
  // Query database for statistics
  const stats = await getGalleryStats();
  
  // Generate FAQs from statistics
  const faqs = [
    {
      question: "How many photos are in the gallery?",
      answer: `The gallery contains ${stats.total_photos} professionally captured and AI-enriched sports photos.`,
      category: "general"
    },
    {
      question: "What sports are covered?",
      answer: `The gallery covers ${Object.keys(stats.sports).join(', ')} photography. Volleyball is the primary focus with ${stats.sports.volleyball} photos.`,
      category: "general"
    },
    // ... more generated FAQs
  ];
  
  return faqs;
}
```

### 3.2 FAQ Page with Schema.org

**Location:** `src/routes/faq/+page.server.ts` and `+page.svelte`

**Features:**

- Auto-generated FAQ content
- FAQPage Schema.org markup
- Searchable/filterable FAQ list
- Individual QAPage schema for each FAQ

**Schema.org Structure:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How many photos are in the gallery?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The gallery contains 20,000+ photos..."
      }
    }
  ]
}
```

### 3.3 FAQ API Endpoint

**Location:** `src/routes/api/ai/faq/+server.ts`

**Returns:**

- JSON format: Simple FAQ array
- JSON-LD format: Complete FAQPage schema

---

## Feature 4: Enhanced Schema.org Markup

### 4.1 Photo Pages Enhancement

**Location:** `src/routes/photo/[id]/+page.server.ts`

**Current:** Basic Photograph schema exists

**Enhancements:**

- Add `ImageObject` with detailed properties
- Add `Person` (photographer) with complete profile
- Add `SportsEvent` if event data available
- Add `Offer` schema for licensing (if applicable)
- Add `aggregateRating` (already exists, enhance)

**Enhanced Schema:**

```json

{

"@context": "https://schema.org",

"@type": "Photograph",

"image": {

"@type": "ImageObject",

"contentUrl": "...",

"thumbnail": "...",

"width": 5472,

"height": 3648,

"encodingFormat": "image/jpeg"

},

"creator": {

"@type": "Person",

"name

### To-dos

- [ ] Create Breadcrumb component with Schema.org structured data
- [ ] Enhance structured data on photo pages (BreadcrumbList, ImageObject)
- [ ] Improve sitemap.xml with image sitemap extension and priority weighting
- [ ] Add view count display to photo detail pages and photo cards
- [ ] Create PopularPhotos component for homepage carousel
- [ ] Create RecentlyViewed component with localStorage persistence
- [ ] Enhance analytics dashboard with stats cards, charts, and tables
- [ ] Create aggregation functions for dashboard data (time series, sources, albums)
- [ ] Create database materialized views for daily counts and album performance
- [ ] Create PhotoInsights component with view history and performance metrics
- [ ] Set up scheduled refresh jobs for analytics materialized views