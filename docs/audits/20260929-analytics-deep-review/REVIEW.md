# Analytics architecture and code review

**Verdict: keep the architecture, but hold the pending release until the measurement and privacy defects are fixed.** The full feature scope is useful. The problem is that several parts can currently record, expose, or describe the wrong thing. Gallery reports also do too much work before showing the first screen.

Reviewed September 29, 2026. This was a read-only review of the deployed photography commit and pending photography, profile, and blog changes. Three independent reviewers covered backend/access, data/measurement, and frontend/interaction. The parent reviewer checked production boundaries, inspected live frames, and reproduced the most important findings. No source fixes, production writes, commits, pushes, or deployments were made.

## What is actually live

| Capability | Verified state |
|---|---|
| Gallery and Cloudflare site-reach reports | Live on `analytics.ninochavez.co`, using the existing `/photography/analytics/...` paths. |
| Deployed photography source | Cloudflare Pages deployment `ba2c47f6-cd97-40af-a603-8e85bd0e10c7`, commit `628dccff6d0df40a2c61bbc9b05dd001c502c71c`. |
| Clean `/sites` and `/gallery` URLs | Both return 404. Their implementation remains local. The subdomain root redirects to the existing sites URL. |
| Shared public-content collector and main-domain choices page | Both return 404. These additions remain local. The production preferences endpoint has no GET handler: it returns 405. |
| PostHog read access | The project-restricted query key works. A wrong key and another project both return 403. |
| PostHog event history | The authenticated project query returned zero events. This does not prove capture or delivery works. |
| Scheduled PostHog relay | Worker settings and schedules return 404. It is not deployed. Its checked-in configuration is also disabled. |

Evidence: [provider state](provider-state.json), [HTTP route checks](route-state-curl.json), [access checks](access-probes.json), [legacy raw-table negative control](legacy-access-probe.json), and [database checks](database-live-checks.json). The initial `urllib` checks in `route-state.json` returned blanket 403s; they are not application authorization evidence. The curl checks supersede them.

## Fix the privacy and counting defects first

P1 means a release blocker or a serious defect in a core job. P2 means a material defect with a narrower impact. Severity applies to the described mechanism, not to a claim that someone has exploited it.

### P1 — A photo moved into an unlisted album can remain in a public historical report

**Status: current code and pending code. Independently reproduced with synthetic data.**

The public report checks the album recorded when the action happened. It does not check the photo's current album. Preview lookup fetches the photo and its image reference without its current album key. A historical public-album row therefore still returns a preview after the photo moves into an unlisted album.

