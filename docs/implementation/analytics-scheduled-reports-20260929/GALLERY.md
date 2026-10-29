# Scheduled gallery reporting

The gallery report requests finished totals and one page of photos from PostgreSQL. It no longer transfers detailed daily evidence rows to the application server for aggregation. Additive counts read stored summaries. The optional exact browser estimate still uses a protected query over retained raw evidence; daily unique counts are never summed.

## Preserved behavior

The aggregate RPC preserves all five measures, historical dimension filters, inclusive and conservative traffic, sources, traffic impact, album-only actions, previous and custom comparisons, publication-age comparisons, and popular, rising and recent photo rankings. Diagnostics remain a separate protected read on the Measurement view. Current public album visibility and exact current photo membership apply before totals, ranks, pages, exports and browser estimates are produced.

Photos are grouped once before ranking. This avoids repeated joins between unindexed aggregate groups, which the planner can mistakenly treat as single rows after a traffic burst. Page size zero returns no photos. Full CSV export retains every matching photo, including reports larger than 1,000 rows.

The current Chicago day refreshes every 30 minutes through the existing idempotent reconciliation function. Today is independent of the selected historical range and always partial. Missing or malformed report data is unavailable, not zero. A missing new RPC does not trigger a large legacy fallback.

## Verified locally

The parent ran SQL assertions, focused report tests, type checks, and desktop/mobile pagination checks. Assertions cover all measures, aggregation multiplication, historical filters, moved-hidden photos in totals and exports, distinct-browser visibility, idempotent refresh, unavailable and partial coverage, a falsely complete today ledger, comparisons, source and traffic sections, and access denial.

All 28 baseline comparison cases pass with documented corrections. Zero-activity albums now include known catalogue publication dates. Recency uses real timestamps instead of comparing strings with different timezone formats. Publication dates and recent ordering were independently checked against SQL, not merely accepted as changed output.

On 50,000 synthetic photos, the report response fell from 30,039,284 bytes to 4,952 bytes and returned 12 photos with the correct 50,000 total. With updated planner statistics, SQL time was 549.917 ms before and 365.199 ms after. Without updating statistics after the simulated burst, the corrected query took 372.323 ms; the earlier candidate had exceeded a 15-second timeout. The failing candidate was not accepted.

These are local measurements on synthetic data. Live latency and scheduled-job operation remain unverified. The new migration is installed only on the marked local rehearsal database. No production changes, commits or pushes have been made.

## Release order

Review and apply generated migration `20260930004554_analytics_scheduled_gallery_reports.sql` before deploying the new reader. Run the current-day reconciliation once and inspect its cutoff. Verify the report and scheduled job in production after deployment.
