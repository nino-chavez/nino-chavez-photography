# Launch figures outside the app: dashboard probe, 2026-10-08

A claude.ai Dashboard artifact was built over this site's seven album launches. The question was whether the report's figures can live on a surface outside the app. The fleet verdict lives in the operator's dotfiles research note of the same date. This file keeps what the probe found about **this repository**, and the fix pass it earned.

## What the probe showed

- The launch-level figures already have an owner outside the app. `/albums/export.csv` (`src/lib/analytics/album-index.server.ts`) answers without a key, with per-field states and `as_of`. Every analytics page's `__data.json` and `GET /photography/api/analytics/intelligence?scope=…` answer unauthenticated too, for public albums. That is by design: `src/routes/analytics/home/+page.server.ts` says aggregate evidence about public albums is open by direct link.
- The daily series has no export. A page outside the app that wants daily bars has to read SvelteKit's `__data.json`. That is an internal transport, not a contract.
- The probe's first dataset came from `docs/design/concepts/2026-10-06-launch/index.html`. Its counts disagreed with the report on six of seven launches. JCA at ACC read 945 against the report's 931 for the first week; Millikin read 293 against 266. The snapshot counts audience and unclassified traffic; the report does not. The artifact's own consistency check compares the page with its own data, never the data with its source. It reported nothing.

## Findings in this repository

1. **The day-7 rank is an as-of figure, and one comment says otherwise.** `analytics_read_launch` ranks every launch whose window was complete at the read date (the `r3` and `r7` windows in `supabase/migrations/20261006210000_analytics_read_launches.sql`). `src/lib/analytics/launch-recap.ts` knows it: "launches published since can move a rank". The function's `COMMENT` at the end of that migration says "against every earlier launch". That describes the median's comparison set, not the rank's. The stored day-7 recap for JCA at ACC says "2nd of the 6"; it ran on October 2, before Millikin's week was complete. Today's export says 2 of 7. Both are right for their dates.
2. **Two golds.** `DESIGN.md` calls itself canonical and gives gold-500 as `#eab308`. `src/app.css` ships `--color-gold-500: #D4AF37`. Anything that reads `DESIGN.md` as brand truth gets a gold the site does not show.
3. **Inter is named, never loaded.** `src/app.css` sets `--font-family-sans` to `'Inter Variable', system-ui, …`. Nothing supplies the face: no `@font-face`, no package, no file. Montserrat has one under `static/fonts`. Production shows Inter only where a visitor has it installed.
4. **The concept snapshot zero-fills days it never saw.** `docs/design/concepts/2026-10-06-launch/index.html` was read on October 6. JCA at ACC's days 11–13 and Millikin's days 10–13 had not happened, yet the curves hold 0 there. A 14-day total or share taken from that file counts unobserved days as zero. The site's own rule is that a missing day is a gap, never a zero.
5. **The concept snapshot's counting rule is not the report's.** It includes audience and unclassified traffic; the report uses the conservative rule. The folder's README says "can differ by a few". The difference is 14 opens on one launch's first week.

## Next fix pass, ranked

1. Decide which gold is right, and make `DESIGN.md` and `src/app.css` agree.
2. Correct the migration's `COMMENT` on `analytics_read_launch` so it describes the rank the code computes.
3. Add a daily-series export beside the CSV route, in `scripts/`. Build it on `dailyChart` and `cumulativeCurves` from `src/lib/analytics/launch-report-view.ts`, which sits outside the gallery reader gate's source roots. Write `asOf`, the source commit, `rule: "conservative"`, `dayBasis: "day 0 = publication day, Chicago"`, `null` for every unobserved day, and a `numbers` map. Gitignore the output. Give it a parity test. The series' totals must equal the CSV export's and the stored recap text at the same `asOf`. Rank is asserted only against the export at a matching `as_of`. Break the test once on purpose before anyone trusts it.
4. Either load Inter with an `@font-face` beside Montserrat's, or stop naming it.
5. Say in `docs/design/concepts/2026-10-06-launch/README.md` that the snapshot's rule is the inclusive one, and that its post-read-date days are unobserved. Then nobody quotes a 14-day figure from it.
6. Only if a surface outside the app ever needs daily bars: add a stable JSON launch route, so nothing reads `__data.json`.

## How this was checked

Live unauthenticated GETs against analytics.ninochavez.co on 2026-10-08: every analytics page, its `__data.json`, both CSV exports, and the intelligence endpoint. Read in this repository: the migration, `launch-recap.ts`, `launch-report-view.ts`, `album-index.server.ts`, `DESIGN.md`, `src/app.css`, `static/fonts`, and the concept folder. The stored recaps came from `docs/evidence/screen-reviews/analytics-launch-recaps-0ad62f3/replay-launch-recaps.json`. The rebuilt artifact's tiles and table were read back against `/albums/export.csv`, row for row.
