# Analytics experience

Design intent: rethink. Scope: the whole report site at `analytics.ninochavez.co` (gallery and site reports, intelligence, recaps). Mode: Operate.

Nino asked to replace the styling completely on September 29, 2026. Public access, accurate measure definitions, exports, filtering, and protections for private data remain product requirements. The measurement review below identifies definitions and collection behavior that need correction alongside the redesign.

## Launch rethink, October 6

This section supersedes "The job", "Character and hierarchy" and the surface list below where they conflict. The September sections stay as the record of the first direction and its evidence.

**Why.** On October 5 and 6 Nino asked what the Albums page was for and whether it was a dead page. Production data shows why the September structure fails: each event album gets about 80% of its attention in its first three days, then goes quiet. Calendar-period comparisons describe publication timing, not performance, and the intelligence rules never fired (12,637 snapshots, 0 findings). Full evidence: [the analytics site rethink](../audits/20261006-analytics-site-rethink/README.md). Decided October 6: album age counts from the first publication, and launch recaps on day 3 and day 7 replace the daily and weekly briefs.

**The job, in five questions.**
1. *What is happening now?* Which album launched most recently, and how its first days compare with earlier launches at the same age.
2. *What is next?* The next recap checkpoint, or nothing until the next publish. A quiet gallery says so.
3. *Who is involved?* A small group per launch (about 40 browsers for JCA at ACC), how they arrived, and which photos they took.
4. *When and where is this read?* On a phone in the days after publishing, and from a day 3 or day 7 recap. On a desktop when comparing launches or checking data.
5. *What can I do from here?* Open the album's photos, shortlist or export the ones people downloaded, record a change, or check whether collection is working.

**Character:** launch-centred, honest about small numbers, photographic, quiet when nothing happens, brief.

**Anti-goals:** calendar-month comparisons on burst-shaped albums; a 250-row table of trickle; an intelligence panel that is always empty; a diagnostics console in the main navigation; any number without a "compared with what".

**Density target.** Home fits one 1440 × 900 desktop screen and two 390 × 844 phone screens. An album report's first desktop screen holds the launch curve, its place among earlier launches, and three numbers; photos start in the second.

**Hierarchy.** First the most recent launch and its status; second its comparison with earlier launches at the same age; third the photos people took. Data quality appears only as an open incident.

**Carried forward from September 29.** Nino's note asked for an album summary beside the overview and a click into a photo-first detail view. Every October concept keeps that path: summary, then photos.

## The job (September 29)

Nino opens this after publishing or sharing photography, or to revisit the catalogue. He needs to understand what is getting attention, whether that attention changed, and which albums or photographs explain the change. From there he can inspect an album, compare it with peers, find photos to share, or export the result.

Desktop supports sustained comparison. A phone supports a quick check and drilling into one album. Ambient lighting is unknown; the concepts test a readable light workspace and a photo-focused neutral surface rather than assuming photography requires a dark dashboard.

## Character and hierarchy (September 29)

Character: precise, photographic, composed, inspectable, responsive.

Anti-goals: a wall of filters; a single endless report; giant decorative numbers; a technical diagnostics console as the landing page; popularity presented as photographic quality.

The first viewport establishes dates and album scope, shows activity over time, and identifies contributing albums or photos. Metric definitions sit with their numbers. Data-quality detail belongs in a dedicated view, with only material warnings surfaced globally.

The overview should fit a summary, a chart under 280px tall, and the start of both an album ranking and a photographic selection in a 1440 by 900 viewport. Primary views should fit within two desktop screens before intentional pagination. New features replace or move secondary content; they do not silently extend the landing page.

## Surfaces

Selected October 6 ([ADR 0008](../../blueprint/decisions/0008-analytics-launch-layout.md)): Home from concept A, the album report opening with concept C's recap, then concept B's photo grid and launch chart; B's table is the album index. The September surfaces fold in as noted.

- Home: the latest launches and their status, site reach this week, and any open incident. Replaces Overview.
- Album index: every album, newest first publication first, with first-week reach against earlier launches. Replaces the Albums table.
- Album report: one album's launch curve, comparison, people and arrivals, then a photo-first view with shortlist and export. Absorbs the side panel, Photos and album-level Sources.
- Site report: profile, work, writing and demos; reach, top pages, arrivals, contact clicks.
- Data quality: coverage, traffic classes and impact, counting rules, event counts, journeys, provider checks, open locations.
- Settings: this browser's analytics choices, recap and alert preferences, saved views.
- Launch recap: the day 3 and day 7 summary, in the dashboard and by email once a destination is verified.

