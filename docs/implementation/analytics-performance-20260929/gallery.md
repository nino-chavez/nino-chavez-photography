Implemented the analytics gallery performance slice in the linked worktree. Changes remain uncommitted for parent integration.

Key outcomes:

- `buildOperatorReport` now accepts `photoWindow`, returns `photoPagination`, aggregates album/photo measures in one pass, ranks server-side with stable ties, clamps pages, and hydrates only visible photos.
- Overview requests 4 popular photos; Photos requests 12 using `photo_page` and `photo_rank`; other sections return no photos or previews.
- CSV retains all rows while skipping preview and category-metadata queries.
- Section, photo page, and rank are URL-backed. Back/Forward and legacy hash links work. Shortlist and selected album survive navigation.
- Diagnostics, v2 evidence, private health, and journeys load only for relevant sections. Sources loads only its journey; Measurement loads all journeys.
- Interactive ranges are limited to 90 days before queries begin. Explicit exports allow up to 3,650 days.
- V2 classification reads are limited to selected raw event IDs, in batches of 100 with concurrency capped at four.
- Added a 15-second server-only evidence cache: single-flight, eight entries, 8 MiB total, database/role/query scoped, and failures are not cached.

Files changed:

- [operator-report.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/lib/analytics/operator-report.server.ts:79)
- [operator-report.test.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/lib/analytics/operator-report.test.ts)
- [gallery-performance.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/lib/analytics/gallery-performance.server.ts:64) and its test
- [bounded-singleflight-cache.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/lib/analytics/bounded-singleflight-cache.server.ts:3) and its test
- [report-contract.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/lib/analytics/report-contract.ts:156) and its test
- [v2-report-projection.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/lib/analytics/v2-report-projection.server.ts:201) and its test
- [+page.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/routes/analytics/operator/+page.server.ts:88)
- [+page.svelte](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/routes/analytics/operator/+page.svelte:29)
- [export.csv/+server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-gallery/src/routes/analytics/operator/export.csv/+server.ts:19)

Verification:

- Full local analytics suite: **117 passed, 0 failed**.
- Focused suite: **34 passed**.
- TypeScript: clean.
- Direct Svelte compilation: clean, with one pre-existing accessibility warning.
- `git diff --check`: clean.
- `npm run check` was attempted but Vite could not write `.vite-temp` through the intentionally shared, read-only `node_modules` symlink. I did not alter shared dependencies.

Measured query behavior in tests changed from the documented 31 sequential preview queries to **one 12-ID metadata query** for a photo page and **zero preview queries** for CSV. Production LCP and the 6.584-second evidence RPC were not remeasured; the parent-owned benchmark remains required. Query-layer current-membership enforcement for aggregate totals also remains dependent on the parent’s evidence-query integration; windowed photo output itself rechecks current visibility before returning metadata.