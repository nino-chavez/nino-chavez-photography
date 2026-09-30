# Photography analytics implementation plan

Status: extended September 29, 2026. The scheduled reporting release and clean-URL correction were merged as PRs #170 and #171 and checked on production. The next proposed work is [actionable insights and reporting](#8-turn-the-data-into-decisions-and-follow-up). The earlier measurement and PostHog plans remain authoritative for their contracts. Production activation, provider delivery, and available history have separate acceptance checks; a deployed interface does not establish any of them. This document authorizes no production changes or outbound reports.

Build the full photography analytics north star in one complete release. Nino must be able to understand individual albums, discover popular and rising work, compare performance, investigate distribution and data quality, and save or export useful views. Preserve useful totals, exclude controlled test traffic, and make collection failures visible.

**Scope directive, September 28:** the full north star is the release commitment. Phases describe dependency order, parallel work and verification checkpoints. They are not smaller releases, optional feature bundles, or permission to stop after a subset works. Do not reduce scope on the assumption that a one-person gallery needs less. A preservation-only production change may happen earlier if separately authorized because waiting can lose history; that does not replace the complete release.

Keep validated first-party events as the shared foundation. Add PostHog Cloud for linked journeys, discovery and download funnels, and site experiments. Keep the gallery workspace for photographic inspection and album comparison. Nino selected PostHog Cloud with proposed updated retention wording on September 29; the [PostHog plan](POSTHOG_PLAN.md) owns that integration, its event contract, privacy proposal and acceptance cases.

Reader: Nino as photographer/operator and the implementer. Preserve precise metric definitions while keeping the decisions and work order easy to follow.

## 1. Resolve history and access without reducing the product

### Preserve totals and verify the active retention jobs

The repository schedules deletion of engagement events older than 90 days at 03:17 UTC. Its migration date does not prove when production applied it, whether the job is active, or how much history has already disappeared. Do not report a week of loss as an established fact.

The current build includes daily summaries. Confirm their production coverage and reconciliation, the active pruning job and recent executions, and the earliest retained raw event before changing storage. Repair missing preservation through a reviewed migration if needed; do not recreate an already applied backfill merely because this older plan described it as pending. Preserve history independently of competitor research and the reporting interface.

