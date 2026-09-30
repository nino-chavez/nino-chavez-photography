# Verdict

The design is directionally sound, but it is not ready to ship as a trustworthy full-scope analytics system. I found three P1 correctness/privacy defects, one P1 performance defect, and three P2 measurement defects. There is no source-confirmed P0.

The most serious problems are:

- The pending prune migration can retain pseudonymous PostHog payloads indefinitely.
- Public gallery reports can expose a photo after it moves into an unlisted album.
- Site-action gaps are rendered as measured zeroes.
- The report architecture loads the full result before paginating, matching the documented 19–26 second renders.

## 1. Collection, consent, and retention

### DATA-01 — P1 — Pending prune function breaks the 90-day pseudonymous-data boundary

- **Evidence:** Source-confirmed; live not verified.
- **Scope:** Pending only; current release blocker.
- **Locations:** [`20260929190000_analytics_v2_classifications_health.sql:8–12,317–348`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/supabase/migrations/20260929190000_analytics_v2_classifications_health.sql:8), [`20260929215936_site_action_analytics.sql:6–28`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/supabase/migrations/20260929215936_site_action_analytics.sql:6), [`20260929040000_analytics_events_v2_outbox.sql:70–75`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/supabase/migrations/20260929040000_analytics_events_v2_outbox.sql:70), [`site-actions-assertions.sql:23–30`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/supabase/rehearsal/site-actions-assertions.sql:23).
- **Observed mechanism:** The classification migration deliberately removes the outbox foreign key, then explicitly deletes event outbox rows when their raw event expires. The pending site-action migration replaces that prune function and deletes only old `confirmed` rows. Its statement that outbox rows cascade is no longer true. Pending, failed, or submitted rows can therefore survive after their raw event is archived and deleted. Their JSON payload contains `anonymous_browser_id` and `visit_id`.
- **Affected job and blast radius:** A visitor expects linked identifiers to disappear with the stated 90-day raw retention. Every export-eligible event whose delivery is not confirmed at prune time is affected. These orphans also distort delivery health and cannot be reconciled against a retained event.
- **Reproduction/falsifier:** Accept an export-eligible event, backdate `received_at` by 91 days, leave its outbox row pending, invoke the pending prune function, then query both tables. The defect is falsified only if the raw event and its event-origin outbox row are both gone.
- **Confidence:** High.
- **Smallest coherent remedy:** Preserve the existing explicit event-orphan and classification-control cleanup while adding the site-action archive dimensions. Add an export-eligible expired event to the SQL rehearsal and exercise pending, submitted, failed, and confirmed states.

### DATA-02 — P2 — Corrections can promote excluded traffic into public audience totals

- **Evidence:** Source-confirmed and locally reproduced.
- **Scope:** Both committed and pending; current bug.
- **Locations:** [`20260929190000_analytics_v2_classifications_health.sql:65–102`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/supabase/migrations/20260929190000_analytics_v2_classifications_health.sql:65), [`v2-report-projection.server.ts:73–94`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/v2-report-projection.server.ts:73), [`20260929215936_site_action_analytics.sql:40–47`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/supabase/migrations/20260929215936_site_action_analytics.sql:40).
- **Observed mechanism:** The correction RPC permits any classification. The generic v2 projection uses the latest classification unconditionally, so an original `operator`, `test`, or `self_excluded` event corrected to `audience` enters the public audience report. The pending site-action RPC instead preserves any original non-audience context. Two public reports therefore assign different effective traffic to the same event. The outbox eligibility rule already uses the safer invariant: original context must have been audience.
- **Affected job and blast radius:** The operator cannot trust audience totals after a correction. This affects raw v2 counts until archival and creates source-to-source reconciliation disagreements.
- **Reproduction/falsifier:** I passed an `operator` event with latest classification `audience` through `buildV2ReportProjection`; it returned `photo_opened: 1` in audience mode. The defect is falsified if it returns zero consistently across raw, archive, site-action, and provider projections.
- **Confidence:** High.
- **Smallest coherent remedy:** Make collection context immutable. Compute report eligibility as `original_context = audience AND latest_classification IN (audience, unclassified)`. Corrections may refine or exclude audience traffic, but must not elevate operator, test, or excluded traffic.
- **Overlap:** Backend classification and frontend report-consistency reviews.

## 2. Privacy and catalogue lifecycle

### DATA-03 — P1 — Current visibility is checked against the historical album key, not the photo’s current album

