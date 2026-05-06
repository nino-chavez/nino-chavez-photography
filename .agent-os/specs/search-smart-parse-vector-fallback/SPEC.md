# Specification: Smart Parse + Vector Fallback Search

## Goal

Replace the broken search system (ilike substring matching + client-side text filtering + partial NLP parser) with a two-layer architecture: a robust server-side structured parser that maps queries to metadata filters (fast path), with automatic fallback to pgvector semantic search via Gemini embeddings when structured parsing fails or returns zero results.

## User Stories

- As a visitor, I want to search "soccer" and see only soccer photos with an accurate result count, so I can quickly find the sport I am looking for.
- As a visitor, I want to search "volleyball spike golden hour" and see filtered results with visual feedback showing what filters were applied, so I understand how my query was interpreted.
- As a visitor, I want to search "powerful athletic moments" (an abstract phrase) and see semantically relevant photos via vector search, so I can discover photos even when I do not know the exact metadata terms.
- As a visitor, I want to search "number 12" or "#12" and see photos of the player wearing jersey number 12.
- As a visitor, I want to see a clear message explaining what the system understood from my query (e.g., "Showing soccer photos" or "Showing results similar to 'powerful athletic moments'"), so I can refine my search if needed.
- As a visitor, I want search to compose with existing filters (e.g., search "spike" while a sport filter is active), so I can progressively narrow results.

## Core Requirements

### Functional Requirements

- **Structured parser** runs server-side in the explore page load function. It maps known terms to the 9 filterable metadata dimensions (sport_type, photo_category, play_type, action_intensity, lighting, color_temperature, time_of_day, composition, emotion) plus album names and jersey numbers. It returns both `matchedFilters` and `unmatchedTerms`.
- **Vector fallback** triggers automatically when: (a) structured parser matched nothing, (b) significant unmatched terms remain, or (c) structured query returned zero results. It embeds the query via Gemini embedding-001, then calls the existing `match_photos()` RPC.
- **Search feedback** is always shown to the user, indicating whether results came from structured filtering or semantic search, and describing what was understood.
- **GlobalSearch** navigates to `/explore?q={query}` with no client-side parsing logic.
- **SearchAutocomplete** provides dynamic suggestions sourced from cached server data (sport counts, category counts, album names) instead of hardcoded keyword lists.
- **ilike search** is removed from `fetchPhotos()` and `getPhotoCount()`.
- **Client-side text filtering** (`displayPhotos` derived) is removed from the explore page.
- **Existing filters compose with search**: URL filter params and the `q` param work together. Structured parse results merge with (or override) existing filter params.

### Non-Functional Requirements

- Structured search path completes in under 100ms server response time (same as current filter-only queries).
- Semantic search path completes in under 800ms server response time (including Gemini API call of 200-500ms).
- Autocomplete suggestions render in under 50ms (client-side from data already loaded by server).
- Gemini API key is server-side only (never exposed to browser).
- Search query input is sanitized against injection (existing allowlist pattern in `getFilterCounts` can be referenced).

## Reusable Components

### Existing Code to Leverage

- **`match_photos()` RPC** (`database/migrations/003_similarity_search_function_minimal.sql`): Already exists and is production-tested. Accepts a 768-dimensional embedding, returns image_keys with similarity scores. Currently used only for "similar photos" on photo detail page.
- **`findSimilarPhotos()` in `server.ts`**: Demonstrates the pattern for calling `match_photos()` RPC, fetching full photo data by image_key, and preserving similarity-based ordering. The vector search portion of the new `searchPhotos()` function should follow this same pattern.
- **`transformPhotoRow()` in `server.ts`**: Reuse for transforming database rows to Photo type after vector search results.
- **`PHOTO_COLUMNS` constant in `server.ts`**: Reuse for select queries after getting image_keys from vector search.
- **`getFilterCounts()` in `server.ts`**: Its allowlist-based sanitization pattern should be referenced for search input validation.
- **`parseQuery()` in `nlp-query-parser.ts`**: The structure (keyword mappings, regex matching) will be rewritten and expanded, but the overall approach of mapping keywords to filter values is sound.
- **`FilterChip` component**: Already used for displaying active filters; can be reused or extended to show search-derived filter chips.
- **Cached layout data** (`sports`, `categories`, `baseFilterCounts` from `+layout.server.ts`): Sports and categories with counts are already cached and available via `parent()`. Album names can be derived from this or added to the cache.
- **Gemini embedding generation pattern** (`scripts/generate-embeddings-metadata.ts`): The `@google/generative-ai` package is already a project dependency. The embedding generation pattern (`genAI.getGenerativeModel({ model: 'embedding-001' })` then `embedContent()`) is documented in the embeddings guide.

