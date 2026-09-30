# Verdict

The frontend is not release-ready for full-scope analytics.

The information architecture is strong: reach, first-party actions, linked journeys, and gallery behavior are kept conceptually separate. The UI also avoids presenting counts as people or business outcomes. I found no source-confirmed additive double counting between legacy gallery reporting, v2 observations, and site actions.

However, two P1 defects undermine the product’s central jobs:

1. The profile collector can silently lose the initial page view.
2. Gallery analytics eagerly builds and ships the complete report before showing any section, producing measured 14–25 second waits at 90 days.

Pagination, state restoration, filter facets, route coverage, and keyboard access add five P2 problems. These are current behavior or directly reproducible risks, not stylistic objections.

Evidence labels below mean:

- **Source-confirmed:** established from current source.
- **Locally reproduced:** reproduced without a browser, provider, or production request.
- **Live not verified:** production behavior remains for the parent’s inspection.

## 1. Collection and classification

### FE-COLLECT-01 — P1 — The initial React page view can be dropped

**Evidence:** Source-confirmed and locally reproduced; live not verified.

**Paths:** [static/site-activity.js](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/static/site-activity.js:46), lines 46–54 and 89–99; [SiteActivity.tsx](/Users/nino/Workspace/dev/sites/nino/nino-chavez-site/.worktrees/codex/site-action-analytics/app/components/SiteActivity.tsx:7), lines 7–12.

**Mechanism:** The React component dispatches `nino:page-ready` as soon as it mounts. The collector handles that event immediately. If the preferences request has not resolved, `start()` records the route in `view`, but `emit()` refuses to send because the default preference state excludes the browser. When preferences later arrive, `start()` sees the same route and returns before sending it.

**Affected job and blast radius:** The quick site-actions overview, page rankings, and optional linked journeys can undercount initial landings on the profile site. The failure is timing-dependent, so it can also create browser- or connection-dependent differences.

**Scope:** Pending only; neither collector file exists at the referenced repository HEAD.

**Minimal reproduction:** I ran the collector in a small VM harness with a delayed preferences response and dispatched the React event first. Result: `{"eventPosts":0,"viewFlag":true}`. The falsifier is one emitted page-view event under that ordering.

**Confidence:** High.

**Smallest coherent remedy:** Introduce an explicit preferences-ready state. Do not mutate `view`, install timers, or emit until preference resolution succeeds or fails. Then start exactly once for the current route. Add a delayed-preferences test using the real React event order.

**Overlap:** Backend/data reports may observe missing rows, but the originating defect is collector lifecycle ordering.

### FE-COLLECT-02 — P2 — `/search` is classified as profile traffic but cannot produce site actions

**Evidence:** Source-confirmed; live not verified.

**Paths:** [static/site-activity.js](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/static/site-activity.js:11), lines 11–12; [events-v2.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/events-v2.ts:121), lines 121–125; [site-traffic.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/site-traffic.ts:13), lines 13–18.

**Mechanism:** The reporting taxonomy assigns `/search` to the profile/work section, but the collector’s safe-path contract excludes it. Visits and search-result interactions therefore cannot appear in site actions, while the report’s section naming implies broader coverage.

**Affected job and blast radius:** Anyone comparing profile pages receives an incomplete section without an explicit coverage warning.

**Scope:** Pending collector behavior; the taxonomy mismatch spans committed and pending code.

**Minimal reproduction:** Pass `/search` through the current safe-path allowlist; it is rejected. A falsifier would be an intentional contract declaring search reach-only, reflected in the UI.

**Confidence:** High.

**Smallest coherent remedy:** Decide explicitly whether `/search` is measured. If yes, allow only the canonical path and keep query terms out of event properties. If no, classify it outside measured profile actions and disclose the coverage boundary.

## 2. Report loading and payload lifecycle

### FE-LOAD-01 — P1 — Every gallery section pays for the complete report

**Evidence:** Source-confirmed, supported by existing live measurements; live behavior not independently verified.

**Paths:** [operator/+page.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.server.ts:93), lines 93–137; [operator-report.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/operator-report.server.ts:301), lines 301–314; [operator/+page.svelte](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.svelte:91), lines 91–107.

**Mechanism:** The server builds the full gallery report, v2 observations, and journey datasets before rendering any tab. Photo previews are then retrieved in sequential chunks of 100. The client receives the full photo and album collections and performs sorting and pagination in memory, including for hidden sections.