- **Evidence:** Source-confirmed; live not verified.
- **Scope:** Both; current public-data bug.
- **Locations:** [`operator-report.server.ts:226–250,298–313`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/operator-report.server.ts:226), [`v2-report-projection.server.ts:108–124`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/v2-report-projection.server.ts:108), [`operator-report.test.ts:112–170`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/operator-report.test.ts:112).
- **Observed mechanism:** Public filtering excludes rows whose recorded album key is currently unlisted. Preview lookup then requests `photo_id, cf_image_id` without the current `album_key`. If photo P was observed in public album A and later moved to unlisted album B, its historical A row passes filtering and the report emits P’s reference, preview URL, and photo segment. V2 aggregates have the same inclusion error, although their returned DTO omits identifiers.
- **Affected job and blast radius:** A visitor opening the intentional public aggregate report can discover a currently unlisted photo. Every photo whose album membership changes is exposed; ordinary same-album visibility changes are already covered correctly.
- **Reproduction/falsifier:** Fixture: historical row `(P,A)`, current `photo_metadata(P,B)`, A public, B unlisted. Build the public report. The defect exists if P appears anywhere. Existing tests cover a hidden album with an unchanged key, not this move.
- **Confidence:** High.
- **Smallest coherent remedy:** Resolve every photo ID to its current album before aggregation and output. Require that current album to be public. Fetch current `album_key` with previews and add public→unlisted, unlisted→public, and deleted-photo tests.
- **Overlap:** Backend loader and frontend public-report reviews.

## 3. Aggregation and coverage

### DATA-04 — P1 — Site-action reports convert missing coverage into zero

- **Evidence:** Source-confirmed; live not verified.
- **Scope:** Pending only; release blocker.
- **Locations:** [`20260929215936_site_action_analytics.sql:33–80`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/supabase/migrations/20260929215936_site_action_analytics.sql:33), [`SiteActions.svelte:8–25`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/components/analytics/SiteActions.svelte:8).
- **Observed mechanism:** The RPC has no daily or per-metric coverage ledger. `recordedSections` means only that some event for a section exists at some time. The component then renders every absent applicable measure as zero and calls the interval “complete UTC days.” A writing page view is enough to make missing `reading_90` and `active_30` instrumentation display as measured zeroes. Mid-period outages are indistinguishable from no activity.
- **Affected job and blast radius:** The operator may change an article or demo because an unmeasured behavior appears to have failed. All comparisons, page rows, and partial-today values are affected.
- **Reproduction/falsifier:** Insert only `site_page_viewed` for `writing`. The RPC returns `writing` in `recordedSections`; the UI renders zero for reading and active-time metrics. Falsify with explicit complete coverage for each date, section, metric, and instrumentation version.
- **Confidence:** High.
- **Smallest coherent remedy:** Copy the proven legacy pattern: a daily coverage ledger and nullable totals. Record instrumentation/version coverage explicitly. Return `null` for unavailable periods or metrics, and suppress comparisons unless both windows are complete.
- **Overlap:** Frontend empty-state and comparison review.

## 4. Query and rendering lifecycle

### DATA-05 — P1 — Pagination occurs after full-range loading and sequential preview fan-out

- **Evidence:** Source-confirmed. Existing live evidence inspected but not independently rerun.
- **Scope:** Both; current bug with worsening future-scale risk.
- **Locations:** [`operator-report.server.ts:241–313`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/operator-report.server.ts:241), [`v2-report-projection.server.ts:186–224`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/v2-report-projection.server.ts:186), [`PERFORMANCE.md:24–38`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/docs/implementation/site-actions-20260929/PERFORMANCE.md:24).
- **Observed mechanism:** The legacy builder loads the full expanded interval, constructs every photo group, then performs sequential batches of 100 preview IDs before the UI paginates. V2 loads every raw and archived event in the range and then loads every classification in the database, not just classifications for those events. The pending site-action RPC similarly builds one union over raw and indefinite archive history before applying most date work.
- **Affected job and blast radius:** Every report viewer waits for work unrelated to the visible page. Database and application memory grow with total history and catalogue size.
- **Minimal reproduction:** The saved candidate evidence reports 3,097 preview records through 31 sequential queries and 19.33–25.54 second ninety-day renders. Those timings are **live not verified in this review**; the fan-out mechanism is source-confirmed.
- **Confidence:** High on mechanism; medium on current production timings.
- **Smallest coherent remedy:** Move filters, effective classification, current visibility, ranking, and pagination into report RPCs. Run one bounded aggregate query plus one visible-page preview query. Give CSV its own cursor/export path. Restrict classification lookup to selected event IDs.

## 5. Measurement ownership and exports

### DATA-06 — P2 — Legacy “shares” treat opening a composer as a completed, high-weight share

