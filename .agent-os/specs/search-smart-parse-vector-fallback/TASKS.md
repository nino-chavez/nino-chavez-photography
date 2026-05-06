# Task Breakdown: Smart Parse + Vector Fallback Search

## Overview
Total Tasks: 18 (across 4 task groups)
Assigned Roles: api-engineer, ui-designer, testing-engineer

## Files Impacted (Summary)

| File | Task Group | Change |
|------|------------|--------|
| `src/lib/utils/nlp-query-parser.ts` | 1 | Major rewrite: expand synonyms, add jersey/album detection, return unmatchedTerms |
| `src/lib/supabase/server.ts` | 2 | Add `searchPhotos()` + `embedSearchQuery()`, remove ilike from `fetchPhotos()` + `getPhotoCount()` |
| `src/routes/explore/+page.server.ts` | 2 | Use `searchPhotos()` when `q` param present, pass searchMode + parsedDescription |
| `src/routes/explore/+page.svelte` | 3 | Remove client-side filtering/NLP, add search feedback UI |
| `src/lib/components/search/SearchAutocomplete.svelte` | 3 | Replace hardcoded keywords with data-driven suggestions from server |

---

## Task List

### Backend Logic Layer

#### Task Group 1: Structured Parser Rewrite
**Assigned implementer:** api-engineer
**Dependencies:** None

- [ ] 1.0 Complete structured parser rewrite
  - [ ] 1.1 Write 4-6 focused tests for the enhanced parser
    - Test file: `src/lib/utils/__tests__/nlp-query-parser.test.ts`
    - Test structured parsing: "soccer" maps to `{ matchedFilters: { sportType: 'soccer' }, unmatchedTerms: [] }`
    - Test multi-dimension parsing: "volleyball spike golden hour" maps to sport + play_type + time_of_day with empty unmatchedTerms
    - Test jersey number detection: "#12", "number 12", "jersey 12" all return `jerseyNumber: 12`
    - Test unmatched terms extraction: "powerful athletic moments" returns all terms as unmatched
    - Test mixed matched/unmatched: "volleyball epic moments" returns sport match + "epic moments" as unmatched
    - Test description generation: verify human-readable `description` string is returned
  - [ ] 1.2 Rewrite `parseQuery()` to return `ParsedSearchResult` type
    - File: `src/lib/utils/nlp-query-parser.ts`
    - Define `ParsedSearchResult` interface:
      ```typescript
      interface ParsedSearchResult {
        matchedFilters: Partial<PhotoFilterState>;
        unmatchedTerms: string[];
        description: string;
        jerseyNumber?: number;
        albumKey?: string;
      }
      ```
    - Keep the function signature server-compatible (pure function, no browser APIs, no side effects)
    - Rename existing `ParsedFilters` to avoid conflicts, export `ParsedSearchResult` as primary type
  - [ ] 1.3 Expand keyword coverage for all 9 metadata dimensions
    - Map all values from the `PhotoFilterState` type in `src/types/photo.ts`
    - Sports: volleyball, basketball, soccer, football, baseball, softball, track, tennis, hockey, swimming, lacrosse, rugby, wrestling (13 sports per spec)
    - Categories: action, celebration, candid, portrait, warmup (5 categories)
    - Play types: attack/spike, block, dig, set, serve, celebration, transition (7 play types)
    - Action intensity: low, medium, high, peak (4 levels)
    - Lighting: natural, backlit, dramatic, soft, artificial (5 types)
    - Color temperature: warm, cool, neutral (3 values)
    - Time of day: golden_hour, midday, evening, blue_hour, night, dawn (6 values)
    - Compositions: rule_of_thirds, leading_lines, framing, symmetry, depth, negative_space (6 types)
    - Emotions: triumph, determination, intensity, focus, excitement, serenity (6 emotions -- mapped but used internally, not as user-facing filter)
    - Add 2-4 synonyms per value (e.g., "spike" -> attack, "hoops" -> basketball, "sunset" -> golden_hour)
  - [ ] 1.4 Add jersey number detection via regex
    - Patterns: `#\d+`, `number \d+`, `jersey \d+`, `no\. ?\d+`
    - Extract numeric value and set `jerseyNumber` in result
    - Remove matched jersey patterns from remaining tokens before unmatched term calculation
  - [ ] 1.5 Add album name matching
    - Accept optional `albumNames: string[]` parameter
    - Match case-insensitively against album names
    - Set `albumKey` in result when matched
    - Remove matched album name tokens from remaining tokens
  - [ ] 1.6 Implement `unmatchedTerms` tracking and `description` generation
    - Tokenize input, iterate all keyword mappings, track which tokens were consumed
    - Collect unconsumed tokens as `unmatchedTerms`
    - Generate human-readable `description` string (e.g., "Showing volleyball spike photos at golden hour")
    - Export updated `describeFilters()` function that works with new `ParsedSearchResult`
  - [ ] 1.7 Ensure parser tests pass
    - Run ONLY the 4-6 tests written in 1.1
    - Verify all keyword mappings resolve correctly
    - Verify unmatchedTerms tracking works
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- `parseQuery("soccer")` returns `matchedFilters.sportType === 'soccer'` and `unmatchedTerms === []`
- `parseQuery("volleyball spike golden hour")` returns three matched filters and empty unmatchedTerms
- `parseQuery("#12")` returns `jerseyNumber === 12`
- `parseQuery("powerful athletic moments")` returns empty matchedFilters and all terms as unmatchedTerms
- `parseQuery("volleyball epic moments")` returns sport match and "epic moments" in unmatchedTerms
- Description string is always non-empty when matchedFilters has entries
- Function remains a pure function with no imports from browser modules