The supplied 90-day evidence records 3,097 photos, 31 preview queries, a 13.925-second report load, and 19.328–25.544-second LCP. The 30-day query profile still makes 22 preview queries.

**Affected job and blast radius:** Quick overview, album comparison, selected-photo inspection, and returning to a saved report all inherit the slowest full-report path. Cost grows with the reporting window and photo volume.

**Scope:** Both; the eager report shape and client slicing are already committed and remain present.

**Minimal reproduction or falsifier:** Compare an overview request with a photos request after implementing section-aware projection. A valid fix should make overview latency and payload independent of the total photo count. Existing evidence currently shows the opposite.

**Confidence:** High.

**Smallest coherent remedy:** Keep the full feature scope, but load it by job:

- Return overview totals and bounded top lists first.
- Fetch album and photo pages server-side using the active sort and cursor/page.
- Retrieve previews in one joined/batched query for only the visible page.
- Keep full export as a separate explicit request.

**Overlap:** This likely overlaps the backend report on query shape and the data report on indexing. The frontend-specific defect is hidden-section work and full client materialization.

## 3. Navigation, filtering, and working-state preservation

### FE-STATE-01 — P2 — Filtering can strand album comparison on an empty page

**Evidence:** Source-confirmed and locally reproduced.

**Path:** [operator/+page.svelte](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.svelte:98), lines 98–107, 131–135, and 342–347.

**Mechanism:** `albumPage` is not clamped or reset when a new report contains fewer album rows. Slicing therefore starts beyond the end of the filtered collection.

**Affected job and blast radius:** A user who pages through albums and then applies sport, event, source, or date filters can see an empty comparison despite matching albums existing.

**Scope:** Both.

**Minimal reproduction:** With `albumPage = 2`, page size 12, and five filtered rows, the current calculation produced `visibleCount: 0`, with a displayed range beginning at 25 and ending at 5.

**Confidence:** High.

**Smallest coherent remedy:** Clamp the page whenever `albumPageCount` changes, or reset it only when the serialized report query changes. Add a test for “page three, then filter to five rows.”

### FE-STATE-02 — P2 — Back, reload, and data invalidation do not preserve analysis position

**Evidence:** Source-confirmed; browser behavior live not verified.

**Path:** [operator/+page.svelte](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.svelte:16), lines 16–31, 51–70, and 136–145.

**Mechanism:** Only the section hash and selected items receive partial persistence. Rank, pagination, visible columns, and shortlist are memory-only. A broad effect clears the photo page, selected photo, and shortlist whenever the report query object changes. Native `history.pushState` is used without a corresponding `popstate` synchronization path.

A save, note, correction, or other invalidation that replaces report data can therefore erase unrelated analysis state. Reloading a bookmarked `#photos` view returns to default rank/page with an empty shortlist.

**Affected job and blast radius:** Inspecting photos, building an export shortlist, returning without losing place, and using Back/Forward.

**Scope:** Both.

**Minimal reproduction:** Shortlist photos, trigger a report invalidation, and inspect the shortlist; or reload a non-default photos view. The falsifier is restoration of the same section, rank, page, selected item, and shortlist where intended.

**Confidence:** High for reset/persistence; medium for the exact browser-history manifestation pending live inspection.

**Smallest coherent remedy:** Key resets to a stable serialized filter query, not arbitrary report-object replacement. Put bookmarkable navigation state in the URL or SvelteKit shallow state. Preserve explicitly ephemeral choices in session storage. Test reload, Back/Forward, and mutation invalidation separately.

### FE-FILTER-01 — P2 — Selecting a source collapses the source facet

**Evidence:** Source-confirmed.

**Paths:** [operator/+page.svelte](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.svelte:74), lines 74–77 and 278–286; [operator-report.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/operator-report.server.ts:316), lines 316–323.

**Mechanism:** Source options are derived from the already source-filtered report. After choosing one source, alternatives disappear. If the selected source returns no rows, the `<select>` can visually fall back to “Any source” while the URL still contains an active source filter.

**Affected job and blast radius:** Comparing slices and understanding why a report is empty.

**Scope:** Both.

**Minimal reproduction:** Load a report with `source=X`; inspect the available options. Alternatives that exist outside the filtered result are absent.

**Confidence:** High.

**Smallest coherent remedy:** Build source-facet options while ignoring only the source dimension, and always include the active value even when it has zero results.