- **Evidence:** Source-confirmed; live not verified.
- **Scope:** Committed; current bug.
- **Location:** [`client.ts:82–105`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/client.ts:82).
- **Observed mechanism:** `recordShare` sends a legacy `share` for every outcome except `cancelled` and `failed`. That includes `composer_opened`, `email_link_opened`, and `native_share_handed_off`. The surrounding contract calls this a completed share and notes that legacy share has the highest popularity weight. Those observations prove only successful UI or OS handoff. V2 correctly retains the distinct outcomes.
- **Affected job and blast radius:** Popular and rising rankings can overvalue photos whose share UI was opened but never used. The legacy “Shares” total also overstates completion.
- **Reproduction/falsifier:** Call `recordShare(subject, channel, 'composer_opened')`; it invokes both legacy `trackEngagement('share')` and the precise v2 event.
- **Confidence:** High.
- **Smallest coherent remedy:** Stop calling the legacy value completed. Either restrict legacy ranking to an explicitly accepted observable outcome, or rename/reweight it as “share handoffs.” Keep V2 outcomes separate.

### DATA-07 — P2 — One CSV places legacy and v2 observations in the same additive-looking count column

- **Evidence:** Source-confirmed.
- **Scope:** Committed; current export hazard.
- **Locations:** [`operator-report.server.ts:420–438`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/operator-report.server.ts:420), [`photo/[id]/+page.svelte:37–43`](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/photo/[id]/+page.svelte:37).
- **Observed mechanism:** A photo open deliberately emits both legacy and v2 events. The CSV then appends legacy photo/album rows and v2 observation rows under one `count` column. `row_type` and definitions distinguish them, but a normal spreadsheet sum doubles overlapping actions.
- **Affected job and blast radius:** Anyone analyzing the exported CSV can create a plausible but false combined total. The on-screen report does not currently sum these systems.
- **Reproduction/falsifier:** One photo open produces a legacy photo count of one and a v2 “Photos opened” count of one; summing the CSV column returns two.
- **Confidence:** High.
- **Smallest coherent remedy:** Export legacy and v2 as separate files or separate non-additive tables. At minimum add `measurement_system` and `additive_group`, and leave a shared total column unavailable across systems.
- **Overlap:** Frontend/export semantics review.

## Architecture recommendation

Keep both systems during transition, but make their ownership explicit:

```text
collector
  -> raw event + immutable collection/consent context
  -> downgrade-only classification ledger
  -> archive + outbox cleanup in one owned prune function
  -> per-day, per-metric coverage ledger
  -> SQL report RPC with current-visibility join and pagination
  -> identifier-free public DTO

legacy daily actions != v2 observations
```

Do not reconcile legacy and v2 by addition. Reconcile them as parallel instruments with named definitions until one becomes authoritative. Keep Chicago dates for gallery action history and UTC dates for cross-site actions, but place timezone and coverage metadata in every report snapshot and export.

## Verification performed

- Ran 71 pure analytics tests across collection, report contracts, operator reports, v2 projection, site actions, journeys, PostHog delivery/timestamps, and visit handling: **71 passed, 0 failed**.
- Locally reproduced the operator→audience classification leak with `buildV2ReportProjection`.
- Compared pending implementations with `git show HEAD:path`.
- Inspected the supplied raw performance evidence and report-builder source.
- `git diff --check` was attempted for all three worktrees but was inconclusive because the managed sandbox could not create its macOS `/tmp/xcrun_db` cache.
- No SQL rehearsal, production database, PostHog, browser, server, Docker, or network operation was run.

## Relevant strengths

- Raw tables and privileged RPCs are restricted to `service_role`; public DTOs omit visitor IDs.
- The privacy page accurately calls the derived visitor value pseudonymous, not anonymous.
- Event UUIDs provide retry idempotency, and the rehearsal checks duplicate acceptance.
- V2 download and share events distinguish requests, preparation, handoff, failure, cancellation, and outcome.
- The committed legacy report already models partial/unavailable daily coverage with nullable counts.
- UTC site-action boundaries and Chicago gallery boundaries appear intentional; DST-focused contract tests passed.

## Unverified questions

- Which migrations and function versions are actually installed in production.
- Current production query plans, table cardinalities, and archive growth.
- Whether photos have historically moved between albums.
- Provider delivery state and late/out-of-order production events.
- PostHog retention, regional hosting, billing state, and correction application.
- Whether live collector outages exist; absence of a coverage ledger prevents proving otherwise.

## Files examined

The review covered the listed 20260928/20260929 migrations and rehearsal SQL; analytics report, collection, session, event, delivery, projection, site-action, journey, traffic, and PostHog modules; public/operator loaders and components; `static/site-activity.js`; the associated analytics tests; performance evidence; the profile privacy page; and the profile/blog collectors and layout integrations.

## Cleanup

No files were edited. No persistent resources were started, so none required cleanup.