### New Components Required

- **`searchPhotos()` function in `server.ts`**: New orchestrator function that implements the smart parse + vector fallback flow. Cannot reuse `fetchPhotos()` directly because it needs to conditionally branch between structured filtering and vector search, and return metadata about which path was taken. `fetchPhotos()` itself remains unchanged (minus ilike removal) for non-search use cases.
- **`embedSearchQuery()` function in `server.ts`**: New function to generate an embedding for a search query string using Gemini embedding-001. Cannot reuse existing code because embedding generation currently only exists in scripts (not in the server module). Must handle API errors gracefully with fallback to empty results.
- **Search feedback UI section in explore page**: New UI element (not a separate component -- just markup in `+page.svelte`) showing what the search understood. Does not exist in current codebase. Should be a simple conditional block, not a heavy component.

## Technical Approach

### Parser Enhancement (`nlp-query-parser.ts`)

Rewrite the parser to:

1. **Expand keyword coverage** for all 9 metadata dimensions. Add synonyms and common phrases for each value. Cover all values listed in the requirements (13 sports, 5 categories, 5 play types, 4 intensities, 5 lighting types, 3 color temps, 5 times of day, 5 compositions, 10 emotions).

2. **Add jersey number detection** using regex patterns: `#\d+`, `number \d+`, `jersey \d+`, `no\. ?\d+`.

3. **Add album name matching** by accepting an album list parameter (from cached layout data or a new cache). Match against album names case-insensitively.

4. **Return `unmatchedTerms`** alongside `matchedFilters`. After iterating all keyword mappings, collect any input tokens that were not consumed by any match. This drives the vector fallback decision.

5. **Return a `ParsedSearchResult` type**:
   ```
   interface ParsedSearchResult {
     matchedFilters: Partial<PhotoFilterState>;
     unmatchedTerms: string[];
     description: string; // human-readable summary of what was matched
     jerseyNumber?: number;
     albumKey?: string;
   }
   ```

6. **Remain server-compatible**: No browser APIs, no dynamic imports. Pure function with no side effects.

### Server-Side Search Orchestration (`server.ts`)

Add a new `searchPhotos()` function:

1. Parse the query using the enhanced structured parser.
2. **Fast path (structured)**: If all terms matched, apply `matchedFilters` to the existing `fetchPhotos()` and `getPhotoCount()` functions. Return results with `searchMode: 'structured'`.
3. **Semantic path (vector)**: If unmatched terms remain or the structured path returned zero results:
   a. Call `embedSearchQuery()` to get a 768-dimensional embedding from Gemini.
   b. Call `match_photos()` RPC with the embedding.
   c. Fetch full photo data for the matched image_keys using the same pattern as `findSimilarPhotos()`.
   d. Return results with `searchMode: 'semantic'`.
4. **Return type**:
   ```
   interface SearchResult {
     photos: Photo[];
     totalCount: number;
     searchMode: 'structured' | 'semantic';
     parsedDescription: string;
   }
   ```
5. **Error handling**: If Gemini API fails, return zero results with a helpful message rather than throwing. Follow the graceful degradation standard.

The `embedSearchQuery()` function:
- Uses `@google/generative-ai` package (already installed).
- Reads API key from `GOOGLE_API_KEY` environment variable (server-side only, via `import.meta.env` or `process.env`).
- Returns `number[] | null` (null on error).
- Includes console warning if API key is missing.

### Explore Page Server Load (`+page.server.ts`)

When `q` param is present:
1. Call `searchPhotos(query, existingFilterOptions)` instead of `fetchPhotos()` + `getPhotoCount()`.
2. Pass `searchMode` and `parsedDescription` to the page data.
3. Existing filter params from the URL still apply (they compose with search).
4. When no `q` param, behavior is unchanged (use `fetchPhotos()` + `getPhotoCount()` as today).

