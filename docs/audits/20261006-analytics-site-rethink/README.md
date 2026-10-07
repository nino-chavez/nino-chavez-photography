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
| Photo explorer: real images, table, rankings, inspection, shortlist, export | Photos tab | Album report photo section; gallery-wide view from `/albums` (built as `/photos`, [step 8](#old-addresses-build-step-8)) |
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
8. **Old addresses.** (Built: [what moved where](#old-addresses-build-step-8).) `/gallery?section=…` links redirect to their new homes, then the old tabs are removed. Two things still live only on the old tabs after step 5 and must move before they go: the signed-in classification corrections (Measurement tab, linked from `/data`) and the signed-in sharing notes (Sources tab). Saved-view updates from the gallery filter bar also stay there; `/settings` saves, renames and deletes. Step 5 also keeps two things from the old site report: the report-intelligence panel returns on `/sites` the way it does on the album report (findings when a saved calculation exists for the site scope, the owner's record form when none does, nothing for visitors), and a single "Today so far" line for link clicks, kept apart from every total.
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
- Step 7 note: launch scopes travel in `p_standard_scopes`. Step 7 (below) replaced the daily and weekly briefs, so they no longer join any brief.

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

## Launch recaps (build step 7)

Built on branch `feat/analytics-launch-recaps`. Rules and constants live in `src/lib/analytics/launch-recap-schedule.ts`; the words in `launch-recap-text.ts`; the reads, generation and storage in `launch-recap.server.ts`.

### A recap is public, so it is stored publicly

Visitors read recaps on the album report. So a recap is one row per album and checkpoint in its own table, `analytics_launch_recaps`, with no owner column and no link to any private table. It is written whether or not any owner exists, and it is outside private retention and delete-history: `analytics_cleanup_intelligence_private` and `analytics_delete_intelligence_private_history` never touch the table, and the rehearsal asserts it with a 400-day-old recap.

An earlier version stored each recap as a per-owner row in `analytics_intelligence_briefs`. That was wrong: choosing 90-day retention would have deleted public recaps, and with no owner row in production nothing would have been written. The gate was a symptom of that choice, so it is gone.

Only email stays owner-gated, through the delivery path as it already works. A delivery row points at a brief, and `analytics_claim_intelligence_deliveries` re-reads that brief's owner's preferences at claim time and suppresses a queued email when the owner has opted out, changed destination or lost verification. To keep that proven check unchanged, an email for a recap is queued as a private per-owner brief of kind `launch_recap` (the message that was queued), keyed `launch:<albumKey>:day<N>` under a unique index, plus its email delivery record. That row is a send record, so private retention is right for it. It is written only for an owner with email on, a verified destination and retention chosen, never for a backfilled recap, and `pending` only for a complete recap (otherwise `suppressed` with `recap_not_complete`). The rehearsal proves the claim path claims a verified owner and refuses an opted-out owner, a changed destination and an incomplete recap.

Migration `20261007120000_analytics_launch_recaps.sql` (unapplied) creates the table, widens the brief kind constraint, and adds the key check and the unique index for the email brief. Apply it before deploying the code. Until then the scheduler stores nothing, logs the missing table and keeps refreshing.

### When a recap is written

- Due at 08:00 America/Chicago on the first publication's Chicago date plus 3 (and plus 7), added in calendar days so DST moves nothing. Day 0 is the publication day, so the recap covers days 0-2 (or 0-6), never the due morning.
- Read as of the due instant (`p_as_of` = 08:00), so a late run reports the same days and says it is late (more than 15 minutes, `RECAP_LATE_AFTER_MINUTES`).
- The primary key (`album_key`, `checkpoint`) makes it idempotent; a unique violation means it exists.
- A checkpoint more than 3 days past due is not written by the scheduler (`RECAP_CATCH_UP_DAYS`).
- If the records for the covered days are incomplete, the scheduler waits up to 6 hours (`RECAP_SETTLE_HOURS`), then stores the recap saying what is missing. A launch read that keeps failing is stored as an "unavailable" recap that states no figure.
- One recap per wake-up (`MAX_RECAPS_PER_RUN`); a wake-up that builds one skips the refresh jobs (arithmetic below). An unlisted album is skipped before any number is read.

### What visitors and the owner see

A visitor sees stored recaps, "Day N recap due <date> at 8:00 AM Chicago time" for ones still to come, or no Recaps section at all. A recap that is due and not stored, or was never stored, is not listed for a visitor. The owner also sees why one is missing, only when that means something: it is due and being waited for, or its window passed with nothing written. A recap written afterwards says so in its row ("Written later from the records") and in its first paragraph; a late one says "Late"; one on incomplete records says so. Home's Next lists only recaps still to come. Settings says recaps are written for every album, public, and not deleted with private records; email says what it will and will not do.

### One-time backfill of the launches that predate recaps

All 14 checkpoints of the 7 existing launches have lapsed, so without a backfill every album would show nothing. `scripts/backfill-launch-recaps.ts` builds them through the same `buildSlotDocument` path, read as of each due instant, with one added paragraph saying the recap was written later from the records for those days. It stores source `backfill`: public, `late = false`, no delivery, no brief, no email. It is a dry run unless given `--write`, idempotent on the primary key, and leaves a checkpoint still inside its window to the scheduler. Its dry run against production (read-only) is in the evidence directory (`backfill-dry-run.txt`, `.json`): 14 would be written. It has not been run with `--write`. Nino approves it with the migration.

### Subrequest budget

A Pages Function on the Workers Free plan may make 50 subrequests per request; Paid 10,000 ([Workers limits, "Subrequests"](https://developers.cloudflare.com/workers/platform/limits/), fetched 2026-10-07; the Pages Functions pricing page says Functions are billed as Workers requests but does not restate the limit, and the Pages-specific limits URL returns 404). Every Supabase call and PostHog query is one. The account's plan could not be read from here, so Free is assumed.

Measured read-only by `scripts/measure-intelligence-subrequests.ts` (2026-10-07; writes are counted by hand from the code and added):

| Part | Requests |
| --- | --- |
| Fixed for any wake-up: cleanup RPC, launch list, prepare RPC, claim RPC, delivery list, delivery claim | 6 |
| One gallery job: 3 evidence reads, 8 PostHog queries, 9 for the snapshot reads and writes | 20 |
| One site job: 2 reads, 1 PostHog query, 9 | 12 |
| One launch job (Home / newest album): 10 / 8 reads, 0 PostHog, 8 | 18 / 16 |
| A wake-up claiming 1 launch job | 22 |
| The worst wake-up (4 jobs: 2 gallery + 2 site) | 70 |
| **A wake-up that builds a recap**: 7 fixed (cleanup, launch list, stored check, insert, email owners, delivery list and claim) + 9 reads to build it | **16** (18 with one email owner) |

A recap wake-up (16 to 18) fits under 50 with 32 to 34 to spare. Because it skips the refresh jobs, it costs the refresh nothing; the jobs run again the next minute, so a refresh is late by one minute on the few mornings a recap is built. An ordinary wake-up adds one request (the stored check) while a checkpoint is inside its 3-day window, and at most 3 while a recap waits for records (the check plus the visibility and launch reads), for up to 6 hours.

One finding about what was already live: by this count the existing jobs request exceeds 50 on a heavy wake-up (70), and a typical one is 22 to about 60 depending on the mix. Production has 12,637 snapshots since Sep 30, so the jobs do run, which means either the account is on Paid, or the PostHog cache (12 minutes) removes calls this count does not credit. Not verified. If the account is on Free, the step 6 refresh is already near its limit independent of recaps, and the right fix is fewer jobs per claim, not recap changes.

Job timing since answers the practical half: heavy wake-ups do not hit the cap (checked read-only 2026-10-07, [#205](https://github.com/nino-chavez/nino-chavez-photography/pull/205)). A request that ran past its subrequest limit would fail in one of two ways. A throw inside a job hands the job back with exception backoff, so its second attempt starts 60 to 120 seconds after creation. A throw in the hand-back itself ends the wake-up, so the job's lease expires and the gap reads about 0. Of 3,370 jobs in the two days to 02:40 UTC, one retry matched backoff and none matched an expired lease. Minutes that created 2 gallery jobs and up to 4 site jobs completed. The retries were PostHog queries still pending at the report deadline (470 of 473 site second attempts landed 309 to 380 seconds after creation, the 300-second pending delay), fixed in #205. The plan itself is still unread, so it remains open whether this is Paid or a count that overstates.

### What happened to daily and weekly

Removed from the application: `intelligence-schedule.ts` and its test, the `daily` and `weekly` fields and toggles in preferences, the preferences route and the settings form, and the daily and weekly job kinds in `intelligence-jobs.server.ts`. The dormant SQL cannot be dropped, because each function that holds a daily or weekly branch is still called for other work:

- `analytics_prepare_intelligence_periods` is called every wake-up (`intelligence-jobs.server.ts`, `prepare`) to queue refresh jobs; its daily and weekly loop is skipped because the application passes null periods.
- `analytics_finish_intelligence_job` is called by `finish` for every refresh and request job; its daily and weekly brief block runs only for those two kinds.
- `analytics_set_intelligence_preferences` is called by the preferences route to save retention; it also writes the schedule row, which the application now writes switched off.
- `analytics_intelligence_schedules` is read only by the prepare function's daily and weekly loop and written only by the preferences function.

Removing the branches means rewriting those three functions and the assertions in `analytics-intelligence-assertions.sql` that test them, which is a separate migration. The CHECK values stay because rows of those kinds may exist (0 in production). A daily or weekly job found in the queue is handed back and never run; after 20 hand-backs the database marks its period unavailable and writes a brief that names it. There are none today.

### Articles and demos: not built

No reliable first-public time exists that this app can read safely.

- Blog `publishedAt` is author-declared: 253 of 262 posts carry a time, 9 are midnight UTC, and the three posts compared sit minutes to 1.5 hours from their first commit. It lives in a sibling repo that a Pages build does not check out, so a build-time import repeats the 2026-08-23 outage. `/blog/rss.xml` carries the same declared dates for 260 posts, over public HTTP.
- Demos: `meta.json` dates are months ("2026-08"). The demos have no feed.
- Site actions are bucketed by UTC day, collection began Sep 29, and `analytics_site_actions` returns the top 8 pages for a 7, 30 or 90 day window with no per-page daily series. The first observed view of a page is a lower bound at best.
- So "reach so far against earlier launches at the same age" has no earlier launch with a complete first week for any article.

Options for Nino: (A) have the blog's deploy record each new page's first appearance here (a new cross-repo credential and a table); (B) read the declared dates from the RSS feed at job time and add a per-page daily read, labelled "declared date", for blog posts only; (C) wait for a month of site-action history first. Recommendation: C, then B.

### Replay and captures

`scripts/replay-launch-recaps.ts` (read-only) builds each recap for the 7 real launches as if run one minute after 08:00; the text is in [`replay-launch-recaps.txt`](../../evidence/screen-reviews/analytics-launch-recaps-0ad62f3/replay-launch-recaps.txt). Two inputs differ from production: findings are the launch rules evaluated as of the due instant (stored snapshots hold only today's), and the photo counts use today's photo rows. Screens: [`analytics-launch-recaps-0ad62f3`](../../evidence/screen-reviews/analytics-launch-recaps-0ad62f3/), 1440 and 375 wide, with the walk notes in `walk.txt`. Stored recaps in those captures are the replayed or backfill-dry-run ones, presented by a preload; nothing was written.

## Old addresses (build step 8)

The old gallery report (`/gallery`, internally `/photography/analytics/operator`) is gone. Everything it still did has a working home, every old address redirects once to where its job went, and the route, its three components and its tests are removed. Branch `feat/analytics-old-addresses`, evidence in [`analytics-old-addresses-1b45d86`](../../evidence/screen-reviews/analytics-old-addresses-1b45d86/).

### One page was missing from the map: the photo explorer

The capability map said the gallery-wide photo view lives "from `/albums`" and the saved-view update "on `/albums` or the album report". Neither page has a filter bar, and the album index's CSV is album-level launch figures, not the photo file. So three things had no home: the gallery-wide photo ranking, `/gallery/export.csv`, and a saved view's filters (opening one, updating one). Step 8 adds one lean page for all three, `/photos`, linked from the album index and from the album report. It reads exactly the old report's query (dates, measure, albums, traffic, sport, category, source, event date, season, comparison), so an old link, a saved view and a CSV all say the same thing. It carries only what the map names: rankings, images or table, columns, shortlist, inspection, filters, CSV, and save or update a view. It does not bring back Overview, Albums, Sources or Measurement.

**Deviation from the brief.** The brief asked for saved-view updates "on `/albums` or the album report". They are on `/photos`, because only that page has the filters a view stores. The album report's "Filter these photos" link opens it with that album and its dates, and the index links to it, so both named pages lead there. Say so if you want the update control on the report itself.

### Inventory: every capability the operator route held

Production holds no rows for any of the writes below (`analytics_sharing_annotations`, `analytics_saved_reports`, both correction tables: 0 each, [`counts.txt`](../../evidence/screen-reviews/analytics-old-addresses-1b45d86/counts.txt)), so nothing was stranded by the move.

| Capability | Where it lived | Where it lives now | Status |
| --- | --- | --- | --- |
| **Overview** | | | |
| Recorded actions and the change against the earlier period | Overview answer grid | Home's week line; Data's counting totals | Already there. The calendar-period "change" is the comparison the rethink rejected for launches. |
| Browsers with any activity | Overview | Data, "How counting works" | **Moved.** It was only on Overview; Data now shows it with its limit ("a browser is not a person"). |
| Freshness line (updated, history since) | Overview | Data, "Coverage and freshness" | Already there. |
| "Today so far" for the whole gallery | Overview | The album report and Home show today's partial for each launch | **Dropped.** A gallery-wide partial day answers no launch question. |
| Free-window daily trend chart | Overview | Each launch's daily chart (album report); the launch overlay (index) | **Dropped.** A free calendar window is the comparison the rethink rejected. |
| Findings, the owner's record form, the assistant (gallery scope) | Overview panel | Home findings; the album report's findings, record form and assistant (album scope) | Already there. Production holds 0 actions and 0 assistant requests. |
| "Albums getting attention", "Photos drawing attention" | Overview | Home launch log and the album index; the explorer's top photos | Already there. |
| **Filter bar** | | | |
| Album picker, dates (7, 30, 90, custom), measure (five), traffic, sport, category, source, event date, season, comparison, reset | Filter bar on every tab | `/photos` | **Moved** (this page is the one place with them). |
| Album event type filter | Advanced filters | None | **Dropped.** The column was removed in June (`20260609060000_drop_dead_columns.sql`), so the only value was "unknown". An old address that carries it is still read. |
| Same-age comparison mode | Advanced filters | The album index (same-age rank by default) | Already there. On `/photos` an old address that asks for it reads as no comparison. |
| Mobile "Filters" toggle | Mobile bar | The filter form is always on the page | **Dropped.** |
| **Albums tab** | | | |
| Album table: current, previous, change, rank, search, paging, selected-album panel | Albums | The album index (launches ranked at the same age; search; compare up to the limit); each row opens its report | Already there. The calendar-period table by an arbitrary measure is **dropped**; `/photos/export.csv?measure=album_opens` still gives per-album totals for any dates. |
| Same-age table and daily table | Albums, "publication age" | Index overlay; album report launch comparison | Already there. |
| **Photos tab** | | | |
| Popular, rising, recently active; images or table; column choice; shortlist; inspection dialog; paging; the note on what Rising leaves out | Photos | `/photos` | **Moved.** The shortlist is the owner's, on `/photos` as on the album report (one rule, `shortlist.ts`); visitors are told what signing in adds. |
| Gallery-wide CSV and shortlist CSV, including an explicitly empty shortlist | `/gallery/export.csv` | `/photos/export.csv`, also used by the album report's two CSV links | **Moved.** |
| **Sources tab** | | | |
| Tagged arrivals; where albums and photos were opened; linked visits after an arrival | Sources | Album report (arrivals); Data (arrivals, open locations, linked visits) | Already there. |
| Sharing notes: add, edit, delete | Sources, owner only | Album report, "Where you shared this album", owner only | **Moved.** Notes are always one album's (the table needs an album), so site scope is not needed. The old Sources list read notes only on Overview, so it never showed them; the report lists all of the album's notes. |
| Saved views: save, update, delete | Sources, owner only | Settings (save, rename, delete; opens the explorer); `/photos` (save the filters on the page, update a saved view) | **Moved.** A name is unique per owner. |
| **Measurement tab** | | | |
| Cloudflare cross-check, traffic classes, counting rule, delivery health, volume estimate, recorded event counts, linked journeys, traffic impact, search and download evidence | Measurement | Data | Already there (step 5). |
| Correct a retained traffic event, history, reverse latest, event paging | Measurement, owner only | Data, "Correcting how an event is classified", owner only | **Moved.** |
| Correct a retained version 2 event (incl. "self excluded"), history, reverse latest | Measurement, owner only | Same | **Moved.** |
| **Preferences, header, plumbing** | | | |
| Analytics choices for this browser | Preferences | Settings | Already there. |
| "All sites" link | Header | The header's Site link | Already there. |
| "View gallery" link out | Header | None | **Dropped.** The public gallery is one click from any photo link. |
| "Operator tools enabled / Available by direct link" badge | Header | Each owner block says what signing in adds | **Dropped.** |
| `#section` anchors on old links; remembered selected album | Browser | None | **Dropped.** An old anchor survives the redirect and does nothing. |
| Sign-in return to the old report; magic links already sent | `next=/analytics/operator…` | Home, or the page the old address maps to | **Moved** (one mapping serves all). |
| Links stored in findings and briefs (`/analytics/operator?…`) | Stored snapshots | The same mapping, so they still open | **Moved.** New findings write the new links. |
| Assistant "reachable from the album report" | | Album report, `#assistant` (record form for an owner; the assistant when a saved calculation exists) | Confirmed. |

### Redirects

One `308` from the app's own hook, GET and HEAD only (a form post to an old address is a 404, never replayed). Only the parameters the new page reads are carried; album keys are validated before they go into a path; Home never takes a query, because Page Rule 49cd0626 sends `/?*` to the site report before the app runs. The full table, one row per address, is [`redirects.md`](../../evidence/screen-reviews/analytics-old-addresses-1b45d86/redirects.md); the mapping is `src/lib/analytics/old-addresses.ts` with 43 unit tests.

| Old address | New address |
| --- | --- |
| `/gallery`, `?section=overview`, any unknown `?section=` | `/` |
| `/gallery?scope=album&albums=<key>` (overview, sources) | `/albums/<key>` |
| `/gallery?section=albums` | `/albums` |
| `/gallery?section=albums&scope=album&albums=<key>` | `/albums/<key>` |
| `/gallery?section=albums&albums=<key>` (one album picked) | `/albums/<key>` |
| `/gallery?section=albums&scope=selected&albums=a,b,c` | `/albums?compare=a,b,c` |
| `/gallery?section=photos&…filters…` | `/photos?…the same filters…` |
| `/gallery?section=sources` | `/data#arrivals` (`?period=7`, `30`, `90` kept) |
| `/gallery?section=measurement` | `/data` (`?period=7`, `30`, `90` kept) |
| `/gallery?section=analytics-preferences` (and `preferences`) | `/settings` |
| `/gallery/export.csv?…` | `/photos/export.csv?…` (same query, same file) |
| `/photography/analytics`, `/photography/analytics/operator[/export.csv]` | the same rows above, in one hop, on any host |
| `/?period=30`, `/?section=writing&period=7` (the report host's root, with what the old site report read: `period`, `section`, `page`, `actionsPage`, `view`) | `/sites?period=30`, `/sites?period=7&section=writing` (a bare `/`, or any other root query, stays on Home) |

Two facts about the platform found while building it. First, SvelteKit answers 404 to any path outside the app's `/photography` base before `handle` runs, and `/gallery` is outside it, so `hooks.ts` `reroute` places `/gallery` and `/gallery/export.csv` under the base; with that removed, the worker answers `/gallery` with a bare 404. The dev server cannot show this (it 404s every clean address), so the proof is a production build under `wrangler pages dev`. Second, the redirect table's "second hop" column is empty of 308s: no row chains.

### Edge rules

No Cloudflare change was made. Curl of the live host ([`redirects.md`](../../evidence/screen-reviews/analytics-old-addresses-1b45d86/redirects.md#production-edge-before-this-change-is-deployed)): no Page Rule touches `/gallery`, `/gallery/export.csv`, `/photos` or `/photos/export.csv`. Rule 49cd0626 (`analytics.ninochavez.co/?*`, a 301 to `/photography/analytics/sites?$1`) catches every root address with a query, so the app never saw one; the app then redirected the internal path again, two hops.

The app now does that rule's job: a root address on the report host whose query carries a parameter the old site report read (`period`, `section`, `page`, `actionsPage`, `view`, taken from `/sites` before step 5, `git show bd99964^:src/routes/analytics/sites/+page.server.ts`) is one 308 to `/sites` with just those parameters. A bare `/` and a root query with none of them (`/?x=1`) stay on Home. **The rule is redundant once this deploys.** It still answers first until it is deleted, which is harmless (both end at `/sites`), and the app's version cannot be seen live while the rule exists. The coordinator will ask Nino to delete it, then check `curl -sI 'https://analytics.ninochavez.co/?period=30'`: `308` to `/sites?period=30` with `x-frame-options: DENY`.

### What moved where

| Page | Change | Captures (1440 and 375) |
| --- | --- | --- |
| `/photos` (new) | Photo explorer, filters, shortlist (owner only), CSV, saved views | `photos-visitor`, `photos-rising`, `photos-album-table`, `photos-dialog`, `photos-empty`, `photos-owner-views`, `photos-owner-no-views`, `photos-owner-shortlisted` |
| `/data` | Corrections for the owner, in plain words; browser estimate | `data-visitor`, `data-owner-empty`, `data-owner-history` |
| `/albums/<key>` | Sharing notes for the owner; CSV and "Filter these photos" links | `album-visitor`, `album-owner-no-notes`, `album-owner-notes` |
| `/albums` | "Photos across all albums" link | `albums-index` |
| `/settings` | A saved view opens the explorer | `settings-owner-views` |
| Home | Only the site link's address | `home-visitor` |

All under [`analytics-old-addresses-1b45d86`](../../evidence/screen-reviews/analytics-old-addresses-1b45d86/), with the walk's gates and the forced failures in `walk.txt`.

### Rules settled in review

1. **Unlisted albums in the corrections are read on purpose.** The owner's pickers and history on `/data` read actions from every album, unlisted ones included, as the old Measurement tab did and as the album report does for the owner. This is the owner's private surface and its job is to correct the owner's own traffic, which is mostly on albums that are not public yet; excluding them would hide the very actions to reclassify. It is safe because the caller has proved the owner, a correction writes a new private version rather than changing the action, and nothing read reaches a visitor. The rule is written beside the read in `corrections.server.ts`. Everything else new here reads public albums only, for everyone (the explorer, its CSV, its album picker and facets); for the owner that is a change, because the old picker listed unlisted albums that the report then left out.
2. **Shortlisting is the owner's, on both pages.** One module, `src/lib/analytics/shortlist.ts`, owns the storage key, its limits and the sentence that tells a visitor what signing in adds. On `/photos` a visitor sees no shortlist checkboxes, no shortlist CSV and no "add to shortlist" in the photo dialog, and is told "Shortlisting and saved views need sign-in".
3. **A saved view's name is unique per owner** (ignoring case and spaces), because "Open" and "Update" would otherwise point at two things with one name. The table has no unique constraint, so the check is in `saved-views.server.ts`. Settings saves, renames and deletes through the same module: a taken name is refused on save and on rename, and a rename or delete that matches none of the owner's views is reported as not found instead of as success.

### What else changed in review

- **Saving and updating a view** moved out of the route into `saved-views.server.ts`, with a fake-client test: signed out is refused; someone else's or a missing view is refused (an update that matched no row used to be reported as success); the stored filters equal what the page parsed from its address; a duplicate name is refused. Forced failure: removing the owner filter and the signed-out check made two of seven tests fail.
- **Corrections wording** on `/data`. "Retained event", "version 2", "server-made control" and "provider" are gone. The page says what each form changes in the words the counts use (photo and album actions, detailed events, the six classes), describes detailed events by album, page and time with the identifier as small text, and says "This action's record is no longer kept" or "Its details could not be read just now" instead of "context unavailable". Precision kept: a correction changes counts at once, a record not yet sent to PostHog is held back, and for one PostHog already has only the identifier, the new class and the version number are sent.
- **Mapping:** one album picked in `/gallery?section=albums` goes to that album's report; two or more go to the index comparison. The site report's root addresses are mapped (see Edge rules).
- **Dead code deleted:** `bounded-singleflight-cache.server.ts`, `describe-filters.ts` and `report-evidence.server.ts`, with their tests and the `filters:test` script. Nothing imported them (src, scripts, tests, tools re-searched).

### Playwright and the local verifier

Run against the local synthetic stack (`supabase status` written to `.temp/analytics-local-rehearsal/runtime.json`; the resetting setup was not run). The shared local database lagged main, so the launch, first-publication and recap migrations were installed on it with `scripts/rehearse-analytics-scheduled.py --install-local` (additive, local only).

| Spec | Passed | Failed | Skipped | Notes |
| --- | --- | --- | --- | --- |
| `public.spec.ts` | 4 | 0 | 0 | Rewritten: the one-hop redirects, the explorer without a shortlist for a visitor, filters and CSV, and every write action requiring sign-in on the explorer, Data, the album report and Settings. |
| `journeys.spec.ts` | 7 | 0 | 0 | Real local writes: save, update, reopen and delete a view; an owner shortlist surviving paging; a sharing note added, edited and deleted; a classification correction recorded and reversed. |
| `collection.spec.ts` | 2 | 0 | 0 | The preferences calls now send an `Origin` header, which the route has required; that was stale before this change. |
| `scheduled.spec.ts` | 4 | 0 | 0 | The gallery half is the explorer's paging. The site half asserted the site report as it was before step 5, so it was rewritten for the current page. |
| `intelligence-workspace.spec.ts` | 8 | 0 | 0 | The album report mounts the panel only when a saved calculation exists, and the local database has none, so the page is requested with that one server decision turned on. The panel's own behaviour is what is tested. One step (re-asking after the filters change) has no equivalent on a page whose scope cannot change, and was replaced by a check of the frozen scope. |

The specs write dated screenshots into `docs/implementation/...`; those were restored after the run.

`scripts/verify-analytics-local.mjs` is kept: it signs in the synthetic owner (writing the cookie file the browser suite needs), runs the load and failure rehearsals, and checks numbers and exports. Its failure rehearsal revoked a database function the report no longer reads, so it asserted nothing; it now revokes the one the report reads, and passes (report unavailable, CSV 503, collection 503, grants restored). Its numeric and export-row checks assume freshly reset fixtures (`analytics:rehearse`, which resets the shared synthetic database and was not run): on the shared database they read 6 for 7, 8 for 9 and 1 for 2 visitors, and 1,134 for 1,105 and 29 for 1 export rows, because earlier runs added events. Those four assertions are unverified, not failing for a reason in this change.

### Not verified

- No real write against production and no real sign-in. The harness owner is not a sign-in. The local run did exercise save, update, notes and corrections against a real (synthetic) database.
- The numeric and export-row checks of `verify-analytics-local.mjs` on freshly reset fixtures, as above.
- A cold review of device captures, physical devices, largest text size and increased contrast.
- Cost: every `/data` load now runs the browser-estimate query, and `/photos` replaces `/gallery` in `scripts/measure-analytics-performance.mjs`'s default pages. Step 9's comparison should know both.
- The root redirect on the live host, which cannot be seen while Page Rule 49cd0626 exists.

## Sources

- Live pages walked signed out on 2026-10-06 with browse-tool: `/sites` (Reach and Actions), `/gallery` (all six sections, all albums, last 30 days), and the album-scoped views for `Re7kho`.
- Production queries, read-only, `supabase db query --linked`, 2026-10-06: counts on `analytics_intelligence_*` tables and `analytics_saved_reports`; suppression reasons from `analytics_intelligence_snapshots` in the last day.
- Brief creation condition: `supabase/migrations/20260930084000_analytics_intelligence_refresh_health.sql` (owner loop over `analytics_intelligence_preferences` where `retention_policy <> 'undecided' AND dashboard_enabled`).
- Root redirect observed by navigation: `/` lands on `/sites`.