**Verification Steps:**
1. Run parser tests: `npx vitest run src/lib/utils/__tests__/nlp-query-parser.test.ts` -- expect 0 failures
2. Import check: verify no browser-only imports in the parser file
3. Type check: `npm run check` -- expect no type errors in modified files

**Verification Commands:**
```bash
# Run parser-specific tests
npx vitest run src/lib/utils/__tests__/nlp-query-parser.test.ts

# Type check
npm run check
```

---

#### Task Group 2: Server-Side Search Orchestration
**Assigned implementer:** api-engineer
**Dependencies:** Task Group 1

- [ ] 2.0 Complete server-side search orchestration
  - [ ] 2.1 Write 4-6 focused tests for search orchestration
    - Test file: `src/lib/supabase/__tests__/search.test.ts`
    - Test structured path: `searchPhotos("soccer", {})` returns `searchMode: 'structured'` with photos
    - Test semantic fallback trigger: `searchPhotos("powerful athletic moments", {})` returns `searchMode: 'semantic'`
    - Test zero-result fallback: structured match that returns 0 photos triggers vector search
    - Test `embedSearchQuery()` returns 768-dimensional array or null on error
    - Test filter composition: `searchPhotos("spike", { sportType: 'volleyball' })` applies both search filters and existing filters
    - Mock Supabase RPC and Gemini API calls in tests
  - [ ] 2.2 Add `embedSearchQuery()` function to `server.ts`
    - File: `src/lib/supabase/server.ts`
    - Import `GoogleGenerativeAI` from `@google/generative-ai`
    - Read `GOOGLE_API_KEY` from environment (`process.env.GOOGLE_API_KEY` for Vercel, with `import.meta.env` fallback)
    - Return type: `Promise<number[] | null>`
    - Use model `embedding-001` per the embeddings guide at `.agent-os/guides/embeddings-similarity-search.md`
    - Console warn if API key is missing; return null gracefully on any error
    - Do NOT throw on Gemini API failure (graceful degradation per error-handling standard)
  - [ ] 2.3 Add `searchPhotos()` orchestrator function to `server.ts`
    - File: `src/lib/supabase/server.ts`
    - Define `SearchResult` interface:
      ```typescript
      interface SearchResult {
        photos: Photo[];
        totalCount: number;
        searchMode: 'structured' | 'semantic';
        parsedDescription: string;
      }
      ```
    - Accept params: `query: string`, `existingFilters: Partial<PhotoFilterState>`, `options: { limit, offset, sortBy, albumNames? }`
    - Step 1: Call enhanced `parseQuery()` from `nlp-query-parser.ts`
    - Step 2 (structured path): If `unmatchedTerms` is empty, merge `matchedFilters` with `existingFilters`, call `fetchPhotos()` + `getPhotoCount()` in parallel, return with `searchMode: 'structured'`
    - Step 3 (semantic path): If `unmatchedTerms` exist OR structured path returned 0 results:
      - Call `embedSearchQuery()` with the full query string
      - Call `match_photos()` RPC with the embedding (follow the `findSimilarPhotos()` pattern in `server.ts` lines 1165-1196)
      - Fetch full photo data by image_key using `PHOTO_COLUMNS` constant
      - Preserve similarity-based ordering
      - Return with `searchMode: 'semantic'`
    - Step 4 (error fallback): If Gemini API fails (embedding is null), return zero results with `parsedDescription: "Search unavailable. Try using filters instead."`
    - Handle jersey number and albumKey from ParsedSearchResult by merging into filter options
  - [ ] 2.4 Remove ilike search from `fetchPhotos()` and `getPhotoCount()`
    - File: `src/lib/supabase/server.ts`
    - Remove the `searchQuery` parameter handling from `fetchPhotos()` (lines 179-182)
    - Remove the `searchQuery` parameter handling from `getPhotoCount()` (lines 298-301)
    - Remove `searchQuery` from the `FetchPhotosOptions` interface
    - Remove `searchQuery` from the `getPhotoCount` parameter type
    - This is safe because all search queries will now route through `searchPhotos()` instead
  - [ ] 2.5 Update explore `+page.server.ts` to use `searchPhotos()`
    - File: `src/routes/explore/+page.server.ts`
    - Import `searchPhotos` and `SearchResult` from `$lib/supabase/server`
    - When `searchQuery` (`q` param) is present: call `searchPhotos(searchQuery, filterOptions, { limit: pageSize, offset, sortBy })` instead of `fetchPhotos()` + `getPhotoCount()`
    - When `searchQuery` is absent: keep existing `fetchPhotos()` + `getPhotoCount()` flow unchanged
    - Pass new fields to page data: `searchMode`, `parsedDescription`
    - Remove `searchQuery` from the `fetchPhotos()` call (it no longer accepts it after 2.4)
    - Existing filter params from URL still compose with search (pass them in `filterOptions`)
  - [ ] 2.6 Ensure search orchestration tests pass
    - Run ONLY the 4-6 tests written in 2.1
    - Verify structured and semantic paths work
    - Verify ilike removal does not break non-search queries
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- `searchPhotos("soccer", {})` calls `fetchPhotos` with `sportType: 'soccer'` and returns `searchMode: 'structured'`
- `searchPhotos("powerful athletic moments", {})` calls `embedSearchQuery` + `match_photos` RPC and returns `searchMode: 'semantic'`
- `searchPhotos("spike", { sportType: 'volleyball' })` merges search-derived play_type filter with existing sport filter
- `embedSearchQuery("test query")` returns a 768-element number array (or null on error)
- ilike `.or()` clauses are fully removed from `fetchPhotos()` and `getPhotoCount()`
- Explore page loads without error when `q` param is absent (existing behavior preserved)
- Explore page returns `searchMode` and `parsedDescription` when `q` param is present
- GOOGLE_API_KEY is never exposed to the browser (no VITE_ prefix)

