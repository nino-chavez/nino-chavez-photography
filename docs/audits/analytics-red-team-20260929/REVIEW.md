# The counters are useful; the decision support is not ready

Reviewed September 29, 2026. Scope: collection, counting, traffic exclusion, and the conclusions encouraged by the photography analytics page. Source: commit `8d840154c2d55726cbc0e6a39299e49e8c7d1fb5` in `codex/analytics-experience-rethink`.

**Keep the full dashboard scope, and make measurement repair part of the build.** We can report recorded activity with clear definitions. We cannot yet reliably explain why visitors leave, which design change helped, or which photographic style people prefer. The review found reproducible collection and ranking defects as well as missing evidence for those decisions.

The review changed no production code, data, configuration, or deployment. Two independent read-only reviews informed this report. Their claims were checked and, where necessary, corrected below.

## What the live report establishes

An anonymous read at 09:48 CDT returned the following for September 22–28. These are reporting outputs, not independent measurements of actual visitors or delivered files. Evidence: [live-report.json](live-report.json).

| Recorded measure | Report total |
|---|---:|
| Photo opens | 1,451 |
| Album opens | 98 |
| Download actions | 82 |
| Favorite additions | 4 |
| Share actions | 0 |

The report estimated 80 browser fingerprints with any activity. Including excluded traffic changed photo opens to 1,452 and fingerprints to 81. That difference proves that one recorded action was excluded in this report. It does not establish that all operator or automated traffic was excluded.

The report returned complete daily summary coverage and no diagnostic evidence. Summary completeness describes the records that reached storage. It does not establish collection completeness, download reliability, or agreement with Cloudflare, PostHog, or GA4. External-provider reconciliation remains unverified.

## Problems that change the decisions this page can support

### 1. Download reliability is currently unmeasurable, with two concrete defects

The browser diagnostic helper sends `error_code: null` for a normal request. The receiving handler rejects a provided value unless it is a string. Running the actual helper and handler locally produced HTTP 400 before any database insert. Omitting the field passed; an explicit failure string also passed.

The saved-photos ZIP path also converts an HTTP error response directly into a blob without checking `response.ok`. A synthetic HTTP 503 became a `.jpg` archive entry containing error text. The surrounding path subsequently records photo download actions after constructing the ZIP.

**Consequence:** the report can miss normal diagnostic requests and count failed photo retrievals toward downloads. The live incidence of the ZIP failure is unknown.

**Required change:** accept the intended optional diagnostic shape; check HTTP success and payload validity before declaring a photo ready; cover every download surface with consistent requested, prepared, handed-to-browser, failed, and cancelled states. Keep browser-save completion unknown. Instrument the proxy's observable response failures separately.

**Acceptance:** normal requests reach the diagnostic store; an injected HTTP 503 cannot produce a successful photo entry or success count; retries do not duplicate an action.

Evidence: `src/lib/analytics/client.ts:42`, `src/routes/api/analytics/diagnostics/+server.ts:17`, `src/lib/components/favorites/FavoritesDownloadButton.svelte:63`, `:99`, `src/routes/api/download/+server.ts:48`; [collection-reproduction.json](collection-reproduction.json).

### 2. Our own browsing can still look like audience demand

Traffic is marked as test only when a request carries a valid signed marker. It is marked as operator only when the site authenticates an allowed admin email. Everything else defaults to audience. A normal Chrome user agent passes the crawler check. The local reproduction confirmed this path.

**Consequence:** signed-out owner browsing and unmarked browser automation can affect popularity. A Chrome profile name or the email account used by Chrome provides no site-authentication evidence. Public dashboard access does not activate exclusion.

**Required change:** provide a visible, durable browser-exclusion control appropriate to the public workflow. Require controlled agent browsers to establish their exclusion marker before exercising public gallery actions. Show whether exclusion is active. Keep suspected automation separate from proven test traffic; volume alone is not proof of a bot.

