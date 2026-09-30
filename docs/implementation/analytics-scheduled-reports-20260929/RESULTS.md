# Analytics performance changes are ready for release review

Gallery and site-action reports now read stored PostgreSQL summaries. Counts refresh every 30 minutes. Filtering, comparisons, ranking and photo pagination happen in the database. The existing report features and full exports remain available. DuckDB and a real-time subscription were not added.

The changes are integrated in the `codex/site-action-analytics` worktree. They are uncommitted and have not been pushed or deployed. Production behavior is unchanged. The next release needs the two database migrations reviewed and applied before the application is deployed.

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

## Release order

1. Review migrations `20260930004554_analytics_scheduled_gallery_reports.sql` and `20260930005003_analytics_scheduled_site_reports.sql`.
2. Apply the migrations and run each private refresh once. Verify counts, cutoffs and permissions before changing the application reader.
3. Deploy the verified application build.
4. Measure the live report and confirm the next scheduled refresh completes.

No production migration, refresh or deployment ran. The candidate schema was installed only on the marked synthetic local database. The owned test server was stopped. Dirty source worktrees were preserved. Both worker branch refs remain at their starting commit. Dispatch receipts establish completion; their runtime model and effort fields were not exposed, so those details remain unverified.
