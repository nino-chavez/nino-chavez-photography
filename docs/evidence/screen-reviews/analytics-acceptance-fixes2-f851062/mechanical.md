# Mechanical tier for the second fix pass

Measured results of automated gates on the captured screens, kept apart from the captures so a third cold reviewer can judge the screens from the images alone. This file says what was run, what each gate returned and what was not covered. It judges nothing about whether a screen is good.

Source tree: branch `fix/analytics-acceptance-2`, code as of commit f851062. Run on 2026-10-07 between 18:14 and 18:40 UTC (Chicago date 2026-10-07).

## Result in one table

Over 104 page loads (13 surfaces, visitor and owner, Chromium and WebKit, phone and desktop; default, contrast-more and forced-colors on every load, 200% and 312% text on the phone loads):

| gate | result |
| --- | --- |
| tests | `npm run analytics:contract:test`: 540 tests, 540 pass (the first pass had 530; this pass adds `collection-rejections`, `failure-scale` and about 25 tests inside existing files) |
| `npm run check` | 0 errors. 5 warnings in 4 files this pass did not touch (`AlbumCard.svelte`, `VideoPlayer.svelte`, `routes/albums/+page.svelte`, `routes/explore/+page.svelte`) |
| `npm run build` on Node 22.22.0 | passes, including `reader:check:gallery`, after the receipt in `docs/reader-audits/gallery-interface.json` was recorded (digest `sha256:12cb9b2f...`, 204 source files) |
| overflow, at all five settings | 0 offenders other than the header's own navigation links at 200% and 312% text (see "One gate changed" below). 416 checks |
| 44 px targets | 0 under 44 px of 2,180 measured |
| text that did not grow at 200% and 312% | 0 groups |
| keyboard, Tab only, 3,506 stops | 0 stops without a visible ring |
| axe (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice), 260 runs at default, contrast-more and forced colours | 0 violations |
| own text contrast, same settings | 0 below WCAG AA of 19,870 checked |
| console errors, page errors, failed requests, HTTP status 400 or more | 0 |
| non-GET requests | 0 sent. 0 aborted: the local server serves no analytics script |
| requests to another `*.ninochavez.co` host | 0 |
| images | 0 broken. The two album reports on a phone report 49 and 32 images "incomplete": these are the photo tiles beyond the first 12, which are hidden until "Show all" and so are never fetched (lazy-loaded, `display: none`) |
| first screen at large text (new gate, `harness/firstscreen.mjs`) | at 200% and 312%, on 8 pages, in Chromium and WebKit: the page's `h1` starts inside the top half of the first 844 px screen and the navigation is one row, 32 of 32 pass |

One intermittent finding from the first pass did not repeat: `keyboard default: focused element outside the viewport` on Data, owner, WebKit, phone (`select#legacy-event`). In the main run it fired once on that page; a single reload of that page alone (`r5-wo`) gave 8 stops, 0 without a ring and nothing outside the viewport. It is still the same unexplained, intermittent finding as before and is not claimed fixed.

## One gate changed after it failed, and what that does and does not show

The first run of the main set (all four engine and role runs) reported 117 overflow offenders at 200% and 312% text, on every page: the five links of the header's navigation row, which at that size is a single sideways-scrolling row (the new S8 layout). The overflow gate excuses a sideways scroller only when it takes focus itself (`tabindex`). The navigation row does not need it, because every item in it is a link, which takes focus and scrolls the row into view when tabbed to.

So `harness/gates.mjs` was changed after seeing the result: an element inside `nav[aria-label="Report navigation"]` that is itself a link is excused. The main run's numbers above were taken with the old gate, and the 117 were then reclassified by reading each recorded sample: every one of the 104 loads that had offenders had exactly the navigation links as its offenders and nothing else (`harness/recount.py` prints this). The changed gate was then run on one load (`r5-wo`: Data, owner, WebKit, phone): 0 offenders at all five settings. The forced failures below were run again after the change and all still fired.

What this does not show: a person tabbing through that row on a phone has not been watched. The first-screen gate checks that the row is one line, scrolls, and is reachable; it does not check that a reader notices there is more beyond the fade at its right edge.

## Forced failures

Every gate was made to fail once on purpose, on the local harness, in each engine and at each width, then the plant was removed (`harness/forced.mjs`; raw output in `forced-failures.txt`, first section). 54 checks fired, none did not fire, with the changed overflow gate. The new first-screen gate was forced the same way (second section): a 900 px header planted on Home at 312% text made it fail in both engines (h1 at 1,138 px of 844). The first attempt at that plant did not fire, because the page's hydration replaced the planted element; the plant was changed to a style on the real header and then fired.

## What differs from the first pass

| item | value |
| --- | --- |
| Visitor role | The same local development server as the owner role, plain GETs, no sign-in cookie. So the visitor pages here have no Cloudflare page loads and no PostHog journeys: they show "not available right now" (Site, Home) and "could not be read" (Data) |
| Owner role | A harness owner answered by `preload.mjs` on the local server (`ADMIN_EMAILS` is a test value), read-only. No real sign-in. The Data page reads production's `analytics_collection_delivery_counters` as that owner: the B1 headline in the captures comes from production's real counters |
| Server | This worktree's `vite dev` on Node 22.22.0, reading production Supabase with `.env.local` exported into the process by `node --env-file`. `preload.mjs` aborts the process on any Supabase write, any RPC outside the read allowlist, and any auth call other than the user check |
| Engines | Chromium (Playwright headless shell), WebKit (Playwright build). WebKit is not Safari |
| Settings | default, contrast-more, forced-colors, 200% text and 312% text. The dark setting of the first pass was not run |
| iOS simulator | One frame: Home at the simulator's default text size. The accessibility size was set with `simctl ui content_size`, and Safari did not apply it to the open page after a reload and a re-open, so there is no accessibility-size frame |

## Not covered

- A screen reader, and a person using the owner forms.
- Cloudflare page loads and PostHog journeys with real numbers: the development server has no credentials, so those panels were only seen in their not-available states.
- Safari on a device at an accessibility text size.
- The shared captures show the stored recap text as production wrote it. The new arrival and timing wording only reaches a stored recap when the scheduled job writes a new one; the Home photo-load note shows the new scale line because that is computed when Home loads.