## 4. Mobile and keyboard use

### FE-A11Y-01 — P2 — Gallery data tables cannot receive keyboard focus for horizontal scrolling

**Evidence:** Source-confirmed; existing mobile capture confirms overflow, not keyboard behavior.

**Path:** [operator/+page.svelte](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.svelte:316), lines 316, 341, 358, and 397–406; overflow styling at lines 500–503.

**Mechanism:** Several horizontal table regions explicitly use `tabindex="-1"`. On narrow screens the columns overflow, but keyboard users cannot tab to the region to scroll it. The synthetic mobile capture visibly clips the table after the first columns.

**Affected job and blast radius:** Mobile data-table inspection and keyboard access across overview, albums, photos, sources, and measurement sections.

**Scope:** Both.

**Minimal reproduction or falsifier:** At phone width, tab through the page and attempt horizontal scrolling without a pointer. The containers are skipped.

**Confidence:** High from source; physical keyboard and assistive-technology behavior remain unverified.

**Smallest coherent remedy:** Make each genuinely scrollable region focusable with `tabindex="0"`, a useful accessible label, and visible focus styling. Test keyboard horizontal scrolling at the mobile breakpoint. The pending `SiteActions` component already uses the correct focusable pattern.

## Architecture recommendation

Keep the current measurement boundaries, but adopt two explicit state machines:

```text
collector:
bootstrap → preferences resolved → route ready → active view

report:
URL query → bounded section projection → visible page → optional full export
```

The collector should have one canonical route/action contract consumed by every host. The report URL should own bookmarkable analysis state. Server projections should own pagination and sorting. This preserves the requested full feature set while removing hidden work and accidental state loss.

Deploy the shared collector before the profile and blog consumers. All three currently reference the centrally hosted `site-activity.js?v=1`, so release order and cache-version changes are part of correctness.

## Relevant strengths

- Reach, site actions, linked journeys, legacy reporting, and v2 observations are displayed as separate measurements; I found no source-confirmed summed total that double counts them.
- Public screens do not intentionally render visitor identifiers.
- Copy distinguishes counts from people and outcomes.
- Private controls are conditionally rendered, and preference changes are routed to the main domain that owns the cookie.
- The site-actions table uses focusable horizontal overflow and server pagination.
- The gallery dialog restores focus.
- Performance evidence distinguishes local synthetic captures from live measurements and records failures rather than treating a successful request alone as proof.

## Verification performed

- Inspected the live gallery desktop capture and local synthetic mobile, desktop, and preference captures directly.
- Compared working files with `git show HEAD:path` to separate committed behavior from pending changes.
- Ran 19 pure Node tests covering report contracts, site actions, journeys, visit handling, and route hooks: all 19 passed.
- Reproduced the collector race in memory: zero event posts after the route-ready-before-preferences ordering.
- Reproduced the album pagination defect with the current page arithmetic.
- Rechecked all three worktree statuses. The sandbox emitted Xcode cache warnings, but the existing pending file sets remained visible.
- Did not run Playwright, start a server, use a browser session, contact a provider, or inspect credentials.

## Unverified questions for the parent

- Production timing frequency of FE-COLLECT-01 under real Next.js hydration.
- Physical-device table scrolling, VoiceOver announcements, focus order, and dialog behavior.
- Live acceptance of `/sites`, `/gallery`, and `analytics.ninochavez.co`.
- Whether serialized public JSON and exports exclude all unlisted albums and visitor identifiers; frontend intent is visible, but backend/data verification owns that claim.
- Provider availability and PostHog journey correctness.
- Cache behavior and deployment ordering for the shared `v=1` collector.
- Whether `/search` is intentionally reach-only or accidentally omitted.

## Files examined

Photography: governing instructions; report contract and analytics plan; performance narrative, raw JSON, scripts, and captures; operator and sites pages/loaders; analytics components; collector; client, visit, event, traffic, preference, hook, path, and report code; relevant API routes, migration, and tests.

Profile: `SiteActivity.tsx`, `DemoStory.tsx`, `SiteFooter.tsx`, `app/layout.tsx`, privacy page, and route inventory.

Blog: `BaseLayout.astro` and `SiteFooter.astro`.

## Cleanup

No persistent resources were started. No files, repositories, browser sessions, ports, databases, Docker resources, or production systems were changed.