**Verification Steps:**
1. Run search tests: `npx vitest run src/lib/supabase/__tests__/search.test.ts` -- expect 0 failures
2. Type check: `npm run check` -- expect no type errors
3. Build check: `npm run build` -- expect successful build
4. Manual test: Start dev server, navigate to `/explore?q=soccer` -- expect structured results with feedback
5. Manual test: Navigate to `/explore?q=powerful+athletic+moments` -- expect semantic results with feedback
6. Manual test: Navigate to `/explore` (no q param) -- expect normal gallery behavior

**Verification Commands:**
```bash
# Run search-specific tests
npx vitest run src/lib/supabase/__tests__/search.test.ts

# Type check entire project
npm run check

# Build to verify no compile errors
npm run build

# Start dev server for manual testing
npm run dev
```

---

### Frontend Layer

#### Task Group 3: UI Updates (Explore Page + SearchAutocomplete)
**Assigned implementer:** ui-designer
**Dependencies:** Task Group 2

- [ ] 3.0 Complete UI updates for search
  - [ ] 3.1 Write 3-5 focused tests for search UI behavior
    - Test file: `tests/search-ui.test.ts` (Playwright)
    - Test search feedback visibility: navigate to `/explore?q=soccer`, verify feedback message is visible and contains "soccer"
    - Test semantic feedback styling: navigate to `/explore?q=powerful+athletic+moments`, verify feedback indicates semantic search mode
    - Test search clears properly: verify clearing search removes feedback and restores normal gallery
    - Test autocomplete renders suggestions from server data (verify dynamic suggestions appear, not hardcoded list)
  - [ ] 3.2 Remove client-side filtering logic from `+page.svelte`
    - File: `src/routes/explore/+page.svelte`
    - Remove `import { parseQuery, describeFilters } from '$lib/utils/nlp-query-parser'`
    - Remove `detectedFilters` derived (lines 112-116)
    - Remove `hasActiveNLPFilters` derived (lines 119-124)
    - Remove `displayPhotos` derived that filters by title/caption/image_key (lines 127-142)
    - Replace all references to `displayPhotos` with `data.photos` throughout the template
    - Remove `handleSearch()` function body that calls `parseQuery()` client-side (lines 221-258)
    - Replace with a simple function:
      ```typescript
      function handleSearch(query: string) {
        const url = new URL($page.url);
        if (query.trim()) {
          url.searchParams.set('q', query.trim());
        } else {
          url.searchParams.delete('q');
        }
        url.searchParams.delete('page');
        url.searchParams.delete('similar_to');
        goto(url.toString());
      }
      ```
  - [ ] 3.3 Add search feedback UI section to explore page
    - File: `src/routes/explore/+page.svelte`
    - Add inline markup (not a separate component) above the photo grid, below the sort/count bar
    - Show when `data.searchQuery` is present
    - Display `data.parsedDescription` text
    - Style differently based on `data.searchMode`:
      - Structured: subtle info bar with filter icon, charcoal background (e.g., "Showing 1,234 soccer photos")
      - Semantic: distinct bar with sparkle/search icon, slightly highlighted (e.g., "Showing results similar to 'powerful athletic moments'")
    - Include a clear search button (X icon) that calls `handleClearSearch()`
    - Use existing Tailwind classes consistent with the charcoal/gold design system
    - Use Svelte 5 runes (`$derived`) if any derived state is needed
  - [ ] 3.4 Update SearchAutocomplete to use data-driven suggestions
    - File: `src/lib/components/search/SearchAutocomplete.svelte`
    - Add new props: `sports` and `categories` (with counts) from explore page server data
    - Update `Props` interface:
      ```typescript
      interface Props {
        value?: string;
        placeholder?: string;
        sports?: Array<{ name: string; count: number }>;
        categories?: Array<{ name: string; count: number }>;
        sportContext?: string | null;
        categoryContext?: string | null;
        onSearch?: (query: string) => void;
        onClear?: () => void;
      }
      ```
    - Replace hardcoded `sportKeywords`, `categoryKeywords`, and `generalKeywords` with data-driven suggestions
    - Generate suggestions from `sports` and `categories` props, matching against user input
    - Show result counts next to suggestions (e.g., "volleyball (8,432)")
    - Keep suggestion logic client-side using `$derived` for instant rendering
    - Maintain existing keyboard navigation and accessibility features
  - [ ] 3.5 Pass sports/categories props to SearchAutocomplete in explore page
    - File: `src/routes/explore/+page.svelte`
    - Update the `<SearchAutocomplete>` component usage to pass `sports={data.sports}` and `categories={data.categories}`
    - Ensure props are threaded correctly from `data` (which comes from `+page.server.ts` -> `parent()`)
  - [ ] 3.6 Ensure UI tests pass
    - Run ONLY the 3-5 tests written in 3.1
    - Verify search feedback renders correctly for both modes
    - Verify client-side filtering is fully removed
    - Do NOT run the entire test suite at this stage