## Interaction and copy

Navigation switches views instead of scrolling through every report. Filters remain in the URL. An album click opens its report with a clear return path. Switching popular/rising/recent changes the ranking, not the meaning of the metric. Dates are explicit; recency is labeled by last activity. New activity never becomes infinite percentage growth.

One compact date control and album scope are always visible. Secondary filters open on demand, show their active values, and can be cleared. Keyboard focus, loading feedback, empty results, partial history, and data failure are first-class states. Motion only explains changes and honors reduced motion.

Plainness: lay. Keep album names, recorded counts, date windows, coverage, traffic classes, and access rules exact. Estimated browsers are not people. Download actions are not completed downloads. Do not call all unclassified traffic human.

## Objects and states

| Object | Owner | Valid actions | States | Reverse action |
|---|---|---|---|---|
| Launch (October 6) | Album catalogue's first publication time | Open report, compare with earlier launches, open photos | In first 3 days, days 3–7, finished, no launch date recorded, inferred date | Back to Home or index |
| Launch recap (October 6) | Scheduled recap job | Read, open evidence, record a change | Due, ready, partial evidence, unavailable, delivered, delivery failed | None; a recap is a record |
| Report | Server report contract | Filter, compare, export | Loading, complete, partial, unavailable, empty | Reset filters |
| Album | Album catalogue | Search, sort, select, inspect, compare | Active, no activity, missing publication date | Back to albums, clear selection |
| Photo | Photo catalogue and report | Inspect, rank, shortlist, export | Image loaded, missing preview, new activity, unchanged | Close inspection, remove from shortlist |
| Traffic evidence | Collection and classification rules | Read inclusion and coverage | Known, unclassified, excluded, unavailable | Return to report |
| Private note / saved view | Authenticated operator | Existing create, edit, delete actions | Signed out, available, save failed | Existing delete or edit actions |
| Classification correction | Authenticated operator | Existing correction and undo | Applied, reverted, failed | Existing undo |

## Metrics must lead to a decision

September 29 clarification: Nino needs the report to guide both site design and photography choices. The proposed screens overemphasized photo opens. The album inspector and comparison table must expose album opens, photo opens, photo download actions, album download actions, favorite actions, and share actions together. A metric selector controls the chart and ranking; it must not hide every other measure. Photo inspection shows its opens, downloads, favorites, and shares together, with period changes and the actual image. The report currently queries one measure at a time, so implementing this requires a consistent multi-measure summary rather than hardcoded preview values.

| Decision | Evidence needed | Current boundary |
|---|---|---|
| What album or photo should I promote? | Recorded actions, recent change, sources of tagged arrivals, and the actual images | Opens/downloads/favorites/shares exist; incoming tagged arrivals are not a complete attribution model |
| What kinds of photographs should I explore making more of? | Response by action/celebration/candid/portrait/warmup/ceremony, album context, publication age, and exposure | Categories and publication-calendar-day comparisons exist; those days do not give equal elapsed exposure, and thumbnail exposure is not recorded |
| Where does browsing become difficult? | Visit paths, search success, time to find a photo, errors, load performance, and device/browser breakdowns | The engagement counters are not visit sessions; joined journeys and device/performance breakdowns require additional collection |
| Is a gallery being discovered but not used? | Album exposure/open, photo exposure/open, and subsequent actions by the same visit | Aggregate totals alone cannot establish this funnel or its conversion percentages |
| Did a site or publishing change help? | A dated change marker, comparable time windows, similar album age/context, and a specified outcome | Period comparisons exist; before/after correlation is not a causal result |

Definitions verified in source: opens fire when the photo viewer opens, before image load is confirmed; favorites count add actions without subtracting removals; download actions do not prove completed file transfers; share actions differ by channel and do not establish a published social post. Counts are deduplicated actions, not people. Never infer a completion rate by dividing mixed album/photo action totals. Rate definitions must name their unit, eligible denominator, time window, and missing coverage.

The public report checked September 29 for September 22–28 returned 98 album opens, 1,451 photo opens, 82 download actions, four favorite actions, and zero recorded share actions, with complete summary coverage. It returned no diagnostic evidence; this does not prove there were no failures. These are a check of reporting output, not independent proof that all real activity was captured.

