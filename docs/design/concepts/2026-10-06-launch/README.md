# Launch concepts, October 6

Three whole-screen structures for the analytics site, following the [launch rethink](../../../audits/20261006-analytics-site-rethink/README.md). Each draws Home and the album report on the same five cases. Brief: [experience brief, "Launch rethink"](../../experience-brief.md#launch-rethink-october-6). Nino has not selected one yet.

Open `index.html` through any local static server; `?concept=A|B|C&case=…` selects a frame. Captures of all 15 frames at 1440 × 900 and 390 × 844 are in `captures/`.

## Data

Every count is a production value read on October 6, 2026 from `analytics_daily_actions`. It includes audience and unclassified traffic. The live report's conservative rule can differ by a few: JCA at ACC's day 1 reads 577 here and 575 in the report. All seven publication dates are inferred from logs. "About 42 browsers" comes from the live album report for Sep 5 – Oct 4. Photos are the albums' real images from Cloudflare Images. The data-failure case is **simulated**. The refresh failure is invented and the frame says so; its counts are real through Oct 4.

## Cases

| Case | Why it is here | Canonical states covered |
| --- | --- | --- |
| Home, Oct 2 | JCA at ACC reaches day 7 while Millikin is on day 6 | Active, upcoming, actionable |
| Album report, JCA at ACC, Oct 6 | The real three-day burst, finished | Active object, dense (7-launch comparison) |
| Album report, VLA – Spring 2026 | An album public before records began; trickle only | Changed by source (no launch date) |
| Home, quiet week, Oct 6 | Ten days with no new album | Empty |
| Home, data unavailable | Refresh failed; must not read as a zero | Failure |

Pruned: "completed, with undo", because these screens have no destructive action. Largest text size and increased contrast belong to the cold review of the selected concept.

## The concepts

**A. Launch log.** Home is a list of launch cards, newest first, under one plain sentence about what is happening. Each card states its day, its opens and its rank at the same age. The album report reads top to bottom. It opens with a summary sentence and daily bars against earlier launches. Then come three numbers, the photos people downloaded, and the recap history.
- Works: the first sentence answers "what is happening now"; the quiet week reads as quiet ("No new album since Sep 26"); every card carries its own comparison.
- Weak: the comparison is a rank, not a picture; older launches beyond the latest three need a separate index.

**B. Cohort board.** Home is one chart of every launch's opens, added up by day since publication, with the latest in blue. Below it sits a table ranked at day 7, and beside it a selected-launch panel. The album report is photo-first, with the comparison chart and a selected-photo panel beside the grid.
- Works: the comparison is visible at once; it keeps Nino's September 29 side-panel request most literally; the photo-first report is the strongest for choosing images.
- Weak: on a phone the chart becomes unreadable (see `B-homeFailure-phone.png`); Home asks for analysis before saying what happened; in a quiet week it still leads with a chart.

**C. Recaps.** Home is a short list of notes such as "Day 7 recap ready", "Quiet" and "Finished". The album report is the recap itself: sentences with the numbers inline, a small chart, six photos and three actions. The day 3 and day 7 email would carry the same text.
- Works: easiest to read on a phone; one piece of writing serves the dashboard and the recap email; it states what it cannot tell you.
- Weak: comparison across many launches is thin; browsing all photos or older albums leaves the recap.

## Recommendation, for Nino's selection

Take A's Home. Put C's recap at the top of the album report, with B's photo grid and launch chart below it on desktop. B's ranked table becomes the album index. A answers "what is happening" on arrival. C makes the report and the recap email one piece of writing. B gives the comparison and the photos room on a larger screen. Left out: B's chart as Home, because it fails on a phone and leads with analysis. Also left out: C's notes list as Home, because it hides the comparison that gives a number meaning.

This is the agent's recommendation, not a selection. The selection record names the person who chose.