**Acceptance:** exercise the same gallery journey in an ordinary visitor browser, an excluded owner browser, and a marked automation browser. Only the ordinary visitor contributes to the default audience report. Opening the analytics report itself must not manufacture gallery activity.

Evidence: `src/lib/analytics/context.server.ts:16`, `src/lib/analytics/bot-detection.ts:10`, `src/lib/analytics/report-contract.ts:147`; [collection-reproduction.json](collection-reproduction.json). Production marker configuration and historical contamination volume were not inspected.

### 3. “Rising” can give the wrong answer

The custom comparison accepts unequal periods, but change is the raw difference between totals. The Rising sort falls back to current count when differences are unavailable, including when comparison is disabled.

**Synthetic example:** 30 actions over 30 days versus 14 over seven days displays `+16 actions`. Activity per day actually fell from two to one. Every number in this example is invented; it is a reproduction case, not gallery performance.

**Consequence:** the page can describe slower activity as rising or show the popularity order under the Rising label.

**Required change:** enable Rising only with a valid, complete comparator. Use equal-duration windows by default. For unequal windows, show an explicitly named rate comparison. Preserve the existing “new activity” treatment for a zero baseline. Show the underlying counts and dates.

**Acceptance:** the synthetic decline must not be labeled rising. With no comparator, Rising must explain why it is unavailable instead of silently changing its meaning. Partial-history rankings must say “observed activity only.”

Evidence: `src/lib/analytics/report-contract.ts:133`, `:191`, `src/lib/analytics/operator-report.server.ts:252`, `src/routes/analytics/operator/+page.svelte:50`; [ranking-reproduction.json](ranking-reproduction.json).

### 4. Download totals combine different units

A full-album ZIP records one album-level download action. A saved-photos ZIP records one action for every included photo. A single-photo download records one photo action. The current download total accepts all three.

**Consequence:** differences between albums partly reflect which download button people used. The combined total cannot measure files received, visits converted, or comparable demand by itself.

**Required change:** separate download requests, requested photo items, and album ZIP requests. Preserve the request identifier that relates items to their ZIP. Show these alongside opens and favorite additions in the album inspector. Do not backfill item quantities that were never recorded.

**Acceptance:** the same selected set downloaded individually, as saved photos, and as an album ZIP produces understandable request and item totals. Counts never imply that the visitor saved the file successfully.

Evidence: `src/lib/components/album/BulkDownloadButton.svelte:32`, `src/lib/components/favorites/FavoritesDownloadButton.svelte:105`, `src/lib/analytics/report-contract.ts:167`, `src/lib/analytics/operator-report.server.ts:263`.

### 5. We lack the evidence needed to explain browsing or photographic preference

The engagement contract accepts opens, favorites, downloads, and shares. It does not record visible thumbnail exposure or placement. The inspected gallery card displays a lazy-loaded image without reporting exposure. Search records contain query/filter/result information but no visit or search identifier to connect that search to a subsequent photo action. Ordinary filter interactions have a browser-local store, not the same durable search record.

**Consequence:** we cannot distinguish an unseen photo from a seen-but-ignored photo. We cannot calculate a trustworthy search-to-photo or album-to-download funnel by dividing today's totals. Direct photo visits, favorites on cards, repeated visits, and ZIP item counts make those totals different populations.

**Required change:** record visible, loaded thumbnail exposure and position; successful full-photo rendering; privacy-conscious anonymous visit and search identifiers; search results and result selection; filter use; action outcomes; and device/layout context. Preserve known album facts and category provenance. Connect tagged arrivals to subsequent activity without claiming that a tag proves causation.

**Acceptance:** a synthetic visitor can be followed from a visible album card or direct arrival through discovery to a photo action. A thumbnail merely fetched below the viewport does not count as seen. Empty search results and abandoned searches remain distinguishable. Exposure-adjusted response includes eligible exposure counts and missing coverage.