### Explore Page Client (`+page.svelte`)

Remove:
- `displayPhotos` derived that filters by title/caption/image_key (lines 127-142).
- `detectedFilters` derived using `parseQuery()` (lines 112-116).
- `hasActiveNLPFilters` derived (lines 119-124).
- `handleSearch()` function that calls `parseQuery()` client-side and sets filter URL params (lines 221-258). Replace with a simple function that sets `q` param and navigates.
- Import of `parseQuery` and `describeFilters` from `nlp-query-parser.ts`.

Add:
- Search feedback section above the photo grid. Show `data.parsedDescription` when `data.searchQuery` is present. Style differently based on `data.searchMode` (structured vs semantic).
- Use `data.photos` directly (no client-side filtering).

### GlobalSearch (`GlobalSearch.svelte`)

No changes needed. It already navigates to `/explore?q={query}` without client-side parsing. This is the correct behavior.

### SearchAutocomplete (`SearchAutocomplete.svelte`)

Replace hardcoded `sportKeywords`, `categoryKeywords`, and `generalKeywords` with data-driven suggestions:
- Accept sports and categories (with counts) as props from the explore page.
- Generate suggestions from actual metadata values rather than hardcoded lists.
- Show result counts next to suggestions (e.g., "volleyball (8,432)").
- Keep suggestion logic client-side for instant rendering (data is already loaded from server).

### Database

No new migrations required. The existing `match_photos()` function already accepts arbitrary query embeddings and returns results. It was designed for this use case.

### Environment Variables

- `GOOGLE_API_KEY`: Required for vector search fallback. Check if already configured in Vercel environment. This is the same key used by the embedding generation scripts (`scripts/generate-embeddings-metadata.ts`). Must be server-side only (no VITE_ prefix).

## Files to Modify (Summary)

| File | Change Type | Scope |
|------|-------------|-------|
| `src/lib/utils/nlp-query-parser.ts` | Major rewrite | Expand synonyms, add jersey/album detection, return unmatchedTerms |
| `src/lib/supabase/server.ts` | Add + remove | Add `searchPhotos()` and `embedSearchQuery()`. Remove ilike from `fetchPhotos()` and `getPhotoCount()` |
| `src/routes/explore/+page.server.ts` | Modify | Use `searchPhotos()` when `q` param present. Pass searchMode + parsedDescription |
| `src/routes/explore/+page.svelte` | Modify | Remove client-side filtering/NLP. Add search feedback UI |
| `src/lib/components/ui/GlobalSearch.svelte` | No change | Already correct |
| `src/lib/components/search/SearchAutocomplete.svelte` | Modify | Replace hardcoded keywords with data-driven suggestions |

## Out of Scope

- Full-text search (tsvector/tsquery) -- no free text columns to index
- External search services (Algolia, Meilisearch) -- overkill for 20K photos
- Client-side vector search -- 60MB embedding payload is impractical
- LLM-powered query understanding -- too slow and expensive for search bar
- New database migrations -- existing `match_photos()` function suffices
- Changes to photo detail page similarity feature -- it works independently
- Search analytics/tracking -- can be added later
- Search history/recent searches -- can be added later
- Voice search -- out of scope

## Success Criteria

1. Searching "soccer" shows only soccer photos with correct count and a feedback message like "Showing 1,234 soccer photos".
2. Searching "volleyball spike golden hour" applies sport, play_type, and time_of_day filters simultaneously, showing filter chips and a description of what was understood.
3. Searching "powerful athletic moments" (no matching metadata terms) triggers vector search and shows semantically relevant results with feedback like "Showing results similar to 'powerful athletic moments'".
4. Searching "#12" or "number 12" shows photos with jersey_number = 12.
5. Search feedback is always visible, clearly distinguishing structured vs semantic results.
6. No client-side text filtering remains in the explore page.
7. GlobalSearch from any page navigates to explore with the query and returns correct results.
8. SearchAutocomplete shows dynamic suggestions with counts from cached server data.
9. Existing filter + search composition works (e.g., sport filter active + search "spike" narrows within that sport).
10. Structured search path responds in under 100ms; semantic path responds in under 800ms.
