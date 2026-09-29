# Photography analytics implementation plan

Status: the full local implementation and independent visual acceptance are complete; production application and real-data acceptance remain separate. The requirement remains the full release described here. `ANALYTICS_BUILD.md` records the implementation and evidence. This plan does not authorize production migrations, changes to retention or access, or deployment.

Build the full photography analytics north star in one complete release. Nino must be able to understand individual albums, discover popular and rising work, compare performance, investigate distribution and data quality, and save or export useful views. Preserve useful totals, exclude controlled test traffic, and make collection failures visible.

**Scope directive, September 28:** the full north star is the release commitment. Phases describe dependency order, parallel work and verification checkpoints. They are not smaller releases, optional feature bundles, or permission to stop after a subset works. Do not reduce scope on the assumption that a one-person gallery needs less. A preservation-only production change may happen earlier if separately authorized because waiting can lose history; that does not replace the complete release.

Keep first-party events as the initial foundation. Select additional services only if they materially improve delivery of the agreed capabilities; a vendor migration is neither required nor ruled out by the release scope.

Reader: Nino as photographer/operator and the implementer. Preserve precise metric definitions while keeping the decisions and work order easy to follow.

## 1. Resolve history and access without reducing the product

### Preserve totals first; keep the published raw-data retention

The repository schedules deletion of engagement events older than 90 days at 03:17 UTC. Its migration date does not prove when production applied it, whether the job is active, or how much history has already disappeared. Do not report a week of loss as an established fact.

The first implementation task is a read-only production check: applied migration, active job and recent executions, earliest retained event, daily event counts, and any existing summaries. Then prepare a small, reviewed migration that preserves daily action totals and backfills the retained window. Do this independently of competitor research, provider comparisons, and the full reporting interface.