**Acceptance Criteria:**
- No `parseQuery` or `describeFilters` imports remain in `+page.svelte`
- No `displayPhotos` derived logic remains (all references use `data.photos` directly)
- Search feedback bar appears when `data.searchQuery` is present
- Feedback bar shows different styling for structured vs semantic results
- SearchAutocomplete shows dynamic suggestions from server data with counts
- Clearing search removes the feedback bar and restores normal gallery view
- Lightbox, pagination, and filter chips still work correctly with `data.photos`

**Verification Steps:**
1. Run Playwright tests: `npx playwright test tests/search-ui.test.ts` -- expect 0 failures
2. Type check: `npm run check` -- expect no type errors
3. Visual check: Navigate to `/explore?q=volleyball` -- verify feedback bar is visible with structured message
4. Visual check: Navigate to `/explore?q=epic+moments` -- verify feedback bar shows semantic mode
5. Visual check: Open SearchAutocomplete, type "vol" -- verify "volleyball (N,NNN)" appears as suggestion
6. Regression check: Navigate to `/explore` (no search) -- verify gallery works normally

**Verification Commands:**
```bash
# Run search UI tests
npx playwright test tests/search-ui.test.ts

# Type check
npm run check

# Start dev server for visual verification
npm run dev
```

---

### Testing Layer