Prioritize observations over automatic prescriptions. An under-viewed image may never have been shown; a frequently downloaded image may depict the visitor's teammate rather than demonstrate superior composition. Display sample sizes, publication age, collection coverage, and excluded known operator/test traffic. Unclassified traffic remains uncertain. Low-volume favorites and shares are supporting evidence, not a basis for definitive creative advice.

## Measurement review changes the build requirements

The [September 29 red-team review](../audits/analytics-red-team-20260929/REVIEW.md) found reproducible download-diagnostic and ranking defects, inconsistent download units, and missing evidence for exposure or visit-based conclusions. This does not reduce the requested release scope. Measurement repair is part of the full redesign.

- Repair the normal download-diagnostic payload and reject failed image responses before treating them as ZIP entries. Show delivery health separately from daily summary coverage.
- Show download requests, requested photo items, and album ZIP requests as distinct measures. Favorite additions and share handoffs keep their exact meaning.
- Give the operator a visible way to exclude this browser while preserving public report access. Controlled agent browsers must establish test exclusion before exercising gallery actions. A Chrome profile or Chrome email does not establish site operator context.
- Require a complete, compatible comparator for Rising. Never substitute popularity silently. Explain partial-history rankings and unequal comparison windows beside the ranking.
- Call the existing age view publication calendar days. Equal elapsed-age analysis needs the appropriate time-based evidence. Label recency as the last recorded action because repeated actions may be deduplicated.
- Add visible-photo exposure, successful photo rendering, visit/search links, discovery outcomes, and device/layout context before offering conversion or photography-preference insights. Known album facts remain authoritative; photo-category provenance stays visible where it affects interpretation.
- Expose collected search result counts and aggregate failure reasons without exposing search text or visitor identifiers. New measures show their collection start date and unavailable state until evidence exists.

The reviews and synthetic reproductions are evidence of source behavior. They do not establish production loss rates or external-provider parity. Historical totals cannot supply missing impressions, visits, or successful-download evidence retroactively.

## PostHog extends the evidence behind the same workspace

The [PostHog integration plan](../POSTHOG_PLAN.md) is part of the full release. Nino selected PostHog Cloud with proposed updated privacy wording. One accepted event contract feeds local action reporting and eligible PostHog export; linked visits add discovery, search and download funnels, photo-exposure response and experiments. The integration is planned, not active.

Keep the overview, album comparison, selected-album side panel and photo detail path in this workspace. Add the useful journey aggregates to their relevant views rather than sending Nino to another product for every answer. A private PostHog link can support deeper investigation. Public gallery access remains; provider credentials, visit-level records and private notes remain protected.

Each new panel must show what it counted, its eligible population, collection start, comparison and freshness. Permission-limited journeys and legacy daily counts are different populations. Provider failures show an unavailable panel while local reports remain usable. An Exclude this browser control shows whether Nino's own browsing is excluded without requiring a site login. Its preference grants no editing rights.

## Baseline evidence

The user's September 29 screenshot shows a full-width bar for each day. The live page confirms `grid-template-columns:repeat(30,minmax(1.8rem,1fr))}`: the extra closing brace invalidates the declaration. At the inspected viewport the chart is 5,029 CSS pixels tall. This is a rendering defect, separate from the requested information architecture redesign.

## Reference observations

Inspected September 29 through Nino's existing Mobbin login. These are captured product screens, not live behavioral tests.