**Recommendation:** keep local raw engagement events on their 90-day schedule and preserve non-identifying action totals. The [live privacy policy](https://ninochavez.co/privacy), fetched September 29, already describes both practices and the IP/browser-derived identifier. PostHog Cloud has a separate retention policy; publish the proposed distinction and configure the agreed privacy controls before enabling export. A provider reporting window is not an automatic deletion guarantee.

If a verified active prune job will run before aggregate preservation can safely ship, present a concrete, bounded pause for approval: exact job, expiry, maximum retention, policy impact, and resumption procedure. Do not pause it automatically or export raw events elsewhere to bypass the retention decision. Production application still needs authorization; this plan alone does not preserve history.

### Keep the public report and protect private operations

Nino subsequently chose public access to the full aggregate report. `/analytics/operator` now permits anonymous report reads; its name does not make it a private page. Preserve this decision in the redesign. Apply current catalogue visibility before calculating public totals and exports. Never send private fields and merely hide them in the UI.

Private notes, saved private reports, individual event investigation and classification changes still require verified Supabase operator identity. The browser never receives raw identifiers, search text, another owner's private rows or provider credentials. PostHog's project remains private; selected aggregate insights reach the public gallery through fixed server-side queries. Do not reintroduce a login requirement for reading the gallery report.

## 2. Deliver the complete photographer and analyst workspace

| Capability | Photographer/operator job | Required behavior |
| --- | --- | --- |
| Overview | Understand what is happening across the gallery | Daily trends, previous-period comparison, popular and rising work, and the albums contributing to change |
| Album reports | Understand one album and compare it with relevant peers | Searchable album list including zero activity; daily measures; photo rankings; album age/size and sharing context; bounded multi-album comparison |
| Photo explorer | Decide which photos deserve attention or another share | Real-image and table views; gallery/album/content filters; popular, rising and recently active rankings; exact photo inspection; shortlist creation and export |
| Sources and sharing | Understand where recorded attention comes from | Tagged arrivals separate from internal photo-open locations, unknown attribution, private sharing annotations over the activity timeline |
| Analyst controls | Slice and compare the same data consistently | Custom dates, named measures, content and traffic filters, selectable columns, full-result CSV exports and reproducible report state |
| Saved reports | Repeat a useful analysis without rebuilding it | Name, save, reopen, update and delete private views; preserve filters in report links; respect access permissions |
| Measurement and operations | Decide whether a result is trustworthy and investigate failures | Coverage/freshness, excluded traffic and its impact, reversible classification where evidence survives, provider reconciliation, search and download diagnostics |
| Durable history | Compare performance over time | Reconciled daily summaries, truthful coverage dates, supported long-period estimates and explicit limits on reconstructing missing history |

```text
Scope: All albums / One album / Selected albums
Activity dates: 7 / 30 / 90 days / Custom
Compare: Previous equal period / Selected period / Supported album-age window
Filters: Sport / Event date or season / Event type / Photo category / Traffic

Overview     Albums → Album report     Photos     Sources     Measurement
                   Shared dates, filters and measure
                      Save view / Export / Shortlist
```

Use all albums and the last 30 complete days by default. Show today's activity separately as partial. Store UTC timestamps, group calendar days in America/Chicago, and show the reporting timezone. Comparison windows must disclose missing coverage. Activity dates and album event dates are independent filters. Compare the first days after publication only where actual publication timestamps exist; never substitute import or event dates.

Use authoritative metadata and retain unknown values in filter choices. Do not infer athlete or team identity to fill missing fields. Show active filters and one clear reset action. Preserve scope, dates and filters across drilldown, Back, reload and report links. Saved reports store query settings, not a frozen claim that the data never changes. Exports include the full filtered result, definitions, timezone, coverage, traffic exclusions and generation time, independently of visible pagination.

Support sharing annotations and source tags without claiming causation. Tag future arrival collection explicitly; do not give downstream actions a channel by joining only on a persistent fingerprint. Audit and instrument search outcomes and download attempts/failures. Show successful delivery only when observed. Historical diagnostics unavailable before instrumentation show their coverage start, not zero. Shortlisting and export do not authorize publishing or sending anything.

Replace the analytics styling completely, as Nino requested September 29. Preserve the product name and real photography. Combine the overview and album comparison with a selected-album side panel, then a dedicated photo detail view. Support phone and desktop use, keyboard navigation, readable chart/table alternatives, and previews that do not count operator activity as audience engagement. The [experience brief](design/experience-brief.md) owns the current composition proposals and user steering.

Before selecting the screen structure, compare three genuinely different whole-screen concepts: a trend-led overview with drilldown, an analyst table with linked charts and image inspection, and an album-led workspace with a cross-gallery discovery view. Walk each through the same cases: a newly shared album, rising older photos, an unusual traffic burst, and an empty or failed report. Select one coherent structure, incorporate useful parts of the rejected concepts, and record the tradeoffs. These are alternatives for the same full scope, not three smaller products.

Popularity is audience response, not a photographic quality score. Different exposure and promotion can explain different counts. Equal reporting windows do not establish equal exposure.

## 3. Keep the metric contract precise across every view

The table below describes retained version-1 evidence and the intended ranking meanings. The [PostHog plan's version-2 contract](POSTHOG_PLAN.md#3-collect-observations-with-an-explicit-owner) adds visits, exposures and observable outcomes. Do not silently combine daily-deduplicated legacy counts with unrestricted new action counts. Show the definition and collection boundary in every affected report.

| Measure | Definition and limitation |
| --- | --- |
| Estimated visitors | Distinct accepted `session_hash` values across the whole selected scope and period. This counts fingerprints, not verified people. Only offer it when the entire interval retains enough evidence to deduplicate. Never add daily or album visitor counts. |
| Album opens | Recorded `album_open` events after the existing visitor/album/day deduplication. Not unrestricted pageviews. |
| Photo opens | `view` events with a photo ID, using the existing visitor/photo/type/day deduplication. Arrival records without a photo ID do not belong here. |
| Download actions | Use the label supported by the emitter. A click or initiation is not a completed file transfer. |
| Favorites and shares | Audit emitters and add/remove/share behavior. Action counts are not necessarily current saved-photo totals or successful deliveries to another person. |
| Popular | Highest count for the selected measure and period. No combined engagement score. |
| Rising | Largest absolute increase against a complete preceding equal period. Without a valid comparator, explain that Rising is unavailable; never substitute Popular. Unequal periods require an explicitly named rate comparison. Show current, previous and difference. A zero baseline says “new activity.” Include percentage growth only with a stated support rule and underlying counts. |
| Latest activity | Latest accepted event, separate from popularity, growth, and album event date. |

Use the same scope, date and traffic rules for totals, chart buckets and rankings. Missing coverage and read failures must not become zeros. Do not add conversion percentages without a matching population and observable completion event.

### Treat the visitor hash as a protected identifier

The code stores an unkeyed SHA-256 digest of IP plus user-agent. Treat it as a pseudonymous identifier, not anonymous data. Exclude it from public responses, URLs, exports, client logs, durable daily summaries, and public diagnostic screens. Audit database grants and server responses as well as rendered output.

Candidate IP/browser combinations can be hashed and compared. The claim that trying every IPv4 address alone universally reverses the identifier is too broad: the browser string and address family also matter. The protection rule does not depend on proving a particular attack practical.

Before release, review a keyed identifier or another minimization design. Define key storage, versioning, rotation and the resulting break in distinct-count comparability before changing it. Hashing differently does not turn a fingerprint into an anonymous person count. Keep any identifier hardening separate from emergency aggregate preservation so it does not delay saving non-identifying totals.

### Fix recording and controlled traffic before interpreting growth

Reuse verified Supabase identity plus the existing operator allowlist to establish internal activity. A normal signed-in visitor is not an operator. Agents outside that browser need an explicit scoped test context. Client body/query flags alone are not trusted.

Apply exclusion to album, photo, search, download, favorite and share paths, including server emitters and public discovery rankings. Local tests default to disabled production analytics or isolated storage. Validate marker expiry, scope and production route-prefix behavior. A separate signed cookie is only needed if existing context cannot serve the job; it must not grant admin access.

Start collection verification with the existing crawler gate and explicit internal/test exclusion, then complete the traffic review capability within this release. Distinguish internal/test, known crawler, suspected automation and unclassified audience. Preserve independent reason flags, deterministic counting precedence, classification version and time. Keep original records unchanged and make supported reclassification reversible.

The measurement view must compare inclusive and conservative aggregates and identify which albums/rankings change; detailed event investigation and correction controls remain private. A newly added marker cannot identify old agent sessions. Historical exclusions require documented, reproducible evidence and a before/after count; unclassified traffic must never be relabeled “human.” Classification cannot be retroactively corrected once the necessary raw evidence is gone.

The collector now has an explicit failure response, but the browser helper ignores it. The September 29 review also reproduced normal download diagnostics being rejected because an optional error field arrives as `null`, and a ZIP path accepting an HTTP error body as an image. Fix these defects, add stable event IDs and bounded retries, and distinguish an accepted duplicate from a failed write. Collection reports are evidence of accepted events, not undeniable evidence of human actions.

## 4. Preserve history at the detail the full reports need

Write durable daily action counts at photo level, with a separate representation for album-only events. Album-only summaries cannot support historical photo rankings. Retain the dimensions needed for the promised queries: album/photo identity, authoritative content grouping, event type, supported source fields and traffic classification. Define grouping at event time versus current catalogue explicitly. Estimate row growth and test combinations before locking the schema. Do not retain raw fingerprints in action summaries. Missing historical dimensions must be disclosed; they cannot be reconstructed by inventing values.

Snapshot authoritative grouping at collection or use an immutable catalogue revision. For retained historical events without such evidence, label the grouping as catalogue values at backfill. Album sport remains the authority; never guess it from an individual photo. Current access and unlisted rules apply even to historical reports.

Make each reporting bucket unique. Re-running a day must replace/reconcile the same result, not add another copy. Handle concurrent arrivals through a defined cutoff and catch-up window. Mark a day complete only after reconciliation; coordinate backfill and pruning so an expiring day is not silently skipped. Store definition version and coverage. Test a rerun and an interrupted run before production application.

Classification stored with totals says what was known at aggregation time. Once raw records are deleted, it cannot identify a new crawler within an old bucket. Corrections are supported only where retained evidence allows recomputation. Keep one active result per bucket/version selection so readers cannot sum old and replacement summaries.

The current `all_time_score` is a weighted retained-window total. Do not reuse it as lifetime history or as the new explicit popularity metric. Longer-lived totals start at the earliest successfully preserved date; say “since [date].” Provide 90-day and custom historical reports over the preserved interval in this release. For longer-period visitor estimates, evaluate mergeable sketches or another bounded design during data-contract work. Validate availability, precision, privacy, filter support, identity versioning and correction limits before selecting it. HLL is a possible implementation, not a universal 99% accuracy guarantee. Label approximations and their coverage; never sum daily distinct counts. Where an interval predates collection or retained evidence cannot support a measure, show it as unavailable and explain why. Full functionality does not authorize invented history.

## 5. Add PostHog and reconcile equivalent measures

The [PostHog integration plan](POSTHOG_PLAN.md) is part of this full release. It specifies the collection/export architecture, anonymous visit context, event/property catalogue, decision-focused reports, public aggregate query boundary, proposed privacy wording, delivery health and acceptance tests. The gallery remains the working photography interface; PostHog provides deeper private journey analysis and experiments.

The page shell contains a Cloudflare Web Analytics beacon. The source scan found no PostHog or GA4 instrumentation in `src` or `package.json`; this does not rule out externally injected configuration. Verify existing accounts and actual collection before provisioning PostHog. Check the active Cloudflare property and whether it is receiving events. An absent GA4 integration is not a delivery gate.

Compare one complete week of Cloudflare daily pageviews for the same album routes with recorded album opens. Align timezone, hostname and route coverage, and inspect SPA navigation and repeat visits. This is a diagnostic comparison, not an equality test: our album opens deduplicate repeat visits within a day, while [Cloudflare defines a different pageview measure](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/). Record the differences and remaining uncertainty.

Where access or compatible route data is unavailable, state that and proceed with direct collection verification. Never declare cross-provider accuracy from similar-looking totals. For new PostHog events, reconcile the same event IDs, schema version, eligible population and time window with first-party accepted records. Old fingerprint/day counts cannot validate new visit funnels.

## 6. Sequence the work; release the full north star

Phasing buys four things: protect expiring history early, settle shared definitions before several views depend on them, test collection before interpreting charts, and diagnose failures within a bounded change. It also allows independent work to run in parallel. It does not reduce the agreed release scope or introduce approval requests at every checkpoint.

| Checkpoint | Work | Evidence before dependent work proceeds |
| --- | --- | --- |
| 0. Confirm facts and experience | Verify active retention and existing summaries; preserve public access; compare whole-screen concepts; map filters and measures; verify PostHog project/tier/region | No inferred production state; one full-scope experience brief, report contract and collection/privacy proposal |
| 1. Preserve and collect reliably | Reconcile summaries; repair diagnosed collection defects; add visits, exposure and outcomes; establish exclusions, permission controls and durable PostHog export | Reruns/retries cannot inflate counts; known internal traffic stays out of both audience destinations; coverage is known |
| 2. Complete shared reporting | Implement date/scope/content/traffic queries, comparisons, history, supported corrections and PostHog journey reports | Independent calculations match totals, buckets, rankings and eligible funnel populations; filter support is explicit |
| 3. Complete the workspace | Overview, album reports/comparison, photo explorer, sources, annotations, diagnostics, saved views and exports | All photographer and analyst jobs work together with persistent state and real data |
| 4. Validate the whole release | Numerical reconciliation, cold visual review, desktop/phone journeys, permissions, failure/retry/date tests and migration rehearsal | Every release acceptance case below passes; unresolved limitations are explicit |
| 5. Release and verify hosted behavior | Apply reviewed migrations and deploy when authorized; verify the hosted code, schema, collection and report behavior | Hosted receipts establish what shipped; a local build is not a production result |

Provider comparison, design exploration and read-only data audits can run in parallel with preservation preparation. UI work can proceed against the agreed contract while report implementation continues; synthetic previews must be clearly labeled and cannot substitute for real-data acceptance. New diagnostic instrumentation should begin collecting as early as authorized so the finished views have evidence.

An earlier authorized preservation deployment is an exception for expiring history, not an MVP or permission to finish the task at checkpoint 1. The complete workspace remains the delivery obligation. Queueing, HLL or vendor selection are implementation decisions driven by measured needs; they are not extra user-facing goals. Load-test collection and queries, introduce durable buffering if required, and prove retries cannot duplicate events.

Extend `src/lib/analytics/`, the engagement and diagnostic endpoints, and the analytics routes. Use server-only report code and existing catalogue/visibility helpers. The existing implementation is a starting point. Its earlier build receipt does not establish completion of the September 29 redesign, measurement repairs or PostHog integration.

Release acceptance:

- Explain a newly shared album using its timeline, audience estimate, action counts, top photos and sharing context; distinguish zero, failure and missing coverage.
- Find popular and rising photos across a sport, event/category and multiple albums; inspect images, create a shortlist and export exact photo identities.
- Compare albums and periods, including older work, zero baselines and supported equal-age windows. Distinguish album event date, recency, popularity and growth.
- Drill from the overview into contributing albums/photos, change filters, navigate Back, save/reopen the view and export all matching rows. All views use the same query rules.
- Compare recorded sharing channels without false attribution; add/edit a private annotation; investigate a search or download failure with its evidence and collection start visible.
- Compare inclusive and conservative traffic results, inspect reasons and reverse a supported classification. Verify recomputation does not double-count summary versions or claim to repair pruned history.
- Exercise every collection path in a marked operator/agent session. Audience reports and discovery rankings stay unchanged; an ordinary audience control still counts.
- Force recording/read failures, duplicate deliveries, partial batches if queueing is used, interrupted backfill and summary reruns. Accepted events and report gaps remain accounted for.
- Verify midnight, daylight saving, partial today, custom comparisons, retention-edge backfill, metadata changes and result sets beyond API row limits.
- Verify public/API/export responses contain no fingerprint, visitor search text, private notes or unauthorized content. Private report links and saved views enforce the chosen access contract server-side.
- Reconcile daily totals against retained evidence and full-scope unique estimates against their documented method. Exercise historical dates before coverage starts.
- Complete the whole workspace on desktop and phone with keyboard support, readable chart/table alternatives and an independent cold review of real-data captures.
- Pass the PostHog plan's delivery, journey, privacy, exclusion, visibility and failure cases. A browser action, an accepted local event, a queried PostHog event and a correct report are separate pieces of evidence.

Do not call the release complete because the album page works while exports, sources, diagnostics or saved views remain unfinished. Its effect on photography/business decisions remains unmeasured until use; that is an outcome to evaluate after the agreed functionality is delivered, not a reason to defer it.

## 7. Evidence and conditions that would change the plan

Current corrections and decisions: [September 29 red-team evidence](audits/analytics-red-team-20260929/REVIEW.md), [experience brief](design/experience-brief.md), and [PostHog plan](POSTHOG_PLAN.md). The September 28 observations below are historical; where they conflict with the current review or the later public-access decision, the newer evidence and decision govern.

Repository evidence inspected during the September 28 investigation:

- [Current analytics loader](../src/routes/analytics/+page.server.ts): fixed 30-day views and retained-event photo ranking; current route intentionally public.
- [Album/photo measure definitions](../supabase/migrations/20260829100043_separate_album_and_photo_opens.sql): separate opens, estimated visitors, and source semantics.
- [Session identity](../src/lib/analytics/session.ts), [event endpoint](../src/routes/api/engagement/+server.ts), and [tracking helpers](../src/lib/analytics/tracker.ts): identity, recording, and deduplication behavior.
- [Automation and ranking definitions](../supabase/migrations/20260728090000_analytics_exclude_automated_sessions.sql) and [retention migration](../supabase/migrations/20260623191000_popularity_engine_tuning.sql): behavioral exclusion and retained-history limits.
- [Album catalogue loader](../src/routes/albums/+page.server.ts): existing sport/year facets and unlisted handling to reuse.
- [Supabase server client](../src/lib/supabase/server-ssr.ts), [admin authorization](../src/lib/server/admin-auth.ts), and [admin album loader](../src/routes/admin/albums/+page.server.ts): existing session validation and operator allowlist to reuse before proposing another authentication system.

The anomaly was independently recomputed from the sanitized audit snapshot; it is historical evidence, not a live counter. Snapshot SHA-256: `18772d3084f47cf917fc97b1bf42787593d92ca9a7c0ccf712d12a0133dd663c`. Private snapshot files stay outside committed documentation.

The earlier plan recorded the following official product references on September 28. On September 29, Pic-Time's activity page was fetched again and supports the described summary, drilldown, segmentation and export. Direct fetches of the SmugMug and Pixieset pages returned 403, so their descriptions below remain prior research claims, not newly verified behavior. Authenticated competitor screens were not exercised:

- [SmugMug statistics](https://www.smugmughelp.com/hc/en-us/articles/18212642507668-Track-the-stats-of-my-photos): date ranges, gallery scope that persists across views, gallery/photo rankings, and report permalinks. Adopt the connected scopes and explicit measures.
- [Pic-Time user activity](https://help.pic-time.com/en/articles/7905036-how-do-i-see-user-activity): gallery summaries, activity detail, user-type segmentation, and export. Adopt drilldown and explicit internal-activity treatment without importing its identity model.
- [Pixieset download activity](https://help.pixieset.com/hc/en-us/articles/360000930212-Reviewing-Collection-Download-Activity): separate gallery/photo download reporting and CSV export. Adopt action-specific detail and clear download semantics.

Change the plan if a controlled replay shows that the suspicious burst comes from a tracking defect: fix that emitter before tuning behavioral classification. If historical metadata cannot support a filter, disclose that interval and instrument the missing dimension prospectively; do not silently remove the agreed control. Change the tool choice if maintaining accurate reporting proves more expensive than an integrated service that satisfies the same contracts. Use observed operator behavior to improve presentation after release. Any material reduction of the agreed north-star scope requires an explicit product decision.
## 8. Turn the data into decisions and follow-up

### Outcome and reader

Give Nino a short list of useful actions, the evidence behind each one, and a way to see whether an action helped. Cover photography, profile/work, writing and demos in the complete release. Put this intelligence in the dashboard, with a contextual assistant for the report Nino is examining. Daily and weekly reports should deliver the same findings. Operational alerts should identify broken collection or visitor flows while they can still be repaired.

This section is the implementation plan for that outcome. Nino is the primary reader and operator. The decision summary uses ordinary language; the data contracts retain exact event names, units, coverage and permissions. Build order follows dependencies. It does not split the commitment into smaller releases.

Success means Nino can choose an action from valid evidence, find its exact album/photo/page, record what changed, and return to an honest comparison. The effect on inquiries, audience response or photography remains unmeasured until those outcomes are observed. A tally of generated recommendations is not the success measure.

### Baseline: separate implemented features from usable evidence

At the last release check, production commit `8c830924bda86a74fdd5fa709d9dc84f353cddc6` was deployed. Gallery totals matched independent SQL for the 30-day and 90-day windows. Photo paging, filters, album inspection and CSV export worked. Automatic gallery and site summary cutoffs advanced at 02:00 and 02:07 UTC on September 30. These are release observations, not a promise about current service health.

The same check found no recorded first-party site-action history. The checked-in PostHog relay has `ANALYTICS_RELAY_ENABLED=false`. There are existing contracts and queries for exposure, rendering, downloads, search, linked sources, reading and demo progress. Neither those files nor a provider HTTP success establish that production actions reach their reports. Verify the deployed bindings and provider receipts again before activation or interpretation.

| Decision | Available foundation | What this build must add or establish |
| --- | --- | --- |
| Promote an album or photo | Gallery measures, comparisons, image inspection and shortlist | Evidence-backed promotion suggestions and recorded follow-up |
| Improve album discovery | `album_exposed`, `album_opened`, linked discovery query | Production delivery, comparable placement/exposure, and a cover/title experiment |
| Repair image or download problems | Rendering failures and separate download lifecycle events | Reliable collection, failure-rate findings, relevant device/release context and alerts |
| Improve search | Result counts, failures and linked result selections | Complete linked search evidence; recommendations without exposing search text |
| Improve profile, articles and demos | Site action counts and same-page-view journey query | Working emitters on each deployed section, history and section-specific findings |
| Improve distribution | Source tags and linked post-arrival observations | Promotion records, adequate cohorts and clear attribution limits |
| Learn what to photograph or edit differently | Known catalogue facts and response signals | Operator notes, repeated comparable cases and visual review |
| Learn whether work produced a business outcome | Contact-link clicks | Optional operator-recorded inquiry/booking outcomes; clicks retain their existing meaning |

### Architecture: calculate once and explain the result

Compare these approaches before implementation:

| Approach | Fit | Decision |
| --- | --- | --- |
| PostHog dashboards, native alerts and subscriptions | Reuses provider features for linked metrics and delivery | Reuse where the finding is wholly supported by a validated provider query. It cannot own local rollup coverage, all current visibility rules, private action records and the complete cross-provider decision workflow. |
| Stored evidence and explicit rules in the existing reporting system | Gives the dashboard and reports the same result, audit trail and privacy checks | Selected foundation. Extend scheduled PostgreSQL reporting and the existing delivery seam. Use PostHog for linked analysis in background jobs. |
| A contextual assistant explains approved evidence and helps explore it | Applies the same findings to Nino's current album, photo, page or comparison | Include in the complete release. Supported question buttons and free-text questions share bounded report tools. Templates can explain supported results; any language model must consume approved evidence and cannot change eligibility, numbers or action rules. |
| An AI agent interprets raw events and independently chooses actions | Flexible narrative, but harder to reproduce and prone to invented explanations | Do not make this the measurement or ranking authority. The assistant uses the validated calculations and rule catalogue above. |

Keep provider queries, rule evaluation and report generation out of page loads. The page reads stored results with their cutoff and coverage. Additional analysis requested through the assistant runs as bounded background work. No DuckDB migration or real-time audience subscription is required for this workload.

```text
Accepted events + known catalogue facts + private operator context
    Scheduled summaries + background linked queries
        Evidence snapshots and versioned decision rules
            Dashboard findings / contextual assistant / scheduled briefs and alerts
                Recorded action and follow-up comparison
```

The canonical baselines are provider funnels, alerts/subscriptions and scheduled PostgreSQL jobs. The custom finding store is justified by the required common evidence, visibility filtering and action history across providers. Reuse native PostHog notifications for compatible findings; choose exactly one sender for each finding and channel. Do not notify once from PostHog and again from our system for the same incident.

Internal references: the existing `posthog-outbox.server.ts` owns collection-delivery RPC access. `apps/rally-hq/src/lib/server/notify.ts` owns a working event-driven notification pattern with preference gates and receipts. Adapt its small producer/recipient/template separation; do not import tournament rules or construct a generic notification platform.

### Workstream A: prove collection and make gaps visible

1. Inventory the deployed public routes in photography, `nino-chavez-site`, `blog` and `nc-demos`. Confirm each emitter, collector origin, consent state, traffic marker, release version and permitted content path. Keep site origin, site section and content kind as separate fields. Adding another property requires an explicit registry entry and verified collection; it is not covered merely because Cloudflare sees the hostname.
2. Follow the existing PostHog activation plan. Resolve its actual privacy, region, credential, quota and hosted-verification holds. Reuse approved 1Password items. Confirm one accepted event ID is received by the intended production project before calling export operational. A 200 capture response means submitted; confirmation needs a query receipt.
3. Rehearse each supported flow end to end: gallery discovery, photo render/failure, favorite addition/removal, individual and ZIP download stages, search outcome/selection, tagged arrival, contact/outbound link, article progress/active time, and demo progress. Test opted-in, opted-out, excluded operator, signed test, retry and failed-provider states. These rehearsals must not add audience activity.
4. Compare event acceptance, durable storage, delivery and report inclusion using the same IDs and definitions. Cloudflare page loads are independent context, not the denominator for opt-in PostHog actions or historical daily-deduplicated gallery opens.
5. Expose collection version, first valid history, summary cutoff, provider receipt delay, expected-versus-observed controlled canaries and unavailable dimensions. No audience events alone does not establish an outage. A fresh SQL refresh alone does not establish complete collection.
6. Confirm the documented deletion and aggregate-preservation behavior. Insights built from missing historical details remain unsupported. Never reconstruct deleted visitors or silently combine daily distinct counts.

Acceptance: each deployed section has a controlled receipt chain and truthful history start; a deliberately broken emitter, failed relay and overdue summary each produce a visible failure. Restoring them clears the incident without inflating audience counts.

### Workstream B: add only context needed for decisions

Extend the existing sharing annotations into private structured records: target, channel tag, actual share time, optional campaign key and note. A saved draft is not a sent share. Link the record to the chart without asserting that it caused subsequent activity.

Add private change/action records: target, change kind, actual change time, hypothesis, primary measure, expected observation window and relevant release/variant. Supported examples are an album-cover change, promotion, page headline/CTA change, search fix, download repair and a shooting/editing experiment.

Record inquiries/bookings only through a bounded manual operator record or a separately verified first-party form/CRM integration. Use an optional source/action reference and a coarse outcome. Do not guess attribution or collect message bodies, visitor email addresses or customer identities into public analytics. The current gallery has no photo-sales goal; this plan adds none.

Add coarse device/viewport and release/placement context only where the existing event contract lacks it. Preserve consent and the property allowlist. Do not collect precise location, additional fingerprints or raw search text for recommendations. Photograph categories must come from supported catalogue fields. Shooting/editing notes are Nino's observations; no revival of deprecated aesthetic extraction, named athlete identity or faces.

Private mutation and outcome history need verified owner access. Exercise the existing Supabase sign-in/session flow before accepting this workflow. Keep public aggregate reading available; do not lock the report behind this requirement. An email account, Chrome profile and exclusion cookie are different things. A browser-local dismissal can work anonymously, but it cannot authorize private records.

### Workstream C: implement a bounded catalogue of decision rules

Each rule names a decision, candidate action, cohort, unit, comparator, required history and exclusions. Its result includes the numerator and denominator, absolute change, coverage, confidence limits, calculation version and reproducible report link. Keep severity, evidence strength and lifecycle state as separate fields.

| Rule family | Evidence required | Suggested action and its limit |
| --- | --- | --- |
| Album momentum | Complete comparable activity windows; absolute increase; publication/promotion context | Inspect and consider resharing the album. New activity has no fabricated percentage baseline. |
| Strong photo response | Photo exposure followed by named favorite/download-item actions, within linked eligible visits; repeated comparable cases | Shortlist photos and inspect a recurring content pattern. Photo opens are a separate weaker signal. No artistic-quality verdict. |
| Discovery friction | Album exposure followed by opens, separated from direct entry; placement and publication-age context | Test a cover, title or card placement. Low opens without exposure evidence do not prove a poor cover. |
| Image/download reliability | Linked attempts and observed render/preparation/handoff/failure stages; device/release context | Investigate the affected flow. An album ZIP is not one individual-photo download; handoff is not a confirmed file save. |
| Search usefulness | Valid search/result-set link; eligible searches, empty results, errors and later selections | Review search relevance or filters. Show aggregate evidence; do not expose search text. |
| Profile response | Eligible page views with later same-view contact-link actions; meaningful exposure | Test clearer positioning or CTA placement. Contact clicks remain distinct from inquiries. |
| Writing/demo response | Eligible content views and separately named progress, active-time or final-section observations | Inspect the opening/sequence and test a change. Reaching a threshold does not prove comprehension. |
| Distribution | Tagged arrivals and later named actions; repeated comparable cohorts; promotion notes | Consider repeating a channel/content pairing. Source rows can overlap and cannot be summed into people; association is not causation. |
| Measurement health | Rejections, failed receipts, controlled canaries, job failures or overdue cutoffs | Repair collection/reporting. Low audience volume alone is not a failure. |
| Follow-up | Recorded action, predeclared outcome/window, valid post-action coverage and known competing changes | Report improved, worsened, unchanged or inconclusive observations. Claim causality only from a supported controlled experiment. |

Use complete-day comparisons for promotion and content decisions. Prefer matched weekdays and relevant publication-age cohorts when enough history exists. Same-age comparisons must use supported elapsed exposure time or clearly label calendar-day limitations. Site summaries currently use UTC days and gallery reports use America/Chicago; retain those boundaries explicitly in each brief panel. Do not add or divide incompatible provider, timezone, consent or event-generation totals. A combined local-day comparison needs new supported evidence before it is offered.

Set minimum eligible samples, meaningful absolute changes, uncertainty checks and repeat-observation rules per metric. Calibrate them against real recorded volume. No universal significance threshold or large percent change from a tiny baseline can produce a confident recommendation. Show insufficient evidence when history is sparse, provider delivery is partial, baselines differ or a comparison is contaminated. Treat multiple tested albums/photos as multiple comparisons; suppress exploratory noise and require confirmation before recommending broad behavior changes.

Keep controlled traffic excluded. Mark findings exploratory where exclusions, unknown metadata or consent coverage materially change the conclusion. Group one underlying incident into one finding. Prioritize observable visitor failures, then decisions with adequate evidence and a concrete action. Avoid a weighted engagement score that combines incompatible units.

Acceptance: controlled cases produce the expected action or a justified suppression. Replaying the same input produces the same finding. Tiny baselines, missing exposure, partial coverage, mixed ZIP/photo units, overlapping sources and incomplete comparisons cannot produce confident action language.

### Workstream D: make evidence and action a connected dashboard job

Deliver three connected experiences: overview recommendations across sites, a contextual assistant inside a report, and scheduled briefs that bring findings to Nino. They share evidence and decision rules. Nino should not have to wait for a scheduled report to understand what to do.

Extend the existing overview with **Worth your attention** and **Actions to review**. Preserve the album comparison panel, photo detail view, pagination, filters and exports. Show a few prioritized findings in the first viewport; keep the complete list accessible through filtering and pagination. A display limit is not a reduced rule catalogue.

A finding shows what changed, why it matters, the evidence period/sample, uncertainty, a proposed action and an exact report link. Opening it preserves site/album scope, dates, traffic policy and selected target. It offers album inspection or the photo explorer when relevant. Include empty, sparse-history, stale, unavailable and recovered states. A dashboard outage must not look like an uneventful day.

Let Nino record **I did this**, dismiss a suggestion with a reason, snooze it, or set a follow-up. Store action time and actual change separately from the suggestion's generation time. Preserve dismissed/history records and permit reversal where appropriate. After the observation window, show the result beside the original hypothesis. Prefer one declared primary outcome and explanatory supporting measures.

#### Contextual assistant: explain this report and help choose a next step

Make visible findings and useful question buttons the entry point. Add a free-text question field alongside them. A blank chat box is not the overview. Supported starting questions include:

- How is this album doing compared with similar albums?
- Which photos should I consider promoting?
- Are people finding this album but struggling to download?
- What happened after I changed its cover?
- Where are readers or demo visitors losing interest?

These are requested analysis jobs, not claims that current collection can answer them. Each job declares its required signals. Missing exposure, linked history or an action record produces a specific explanation of what cannot be concluded.

Capture the selected site, content target, date range, comparison, measure and traffic policy when a question is submitted. Show that scope with the answer. Use known catalogue facts to define comparable albums; show the matching criteria and any exclusions. Changing filters must not silently change an answer already displayed. Offer an explicit rerun for the new scope.

Each answer contains what changed, what the evidence supports, what remains uncertain, a suggested action and how to check its result. Include sample size, source cutoff and exact evidence links. Open the relevant album inspector, photo detail or page comparison without losing scope. Questions about photographic behavior lead to supported response patterns and visual inspection, never an automatic artistic-quality verdict.

Read the latest eligible stored evidence first. If another supported calculation is needed, enqueue bounded analysis and show pending, completed, failed or cancelled status while the rest of the dashboard remains usable. Reuse matching completed work. Show when the answer was calculated and whether its source is stale or partial; requesting an answer does not make yesterday's evidence current. Record the evidence and calculation version so a later review can reproduce the answer.

The server supplies only allowlisted report operations with validated targets, dates, units and access. Free text cannot execute arbitrary SQL, broaden permissions or request raw visitor data. If a language model is used, it may select a supported operation and explain its returned evidence. It may not calculate unsupported rates, invent causes, lift confidence, or bypass a rule's suppression. Unsupported questions receive an honest limit and a useful supported alternative. Collection failures must remain distinguishable from insufficient audience history.

Assistant answers use the same visibility checks as report responses. Treat questions and conversation history as private operator context; do not export them as analytics events or add them to public briefs. Public readers may use predefined explanations of public aggregate findings. Owner access is required for free-text questions, private action context and saved conversations. Private history follows the explicit retention policy in this plan. Do not send raw events, private notes or question text to a language provider without an approved provider/data contract.

Suggestions do not publish a promotion, change a cover, edit a site or send a message. Nino records or explicitly authorizes the action through its owning workflow. The assistant can prepare an action record for review; it cannot mark a suggested action as completed. Scheduled briefs reference the same finding versions and links, so their conclusions match the dashboard when scope and cutoff match.

Acceptance: the supported question buttons and equivalent free-text questions return consistent evidence; scope changes are visible; delayed analysis does not block navigation; absent signals produce no invented answer. Test hidden targets, unauthorized private context, instructions embedded in content, unsupported queries, provider timeouts and repeated requests. The assistant must neither leak private data nor weaken measurement rules. Model unavailability leaves stored findings and supported template explanations usable.

Before implementing new whole-screen composition, compare overview-first, task-list-first and album-inspector-first concepts on the same real representative states. Keep the strongest parts of the rejected concepts and record what was retained. Use the current owned visual system, readable field alignment and real photographs. Desktop/mobile rendered review and a cold reviewer must judge the whole changed screen; source and passing tests cannot certify its appearance.

Acceptance: Nino can understand a finding, inspect the exact evidence, record an action and return to its result without rebuilding filters. Public readers receive only currently public aggregate evidence. Private notes, action/outcome history, recipient settings and investigation records never enter anonymous responses.

### Workstream E: deliver useful reports without notification noise

Proposed defaults, configurable by the owner:

| Report | Schedule and job | Quiet behavior |
| --- | --- | --- |
| Daily brief | 08:00 America/Chicago; last complete source days, material changes, promotion candidates and due follow-ups | Generate an in-dashboard brief each day. Outbound delivery happens only when there is new actionable information; no fabricated zero for unavailable data. |
| Weekly review | Monday 08:00 America/Chicago; completed weekly evidence, repeated patterns, recorded actions and follow-up results | Keep sparse or inconclusive weeks explicit. Dashboard review remains available even when outbound delivery is muted. |
| Operational alert | Evaluate on the existing bounded job cadence; confirmed collection/render/download/refresh problems | One open incident per cause; cooldown, acknowledged state and a recovery message. Display every incident even when outbound delivery is muted. |

Use a few top actions in a brief with a link to all findings. Explain each period and timezone. Complete-day briefs wait for successful preservation/refresh and supported provider cutoffs. Current-day operational evidence is labeled partial and compared only with a compatible cutoff.

Use the existing job mechanism to check due work; compute the owner's local date/time and persist a unique period key. UTC offset changes, retries or overlapping runs must not duplicate a daily/weekly report. Late runs retain the intended period, mark delayed delivery and suppress obsolete alerts. Keep snapshot generation separate from notification attempts.

Email is the proposed optional external channel. Its destination, delivery preference and final activation require a verified owner choice; do not infer an address from screenshots or Chrome. Reuse PostHog subscriptions/alerts when their data and privacy match the finding. Use one small owned sender for cross-provider briefs or local operational evidence. Persist a delivery record and stable idempotency key; provider acceptance and confirmed delivery remain distinct from inbox placement. A timeout after submission requires reconciliation before another send.

No sends, scheduled automation, new recipients or credential changes occur while writing this plan. No billing change is implied. A production rehearsal sends only to an explicitly authorized test destination. Normal scheduled activation happens after complete release acceptance and destination verification.

### Data and execution boundaries

Extend existing annotations and report storage before adding tables. Where separate records are necessary, use these responsibilities rather than another event store:

- Evidence snapshot: rule/version, target, cohort/windows/timezones, aggregate inputs, source cutoffs, visibility/coverage and calculation timestamp.
- Finding: evidence reference, action, evidence strength, severity, lifecycle, suppression/deduplication key and report query.
- Action/change: owner, actual action, target/time, hypothesis, primary outcome, follow-up date and private notes.
- Brief: owner, local reporting period, finding references, snapshot version and delivery status.

On-demand analysis records need a validated scope, supported operation/version, request status and evidence references. Reuse existing job/result storage if it supports these fields. Persist private conversation text only under the owner-approved retention policy; reproducing a calculation does not require retaining the conversation. Apply query limits, timeouts, request deduplication and measured per-owner concurrency limits. If language-model usage is selected, declare its cost allowance before activation; no new paid provider or budget increase follows from this plan.

An evaluator reads stored summaries plus background query receipts; it writes an immutable version of evidence and upserts the finding identity. A changed input or rule creates a new version rather than rewriting an old claim. Reclassification, deletion requests and visibility changes invalidate affected findings, links and exports. Archived snapshots retain only eligible non-identifying evidence; private owner records follow an explicit documented retention policy. Do not promise a new retention duration until its owner approves it.

Use protected server/RLS boundaries for private records. Public projections recheck current album/photo visibility and return no event identifiers, browser IDs, raw queries, private outcomes or provider errors. No public precomputed finding can reveal an album that has since become unlisted. Outbound reports include only recipient-authorized context; previously sent copies cannot be retroactively recalled.

Scheduled work is idempotent, bounded and monitored. Reuse existing PostgreSQL scheduling and Workers delivery where adequate; a queue is warranted only when measured batching/backlog requires it. A queue can redeliver, so notification idempotency is required regardless of transport. No new warehouse, broad credentials or unbounded page-load query is part of the design.

### Complete-release work order and verification

1. Establish production event/report coverage and resolve actual activation holds.
2. Extend promotion/change/outcome context and validate the private operator workflow.
3. Specify and test the rule catalogue against aggregate/linked evidence, suppression and invalidation cases.
4. Store scheduled findings; implement dashboard inspection, the contextual assistant and bounded on-demand analysis, action recording and follow-up.
5. Implement daily/weekly briefs, incident alerts, preference gates and delivery receipts.
6. Rehearse the complete job, measure performance, inspect desktop/mobile renders and obtain cold review.
7. Apply reviewed migrations before the reader deployment; deploy through the owned git integration; verify actual scheduled runs and approved test delivery before activating normal reporting.

All seven steps belong to the same complete release. A successful stage is not acceptance of the whole product. Capture the exact source/version, SQL checks, browser states, provider receipt chain, scheduled job runs and delivery status. Keep synthetic fixtures labeled. No production rehearsal may pollute audience measurements.

Required adversarial checks: partial/stale/missing data; raw retention boundary; provider pending/unavailable; opted-out and internal/test traffic; zero/tiny baseline; unequal periods and DST; duplicate/lost/late notification responses; failed collection with a fresh rollup; hidden or moved photos; competing changes; repeated snoozes; low-volume and high-volume events; pagination and preserved drilldown state; assistant scope drift, unauthorized context, invented denominators, malicious content instructions and unavailable language providers. Force each important gate to fail once.

Performance acceptance reuses `scripts/measure-analytics-performance.mjs` with the same load conditions. Compare before/after cold and warm results; disclose cache state and provider outliers. The last live gallery medians were 1.08 seconds desktop and 1.89 seconds simulated mobile across three runs. Those are lab observations, not field guarantees. Findings must remain usable when PostHog is slow and must not add a synchronous provider request to initial rendering. Measure stored-answer response time separately from background query and optional language-model time. Assistant loading and failures must not delay filters, pagination or album/photo inspection.

### Sources, open choices and what would change the design

Source checked for this extension: site/action/event contracts, fixed PostHog queries, reporting components, current relay configuration, scheduled-report migrations, the previous production release receipts and the internal notification implementation. Source inspection establishes implemented behavior; the next build still needs fresh hosted collection evidence. Competitor screens and historical raw events were not re-audited for this extension.

Vendor sources fetched September 29, 2026:

- [PostHog funnels](https://posthog.com/docs/product-analytics/funnels), [alerts](https://posthog.com/docs/product-analytics/alerts) and [subscriptions](https://posthog.com/docs/product-analytics/subscriptions): use supported linked-flow analysis and native notification features where suitable. Check the actual account entitlement before provisioning; no upgrade is authorized.
- [Supabase Cron](https://supabase.com/docs/guides/cron): extend database scheduling and inspect recorded job execution status.
- [Cloudflare delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/): queue consumers must tolerate duplicate delivery.

Final activation choices: verified external destination, owner-selected cadence/preferences, private-record retention, and any optional inquiry/booking connector. The proposed in-dashboard reports allow the build to proceed without guessing those values. Private access must work before the private action/outcome workflow is accepted.

Revisit the chosen architecture if native provider features demonstrably satisfy the full visibility/context/action-history contracts with less owned code. Revise or retire a rule when reviewed examples show repeated wrong actions. Expand collection only when a specific decision lacks necessary evidence. If low traffic cannot support a comparison, retain the full feature but show insufficient evidence and widen the supported observation window; do not produce stronger wording or invent measurements.