#### Task Group 4: Test Review and Gap Analysis
**Assigned implementer:** testing-engineer
**Dependencies:** Task Groups 1-3

- [ ] 4.0 Review existing tests and fill critical gaps only
  - [ ] 4.1 Review tests from Task Groups 1-3
    - Review the 4-6 tests written by api-engineer in Task 1.1 (parser tests)
    - Review the 4-6 tests written by api-engineer in Task 2.1 (search orchestration tests)
    - Review the 3-5 tests written by ui-designer in Task 3.1 (UI tests)
    - Total existing tests: approximately 11-17 tests
  - [ ] 4.2 Analyze test coverage gaps for this feature only
    - Identify critical user workflows that lack test coverage
    - Focus ONLY on gaps related to the search smart parse + vector fallback feature
    - Do NOT assess entire application test coverage
    - Prioritize end-to-end search workflows over unit test gaps
  - [ ] 4.3 Write up to 8 additional strategic tests maximum
    - Add maximum of 8 new tests to fill identified critical gaps
    - Priority areas to consider:
      - End-to-end: search from GlobalSearch on non-explore page navigates to `/explore?q=...` with correct results
      - Integration: search + existing filter composition (e.g., sport filter active then search "spike")
      - Parser edge cases: empty query, single character, special characters, SQL injection attempts
      - Graceful degradation: GOOGLE_API_KEY missing returns helpful message instead of error
      - Jersey number edge case: "#0", "number 99", invalid jersey patterns
      - Search feedback: verify `parsedDescription` is accurate for mixed matched/unmatched queries
    - Do NOT write comprehensive coverage for all parser keyword mappings
    - Skip performance tests and visual regression tests
  - [ ] 4.4 Run feature-specific tests only
    - Run ONLY tests related to this feature:
      - `npx vitest run src/lib/utils/__tests__/nlp-query-parser.test.ts`
      - `npx vitest run src/lib/supabase/__tests__/search.test.ts`
      - `npx playwright test tests/search-ui.test.ts`
      - Any new test files created in 4.3
    - Expected total: approximately 19-25 tests maximum
    - Do NOT run the entire application test suite
    - Verify all critical search workflows pass

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 19-25 tests total)
- Critical user workflows for search are covered: structured search, semantic fallback, jersey search, filter composition, autocomplete suggestions
- No more than 8 additional tests added by testing-engineer
- Testing focused exclusively on the search smart parse + vector fallback feature

