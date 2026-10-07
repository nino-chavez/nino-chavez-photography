# Analytics site rethink: pages, jobs, and verdicts

Status: proposal, 2026-10-06. Approved by Nino on October 6, with the combined layout ([ADR 0008](../../../blueprint/decisions/0008-analytics-launch-layout.md)); the two earlier decisions are [below](#decisions-nino-2026-10-06). It revises the page structure in [`ANALYTICS_PLAN.md` § 2](../../ANALYTICS_PLAN.md#2-deliver-the-complete-photographer-and-analyst-workspace). It removes no capability; the [coverage table](#every-capability-keeps-a-home) maps each one to its new place. The [Sep 28 scope directive](../../ANALYTICS_PLAN.md) still binds: the full north star is the release.

## The verdict

The site is built for steady traffic that the gallery does not have. An event album gets nearly all of its attention in its first three days, and then it goes quiet. The pages compare calendar months, and the intelligence rules wait for a steady baseline. So the main comparison is wrong for every new album, and the intelligence layer has never produced a single finding.

The fix is to make the **album launch** the unit of the site, with its comparison measured from publication. That is a change to the rules as well as the pages.

## What the data looks like

Gallery, last 30 complete days (Sep 6 – Oct 5, 2026), observed on the live site on Oct 6:

- **Small audience.** 125 browsers, 2,290 photo opens, 169 album opens.
- **Two albums are most of it.** JCA at ACC had 1,011 photo opens and Millikin at North Central had 266. Together that is 56% of all photo opens across 254 albums. From the fourth album down, each gets about one photo open a day.
- **Attention arrives in a burst.** JCA at ACC went public Sep 25 (inferred). It had 103 opens that day, 575 on Sep 26 and 126 on Sep 27, which is 80% of its total. It has had none since Oct 2.
- **Most response columns are empty.** Shares are 0 across the gallery. The most-downloaded photo had 4 downloads.
- **The newer, more detailed collection is one week old.** It started Sep 29. It shows 1,692 photos scrolled past on screen and 259 opened. Searches: 0.

Site (ninochavez.co), last 30 days: Cloudflare counted 730 page loads and 120 entry visits. These are sampled and rounded to tens. The site's own collection, running only since Sep 29, recorded 85 page views, 0 contact-link clicks and 3 outbound clicks.

Intelligence and private features, production queries on Oct 6 (read-only):

| Record | Count | Since |
| --- | --- | --- |
| Intelligence snapshots | 12,637 | Sep 30 |
| Snapshots with at least one finding | **0** | |
| Briefs written / deliveries | 0 / 0 | |
| Owner preference rows / brief schedules | 0 / 0 | |
| Actions recorded / outcomes / assistant requests | 0 / 0 / 0 | |
| Saved views | 0 | |

The three most common reasons a rule stayed silent in the last day: "A complete comparable period is not available" (24,804), "Both periods need at least 20 recorded actions" (23,762), and "The selected evidence window is partial or unavailable" (18,530). The rules need two steady, complete periods with at least 20 actions each. A three-day burst followed by silence never qualifies.

Briefs have two separate blockers. A brief is written only for an owner with a preferences row that has a decided retention policy and the dashboard enabled. No such row exists, because nobody has signed in and set one up. Even with that row, there has been no finding to report.

What this walk did not see: every page was read signed out, the way the "Available by direct link" visitor sees it. The signed-in screens (actions to review, assistant answers, saved-view management, brief settings) were judged from source and from the zero usage counts above, not from their rendered screens.

## What a blind reviewer saw

A reviewer with no access to the brief, code or this document judged the six current captures against Nino's own questions. Record: [`cold-review.md`](../../evidence/screen-reviews/analytics-current-ac68ae5/cold-review.md). Verdict: the product does not let the owner know what to do. Its proposed structural change matches this proposal: open on the newest album, say in plain words how it is doing, and fold Measurement away.

It also found defects to carry into the rebuild:
- Sources' open locations add up to 2,459, while Overview says 2,290 photo opens. The gap is the 169 album opens counted in one and not the other.
- Measurement's traffic-impact table lists 136 albums, while Albums says 254.
- "Inspector context: Album Re7kho" shows an internal album ID on an all-albums report.
- Photo titles truncate at the same point, so tiles cannot be told apart.

## Current and proposed page tree

```text
CURRENT                                         PROPOSED
analytics.ninochavez.co/                        analytics.ninochavez.co/
├─ /  → redirects to /sites                     ├─ /            Home: what happened since you last looked
├─ /sites   Reach | Actions                     ├─ /albums      Every album, by publish date and first-week reach
└─ /gallery                                     │  └─ /albums/:id   Album launch report
   ├─ Overview                                  ├─ /site        Profile, work, writing, demos
   ├─ Albums       ── folded into ───────────▶  │
   ├─ Photos       ── folded into album report  │
   ├─ Sources      ── split: tags → album/site; │
   │                  locations → /data         │
   ├─ Measurement  ── becomes ───────────────▶  ├─ /data        Can I trust these numbers?
   └─ Preferences  ── moves to ──────────────▶  └─ /settings    This browser, briefs and alerts, saved views
gallery/export.csv                              (export stays, from album index and album report)
daily + weekly briefs, incident alerts          launch recaps + incident alerts (decided)
```

## Page by page

### `/` (redirects to Site analytics)

| | |
| --- | --- |
| Shows | Nothing of its own. It sends you to `/sites`, so the gallery report is one click away from home. |
| Job today | None. The gallery, where most of the activity is, is not the landing page. |
| Verdict | **Redesign** as Home. |

Proposed Home answers "what happened since I last looked?" across both sites in one screen. It shows each recent album's launch status ("in its first 3 days", "done; 40 people, 2nd of the last 10 at day 7"). It shows site reach this week against last week. It shows any open incident (collection, rendering, downloads). Findings appear here inline, next to the thing they are about, not in a separate panel.

### `/sites`, Site analytics

| | |
| --- | --- |
| Shows | Two views. Reach: Cloudflare page loads and entry visits, daily chart, sections, top pages, entry sources, devices. Actions: first-party page views, contact and outbound clicks, article and demo progress. Plus the intelligence panel. |
| What you can do | Change period and section, page through top pages, open the gallery report. |
| Job | Is anyone looking at my profile and work, and did anyone reach out? |
| Data today | 730 page loads (Cloudflare, sampled) and 85 page views (first-party, since Sep 29) describe the same site with different measures and windows, side by side. Contact clicks: 0. The Photography section shows 100 page loads, while the gallery report shows 2,290 photo opens; the gallery is a single-page app, so page loads undercount it. |
| Verdict | **Redesign** as `/site`. |

Lead with one reach number and say which measure it is. Show the contact and outbound clicks, the closest thing to a business outcome, next to it. Keep top pages and entry sources. Move the second measure, devices, and the Cloudflare caveats to `/data`. Point photography traffic to the gallery numbers instead of showing a competing figure.

### `/gallery` Overview

| | |
| --- | --- |
| Shows | Totals, browsers, previous-period change, coverage, daily trend, intelligence panel and assistant, top 5 albums, top 4 photos. |
| What you can do | Filter albums, period and measure; ask the assistant (signed in); record actions (signed in); jump to Albums or Photos. |
| Job | What is happening across the gallery right now? |
| Data today | "Previous equal period: −684 actions" says JCA vs PNHS has aged out, not that the gallery declined. Intelligence: "No actionable findings for this scope", which is what all 12,637 snapshots so far have said. Top-photo cards repeat the album name four times and nothing else. |
| Verdict | **Fold** into Home. |

### `/gallery` Albums

| | |
| --- | --- |
| Shows | A 254-row table: current, previous and change for the chosen measure, plus album opens, downloads, favorites, shares, last activity. A selected-album side panel. |
| What you can do | Search, page, select an album, open its report, open its photos. |
| Job | Which album should I look at, and how did it do? |
| Data today | The previous-period columns compare calendar months, which for an event album mostly reflects when it was published. Five columns are near zero for 250 rows. The side panel's main button ("Open album report") leads back to the Overview scoped to that album. |
| Verdict | **Fold** into `/albums` (the index) and `/albums/:id` (the report). |

The index lists every album, including ones with no activity, newest publication first. Its default comparison is by album age ("people in the first 7 days, against other albums at day 7"). That comparison already exists as `compare=publication_age`, but it is hidden under advanced filters. It works only for albums with a publication time: 7 of 254 today, all inferred from logs, growing with each publish. Older albums still show their activity totals and say plainly that they have no launch comparison.

### `/gallery` Photos

| | |
| --- | --- |
| Shows | 2,224 photos across 186 pages; popular, rising and recently active rankings; image and table views; shortlist. |
| What you can do | Rank, choose columns, shortlist, export. |
| Job | Which photos should I post, send, or learn from? |
| Data today | The top photo has 13 opens and the most-downloaded photo has 4. Every card repeats "New album · not published in the previous period". Album name is the only text, so photos are told apart only by the thumbnail. |
| Verdict | **Fold** into the album report, and **redesign** the ranking. |

Inside one album, rank photos by response to being seen: shown, then opened, then downloaded or favorited. The collection that began Sep 29 records these exposures. Say when a photo has too few showings to rank. Keep a gallery-wide photo view reachable from the album index (scope: all albums), because the plan requires cross-gallery discovery.

### `/gallery` Sources

| | |
| --- | --- |
| Shows | Tagged arrivals (profile 126, links 15, coverage 11, share-x 1), where albums and photos were opened inside the gallery, linked-visit results, and saved views. |
| What you can do | Read counts; save, update and delete a view (signed in). |
| Job | Where did the attention come from? |
| Data today | Linked results: "unavailable". Open locations describe the gallery's own navigation, not outside sources. Saved views (0 saved) sit here, unrelated to sources. |
| Verdict | **Split.** Arrival tags go into the album report ("how people got here") and `/site`. Open locations go to `/data`. Saved views go to `/settings`. |

### `/gallery` Measurement

| | |
| --- | --- |
| Shows | Cloudflare cross-check, traffic classes, counting rules, delivery health, volume estimate, event counts, seven linked journeys, traffic impact on rankings. |
| What you can do | Read; expand event counts. |
| Job | Can I trust these numbers, and is collection working? |
| Data today | Cloudflare comparison "unresolved". Delivery health "unavailable". Volume estimate: none. Journeys: 5 of 7 "unavailable". Traffic impact: no ranking changes. Unclassified traffic is 1,906 of 2,290 actions. |
| Verdict | **Survive** as `/data`, moved out of the main tabs. |

This is a page for checking whether something is broken, not for deciding what to shoot or share. Home links to it when an incident is open.

### `/gallery` Preferences

| | |
| --- | --- |
| Shows | The same analytics-choices component as the public `/analytics-preferences` page. |
| Job | Exclude my own browser; change linked-analytics choice. |
| Verdict | **Fold** into `/settings`, together with brief and alert preferences and saved views. Keep the public `/analytics-preferences` page unchanged; it serves visitors. |

### Intelligence panel and assistant

| | |
| --- | --- |
| Shows | "Worth your attention", actions to review, contextual inspector with three canned questions. On both `/sites` and `/gallery`. |
| Job | Tell me what to do next and why. |
| Data today | 0 findings in 12,637 snapshots; 0 actions, 0 assistant requests. |
| Verdict | **Redesign the rules**, then place findings inline on Home and the album report. |

The rules have to fit the launch pattern. Proposed rules: launch reach against albums at the same age; launch finished (activity stopped); photos that were seen often and rarely opened; download or rendering failures during a launch; collection outage. Each still states its evidence, sample size and limits, as the plan requires. The assistant moves into the album report, scoped to that album.

### Daily and weekly briefs, incident alerts

| | |
| --- | --- |
| Job | Tell me without my having to open the site. |
| Data today | 0 briefs and 0 deliveries. No owner has set up preferences or a verified destination, and no finding has existed to send. |
| Verdict | **Redesign** around launches: a recap on day 3 and day 7 after an album, article or demo first goes public. Keep incident alerts. Decided 2026-10-06. |

## Every capability keeps a home

| `ANALYTICS_PLAN.md` § 2 capability | Today | Proposed home |
| --- | --- | --- |
| Overview: trends, comparison, popular and rising work | Overview tab | Home |
| Album reports, including zero-activity albums | Albums tab, side panel, album-scoped Overview | `/albums` index and `/albums/:id` |
| Bounded multi-album comparison | Albums table with album picker | `/albums` index (same-age comparison by default; pick albums to compare) |
| Photo explorer: real images, table, rankings, inspection, shortlist, export | Photos tab | Album report photo section; gallery-wide view from `/albums` |
| Sources and sharing annotations | Sources tab | Album report and `/site` (arrivals); `/data` (open locations) |
| Analyst controls: dates, measures, filters, columns, CSV | Filter bar on every tab | Same controls on `/albums` and the album report; CSV from both |
| Saved reports | Inside Sources (0 saved) | `/settings`, plus "save this view" on the index and report |
| Measurement and operations, traffic impact, provider reconciliation | Measurement tab | `/data` |
| Durable history | Behind every view | Unchanged |
| Actionable intelligence, assistant, actions and follow-up | Panel on Overview and Sites | Inline findings on Home and album report; assistant in album report; owner record form also on `/sites` (record-only until a site-scope calculation exists) |
| Daily and weekly reports, incident alerts | Built; never sent | Launch recaps (decided) and incident alerts |
| Visitor analytics choices | Preferences tab and public page | `/settings` (yours); public page unchanged (visitors) |

## Decisions (Nino, 2026-10-06)

1. **Album age counts from the first publication.** A republished album keeps its original launch date for every analytics comparison. The "latest gallery" list still ranks by the latest publication, so a republished album can return to the top of that list. These are two different facts, so they need two fields: `published_at` stays the latest publication, and a new first-publication field anchors album age.
2. **Launch recaps replace the daily and weekly briefs.** A recap goes out on day 3 and day 7 after an album, article or demo first goes public. Incident alerts stay. Recorded in [`ANALYTICS_PLAN.md` workstream E](../../ANALYTICS_PLAN.md#workstream-e-deliver-useful-reports-without-notification-noise). The existing daily and weekly scheduler (`src/lib/analytics/intelligence-schedule.ts`) is replaced during the build, not kept beside the recaps.

3. **The page structure and the combined layout are approved.** Recorded in [ADR 0008](../../../blueprint/decisions/0008-analytics-launch-layout.md). Decision 1 is implemented in PR #194, and its migration is applied to production.

## Next step

Done October 6: [three concepts](../../design/concepts/2026-10-06-launch/README.md) on these cases, selected as a combination in ADR 0008. Original plan: three different whole-screen concepts for Home, the album index, and the album report. They will be compared on the same real cases: JCA at ACC's three-day burst; a trickle album like VLA – Spring 2026; a quiet week with no new album; and unavailable data. Each case uses production numbers, not invented ones. This matches the judged-screen pattern and the concept comparison in [`ANALYTICS_DESIGN_CONCEPTS.md`](../../ANALYTICS_DESIGN_CONCEPTS.md). The Sep 28 comparison used invented cases ("an older photo rising", "a traffic burst") that the real gallery has not produced.

## Build order

One release, built in dependency order. Each step is its own PR with its own checks; no step is accepted as the release on its own.

1. **Launch read model.** One server query returns, for any album with a first publication, its daily opens, downloads and album opens by day since first publication. It also returns the same values for earlier launches at the same age, and photo exposure where it was recorded. It uses the same traffic rule as the report, and the SQL rehearsal covers the burst, trickle, undated and partial-day cases.
2. **Album report.** The C recap on top, then B's photo grid with a selected-photo panel and the launch chart. Shortlist, CSV export and the assistant move here.
3. **Album index.** B's ranked table, with every album: launches ranked at the same age, then undated albums by recent activity, including albums with none.
4. **Home.** A's launch log, the site line and open incidents. `/` stops redirecting to `/sites`.
5. **Site report, data quality, settings.** `/sites` shrinks to one reach measure plus contact clicks. Measurement, open locations and traffic impact move to data quality. Preferences, recap settings and saved views move to settings.
6. **Launch rules.** The intelligence rules are rewritten around launches: reach against earlier launches at the same age, launch finished, seen-but-rarely-opened photos, failures during a launch, and collection outage. Findings show inline on Home and the album report.
7. **Launch recaps.** Day 3 and day 7 recaps replace the daily and weekly scheduler. Email stays off until Nino verifies a destination.
8. **Old addresses.** `/gallery?section=…` links redirect to their new homes, then the old tabs are removed. Two things still live only on the old tabs after step 5 and must move before they go: the signed-in classification corrections (Measurement tab, linked from `/data`) and the signed-in sharing notes (Sources tab). Saved-view updates from the gallery filter bar also stay there; `/settings` saves, renames and deletes. Step 5 also keeps two things from the old site report: the report-intelligence panel returns on `/sites` the way it does on the album report (findings when a saved calculation exists for the site scope, the owner's record form when none does, nothing for visitors), and a single "Today so far" line for link clicks, kept apart from every total.
9. **Acceptance.** A cold review of device captures for every surface, including largest text and increased contrast. Performance is compared with `scripts/measure-analytics-performance.mjs`.

## Launch rules (build step 6)

Built on branch `feat/analytics-launch-rules`, commit `29828aa`. The rules live in `src/lib/analytics/launch-rules.ts`; the evidence they read is `src/lib/analytics/launch-evidence.server.ts`. Every threshold is a named constant there. A rule that stays silent records why.

### The catalogue

| Rule | Fires when | Evidence it shows | Silent, with its reason, when |
| --- | --- | --- | --- |
| Launch reach (`launch_reach`) | A launch reaches day 3, then day 7 (complete Chicago days from first publication) | Its photo opens; how many of the launches **before it** had more; their median and range | Under 20 photo opens (`minimumSample`); fewer than 3 earlier launches with a complete total (`MIN_EARLIER_LAUNCHES`); a day in the window not completely recorded; replaced by the recap once the launch is over |
| Launch finished (`launch_finished`) | Day 7 has passed and the last 3 complete days hold at most 3 photo opens (`FINISHED_QUIET_DAYS`, `FINISHED_MAX_OPENS`) | First-week photo opens and download requests, the day-7 comparison, a link to the downloaded photos | Still active; any of those days not completely recorded; under 20 photo opens in week 1 |
| Seen but rarely opened (`seen_rarely_opened`), album report only | A photo seen at least 20 times in the grid was opened at most a quarter as often as the album's typical photo predicts, and that prediction is at least 5 opens | Times on screen, opens on those days, the album's typical photo; at most 3 photos per album | Exposure not recorded during the launch's first week (version 2 began Sep 29); fewer than 5 photos seen 20 times; no photo far below typical |
| Failures during a launch (`launch_failures`) | At least 2 photo-load failures, or at least 2 download failures, in the first 7 complete days | Failures out of loads with a recorded result, or out of download requests; the days counted | Results not recorded during the first week; the failure records could not be read (said as unknown, not zero); fewer than 2 of each kind |
| Collection gap (`collection_health`, launch scopes) | Any day in the launch window is partial or missing in the daily record | The dates | Every day so far completely recorded |

Rank and median, never a percentage or a ratio. A later launch is never in the comparison, even when it has reached the same age by now. A launch is spoken about for its first 14 days (`LAUNCH_FINDING_DAYS`, the album report's window); after that it has no findings. Nothing claims a cause or a verdict on a photo.

### Every old rule, mapped

| Old rule | Now | Why |
| --- | --- | --- |
| `momentum`, gallery | **Retired.** Replaced by launch reach and launch finished | Two complete calendar periods of 20 or more actions never existed for an event album. Oct 6 suppressions: "A complete comparable period is not available" (23,755 in a day), "Both periods need at least 20 recorded actions" (23,188) |
| `momentum`, site | Kept | Site page views have no launch, and the comparison becomes available as first-party history grows (it began Sep 29) |
| `strong_photo_response` | Kept on the gallery scopes | Not a period comparison. Silent today: "Per-photo eligible exposures with the named favorite-or-download-item response union are not available." Launch finished now points to the downloaded photos |
| `discovery_friction` | Kept on the gallery scopes; seen but rarely opened is its first-party, per-photo counterpart | Silent today: "Per-album eligible exposure and later-open cohorts are not available." |
| `rendering_download_reliability` | Kept on the gallery scopes; failures during a launch adds the per-launch view | Silent today: "Fewer than 20 eligible download requests are available." |
| `search_usefulness` | Kept | Silent today: "The separately observed search cohorts do not cross a review threshold." (searches: 0) |
| `distribution` | Kept | Silent today: "Fewer than 20 tagged arrivals are available." |
| `profile_response`, `writing_demo_response` | Kept on the site scopes | Silent today because the site window is still partial |
| `collection_health` | Kept: still the incident path on the gallery and site scopes. Launch scopes add the collection gap | |
| `follow_up` | Kept | Needs a recorded action; none exists |

### Showing, checking and dismissing

- Home shows up to 3 findings under the launch card they concern; the album report shows its own above the photo grid. Both read through `intelligence-panel.server.ts` and `intelligence-public.server.ts`, so a snapshot with no findings, an album unlisted since the snapshot was written, or a photo moved out of its album shows nothing, for anyone.
- Each group says when it was last checked. Past one hour (`FINDINGS_LATE_AFTER_MS`, four times the 15-minute refresh cadence) it says "These may be out of date", and so does an unknown check time. A normal check is late by the queue (about 25 scopes at 4 a minute) and a failed refresh's retries (1, 2, 4 and 8 minutes), well under an hour, so a later check means the worker has stalled.
- The signed-in owner can dismiss a launch finding with a private reason, or snooze it for 7 days, on Home or on the album report. This uses the existing actions endpoint and tables: the lifecycle row in `analytics_intelligence_finding_lifecycle` holds the state, and the dismiss or snooze row in `analytics_intelligence_actions` holds the reason and, in `target_context`, the version of the finding dismissed. **No migration.** A dismissed or snoozed launch finding is hidden for everyone, wherever it was dismissed, until it is undone, the snooze ends, or its substance changes (its own total, comparison, failure counts or days). A recap's sliding quiet window and its wording are not changes.
- This is stricter than the older report panel, which keeps a dismissed finding on screen with a "dismissed" label for the owner and shows it unchanged to visitors. That panel is not changed.

Launch findings never enter the incident table. Every finding there becomes an open incident that Home lists, and the recovery check knows only the old rules, so a launch reach would stay "open" forever. Collection outages keep their incident path on the gallery and site scopes.

### Scopes, scheduling and volume

- Scopes: `{kind:'launch', albumKey}` for one album and `{kind:'launch', albumKey: null}` for Home, stored in the existing snapshot, pointer and job tables. The key holds no date, so it is the same every day. **No migration.**
- Refresh: Home's scope and each launch up to day 16 (the 14-day window plus 2 days, so the last refresh writes the empty snapshot that retires its findings). Older albums are not refreshed and have no launch pointer. This is a bounded choice, not one scope per album ever published. A failed launch read retries; it never writes an empty snapshot over a good one.
- A refresh writes a snapshot only when the evidence or findings change, apart from the run time, the summary cutoff and the read instant. Otherwise it touches the current pointer. Measured on the last 24 hours of production snapshots (rule version 3, so gallery evidence still held `albumMomentum`): **2,073 written; 64 with the fingerprint.** Launch scopes add about one or two a day each, roughly 70 a day in all.
- Step 7 note: launch scopes travel in `p_standard_scopes`, so they would also join daily and weekly brief jobs if an owner enabled a schedule. None has. Step 7 replaces those briefs.

### Replay on real history

`scripts/replay-launch-rules.ts` runs the scheduler's own loader and rules, read-only, with an earlier `p_as_of`. It shows today's stored data cut off at each date, not what the system saw then: the start of failure and exposure recording comes from today's earliest rows, and failure counts use the label each event arrived with.

| As of (noon Chicago) | Findings |
| --- | --- |
| Sep 28, JCA at ACC | "804 photo opens in its first 3 days. 1 of the 5 launches before it had more photo opens by day 3. Their median was 124, so this launch is above it." |
| Oct 2, JCA at ACC | "931 photo opens in its first 7 days. 1 of the 5 launches before it had more photo opens by day 7. Their median was 125, so this launch is above it." Not finished: 104 photo opens in its last 3 days |
| Sep 4, JCA vs PNHS | "The launch is over. Photo opens fell to 1 over Sep 1–3. In its first 7 days it had 1,258 photo opens and 109 download requests. None of the 4 launches before it had more photo opens by day 7; their median was 81." |
| Oct 3, Millikin at North Central | "2 photo loads failed during the launch. 2 of the 64 photo loads with a recorded result failed, on Sep 29 – Oct 2." and "266 photo opens in its first 7 days. 3 of the 6 launches before it had more photo opens by day 7. Their median was about 381, so this launch is below it." |
| Sep 20, quiet | None. "No album was first published in the last 14 days." |
| Oct 6, Home | The Millikin failures, and "The launch is over" for Millikin and for JCA at ACC |

Every count was checked against the series and an independent SQL count. Across all seven launches at day 3, 7, 10 and 14, two rules never fired. **Seen but rarely opened**: no photo has reached 20 times on screen (the most is 19, JCA at ACC), and the earlier launches predate exposure recording. **Collection gap**: no launch window has a day that is not completely recorded.

Screens: [`analytics-launch-rules-29828aa`](../../evidence/screen-reviews/analytics-launch-rules-29828aa/), each at 1440×900 and 375×812. The `*-findings-*` and `*-owner-*` captures render the real pages with the Oct 6 replayed findings through a throwaway harness: Home checked 12 minutes before (fresh) and 3 hours before (late), and the owner's dismiss and snooze forms open. The `*-live-*` captures show production today, where no launch snapshot exists yet, so nothing shows.

## Sources

- Live pages walked signed out on 2026-10-06 with browse-tool: `/sites` (Reach and Actions), `/gallery` (all six sections, all albums, last 30 days), and the album-scoped views for `Re7kho`.
- Production queries, read-only, `supabase db query --linked`, 2026-10-06: counts on `analytics_intelligence_*` tables and `analytics_saved_reports`; suppression reasons from `analytics_intelligence_snapshots` in the last day.
- Brief creation condition: `supabase/migrations/20260930084000_analytics_intelligence_refresh_health.sql` (owner loop over `analytics_intelligence_preferences` where `retention_policy <> 'undecided' AND dashboard_enabled`).
- Root redirect observed by navigation: `/` lands on `/sites`.
