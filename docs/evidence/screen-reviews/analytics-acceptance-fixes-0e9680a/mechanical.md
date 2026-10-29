# Mechanical tier for the step 9 fix pass

Measured results of automated gates on the captured screens after the fixes, kept apart from the captures so a second cold reviewer can judge the screens from the images alone. This file states what was run, what each gate returned and what was not covered. It makes no judgement of how a screen looks. The method is the one in `analytics-acceptance-a8bfd28/mechanical.md`; this file lists only what differs.

Source tree: branch `fix/analytics-acceptance`, code as of commit `04405eb`. Run on 2026-10-07 UTC, between 14:00 and 14:40 UTC for the final loads of each surface (Chicago date 2026-10-07).

## Result in one table

Over 104 page loads (13 surfaces, visitor and owner, Chromium and WebKit, phone and desktop):

| gate | result |
| --- | --- |
| overflow, at default, contrast-more, forced-colors, 200% and 312% text | 0 offenders in every load. The first acceptance run (`a8bfd28`) found overflow on every page at 312%; the first full run on this branch still found 42 finding rows at 312% and 2 at 200%, fixed before this run (`triage.md` item 9) |
| 44 px targets | 0 under 44 px of 2,504 measured (the acceptance run found 14 native selects in WebKit at 22 to 33 px) |
| text that did not grow at 200% and 312% | 0 groups (the acceptance run found chart text pinned at 12 px) |
| keyboard, Tab only, 1,396 stops | 0 stops without a visible ring. One intermittent finding, below |
| axe (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice), 260 runs at default, contrast-more and forced colours | 0 violations (the acceptance run found `link-in-text-block` on 4 pages and `landmark-unique` on Albums) |
| own text contrast, same settings | 0 below WCAG AA (the acceptance run found the inactive "Previous" pager item at 3.05:1) |
| console errors, page errors, failed requests, HTTP status 400 or more | 0 |
| non-GET requests | 0 aborted. The local server serves no Cloudflare Web Analytics script, so there was nothing to abort (production had two per load) |
| requests to another `*.ninochavez.co` host | 0 |
| images | 0 broken. One image still loading at the moment of capture on the two phone album reports (lazy-loaded, last in the page), as before |

The one intermittent finding: `keyboard default: focused element outside the viewport` on Data, owner, WebKit, phone, in the first of the final loads (the control was `select#legacy-event`). That load ran at the same time as three others. The same page was loaded four more times, one at a time, in the same setup: 8 stops, none outside the viewport, each time (`harness/cap.mjs webkit owner <run> data phone`). The finding is left in the table below and not hidden; its cause is not known.

## What differs from the first acceptance run