- [Plausible dashboard](https://mobbin.com/screens/550f90fc-17b6-4203-a470-57344e02f093): the date and comparison controls sit above a bounded trend chart; current and previous values share one region. Adapt the relationship between scope and chart, with our own report meanings. Check that changing the date never detaches its label from the chart.
- [Seline dashboard](https://mobbin.com/screens/381e7a1c-6678-4f19-a743-59aa944301ec): compact navigation, small metric summary, charts, and ranked source/page lists are visually separated. Adapt persistent wayfinding and ranked detail. Avoid multiplying same-size cards or placing unrelated audit tools on the first screen.

The Mobbin connector required authentication; the existing Chrome session provided access. No claim is made about usability outcomes from these references.

## Direction exploration

Seven grounded structures, ordered before selection: a studio ledger for album comparison; a contact sheet for photo discovery; a performance workspace connecting trend to albums; a library catalogue with an album inspector; a sports scorebook for event peers; an activity monitor for traffic investigation; a seasonal calendar for catalogue review. These draw from records, photographic editing, and time-based graphics.

Impeccable direction seed: `c32c21da`, assigned grounded index 3. Three design mockups use the same seven-day public report as an anchor. Generated photographs and secondary detail values are illustrative, not verified analytics. The mockups show populated views; empty, failed, loading, and mobile states still need implementation and rendered review.

1. **Performance workspace.** Light slate, white working surface, deep blue selection. Persistent navigation, compact trend, album ranking, and photo discovery. Best for the daily check.
2. **Studio ledger.** White and mineral green. A dense album table with a pinned inspector and chart for the selected album. Best for repeated comparisons; more demanding on first entry.
3. **Photo index.** Near-white and ink with a restrained blue accent. A contact sheet paired with an adjustable ranking and side-by-side photo evidence. Best for choosing work to promote; portfolio totals are quieter.

Catalog challenger decisions, evaluated on audience identification and task clarity:

- Origami sequence: declined. Sequential folding would make free exploration cumbersome. Keep reversible drill-down and explicit return paths.
- Cloud quarry: declined. Spatial construction adds no meaning to these reports. Keep a clear division between overview and detail.
- Saville catalogue: declined. Coded names and vast empty fields obstruct album identification. Keep disciplined alignment and quiet inactive controls.
- Racing league: declined. Speed imagery suggests outcomes the gallery does not measure. Keep unmistakable selection states.
- Phosphor terminal: declined. A scrolling transcript repeats the existing page's reading problem. Keep keyboard access and predictable data alignment.
- Variable specimen: competitive on photographic inspection. Replace glyph cells with actual photographs, axes with explicit ranking controls, and pinning with the existing shortlist. This informs Photo index; avoid ornamental giant type.

## User steering, September 29

The first re-roll saved this exact note: “maybe mix overview with album comparison? not sure but i like the side panel album overview of a selected album then allow for a details view to click into the photography first view?”

Carry this into every revised candidate: a combined gallery overview and album comparison, a persistent summary for the selected album, and a View photos action opening a dedicated photo-first detail view. Returning restores the dates, filters, selection, and table position. A selected album is visibly separate from the gallery-wide date scope. Selection changes only the side panel; an explicit Open album report action changes report scope. Photo ranking belongs in the photo detail view.

Retain the overview's bounded trend chart, the ledger's selected-row inspector, and the photo index's contact sheet with evidence beside the selected photo. Drop separate competing entry experiences and different color systems per view. The new proposals share a light slate, ink, and blue system; their remaining difference is how much room the overview versus the comparison table receives. The blue system is a proposal, not a recorded user color preference.

Re-roll 1 was run from seed `c32c21da`. Its generic instruction to discard previous candidates is superseded by the user's explicit request to combine those candidates. The revised round therefore tests three compositions of that specified workflow: balanced chart/table with a full-height inspector; compact overview above a wider table and inspector; and a full-width trend above the table and inspector. All three preserve the same path into photo details. The table-focused composition is the recommended one because long album names remain easier to scan without losing the gallery summary. The user has not chosen a composition yet.

The generated comps are composition references. Do not ship invented side captions, generated photographs, a six-album count inferred from six visible rows, or any other generated detail as product facts. The report supplies recorded counts, dates, coverage, and actual photographs. Measure labels and derived insights must also satisfy the measurement review above.

## Intelligence completion, September 30

Keep the approved light slate, ink, and restrained blue hybrid inside the report
workspace. Intelligence is a report tool, not a separate dashboard or a new
brand direction. The initial finding list carries up to three saved findings and their
evidence links. The contextual inspector sits beside those findings on desktop
and follows them in document order on a phone.

The owner workflow is one connected path: inspect evidence, record a real change,
declare one outcome and an observation window, then return to a labeled pending,
ready, inconclusive, or returned follow-up. A standalone record may start from
the selected album, photo, report context, or a validated page path; it does not
need a finding when the change really happened. Dismissal and snooze collect a
private reason. Private settings are visible independently of whether a report
has findings so the required retention choice is never hidden behind an empty
state.

Briefs use their stored title, body, finding references, and source windows. Do
not manufacture a summary when a stored body is absent. Owner records, questions,
briefs, settings, destinations, and outcomes stay off the anonymous surface.
External delivery remains an explanation of a verified-and-activated state, never
a send control or an assumption based on an email or browser session.

The earlier decision page served the mockups in `.impeccable/mocks/decision/`. Those proposals remain composition references. The implemented report uses the light hybrid workflow described above; actual report data remains authoritative. Full-size image expansion was checked in the browser. The page initially opened before its image files existed; after all four images were saved, a reload made every preview visible.
