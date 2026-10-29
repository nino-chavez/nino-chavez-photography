# Analytics performance fixes

The gallery report builds about twice as fast in a read-only production-data check. It now returns the photos needed for the visible screen. The changes are integrated locally and tested. They are not deployed.

## What changed

- Overview fetches four photo previews. A photo page fetches twelve. Other sections fetch none. Ranking and pagination happen on the server, with stable ties.
- Album and photo measures use indexed aggregation. Publication-age comparisons also reuse an album/day index instead of rescanning every row for every day.
- CSV retains all report rows and skips image hydration. Shortlists survive paging, rankings, and browser history.
- Diagnostics, version-2 evidence, and provider journeys load in the sections that use them. The optional all-sites journey report streams separately from first-party action counts.
- Successful provider reads share bounded server caches. Cloudflare current and comparison requests run together. Cloudflare requests have a five-second deadline; PostHog has one ten-second budget across submission and polling. Failed or incomplete reads stay unavailable.
- Gallery evidence reads share a 15-second cache, capped at eight entries, 8 MiB, and two concurrent reads. Current album visibility is checked on every request. Large responses exceed the cache budget and are not retained.
- Report changes show loading feedback and disable stale controls. Desktop and mobile navigation, inspection, filters, and exports remain usable. The mobile masthead now wraps instead of clipping its gallery link.
- Date work is finite. Screen and export ranges allow 3,650 days; the internal combined evidence envelope allows 7,300 days. The parent rejected the worker's proposed 90-day screen cap to preserve longer history. Extreme requests fail explicitly; no dates are silently dropped.

## What was measured

These timings use the current local report builder on this Mac, reading production data. They are not live Cloudflare page-load or Worker CPU measurements.

| Check | Before | After |
| --- | --- | --- |
| 90-day report build | 15.03 s; second attempt timed out | 7.45 s and 8.11 s |
| Preview metadata requests for 90-day Overview | 31 | 1 |
| Photos returned to Overview | 3,097 | 4 |
| 90-day recorded action total | 7,218 | 7,218 |
| 30-day Overview | No fresh before sample | 3.13 s cold; 0.42 s on repeat |

[Before receipt](baseline-builder.json) and [after receipt](optimized-builder.json) contain the request timings and decoded response sizes. The 90-day legacy database response still dominates: 6.20–6.71 seconds and 28.66 MB decoded. It exceeds the evidence cache budget, so the second 90-day request was not a cache hit. The 30-day repeat used cached evidence within its fifteen-second lifetime.

## The smaller database response is prepared

The new `analytics_read_report_evidence_compact` function sends shared column names once and each row as an array. Its decoder preserves the existing report fields. Only a missing new function triggers fallback to the old function; timeout and invalid data stay errors.

A transaction against the identified local rehearsal database added 50,000 synthetic rows. The response dropped from 31,289,284 to 11,589,534 decoded bytes, a 63% reduction. The row comparison found no differences. Coverage matched, and anonymous execution was denied. The transaction rolled back. These are synthetic transfer measurements, not production latency gains.

- [Migration](../../../supabase/migrations/20260929234500_analytics_compact_report_evidence.sql)
- [Rehearsal receipt](compact-rehearsal.json)
- [Guarded rehearsal script](../../../scripts/rehearse-analytics-compact.py)

The migration has not been applied to production. Production reads in the after benchmark therefore used the compatibility fallback. Apply the reviewed migration with the source release, then repeat the live desktop/mobile performance check before claiming a live improvement.

## Verification and handoff

- 130 analytics tests passed; no failures. They cover paging, counts, privacy filtering, CSV completeness, stable null-rank ties, cache limits, failures, provider deadlines, and compact decoding.
- Six browser checks passed against the local synthetic database. They cover desktop and 390px mobile, filters, ranking, page two, Back navigation, shortlist persistence, inspection, public export, and authenticated write boundaries. A deliberately held report request proved that the loading feedback appears and stale controls disable.
- `npm run check`, the complete production build, the reader review gate, and `git diff --check` passed. The build used nonsecret placeholder public configuration; it is compile evidence, not a hosted production receipt.
- Worker source changes were compared with the dispatch snapshot and integrated by file. Branch tips did not move. Worker model selection receipts are saved; runtime model identity was not exposed by the dispatcher.
- Worker results remain preserved in their linked worktrees. No worker server or browser was left running. The parent stopped its own validation server.

The integration worktree already contained unrelated cross-site changes before this task. Those changes were preserved. The earlier deep review still records separate data-retention, visibility, consent, and sign-in concerns. This performance work does not close them or authorize deploying that entire pending set. No commit, push, production migration, or deployment was performed.