**Verification Steps:**
1. Run all feature tests: `npx vitest run --reporter=verbose src/lib/utils/__tests__/nlp-query-parser.test.ts src/lib/supabase/__tests__/search.test.ts` -- expect all pass
2. Run E2E tests: `npx playwright test tests/search-ui.test.ts` -- expect all pass
3. Type check: `npm run check` -- expect 0 errors
4. Build check: `npm run build` -- expect successful build

**Verification Commands:**
```bash
# Run all unit/integration tests for this feature
npx vitest run --reporter=verbose src/lib/utils/__tests__/nlp-query-parser.test.ts src/lib/supabase/__tests__/search.test.ts

# Run all E2E tests for this feature
npx playwright test tests/search-ui.test.ts

# Type check entire project
npm run check

# Full production build
npm run build
```

---

## Execution Order

Recommended implementation sequence:

1. **Task Group 1: Structured Parser Rewrite** (api-engineer)
   - No dependencies. Parser is a pure function with no external calls.
   - Enables all downstream work.

2. **Task Group 2: Server-Side Search Orchestration** (api-engineer)
   - Depends on Task Group 1 (uses the rewritten parser).
   - Adds `searchPhotos()` + `embedSearchQuery()` to server.ts.
   - Updates explore page server load to use new search function.
   - Removes legacy ilike search.

3. **Task Group 3: UI Updates** (ui-designer)
   - Depends on Task Group 2 (needs server data shape: `searchMode`, `parsedDescription`).
   - Removes client-side filtering logic.
   - Adds search feedback UI.
   - Updates SearchAutocomplete with data-driven suggestions.

4. **Task Group 4: Test Review and Gap Analysis** (testing-engineer)
   - Depends on Task Groups 1-3 (reviews all previously written tests, fills gaps).
   - Validates complete feature end-to-end.

## Key Implementation Notes

### Environment Variable
- `GOOGLE_API_KEY` must be set in Vercel environment variables (server-side only, no VITE_ prefix)
- This is the same key used by `scripts/generate-embeddings-metadata.ts`
- Without it, vector search gracefully degrades to zero results with a helpful message

### Performance Budget
- Structured search path: under 100ms server response (same as current filter queries)
- Semantic search path: under 800ms server response (including Gemini API call of 200-500ms)
- Autocomplete suggestions: under 50ms (client-side from already-loaded server data)

### Diff Budget (Selective Mode)
- Total estimated changes: ~120 lines across 5 files
- `src/lib/utils/nlp-query-parser.ts`: ~80 lines changed (major rewrite, but most is data/keyword mappings)
- `src/lib/supabase/server.ts`: ~60 lines added, ~10 lines removed
- `src/routes/explore/+page.server.ts`: ~15 lines changed
- `src/routes/explore/+page.svelte`: ~40 lines removed, ~20 lines added
- `src/lib/components/search/SearchAutocomplete.svelte`: ~30 lines changed

### Files NOT Modified (Confirmed in Spec)
- `src/lib/components/ui/GlobalSearch.svelte` -- already navigates to `/explore?q={query}` correctly
- `database/` -- no new migrations needed, existing `match_photos()` RPC suffices
- `src/routes/photo/[id]/` -- photo detail similarity feature is independent