Evidence: `src/lib/analytics/collection-contract.ts:3`, `src/lib/components/gallery/PhotoCard.svelte:54`, `src/lib/analytics/tracker.ts:13`, `:104`, `src/routes/explore/+page.server.ts:126`, `src/lib/stores/filter-analytics.svelte.ts:230`.

### 6. The names need to preserve what was actually observed

| Current evidence | Safe meaning | Unsupported conclusion |
|---|---|---|
| Photo open | The viewer/page opened; the event currently fires before image load | A human saw or studied the photograph |
| Favorite | A favorite-add action was recorded; removals are not subtracted | This many people currently have it saved |
| Share | A link copy, native-share handoff, composer open, or email-link action | A social post was published or an email delivered |
| Browser fingerprint | An IP/browser-string hash had recorded activity | A person, a true visit session, or a reliable returning customer |
| Last activity | Latest accepted event after deduplication | Latest real interaction; repeat opens can be discarded |
| Publication-age comparison | Whole Chicago calendar dates beginning on publication day | Equal elapsed hours of opportunity |

Counts are usually capped at one fingerprint/target/type per UTC day, while reports use Chicago dates. Legacy null-fingerprint events require separate coverage accounting. An album published just before midnight has much less first-day exposure than one published just after midnight. Our calendar-boundary reproductions confirm the mismatch; their timestamps are invented examples.

**Required change:** carry exact units and definitions into the UI and export. Add successful-render events where attention is the question. Use true visit boundaries for journeys. Version any change to historical dedup rules. Call existing age comparisons “publication calendar days,” or collect enough detail to calculate equal elapsed windows. Explain that first-party collection is evidence of a recorded action, not undeniable ground truth.

Evidence: `src/lib/components/gallery/Lightbox.svelte:475`, `src/lib/stores/favorites.svelte.ts:75`, `src/lib/components/social/ShareMenu.svelte:81`, `src/lib/analytics/session.ts:11`, `src/lib/analytics/operator-report.server.ts:130`, `:329`, `supabase/migrations/20260928120000_analytics_north_star_draft.sql:22`.

### 7. A reconciled summary does not prove healthy collection

The client discards network errors and does not inspect collector responses. The collector can return 503, while the summary still correctly reconciles the smaller set of accepted records. The report's diagnostic loader also omits stored `result_count` and `error_code`, so its current table cannot explain zero-result searches or failure reasons.

**Required change:** report collector delivery health, last verified event by path, coverage start dates, rejected events, and known interruptions separately from summary coverage. Add bounded retries with stable event identifiers. Publish aggregate search outcome and error categories without exposing search text or visitor identifiers. Keep missing evidence distinct from measured zero.

**Acceptance:** deliberately fail one ingestion request, one image load, and one search. The dashboard must show a collection problem or missing coverage, and the recovered event must count once. Verify both successful and failing browser journeys against stored events and their summaries.

Evidence: `src/lib/analytics/client.ts:24`, `src/routes/api/engagement/+server.ts:85`, `src/lib/analytics/operator-report.server.ts:108`, `supabase/migrations/20260928120000_analytics_north_star_draft.sql:490`.

## The decisions and the evidence the redesigned page must connect

| Nino's decision | Show together | Interpretation rule |
|---|---|---|
| Which album should I promote? | Opens, photo download requests/items, album ZIP requests, favorite additions, tagged arrivals, recent change, publication age | Observed response can guide a shortlist; promotion history and audience size affect the totals |
| Which photograph should I share or shoot more of? | Actual image, shot category, exposures, opens, favorite/download response, placement and album context | Compare similar opportunities; popularity is not artistic quality or proof of why someone chose it |
| Where is the site frustrating visitors? | Discovery paths, no-result searches, result clicks, image failures, download failures, device/layout and speed | A result count is not search success; use linked visits and observable outcomes |
| Did my design change help? | Dated change, affected journey, comparable audience/window, explicit outcome and sample size | A controlled experiment can support a causal claim; before/after movement alone cannot |