Sources: [public filtering](../../../src/lib/analytics/operator-report.server.ts#L226), lines 226–250; preview/output construction, lines 301–313. The existing privacy test covers an album becoming unlisted with its key unchanged. It does not cover a photo moving between albums.

The parent reproduction produced one publicly returned photo and a preview URL for the moved photo. The visible-photo control also returned one. This proves the code path; it does **not** establish that a particular production photo has leaked.

**Remedy:** join current photo membership and visibility before counting or returning public results. Apply the same rule to previews, exports, v2 projections, and provider projections. Test public-to-unlisted moves, deletion, and visibility lookup failure.

### P1 — The pending prune replacement leaves identifying export payloads behind

**Status: pending migration only. Independently reproduced in the guarded local database, then rolled back.**

The classification migration removes the outbox foreign key and replaces cascading deletion with explicit cleanup. The pending site-action migration replaces the prune function but assumes that cascading deletion still exists. It deletes only old confirmed delivery rows. Pending, failed, and submitted rows can survive the raw event's 90-day expiry, retaining browser and visit identifiers in their payload.

Sources: [classification migration](../../../supabase/migrations/20260929190000_analytics_v2_classifications_health.sql#L8), lines 8–12 and 317–348; [pending prune](../../../supabase/migrations/20260929215936_site_action_analytics.sql#L6), lines 6–28.

The parent queued an eligible synthetic event, expired its raw row, installed the candidate function within a transaction, and pruned. The raw row disappeared while its identifying pending outbox row remained. Everything rolled back. The current rehearsal uses an **unlinked** expired event, so it cannot catch this defect.

**Remedy:** preserve explicit cleanup of event outbox rows and classification controls. Exercise every delivery state with export-eligible expired events. Verify identifier deletion and idempotent aggregate preservation together.

### P1 — The pending profile collector can lose its first page view

**Status: pending collector/profile integration. Independently reproduced in memory.**

The React page-ready event can run before the preferences request finishes. The collector records its current route while collection is still excluded. Its attempted page-view emission is suppressed. When preferences arrive, `start()` sees the same route and returns without emitting the view.

Sources: [shared collector](../../../static/site-activity.js#L46), lines 46–54 and 89–99; profile `app/components/SiteActivity.tsx`, lines 7–12.

The parent reproduced both orders: preferences before readiness emitted one page view; readiness before preferences emitted zero. These are synthetic results, not measured production loss.

**Remedy:** make preferences readiness an explicit state. Start the current route once after preferences resolve. Do not mark observations sent before collection is eligible. Test the actual React event ordering, initial navigation, later navigation, and unavailable preferences.

### P1 — Site-action reports mistake missing measurement for zero activity

**Status: pending site-action report. Source-confirmed.**

The report knows that a section has some recorded history. It does not know whether each metric was collected on every day in the selected interval. The UI turns absent applicable metrics into zero and describes the range as complete days. One writing page view can therefore make uninstrumented reading progress appear to be zero. Collection outages have the same problem.

Sources: [site-action RPC](../../../supabase/migrations/20260929215936_site_action_analytics.sql#L33), lines 33–80; [site-action UI](../../../src/lib/components/analytics/SiteActions.svelte#L8), lines 8–25.

**Remedy:** record daily coverage by section, metric, and instrumentation version. Return unavailable values as `null`. Compare periods only when their relevant coverage is complete. The existing legacy report already has a useful nullable-coverage model.

### P2 — Reclassification can turn excluded traffic into audience traffic

**Status: current v2 projection; pending site-action code uses a different, safer rule. Independently reproduced.**

The generic v2 projection replaces collection context with the latest classification. An original operator event corrected to audience is counted as audience. The site-action report instead preserves original non-audience context. The two reports can disagree about the same observation.

Source: [v2 projection](../../../src/lib/analytics/v2-report-projection.server.ts#L90), lines 90–94; classification RPC in the classification migration, lines 65–102; pending site-action SQL, lines 40–47.

**Remedy:** preserve immutable collection context separately from revisable bot classification. Ordinary audience reporting must never promote operator, test, or self-excluded collection into audience. Explicit inclusive diagnostics may still show those classes under their own labels. Apply one owned effective-context rule to raw data, archives, exports, and PostHog.

## Make report work proportional to the visible result

### P1 — Pagination hides rows but does not reduce server work

**Status: current and pending code. Source-confirmed; supported by the preceding live performance test.**

Every gallery tab waits for the full report. The builder groups every photo, fetches every preview in sequential batches of 100, and repeatedly scans the evidence to calculate each metric. Only then does the client sort and slice the arrays. The v2 loader also reads classification history beyond the selected events.

Sources: [report builder](../../../src/lib/analytics/operator-report.server.ts#L241), lines 241–313; [gallery loader](../../../src/routes/analytics/operator/+page.server.ts#L93), lines 93–137; [v2 loader](../../../src/lib/analytics/v2-report-projection.server.ts#L186), lines 186–224.

The preceding parent-run test measured 90-day renders at **19.33–25.54 seconds**. Its query profile fetched 3,097 photo previews through 31 sequential queries. These are laboratory measurements of the live site, not field percentiles or measured concurrent capacity. See [performance report](../../implementation/site-actions-20260929/PERFORMANCE.md).

**Remedy:** keep every feature, but load by job. Return overview aggregates and bounded top lists first. Apply filters, ranking, visibility, and pagination in database report queries. Fetch previews for the visible page only. Give full CSV export a separate bounded/cursor path. Scope classification reads to the selected events.

### P1 — Public custom ranges have no maximum

**Status: current code. Independently reproduced through the parser.**

The parser accepts arbitrary valid custom dates. The loader then materializes every day and starts the complete database/provider workload. A 2020–2026 request produced a 2,463-day interval locally. The review did not send that expensive request to production.

Source: [date contract](../../../src/lib/analytics/report-contract.ts#L89), lines 89–158.

**Remedy:** validate primary, comparison, and publication-age ranges against an owned interactive limit before starting work. Retain long-history analysis through a bounded aggregate/export job. Reject excessive requests explicitly.

### P2 — Public refreshes can repeatedly launch provider queries

**Status: current execution path; production quota impact grows when PostHog is activated. Source-confirmed.**

The gallery response is private/no-store and starts seven journey queries per request. Provider polling has individual timeouts but no shared report deadline. Cloudflare reach requests lack an explicit fetch deadline. The current PostHog project is empty; the review did not prove a live quota incident.

Sources: [gallery loader](../../../src/routes/analytics/operator/+page.server.ts#L77), lines 77–82 and 130–137; `posthog-queries.server.ts`, lines 495–563; `site-traffic.server.ts`, lines 119–148.

**Remedy:** separate cacheable public aggregates from the private operator overlay. Cache normalized snapshots and prevent identical concurrent requests from duplicating refresh work. Fetch linked-journey snapshots independently with a total deadline and freshness state. Scope caches by public visibility and invalidate them when publication settings change.

## Finish the access, collection, and delivery boundaries

### P2 — Production report-host preferences do not control main-domain collection

**Status: live UI plus deployed source. Pending code addresses it but is not deployed.**

The live analytics-host page offers editable collection/exclusion preferences. Its cookie writes are host-only. A cookie set on `analytics.ninochavez.co` does not reach `ninochavez.co`, where gallery events are collected. This can make the operator believe their browser is excluded when it is not.

Source: deployed `src/routes/api/analytics/preferences/+server.ts`, lines 30–39. The parent inspected the live controls without changing preferences. The pending UI correctly links to a main-domain choices page, but that page currently returns 404.

**Remedy:** deploy the main-domain preferences endpoint/page and remove misleading report-host controls in the same release. Verify one real browser exclusion on the collecting host. Do not use Chrome profile or email as the identity contract. In the review browser, `navigator.webdriver` was false; that flag alone does not exclude agent visits. Signed test markers and the collector-host exclusion cookie are the relevant controls. Cloudflare reach is a separate instrument and may still include operator visits, as its UI discloses.

### P2 — Magic-link authentication still targets the main domain

**Status: source-confirmed integration risk in current and pending code; an actual sign-in was not performed.**

Magic links use a fixed main-domain callback. Default Supabase session cookies are host-only. The callback's report destination then redirects to the analytics host, which lacks that session. The backend reviewer labeled this pending, but the deployed commit already redirects report routes to the subdomain.

Sources: `src/routes/login/+page.server.ts`, lines 28–30 and 76–80; `src/routes/auth/callback/+server.ts`, lines 6–22; `src/lib/supabase/server-ssr.ts`, lines 19–27; deployed `src/hooks.server.ts`, lines 44–59.

**Remedy:** configure an allowlisted analytics-host callback and a safe report destination. Test request, callback exchange, cookie, redirect, and one protected action on the same host. Public aggregates can remain public; private notes and corrections still need functioning operator access. An undocumented router cookie rewrite could change this finding, so the complete live flow remains unverified.

### P2 — Collection lacks an application-level abuse budget

**Status: current legacy endpoints and pending v2 guard. Source-confirmed; external WAF/rate rules unverified.**

Public clients can submit valid unique events. The code has no rolling quota. Legacy endpoints parse JSON without a decoded-byte bound. The pending v2 limit trusts `Content-Length`, and its origin check allows a missing Origin. UUID idempotency prevents replay of the same event; it does not constrain a stream of new UUIDs. Origin is a browser signal, not proof of a human action.

Sources: `src/routes/api/engagement/+server.ts`, lines 18–28 and 67–78; diagnostics endpoint, lines 10–31; v2 events endpoint, lines 13–27 and 46–59.

**Remedy:** inspect existing edge rules before adding controls. Enforce actual request bytes, a consistent browser-origin policy with explicit trusted-test exceptions, and measured edge/server quotas. Record rejection health. No pollution attempt was made against production. The backend reviewer rated this P1; the parent uses P2 because external protection and actual exploitation were not established.

### Release gap — PostHog delivery is not activated, and its time budgets conflict

**Status: relay absent in production; checked-in relay disabled. Delivery timing risk is source-confirmed.**

A default batch leases 50 events for 60 seconds, then delivers them serially with a five-second timeout per event. That permits approximately 250 seconds of capture waits before database overhead. The relay request aborts at 90 seconds. A lease can expire while its first sender is still working. Stable provider UUIDs help deduplicate capture; they do not prove local receipt races are harmless.

Sources: [batch delivery](../../../src/lib/analytics/posthog-delivery.server.ts#L15), lines 15–54; `posthog.server.ts`, lines 27–47; relay `src/index.ts`, lines 9–18; relay `wrangler.toml`, lines 7–11.

**Remedy:** derive claim size, concurrency, lease, and request cutoff from one total budget. Test delayed capture and concurrent reclaim. Then deploy/provision/enable the relay and verify an eligible synthetic event through pending, submitted, and confirmed. A successful query-key check does not satisfy that acceptance gate.

## Repair working-state behavior without changing the full design

- **P2: filtering can strand the album page.** Search resets the page, but a changed server report does not clamp it. The arithmetic can slice five matching albums from offset 24. Reset or clamp against a stable serialized filter query. Source: gallery page, lines 98–107 and 131–135.
- **P2: ranking, pages, and shortlists are not fully restorable.** Reload loses them, and an effect keyed to the report-query object clears shortlist and photo selection during data replacement. Persist bookmarkable navigation in the URL; preserve temporary work separately. Source: gallery page, lines 51–70 and 136–145. **Basic section Back/Forward works**; see rejected claims below.
- **P2: source options derive from already filtered results.** Choosing a source can remove alternatives or hide the active empty value. Derive facets while ignoring their own filter and retain the selected value. Sources: gallery page, lines 74–77 and 278–286; report builder, lines 316–323.
- **Coverage decision: `/search` is reach-only in the pending collector.** Its reach taxonomy says profile, but the safe path allowlist rejects it. Either track its canonical path without search text or explicitly disclose the exclusion.
- **Export/metric refinement:** the CSV mixes legacy and v2 rows under one count column, distinguished by row type. They are parallel measurements of overlapping actions and must not be summed. Separate their additive groups or files. Legacy share observations include composer opening and handoff; current UI already describes handoffs, so this review does not claim verified completed shares are being shown. Choose ranking weights according to those observable definitions.

## The architecture to retain

Use the first-party ledger for well-defined actions and durable aggregate history. Use PostHog for optional linked journeys and experiments. Replacing the ledger with PostHog would not fix the collector race, cookie scope, visibility join, coverage gaps, or UI state loss.

```text
collecting host: authoritative preferences + bounded event collector
  ledger: immutable collection context + versioned classification
    retention: identifier-free archive + explicit export cleanup
    reports: coverage-aware aggregates + current visibility + bounded pages
      public snapshots: /sites and /gallery
      analytics-host session: private notes, saved reports, corrections
    eligible outbox: budgeted relay -> PostHog -> cached linked reports
```

This preserves overview, album comparison, selected-album inspection, photo discovery, popular/rising/recent sorting, sources, slicing, exports, and multi-site journeys. It changes ownership and execution cost, not feature scope.

Fix order: visibility/retention/context invariants; collector readiness and coverage; bounded report queries; host preferences/auth; delivery budgets and activation; state/facet/export refinements. Deployment order must make the shared collector and choices page available before profile/blog consumers reference them. Verify the complete flow after all hosts deploy.

## What passed, what was rejected, and what remains unknown

**Verified strengths:** anonymous v2 raw/archive/outbox/classification reads and privileged report RPCs are denied. The legacy raw-table control returned no anonymous rows while the privileged control proved data exists. The PostHog read key rejects the wrong project and a garbage key. Event UUIDs, atomic outbox insertion, signed identity bindings, strict property contracts, and distinct submitted/confirmed states are useful foundations. Gallery privacy filtering fails closed when visibility lookup fails. Daily legacy coverage avoids false zeros. Private actions use operator authorization and ownership predicates.

**Tests:** the parent ran 73 focused tests: 73 passed, zero failed. Four source reproductions exercised moved-photo visibility, context promotion, collector ordering, and date bounds. One guarded local SQL reproduction proved the retention defect and rolled back. Expert suites overlap; their counts are not added together. Existing tests passing did not cover these reproduced edge cases.

**Rejected or narrowed expert claims:**

- The frontend report said there was no `popstate` synchronization. Current source explicitly installs it, and live Back restored Albums. That part of the finding is rejected; incomplete detailed-state restoration remains.
- The backend report said it found no unlisted exposure path. The parent/data reproduction establishes the moved-photo edge case, so that broad assurance is rejected.
- The gallery album region is horizontally scrollable, and current Chrome allowed programmatic focus. Several other regions use `tabindex="-1"`; sequential keyboard reachability and assistive-technology use still need targeted testing. Source alone does not establish that all tables are unusable.
- Local clean URLs and PostHog configuration were not called live features. Direct route and provider checks establish their pending state.

**Limits:** no production mutation, load flood, magic-link email, physical-device test, screen-reader test, production query-plan capture, or field INP measurement was performed. Live migration definitions, external WAF quotas, and Supabase advisory results remain unverified. Provider retention/settings were not re-audited here. Mobile frames are browser emulation. Inspection visits may be included in Cloudflare reach.

**Integrity:** all three workers completed successfully. Their route receipts record requested models; runtime model/effort fields were unavailable, so the review does not claim independently verified model identity. All 2,968 baseline source files and branch tips were unchanged after review. Only this audit folder was added. The parent's browser tab was closed; workers started no persistent resources. Existing development servers and local databases were preserved.

## Evidence and expert reports

- [Backend/access/delivery review](backend.md)
- [Data/privacy/measurement review](data.md)
- [Frontend/interaction review](frontend.md)
- [Parent source reproductions](source-repros.json), [reproduction source](reproduce-source.ts)
- [Retention reproduction](retention-repro.json), [guarded rollback script](reproduce-retention.py)
- [Focused test receipt](focused-tests.json), [test output](focused-tests.log)
- [Live interaction checks](live-interactions.json), [source integrity check](postflight.json)
- [Worker receipts](worker-receipts.json)
- [Live sites desktop](live-sites-desktop.png), [sites mobile](live-sites-mobile.png), [gallery mobile](live-gallery-mobile.png), [preferences mobile](live-preferences-mobile.png)

The expert reports are preserved verbatim. Where their findings conflict with parent verification, this review's disposition governs the verdict.
