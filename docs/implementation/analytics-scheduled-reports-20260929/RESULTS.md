# Analytics reports now read scheduled summaries

Gallery and site-action reports now read stored PostgreSQL summaries. Counts refresh every 30 minutes. Filtering, comparisons, ranking and photo pagination happen in the database. The existing report features and full exports remain available. DuckDB and a real-time subscription were not added.

PR #170 was pushed, merged and deployed on September 29, 2026. Cloudflare Pages completed production deployment `2a9b5fb0-b8cd-4b82-b1c8-8bd9dfafdb67` for commit `7ebddff0722541607202db1be3dcd6db04f71afa` at 01:43 UTC on September 30. The four pending analytics migrations were applied before the application deployment. Gallery and site summaries were initialized successfully. Production SQL checks independently matched the 30-day and 90-day gallery totals, bounded photo pages to 12 rows, and confirmed anonymous and authenticated users cannot call the protected report functions.

## The local measurements support the change

Every number below comes from synthetic data. None is live traffic or a production speed measurement.

| Test | Existing read | New read | Result |
| --- | --- | --- | --- |
| Site actions, 100,000 events | 190.243 ms | 1.226 ms | Same totals, eight rows, 13 pages |
| Gallery, 50,000 photos, updated statistics | 549.917 ms | 365.199 ms | Correct 50,000 total and 12 photos |
| Gallery response, same test | 30,039,284 bytes | 4,952 bytes | Detailed daily rows no longer transferred |
| Gallery burst before statistics update | 555.115 ms | 372.323 ms | Correct total and page; earlier candidate timed out |

These are individual local SQL timings, not median latency or a capacity forecast. They exclude hosting, network and browser costs. Receipts: `sites-benchmark.json`, `gallery-benchmark.json` and `gallery-benchmark-unstatted.json`.

## Existing results and controls were checked

All 28 report comparison cases pass. They cover measures, album scope, filters, coverage, comparisons and photo ranks/pages. Two changes were explicitly accepted after independent SQL checks: known publication dates appear on zero-activity albums, and recency sorts actual timestamps rather than differently formatted strings. The original comparison output remains saved.

The SQL assertions pass for visibility, moved-hidden photos in totals and exports, distinct-browser estimates, all measures, summary retries, archive handoff, corrections, exclusions, midnight, failed and overdue refreshes, partial coverage, and access denial. SQL and overflow gates were also made to fail on purpose before being trusted.

Focused analytics tests, `npm run check`, `npm run build`, and `git diff --check` pass. Four browser checks passed at desktop and mobile widths. The parent inspected the captures. A cold reviewer found that the partial labels were ambiguous. The replacement says “Today so far” and “not included above”; the cold recheck passed. The captures contain invented counts and representative photo previews. They do not establish real-user performance.

## Freshness and privacy remain explicit

Today is separate from complete-day totals. Its timestamp identifies the stored cutoff. A failed or overdue site refresh keeps the last good counts visible and marks them stale. A previous-day snapshot cannot certify an incomplete day after midnight. Missing reporting functions or malformed responses show unavailable data, not zeros.

Exact browser estimates remain a separate protected retained-data query. They are not a verified people count and are not calculated by adding daily unique counts. Public totals, ranks, pages, exports and browser estimates apply current album visibility and current photo membership. No visitor identifiers enter report responses.

## Production checks and follow-up

The 30-day photo-open report returned 2,167 recorded actions with complete coverage. The SQL check counts photo opens only when a photo ID exists; album-only view records are separate. The initialized site-action summary was current but had no recorded first-party history yet. Missing history is not evidence of no interest.

An initial live HTTP check returned the 90-day gallery response in 0.756 seconds. Earlier live checks took 14.48–18.35 seconds. This is one request, not a median or a browser paint measurement. External provider responses can still take longer; they are separate from the stored first-party totals.

The gallery refresh runs every 30 minutes. Site summaries run at minutes 7 and 37. Both schedules are active; initialization was observed. The first automatic run had not yet been observed when this receipt was written.

The relay deployment workflow succeeded after its invalid GitHub credential was replaced with the existing Cloudflare deployment credential from 1Password. That credential has account-wide deployment access. PostHog delivery remains disabled in the relay configuration; deploying the relay does not activate collection.

Live inspection found a clean-URL regression after hydration: the photography header returned because the client route ID was absent. The follow-up keeps the report shell based on its host and path, and uses native navigation for report URLs outside the gallery application's fixed base. The album inspector's photo link also now requests the Photos section explicitly. Local rendered inspection verified album selection and the photo drill-down. A separate read-only reviewer inspected the dashboard screenshot and passed its standalone layout, field alignment and comprehension. Dispatch `56dcbddb-07e7-412a-a748-637abcbf77f0` completed; the host did not expose the child runtime model or effort. Exact clean-URL behavior must be checked on the follow-up production deployment.

Dirty worker worktrees and unrelated site changes were preserved.