For each rate, define the eligible visit or photo-exposure population, numerator, time window, exclusions, and coverage. For example, an album action rate could use eligible visits that rendered a photo and then requested a download in the same visit. It must not use total download items divided by album opens.

Collect campaign/referrer context separately from the on-site surface where an action occurred. A public `?src=` label is a tag supplied with a link. It does not authenticate the traffic's origin. There is no need to build signed campaign links merely to show clearly labeled tagged arrivals.

The custom gallery UI remains useful for album comparison, the selected-album side panel, and photographic inspection. PostHog is an option for linked journey and funnel analysis; its [funnel documentation](https://posthog.com/docs/product-analytics/funnels) describes step-based conversion analysis. It still needs correct events and exclusions. Cloudflare already offers [Core Web Vitals](https://developers.cloudflare.com/web-analytics/data-metrics/core-web-vitals/) for loading, responsiveness, and layout stability. Check that existing feed before duplicating performance collection. Neither product was reconciled to our live data in this review.

## What passed, and what would change the verdict

The focused analytics contract suite passed. Source inspection supports authoritative photo-to-album validation, separate zero-day coverage records, snapshot reads of summaries and coverage, public exclusion of unlisted albums, and withholding full totals when daily summary coverage is incomplete. These safeguards are worth preserving.

Confidence would improve when the actual browser journeys produce the expected accepted events, failures and exclusions; those events reconcile to the reports; and each proposed insight has its required exposure or visit denominator. Historical data cannot acquire missing exposures or visit links retrospectively. Show a collection start date for each new capability.

Unresolved production questions: null-fingerprint volume; test-marker coverage; ingestion loss; whether the September 29 suspected-session change was followed by reconciliation; reliable publication timestamps; search cache behavior; provider comparison. No direct database inspection, authenticated provider audit, or production event injection was performed here.

## Review evidence and dispositions

- [Collection review](collection-review.md) and [reporting review](reporting-review.md): independent read-only findings, preserved unchanged.
- [Collection reproduction](collection-reproduction.json): actual client/handler code with synthetic HTTP, DB and auth adapters.
- [Ranking reproduction](ranking-reproduction.json): actual report functions and UI sorting expression with invented cases.
- [Verification record](verification.json): source hashes, test result, dispatch receipts, and evidence limits.

| Reviewer claim | Parent disposition |
|---|---|
| Any accepted source tag is a collection defect | Downgraded to attribution limitation; open tags are intentional, and the page already labels tagged arrivals |
| Search collection is incomplete; cache can suppress it | Collection gap accepted; actual production cache suppression remains unproven |
| Unmarked automation becomes audience | Confirmed with the actual context function and crawler check |
| Early view and share-intent events are false completions | Semantics accepted; current “photo opens” can remain a valid label, while attention and publication claims cannot |
| Download diagnostics insert when received | Incomplete conclusion; parent reproduced rejection of the normal client payload |
| Collector failures disappear from the client | Confirmed; server logs exist, but report-level delivery health is missing |
| Downloads mix units | Confirmed; saved-photos ZIP adds a further per-photo distinction |
| Rising misuses unequal or absent comparisons | Confirmed with real functions and the source sorting expression |
| Publication age gives unequal elapsed exposure | Confirmed; existing calendar-day wording is partially accurate, but “same age” must not imply equal hours |
| Partial periods can still rank observed records | Accepted as a presentation limitation; retain observed records with explicit qualification |
| UTC dedup and Chicago reporting diverge | Confirmed designed limit; a future definition change must preserve history |
| Traffic-impact ranking invents tie movement | Source confirms positional ranks at `operator-report.server.ts:352`; use shared ranks for tied counts |
| Null hashes bypass dedup | Schema permits this, but volume and current path impact were not measured; current album/photo arrival callers supply hashes |

No worker changed files or branch refs or started runtime resources. The decision-page preview from the design work remains available. This audit does not approve a visual composition or certify the whole application.