**Recommendation:** deliver aggregate preservation first and keep raw events on their existing 90-day schedule. The [live privacy policy](https://ninochavez.co/privacy) already describes the IP/browser-derived identifier and promises deletion of engagement events after 90 days. The policy must also explain the proposed longer-lived aggregate totals before that practice ships.

If a verified active prune job will run before aggregate preservation can safely ship, present a concrete, bounded pause for approval: exact job, expiry, maximum retention, policy impact, and resumption procedure. Do not pause it automatically or export raw events elsewhere to bypass the retention decision. Production application still needs authorization; this plan alone does not preserve history.

### Decide access before building report endpoints

The current analytics page is deliberately public. Choose its audience before the report queries and UI are implemented:

| Choice | Consequence for the full release |
| --- | --- |
| Private operator workspace with the existing public aggregate summary — recommended | Deliver every analytical capability privately and preserve the deliberate public summary. Define separate server response contracts; never send private fields and merely hide them in the UI. |
| Make the complete analytics workspace private | Deliver every capability behind verified Supabase identity and the existing operator allowlist. This changes the current public route. |
| Broader public aggregate explorer plus private operator controls | Public visitors can explore approved aggregates; notes, traffic investigations, saved private reports and sensitive diagnostics remain authenticated. |

The implemented choice is the recommended split: `/analytics` remains the public aggregate summary and `/analytics/operator` contains the complete private workspace. The private page and CSV verify the Supabase user with `getUser()` and apply the existing operator allowlist before any service-role read. The browser never receives raw identifiers, search text, or private rows from another owner.

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

Preserve the site's visual identity. Put album performance ahead of a large photo grid. Support phone and desktop use, keyboard navigation, readable chart/table alternatives, and previews that do not count operator activity as audience engagement.

Before selecting the screen structure, compare three genuinely different whole-screen concepts: a trend-led overview with drilldown, an analyst table with linked charts and image inspection, and an album-led workspace with a cross-gallery discovery view. Walk each through the same cases: a newly shared album, rising older photos, an unusual traffic burst, and an empty or failed report. Select one coherent structure, incorporate useful parts of the rejected concepts, and record the tradeoffs. These are alternatives for the same full scope, not three smaller products.

Popularity is audience response, not a photographic quality score. Different exposure and promotion can explain different counts. Equal reporting windows do not establish equal exposure.

## 3. Keep the metric contract precise across every view

| Measure | Definition and limitation |
| --- | --- |
| Estimated visitors | Distinct accepted `session_hash` values across the whole selected scope and period. This counts fingerprints, not verified people. Only offer it when the entire interval retains enough evidence to deduplicate. Never add daily or album visitor counts. |
| Album opens | Recorded `album_open` events after the existing visitor/album/day deduplication. Not unrestricted pageviews. |
| Photo opens | `view` events with a photo ID, using the existing visitor/photo/type/day deduplication. Arrival records without a photo ID do not belong here. |
| Download actions | Use the label supported by the emitter. A click or initiation is not a completed file transfer. |
| Favorites and shares | Audit emitters and add/remove/share behavior. Action counts are not necessarily current saved-photo totals or successful deliveries to another person. |
| Popular | Highest count for the selected measure and period. No combined engagement score. |
| Rising | Largest absolute increase against the preceding equal period. Show current, previous and difference. A zero baseline says “new activity.” Include percentage growth only for nonzero baselines that meet an explicit support threshold calibrated on the real distribution; show the rule and the underlying counts. |
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

The private measurement view must compare inclusive and conservative counts and identify which albums/rankings change. A newly added marker cannot identify old agent sessions. Historical exclusions require documented, reproducible evidence and a before/after count; unclassified traffic must never be relabeled “human.” Classification cannot be retroactively corrected once the necessary raw evidence is gone.

The current collector returns success after some database errors. Correct that contract and distinguish an accepted duplicate from a failed write. Collection reports are evidence of accepted events, not undeniable evidence of human actions.

## 4. Preserve history at the detail the full reports need

Write durable daily action counts at photo level, with a separate representation for album-only events. Album-only summaries cannot support historical photo rankings. Retain the dimensions needed for the promised queries: album/photo identity, authoritative content grouping, event type, supported source fields and traffic classification. Define grouping at event time versus current catalogue explicitly. Estimate row growth and test combinations before locking the schema. Do not retain raw fingerprints in action summaries. Missing historical dimensions must be disclosed; they cannot be reconstructed by inventing values.

Snapshot authoritative grouping at collection or use an immutable catalogue revision. For retained historical events without such evidence, label the grouping as catalogue values at backfill. Album sport remains the authority; never guess it from an individual photo. Current access and unlisted rules apply even to historical reports.

Make each reporting bucket unique. Re-running a day must replace/reconcile the same result, not add another copy. Handle concurrent arrivals through a defined cutoff and catch-up window. Mark a day complete only after reconciliation; coordinate backfill and pruning so an expiring day is not silently skipped. Store definition version and coverage. Test a rerun and an interrupted run before production application.

Classification stored with totals says what was known at aggregation time. Once raw records are deleted, it cannot identify a new crawler within an old bucket. Corrections are supported only where retained evidence allows recomputation. Keep one active result per bucket/version selection so readers cannot sum old and replacement summaries.

The current `all_time_score` is a weighted retained-window total. Do not reuse it as lifetime history or as the new explicit popularity metric. Longer-lived totals start at the earliest successfully preserved date; say “since [date].” Provide 90-day and custom historical reports over the preserved interval in this release. For longer-period visitor estimates, evaluate mergeable sketches or another bounded design during data-contract work. Validate availability, precision, privacy, filter support, identity versioning and correction limits before selecting it. HLL is a possible implementation, not a universal 99% accuracy guarantee. Label approximations and their coverage; never sum daily distinct counts. Where an interval predates collection or retained evidence cannot support a measure, show it as unavailable and explain why. Full functionality does not authorize invented history.

## 5. Verify Cloudflare in parallel, without holding up preservation

The page shell contains a Cloudflare Web Analytics beacon. The source scan found no PostHog or GA4 instrumentation in `src` or `package.json`; this does not rule out externally injected configuration. Check the active Cloudflare property and whether it is actually receiving events. Do not make access to absent services a delivery gate.

Compare one complete week of Cloudflare daily pageviews for the same album routes with recorded album opens. Align timezone, hostname and route coverage, and inspect SPA navigation and repeat visits. This is a diagnostic comparison, not an equality test: our album opens deduplicate repeat visits within a day, while [Cloudflare defines a different pageview measure](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/). Record the differences and remaining uncertainty.

Where access or compatible route data is unavailable, state that and proceed with direct collection verification. Never declare cross-provider accuracy from similar-looking totals. Only extend the comparison to another provider if it is already collecting relevant events.

## 6. Sequence the work; release the full north star

Phasing buys four things: protect expiring history early, settle shared definitions before several views depend on them, test collection before interpreting charts, and diagnose failures within a bounded change. It also allows independent work to run in parallel. It does not reduce the agreed release scope or introduce approval requests at every checkpoint.

| Checkpoint | Work | Evidence before dependent work proceeds |
| --- | --- | --- |
| 0. Confirm facts and experience | Inspect live retention; settle access placement; compare whole-screen concepts; map all promised filters and measures | No inferred production state; one full-scope experience brief and report/access contract |
| 1. Preserve and collect reliably | Design summaries for full query needs, backfill and reconcile, fix false success, add trusted test context and privacy/identifier treatment | Reruns cannot inflate counts; marked tests stay out of audience reports; preservation coverage is known |
| 2. Complete shared reporting | Implement date/scope/content/traffic queries, comparisons, history, classification corrections and authorized server responses | Independent calculations match totals, buckets and rankings; all required filter combinations have explicit support/coverage |
| 3. Complete the workspace | Overview, album reports/comparison, photo explorer, sources, annotations, diagnostics, saved views and exports | All photographer and analyst jobs work together with persistent state and real data |
| 4. Validate the whole release | Numerical reconciliation, cold visual review, desktop/phone journeys, permissions, failure/retry/date tests and migration rehearsal | Every release acceptance case below passes; unresolved limitations are explicit |
| 5. Release and verify hosted behavior | Apply reviewed migrations and deploy when authorized; verify the hosted code, schema, collection and report behavior | Hosted receipts establish what shipped; a local build is not a production result |

Provider comparison, design exploration and read-only data audits can run in parallel with preservation preparation. UI work can proceed against the agreed contract while report implementation continues; synthetic previews must be clearly labeled and cannot substitute for real-data acceptance. New diagnostic instrumentation should begin collecting as early as authorized so the finished views have evidence.

An earlier authorized preservation deployment is an exception for expiring history, not an MVP or permission to finish the task at checkpoint 1. The complete workspace remains the delivery obligation. Queueing, HLL or vendor selection are implementation decisions driven by measured needs; they are not extra user-facing goals. Load-test collection and queries, introduce durable buffering if required, and prove retries cannot duplicate events.

Extend `src/lib/analytics/`, the engagement endpoint, and the analytics route. Use server-only report code and existing catalogue/visibility helpers. The unpublished refit improves layout, labels, links and unavailable states; its `tracker.ts` changes propagate read failures. It is a starting point, not completion of the full design.

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

Do not call the release complete because the album page works while exports, sources, diagnostics or saved views remain unfinished. Its effect on photography/business decisions remains unmeasured until use; that is an outcome to evaluate after the agreed functionality is delivered, not a reason to defer it.

## 7. Evidence and conditions that would change the plan

Repository evidence inspected during the September 28 investigation:

- [Current analytics loader](../src/routes/analytics/+page.server.ts): fixed 30-day views and retained-event photo ranking; current route intentionally public.
- [Album/photo measure definitions](../supabase/migrations/20260829100043_separate_album_and_photo_opens.sql): separate opens, estimated visitors, and source semantics.
- [Session identity](../src/lib/analytics/session.ts), [event endpoint](../src/routes/api/engagement/+server.ts), and [tracking helpers](../src/lib/analytics/tracker.ts): identity, recording, and deduplication behavior.
- [Automation and ranking definitions](../supabase/migrations/20260728090000_analytics_exclude_automated_sessions.sql) and [retention migration](../supabase/migrations/20260623191000_popularity_engine_tuning.sql): behavioral exclusion and retained-history limits.
- [Album catalogue loader](../src/routes/albums/+page.server.ts): existing sport/year facets and unlisted handling to reuse.
- [Supabase server client](../src/lib/supabase/server-ssr.ts), [admin authorization](../src/lib/server/admin-auth.ts), and [admin album loader](../src/routes/admin/albums/+page.server.ts): existing session validation and operator allowlist to reuse before proposing another authentication system.

The anomaly was independently recomputed from the sanitized audit snapshot; it is historical evidence, not a live counter. Snapshot SHA-256: `18772d3084f47cf917fc97b1bf42787593d92ca9a7c0ccf712d12a0133dd663c`. Private snapshot files stay outside committed documentation.

Product references were fetched from official help pages on September 28, 2026. These establish documented behavior; authenticated competitor screens were not exercised:

- [SmugMug statistics](https://www.smugmughelp.com/hc/en-us/articles/18212642507668-Track-the-stats-of-my-photos): date ranges, gallery scope that persists across views, gallery/photo rankings, and report permalinks. Adopt the connected scopes and explicit measures.
- [Pic-Time user activity](https://help.pic-time.com/en/articles/7905036-how-do-i-see-user-activity): gallery summaries, activity detail, user-type segmentation, and export. Adopt drilldown and explicit internal-activity treatment without importing its identity model.
- [Pixieset download activity](https://help.pixieset.com/hc/en-us/articles/360000930212-Reviewing-Collection-Download-Activity): separate gallery/photo download reporting and CSV export. Adopt action-specific detail and clear download semantics.

Change the plan if a controlled replay shows that the suspicious burst comes from a tracking defect: fix that emitter before tuning behavioral classification. If historical metadata cannot support a filter, disclose that interval and instrument the missing dimension prospectively; do not silently remove the agreed control. Change the tool choice if maintaining accurate reporting proves more expensive than an integrated service that satisfies the same contracts. Use observed operator behavior to improve presentation after release. Any material reduction of the agreed north-star scope requires an explicit product decision.