| item | value |
| --- | --- |
| Visitor role | The same local development server as the owner role, plain GETs, no sign-in cookie. The first run's visitor role read production (`analytics.ninochavez.co`). So the visitor pages here have no Cloudflare page loads and no PostHog journeys, and differ from the first run's visitor pages for that reason (Home's Site panel, Site, Data) |
| Owner role | As before: a harness owner answered by `preload.mjs` on the local server (`ADMIN_EMAILS` is a test value), read-only. No real sign-in |
| Server | This worktree's `vite dev` on Node 22.22.0, reading production Supabase with `.env.local` exported into the process by `node --env-file`. `preload.mjs` aborts the process on any Supabase write, any RPC outside the read allowlist, any auth call other than the user check, and any non-GET to another host |
| Engines | Chromium 153.0.8010.12 (Playwright headless shell), WebKit 26.0 (Playwright build v2227) as before. WebKit is not Safari |
| Added surfaces | `?recap=3` and `?recap=7` for both Re7kho and DWdCET, and `?recap=5` for Re7kho (a checkpoint that does not exist) |
| Repeated loads | The Data, Settings, Home and recap pages were loaded again after late code changes (the event counts streaming, the email heading, the recap's as-of time and Home's headline); the rows below are the later loads |

## Forced failures

Every gate was made to fail once on purpose, on the local harness, in each engine and at each width, then the plant was removed (`harness/forced.mjs`). Raw output: `forced-failures.txt`. 54 checks fired, none did not fire. The planted POST was aborted in the browser and never reached a server.

## Home at the experience brief's density target

See `heights.md`. Home: 900 px at 1440 x 900, 1,652 px on a 390 x 844 phone (visitor), 1,702 px for the owner.

## Not covered

- iOS Safari on a device. Three frames from Safari in the iOS Simulator are in `captures/ios/`: the page follows the system text size (Large and Accessibility XXL shown). Nothing else was run in the Simulator.
- The settings page as the report host (`analytics.ninochavez.co`) serves it: there the "Analytics preferences" card is not drawn, because the hostname is the report host. The local server's hostname is `127.0.0.1`, so every capture of Settings shows the card with its two controls. The rule is one condition on the browser's hostname (`isReportHost`); it was not exercised in a browser.
- Whether Cloudflare's edge streams the Data page's first part before its last (see `performance.md`).
- A real sign-in, screen readers, reduced motion beyond `prefers-reduced-motion: reduce` being on for every load, a launch in its first days.
- The stored findings on Home and the album report are read from the database as production wrote them. The new wording of "The launch is over" and of the photo-load failure finding only reaches the page when the scheduled job next writes those findings. Home no longer shows "The launch is over" as a finding at all (its note is computed from the days); the album report still shows the stored finding text until then.

## Per-load summary

| surface | role | engine | width | captured (UTC) | Chicago date | HTTP | final URL path | title | images (broken/incomplete/total) | requests | non-GET aborted | console | page errors | failed | >=400 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home | owner | chromium | desktop-1440 | 2026-10-07 14:50:12 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | owner | chromium | phone-390 | 2026-10-07 14:50:00 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | owner | webkit | desktop-1440 | 2026-10-07 14:50:11 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | owner | webkit | phone-390 | 2026-10-07 14:50:00 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | visitor | chromium | desktop-1440 | 2026-10-07 14:50:13 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | visitor | chromium | phone-390 | 2026-10-07 14:50:00 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | visitor | webkit | desktop-1440 | 2026-10-07 14:50:13 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | visitor | webkit | phone-390 | 2026-10-07 14:50:00 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| albums | owner | chromium | desktop-1440 | 2026-10-07 14:01:08 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| albums | owner | chromium | phone-390 | 2026-10-07 14:00:53 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| albums | owner | webkit | desktop-1440 | 2026-10-07 14:01:07 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| albums | owner | webkit | phone-390 | 2026-10-07 14:00:53 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| albums | visitor | chromium | desktop-1440 | 2026-10-07 14:01:13 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| albums | visitor | chromium | phone-390 | 2026-10-07 14:00:56 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| albums | visitor | webkit | desktop-1440 | 2026-10-07 14:01:12 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| albums | visitor | webkit | phone-390 | 2026-10-07 14:00:56 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 120 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | owner | chromium | desktop-1440 | 2026-10-07 14:02:08 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 216 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | owner | chromium | phone-390 | 2026-10-07 14:01:16 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 215 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | owner | webkit | desktop-1440 | 2026-10-07 14:02:03 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 216 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | owner | webkit | phone-390 | 2026-10-07 14:01:14 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 215 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | visitor | chromium | desktop-1440 | 2026-10-07 14:02:14 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 215 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | visitor | chromium | phone-390 | 2026-10-07 14:01:23 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 214 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | visitor | webkit | desktop-1440 | 2026-10-07 14:02:08 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 215 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | visitor | webkit | phone-390 | 2026-10-07 14:01:21 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 214 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | owner | chromium | desktop-1440 | 2026-10-07 14:03:14 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 199 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | owner | chromium | phone-390 | 2026-10-07 14:02:25 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 198 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | owner | webkit | desktop-1440 | 2026-10-07 14:03:03 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 199 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | owner | webkit | phone-390 | 2026-10-07 14:02:17 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 198 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | visitor | chromium | desktop-1440 | 2026-10-07 14:03:20 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 198 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | visitor | chromium | phone-390 | 2026-10-07 14:02:32 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 197 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | visitor | webkit | desktop-1440 | 2026-10-07 14:03:07 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 198 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | visitor | webkit | phone-390 | 2026-10-07 14:02:23 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 197 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | owner | chromium | desktop-1440 | 2026-10-07 14:50:28 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | owner | chromium | phone-390 | 2026-10-07 14:50:19 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | owner | webkit | desktop-1440 | 2026-10-07 14:50:28 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | owner | webkit | phone-390 | 2026-10-07 14:50:19 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | visitor | chromium | desktop-1440 | 2026-10-07 14:50:33 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | visitor | chromium | phone-390 | 2026-10-07 14:50:22 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | visitor | webkit | desktop-1440 | 2026-10-07 14:50:33 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap3 | visitor | webkit | phone-390 | 2026-10-07 14:50:22 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=3 | Day 3 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | chromium | desktop-1440 | 2026-10-07 14:50:44 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | chromium | phone-390 | 2026-10-07 14:50:34 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | webkit | desktop-1440 | 2026-10-07 14:50:43 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | webkit | phone-390 | 2026-10-07 14:50:34 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | chromium | desktop-1440 | 2026-10-07 14:50:53 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | chromium | phone-390 | 2026-10-07 14:50:42 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | webkit | desktop-1440 | 2026-10-07 14:50:52 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | webkit | phone-390 | 2026-10-07 14:50:41 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | Day 7 recap: HS Girls VB - JCA at ACC - 09-22-2026 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | owner | chromium | desktop-1440 | 2026-10-07 14:50:59 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | owner | chromium | phone-390 | 2026-10-07 14:50:50 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | owner | webkit | desktop-1440 | 2026-10-07 14:50:57 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | owner | webkit | phone-390 | 2026-10-07 14:50:48 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | visitor | chromium | desktop-1440 | 2026-10-07 14:51:13 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | visitor | chromium | phone-390 | 2026-10-07 14:51:01 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | visitor | webkit | desktop-1440 | 2026-10-07 14:51:10 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap3 | visitor | webkit | phone-390 | 2026-10-07 14:50:59 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=3 | Day 3 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | owner | chromium | desktop-1440 | 2026-10-07 14:51:14 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | owner | chromium | phone-390 | 2026-10-07 14:51:04 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | owner | webkit | desktop-1440 | 2026-10-07 14:51:11 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | owner | webkit | phone-390 | 2026-10-07 14:51:02 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | visitor | chromium | desktop-1440 | 2026-10-07 14:51:32 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | visitor | chromium | phone-390 | 2026-10-07 14:51:21 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | visitor | webkit | desktop-1440 | 2026-10-07 14:51:30 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET-recap7 | visitor | webkit | phone-390 | 2026-10-07 14:51:18 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET?recap=7 | Day 7 recap: College Women's VB - Millikin at Nort | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | owner | chromium | desktop-1440 | 2026-10-07 14:51:26 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | owner | chromium | phone-390 | 2026-10-07 14:51:20 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | owner | webkit | desktop-1440 | 2026-10-07 14:51:23 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | owner | webkit | phone-390 | 2026-10-07 14:51:16 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | visitor | chromium | desktop-1440 | 2026-10-07 14:51:48 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | visitor | chromium | phone-390 | 2026-10-07 14:51:40 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | visitor | webkit | desktop-1440 | 2026-10-07 14:51:45 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap5 | visitor | webkit | phone-390 | 2026-10-07 14:51:37 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=5 | No such recap: HS Girls VB - JCA at ACC - 09-22-20 | 0/0/0 | 148 | 0 | 0 | 0 | 0 | 0 |
| photos | owner | chromium | desktop-1440 | 2026-10-07 14:04:59 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | owner | chromium | phone-390 | 2026-10-07 14:04:40 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | owner | webkit | desktop-1440 | 2026-10-07 14:04:38 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | owner | webkit | phone-390 | 2026-10-07 14:04:21 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | visitor | chromium | desktop-1440 | 2026-10-07 14:05:29 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | visitor | chromium | phone-390 | 2026-10-07 14:05:09 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | visitor | webkit | desktop-1440 | 2026-10-07 14:05:06 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | visitor | webkit | phone-390 | 2026-10-07 14:04:49 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| sites | owner | chromium | desktop-1440 | 2026-10-07 14:05:23 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 142 | 0 | 0 | 0 | 0 | 0 |
| sites | owner | chromium | phone-390 | 2026-10-07 14:05:08 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 142 | 0 | 0 | 0 | 0 | 0 |
| sites | owner | webkit | desktop-1440 | 2026-10-07 14:04:59 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 142 | 0 | 0 | 0 | 0 | 0 |
| sites | owner | webkit | phone-390 | 2026-10-07 14:04:46 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 142 | 0 | 0 | 0 | 0 | 0 |
| sites | visitor | chromium | desktop-1440 | 2026-10-07 14:05:55 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 141 | 0 | 0 | 0 | 0 | 0 |
| sites | visitor | chromium | phone-390 | 2026-10-07 14:05:39 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 141 | 0 | 0 | 0 | 0 | 0 |
| sites | visitor | webkit | desktop-1440 | 2026-10-07 14:05:30 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 141 | 0 | 0 | 0 | 0 | 0 |
| sites | visitor | webkit | phone-390 | 2026-10-07 14:05:16 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 141 | 0 | 0 | 0 | 0 | 0 |
| data | owner | chromium | desktop-1440 | 2026-10-07 14:31:36 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| data | owner | chromium | phone-390 | 2026-10-07 14:30:53 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| data | owner | webkit | desktop-1440 | 2026-10-07 14:31:44 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| data | owner | webkit | phone-390 | 2026-10-07 14:30:54 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| data | visitor | chromium | desktop-1440 | 2026-10-07 14:31:31 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| data | visitor | chromium | phone-390 | 2026-10-07 14:30:54 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| data | visitor | webkit | desktop-1440 | 2026-10-07 14:31:36 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| data | visitor | webkit | phone-390 | 2026-10-07 14:30:54 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 134 | 0 | 0 | 0 | 0 | 0 |
| settings | owner | chromium | desktop-1440 | 2026-10-07 14:37:57 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | owner | chromium | phone-390 | 2026-10-07 14:37:44 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | owner | webkit | desktop-1440 | 2026-10-07 14:37:57 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | owner | webkit | phone-390 | 2026-10-07 14:37:44 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | visitor | chromium | desktop-1440 | 2026-10-07 14:37:54 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 128 | 0 | 0 | 0 | 0 | 0 |
| settings | visitor | chromium | phone-390 | 2026-10-07 14:37:44 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 128 | 0 | 0 | 0 | 0 | 0 |
| settings | visitor | webkit | desktop-1440 | 2026-10-07 14:37:54 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 128 | 0 | 0 | 0 | 0 | 0 |
| settings | visitor | webkit | phone-390 | 2026-10-07 14:37:44 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 128 | 0 | 0 | 0 | 0 | 0 |

## Gate results per load

Overflow offenders at each setting (0 = none), targets measured and under 44px, keyboard stops and stops with no ring, axe violation count (default), own contrast offenders (default, contrast-more, forced-colors).

| surface | role | engine | width | overflow default / contrast-more / forced / text-200 / text-312 | targets measured / under 44 | keyboard stops / no ring | Alt+Tab stops / no ring (WebKit) | forced-colors keyboard stops / no outline | axe violations (default) | contrast offenders default / more / forced |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 13 / 0 | 13 / 0 | - | 13 / 0 | 0 | 0 / 0 / 0 |
| home | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 13 / 0 | 13 / 0 | - | 13 / 0 | 0 | 0 / 0 / 0 |
| home | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 13 / 0 | 1 / 0 | 13 / 0 | - | 0 | 0 / 0 / - |
| home | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 13 / 0 | 1 / 0 | 13 / 0 | - | 0 | 0 / 0 / - |
| home | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 11 / 0 | 11 / 0 | - | 11 / 0 | 0 | 0 / 0 / 0 |
| home | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 11 / 0 | 11 / 0 | - | 11 / 0 | 0 | 0 / 0 / 0 |
| home | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 11 / 0 | 1 / 0 | 11 / 0 | - | 0 | 0 / 0 / - |
| home | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 11 / 0 | 1 / 0 | 11 / 0 | - | 0 | 0 / 0 / - |
| albums | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 23 / 0 | 24 / 0 | - | 24 / 0 | 0 | 0 / 0 / 0 |
| albums | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 23 / 0 | 23 / 0 | - | 23 / 0 | 0 | 0 / 0 / 0 |
| albums | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 23 / 0 | 2 / 0 | 24 / 0 | - | 0 | 0 / 0 / - |
| albums | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 23 / 0 | 1 / 0 | 23 / 0 | - | 0 | 0 / 0 / - |
| albums | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 23 / 0 | 24 / 0 | - | 24 / 0 | 0 | 0 / 0 / 0 |
| albums | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 23 / 0 | 23 / 0 | - | 23 / 0 | 0 | 0 / 0 / 0 |
| albums | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 23 / 0 | 2 / 0 | 24 / 0 | - | 0 | 0 / 0 / - |
| albums | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 23 / 0 | 1 / 0 | 23 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 90 / 0 | 93 / 0 | - | 93 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 87 / 0 | 91 / 0 | - | 91 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 90 / 0 | 7 / 0 | 92 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 87 / 0 | 7 / 0 | 90 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 81 / 0 | 82 / 0 | - | 82 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 79 / 0 | 81 / 0 | - | 81 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 81 / 0 | 2 / 0 | 82 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 79 / 0 | 2 / 0 | 81 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 76 / 0 | 79 / 0 | - | 79 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 73 / 0 | 77 / 0 | - | 77 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 76 / 0 | 7 / 0 | 78 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 73 / 0 | 7 / 0 | 76 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 65 / 0 | 66 / 0 | - | 66 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 63 / 0 | 65 / 0 | - | 65 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 65 / 0 | 2 / 0 | 66 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 63 / 0 | 2 / 0 | 65 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap3 | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap3 | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap3 | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap3 | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap3 | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap3 | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap3 | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap3 | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap3 | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap3 | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap3 | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap3 | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap3 | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap3 | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap3 | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap3 | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap7 | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap7 | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap7 | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap7 | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap7 | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap7 | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 7 / 0 | - | 7 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET-recap7 | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET-recap7 | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 7 / 0 | 0 / 0 | 7 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap5 | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 8 / 0 | 8 / 0 | - | 8 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap5 | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 8 / 0 | 8 / 0 | - | 8 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap5 | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 8 / 0 | 0 / 0 | 8 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap5 | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 8 / 0 | 0 / 0 | 8 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap5 | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 8 / 0 | 8 / 0 | - | 8 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap5 | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 8 / 0 | 8 / 0 | - | 8 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap5 | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 8 / 0 | 0 / 0 | 8 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap5 | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 8 / 0 | 0 / 0 | 8 / 0 | - | 0 | 0 / 0 / - |
| photos | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 43 / 0 | 46 / 0 | - | 46 / 0 | 0 | 0 / 0 / 0 |
| photos | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 43 / 0 | 46 / 0 | - | 46 / 0 | 0 | 0 / 0 / 0 |
| photos | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 43 / 0 | 5 / 0 | 46 / 0 | - | 0 | 0 / 0 / - |
| photos | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 43 / 0 | 5 / 0 | 46 / 0 | - | 0 | 0 / 0 / - |
| photos | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 29 / 0 | 32 / 0 | - | 32 / 0 | 0 | 0 / 0 / 0 |
| photos | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 29 / 0 | 32 / 0 | - | 32 / 0 | 0 | 0 / 0 / 0 |
| photos | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 29 / 0 | 4 / 0 | 32 / 0 | - | 0 | 0 / 0 / - |
| photos | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 29 / 0 | 4 / 0 | 32 / 0 | - | 0 | 0 / 0 / - |
| sites | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 24 / 0 | 27 / 0 | - | 27 / 0 | 0 | 0 / 0 / 0 |
| sites | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 24 / 0 | 26 / 0 | - | 26 / 0 | 0 | 0 / 0 / 0 |
| sites | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 24 / 0 | 1 / 0 | 27 / 0 | - | 0 | 0 / 0 / - |
| sites | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 24 / 0 | 0 / 0 | 26 / 0 | - | 0 | 0 / 0 / - |
| sites | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 23 / 0 | 26 / 0 | - | 26 / 0 | 0 | 0 / 0 / 0 |
| sites | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 23 / 0 | 25 / 0 | - | 25 / 0 | 0 | 0 / 0 / 0 |
| sites | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 23 / 0 | 1 / 0 | 26 / 0 | - | 0 | 0 / 0 / - |
| sites | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 23 / 0 | 0 / 0 | 25 / 0 | - | 0 | 0 / 0 / - |
| data | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 21 / 0 | 23 / 0 | - | 23 / 0 | 0 | 0 / 0 / 0 |
| data | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 21 / 0 | 22 / 0 | - | 22 / 0 | 0 | 0 / 0 / 0 |
| data | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 21 / 0 | 9 / 0 | 23 / 0 | - | 0 | 0 / 0 / - |
| data | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 21 / 0 | 8 / 0 | 22 / 0 | - | 0 | 0 / 0 / - |
| data | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 12 / 0 | 15 / 0 | - | 15 / 0 | 0 | 0 / 0 / 0 |
| data | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 12 / 0 | 14 / 0 | - | 14 / 0 | 0 | 0 / 0 / 0 |
| data | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 12 / 0 | 3 / 0 | 15 / 0 | - | 0 | 0 / 0 / - |
| data | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 12 / 0 | 2 / 0 | 14 / 0 | - | 0 | 0 / 0 / - |
| settings | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 17 / 0 | 15 / 0 | - | 15 / 0 | 0 | 0 / 0 / 0 |
| settings | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 17 / 0 | 15 / 0 | - | 15 / 0 | 0 | 0 / 0 / 0 |
| settings | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 17 / 0 | 3 / 0 | 15 / 0 | - | 0 | 0 / 0 / - |
| settings | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 17 / 0 | 3 / 0 | 15 / 0 | - | 0 | 0 / 0 / - |
| settings | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 8 / 0 | 9 / 0 | - | 9 / 0 | 0 | 0 / 0 / 0 |
| settings | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 0 | 8 / 0 | 9 / 0 | - | 9 / 0 | 0 | 0 / 0 / 0 |
| settings | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 8 / 0 | 0 / 0 | 9 / 0 | - | 0 | 0 / 0 / - |
| settings | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 0 | 8 / 0 | 0 / 0 | 9 / 0 | - | 0 | 0 / 0 / - |

## Findings (merged across role and engine)

Each row is one finding. "seen in" lists every role/engine combination that produced it.

| gate | surface | width | settings | detail | seen in |
| --- | --- | --- | --- | --- | --- |
| images | album-Re7kho | phone-390 | - | 0 broken, 1 incomplete of 67 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| images | album-DWdCET | phone-390 | - | 0 broken, 1 incomplete of 50 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| keyboard default: focused element outside the viewport | data | phone-390 | default | select[type=select-one][name=eventId]#legacy-event "Choose an actionPhoto opened · Bell " | owner/webkit |

Finding rows: 3 (from 9 raw observations).
