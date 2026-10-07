# Mechanical tier for build step 9 (acceptance)

Measured results of automated gates on the captured screens, kept apart from the captures so a cold reviewer judges the screens from the images alone. This file states what was run, what each gate returned and what was not covered. It makes no judgement of how a screen looks.

Source tree: `main` at `a8bfd28` (the parent `921556e` differs from it only in `DEPLOY.md`). Run on 2026-10-07 UTC; the folder name carries the commit that production served (see "What production was serving").

## What was run

The gates ran on every capture of the full set (2,800 files, kept at `/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/full-captures/` with its own `index.md`); `captures/` in this folder is the committed subset of 623 files, indexed in `captures/index.md`. Findings below name the setting and width, not a file.

| item | value |
| --- | --- |
| Surfaces | Home `/`, album index `/albums`, album report `/albums/Re7kho` (JCA at ACC) and `/albums/DWdCET` (Millikin), the same JCA report with `?recap=7`, photo explorer `/photos`, site report `/sites`, data quality `/data`, settings `/settings` |
| Visitor role | Production, https://analytics.ninochavez.co, plain GETs from a headless browser. Every non-GET request was aborted before it left the browser and counted. Every request to another `*.ninochavez.co` host (the gallery) was aborted and counted: none occurred. No form was submitted, no link was followed. |
| Owner role | This worktree's vite dev server (Node 22.22.0) reading production Supabase with the project's `.env.local` exported into the process by `node --env-file` (no file copied). A preload (never committed; a copy is in `harness/preload.mjs`) sat in front of `fetch` for the server process only. It aborts the process on any Supabase REST write, any RPC outside the read allowlist, any auth call other than the user check, and any non-GET to another host except two known read-only queries (PostHog query, Cloudflare GraphQL). It answers the auth user check with a harness owner (`walk-owner@example.test`, a fabricated session cookie). This is not a real sign-in. All data shown is real production data; no stored rows were invented in this run. |
| Engines | Chromium 153.0.8010.12 (Playwright headless shell, `chrome-headless-shell`), WebKit 26.0 (Playwright build v2227, installed with `npx playwright install webkit`). WebKit stands in for Safari. It is not Safari and it is not a device. |
| Phone | 390x844 CSS px, device scale factor 2, touch on. Chromium with mobile emulation. WebKit without mobile emulation: with it, Playwright's WebKit produced a 16 px black band at the bottom of every screenshot and a 12 px scrollbar that narrowed the layout to 378 px, so WebKit ran in a plain 390 px window with touch enabled and the macOS scrollbar hidden by an injected `::-webkit-scrollbar{display:none}` (the layout width then equals the viewport width: `clientWidth` 390, recorded per load). |
| Desktop | 1440x900, scale factor 1. |
| Common | `prefers-reduced-motion: reduce`, locale en-US, time zone America/Chicago, a fresh browser context per load, headless. One page load per surface, role, engine and width; the settings below were switched in that page without reloading, using `page.emulateMedia` and a root font size. |

The scripts in `harness/` are the ones that produced this folder. They hold absolute paths to the session scratchpad and to this worktree, so they are a record of the method rather than something that runs elsewhere unchanged. They are not part of the application and nothing imports them.

## What production was serving

The folder name uses `a8bfd28`, the commit at the head of `origin/main` when production was measured. Evidence that production served that code, from this session:

- `https://analytics.ninochavez.co/` returned 200 at `/` with no redirect (Home renders; the Page Rule that used to redirect root queries is gone).
- Every content-hashed stylesheet that each of the nine production pages references (4 to 7 per page; all nine were checked) also exists, byte for byte, in a local `vite build` made from `921556e` (whose source equals `a8bfd28`'s apart from `DEPLOY.md`). Stylesheet names are content hashes.
- Of the 28 JavaScript files production lists for seven of the pages (Home, album index, `/albums/Re7kho`, photos, site, data, settings; the Millikin report and `?recap=7` were not fetched for this check), 26 are identical to files in the local build once the 8-character hashes in their import lists are masked. The two others differ only in a per-build random global name, minifier letter order and the embedded build time. Production's build time is 1791346952575 ms (2026-10-07 04:22:32 UTC), 38 seconds after the merge of #208 (23:21:54 CDT); the local build's is 04:25:13 UTC.
- `a8bfd28` differs from `921556e` only in `DEPLOY.md`.

This is evidence of the same source, not a deployment record: the Cloudflare Pages deployment list was not read.

## Where owner and visitor captures differ because of the harness

The local server has no Cloudflare Web Analytics token and no PostHog key. Checked by fetching each page as visitor (production) and as harness owner (local) and comparing the text: on Home the owner capture says "Cloudflare Web Analytics access is not configured for this report" and its contact-link comparison says the previous 7 days could not be read; on the site report the Cloudflare figures, the page-loads chart and the page lists are replaced by "The page-load lists are not available" (owner page 2,421 px tall against 3,427 px for the visitor, phone); on data quality the Cloudflare page loads and the linked-journeys (PostHog) sections say they could not be read and the page opens with "2 parts of this page could not be read". Production shows real figures in those places. Everything else (album index, album reports, photo explorer) matched in text apart from owner-only forms. The settings page's server-rendered HTML says "Private settings are unavailable"; the captured, hydrated page shows the settings form. These differences come from missing credentials in the harness and say nothing about production.

## Settings and exactly what was emulated

| setting | how it was produced | engine support observed |
| --- | --- | --- |
| default | `emulateMedia({forcedColors:'none', contrast:'no-preference', colorScheme:'light'})` | both |
| contrast-more | `emulateMedia({contrast:'more'})`: `prefers-contrast: more` matches and the page's own `@media (prefers-contrast: more)` rules apply. No operating-system change. | both: the media query matched in both (`contrastMore` true in every record) |
| forced-colors | `emulateMedia({forcedColors:'active'})` | Chromium applies its forced palette (body text rgb(0, 0, 0) on rgb(255, 255, 255), probed on a test page and per load). WebKit: the media query matches (`forced-colors: active` true) but WebKit does not apply a forced palette (probe: computed colours unchanged), so only the page's own `@media (forced-colors: active)` rules differ. WebKit files are named `forced-colors-query-only`. Forced-colors gates that need the palette (own contrast gate, forced keyboard walk) were run in Chromium only. |
| dark | `emulateMedia({colorScheme:'dark'})`: `prefers-color-scheme: dark` matches. | Source: no file under `src` contains `prefers-color-scheme` or `color-scheme` (`grep -rln color-scheme src` returns nothing). Rendered: each page was compared pixel by pixel with its default render in the same load; where at most 0.02% of pixels differed by more than 12 in any channel, no files were stored. WebKit desktop album pages differed by 0.05% to 0.09% (photo thumbnails resampled slightly differently; one crop compared by eye, no colour or layout change) and were reclassified as matching with a 0.15% limit for dark only; their files were deleted. No dark-mode file is in either capture set. The cases with no file are listed at the end of each `index.md`. |
| text-200 | The root `<html>` font size set to 200% with `!important` (32 px root). `rem` and `em` text doubles; text sized in `px` does not. This matches setting the browser's default font size to 32 px for this site: the stylesheets set no root `px` font size (searched `src/app.css`, the analytics routes and components) and every media query is in `px` (listed from source), so no breakpoint moves. Phone only. | both |
| text-312 | The same method at 312% (49.92 px root): the ratio of iOS accessibility size 5 body text (53 pt) to the default body (17 pt). It is not Dynamic Type. Real iOS Safari applies Dynamic Type only to text that opts in with `-apple-system-body`; no file under `src` contains that or `text-size-adjust`, so on an iPhone this page would not grow at all from that setting. The 312% case is a stress test of the layout. Phone only; files stored from WebKit only, gates run in both engines. | both |

Order inside one load, the same in both engines: default, contrast-more, dark, text-200, text-312, keyboard (default colours), forced-colors, forced-colors keyboard. Forced-colors runs last because switching it off in WebKit did not restore the default render: on `/albums/Re7kho` (the only page probed) up to 96,000 pixels per part differed by more than 12 from the default render after forced-colors had been switched on and off, which also made dark and text sizes differ. Chromium restored the default render exactly in the same probe (0 pixels). An earlier full run that put forced-colors third was discarded for that reason and all four runs were repeated in the order above, in one window on one Chicago date.

All four runs (Chromium and WebKit, visitor and owner) ran in parallel from 05:00:19 UTC on 2026-10-07, which is 2026-10-07 in Chicago; all 72 page loads (9 surfaces, 2 roles, 2 engines, 2 widths) fall between 05:00:19 and 05:45:25 UTC, on that one Chicago date. Ten WebKit phone loads (the three album reports, data quality and the photo explorer, both roles) were repeated at 05:42 to 05:45 UTC because the first pass flagged its own check: at the larger text sizes those pages grew while being scrolled and the last part stopped 23 to 582 px short of the real bottom. The capture routine now keeps adding parts until the last one reaches the bottom; the repeated loads replace the first ones in the files and in the tables (checked: in every record the last part reaches the bottom and differs from the first). The pages show a partial "today" and complete days up to the day before. The capture time of every file is in `captures/index.md`, and of every load in the per-load table.

The forced-failure run (below) and the old-versus-new probes ran in the same hour on the same local server.

Storage: the default phone parts are stored at 2x; every other phone setting is stored at 1x (resized from the 2x screenshot); desktop is 1x. Parts are one viewport tall (844 or 900 CSS px), scrolled to, and photographed with a viewport screenshot. The last part of each page is scrolled to the page bottom, so it can overlap the part before it. For every part set the harness checked that the last part reached the bottom (`scrollY + innerHeight >= scrollHeight - 1`) and that its pixels differ from the first part; both held in every record: the findings table has no "capture" row.

## Gates

| gate | what it measures | passes when |
| --- | --- | --- |
| overflow | The bounding box of every rendered element against the viewport width, and the document's own `scrollWidth` against the viewport. A box inside a focusable sideways scroller is excused only if the scroller fits and the box is clipped by it. | no element box outside 0..viewport; the document does not scroll sideways |
| 44px targets | Links, buttons, fields and summaries under 44 px in either direction (a checkbox or radio measured as its label; a stretched-link card as the card; links inside a sentence are excused and counted). | none under 44 |
| text at 200% and 312% | The overflow gate at those root sizes, and a list of text elements whose computed font size did not grow (pinned in `px`). | no overflow |
| keyboard | Tab-only walk from the top of the page (no Enter, Space or click); up to 500 stops. A stop passes if the focused control, or one of its next five ancestors, shows an outline or a box-shadow ring. Each stop is read after running animations finish (an outline that transitions in reads as 0 px if read at once, which the first version of this gate got wrong in WebKit). WebKit on macOS skips links on a plain Tab (Safari's default), so WebKit was walked twice: plain Tab, and Alt+Tab, which visits every link. Under forced-colors (Chromium) only an outline counts, because forced colours remove box shadows. | every stop has a ring |
| axe | `@axe-core/playwright` 4.x (already a devDependency; nothing was added) with tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa and best-practice. Run at default, contrast-more and (Chromium) forced-colors. | no violations |
| text contrast | Own computation: every rendered text element's computed colour (SVG text: its `fill`) against its composited background, WCAG 4.5:1 (3:1 for 24 px or 18.66 px bold). Elements over a background image or gradient are skipped and counted. Run at default, contrast-more and (Chromium) forced-colors, where the browser's forced palette is what is measured. In forced-colors the page text computed to rgb(0, 0, 0) on rgb(255, 255, 255), so the palette is in effect. | none below |
| console | Every `console.error` and `console.warning`, uncaught page error, failed request and HTTP status of 400 or more during the load and all settings. | none |
| non-GET | Every request that was not GET or HEAD, aborted before it left the browser. | none |

Rendered means `checkVisibility()` is true: elements inside a closed `<details>` or otherwise skipped are not measured by the overflow, target, text-size and contrast gates. The first version measured them anyway, and Chromium returned computed sizes there that lagged one setting behind (it showed text "not growing" at 200% that was in a closed disclosure); the gate was changed and all runs repeated. A planted wide box inside a closed `<details>` is not counted and is counted once the details is opened (see the forced failures).

Under forced-colors the browser sets text and background itself, so the text contrast gate passes there by construction wherever the forced palette applies; the meaningful forced-colors surface is anything with `forced-color-adjust: none` (the chart swatches in the source). The gate was made to fail once there with a planted element that opts out of the palette.

## Forced failures

Every gate was made to fail once on purpose, on the local harness, in each engine and at each width, then the plant was removed. The planted POST was aborted in the browser and never reached a server. Raw output follows; the script is `harness/forced.mjs`.

```text
# forced failures 2026-10-07T05:04:09.188Z
== chromium phone-390
   overflow, a planted 420px box: FIRED (offenders 0 -> 2: div#planted spans 0..420 of 390 | the document scrolls sideways by 31px); after removing it: 0
   overflow, a box that escapes its scroller: FIRED (the document scrolls sideways by 511px)
   overflow, a wide box inside a closed <details>: not counted, as intended (content in a closed details is not rendered); after opening the details: FIRED (offenders 0 -> closed 0 -> open 2)
   44px targets, a planted 20px button: FIRED (button#planted-btn "x" 20x20)
   text at 200%, a planted 14rem box: FIRED (offenders at 100% 0, at 200% 2: the document scrolls sideways by 58px)
   text at 200%, planted 14px text that does not grow: FIRED (listed: p#planted-px 14px)
   keyboard, a planted button with no focus ring: FIRED (33 stops, listed: button[type=submit]#planted-ring "ringless")
   axe, a planted image with no alt text and a planted low-contrast pair: image-alt FIRED; color-contrast FIRED
   contrast gate, default colours, planted pair #8a8a8a on #999: FIRED (p#planted-low "planted low contrast text" 1.21:1 (needs 4.5) fg rgb(138, 138, 138) bg rgb(153, 153, 153))
   contrast gate, prefers-contrast: more, same planted pair: FIRED
   contrast gate, forced-colors: active, planted pair kept out of the forced palette (forced-color-adjust: none): FIRED; axe color-contrast on the same page FIRED
   console errors, a planted console.error: FIRED
   non-GET requests, a planted POST: FIRED (POST /photography/analytics/photos; aborted in the browser, never sent)
== chromium desktop-1440
   overflow, a planted 1470px box: FIRED (offenders 0 -> 2: div#planted spans 0..1470 of 1440 | the document scrolls sideways by 30px); after removing it: 0
   overflow, a box that escapes its scroller: FIRED (the document scrolls sideways by 261px)
   overflow, a wide box inside a closed <details>: not counted, as intended (content in a closed details is not rendered); after opening the details: FIRED (offenders 0 -> closed 0 -> open 2)
   44px targets, a planted 20px button: FIRED (button#planted-btn "x" 20x20)
   text at 200%, a planted 46rem box: FIRED (offenders at 100% 0, at 200% 2: the document scrolls sideways by 32px)
   text at 200%, planted 14px text that does not grow: FIRED (listed: p#planted-px 14px)
   keyboard, a planted button with no focus ring: FIRED (33 stops, listed: button[type=submit]#planted-ring "ringless")
   axe, a planted image with no alt text and a planted low-contrast pair: image-alt FIRED; color-contrast FIRED
   contrast gate, default colours, planted pair #8a8a8a on #999: FIRED (p#planted-low "planted low contrast text" 1.21:1 (needs 4.5) fg rgb(138, 138, 138) bg rgb(153, 153, 153))
   contrast gate, prefers-contrast: more, same planted pair: FIRED
   contrast gate, forced-colors: active, planted pair kept out of the forced palette (forced-color-adjust: none): FIRED; axe color-contrast on the same page FIRED
   console errors, a planted console.error: FIRED
   non-GET requests, a planted POST: FIRED (POST /photography/analytics/photos; aborted in the browser, never sent)
== chromium capture method on a 20,000 CSS px page at 2x (40000 device px, over the 16,384 limit)
   old method (fullPage + clip at y=9000) against the top of the page: pixels over 12 = 1264776 (differs from the top); against the true render at y=9000 (viewport screenshot after scrolling): pixels over 12 = 0
   new method (scroll, viewport screenshot) at y=9000 against the top: pixels over 12 = 1264776 (differs from the top, as it should)
   whole-page screenshot (no clip), image 780x40000 device px: top region vs true top: pixels over 12 = 0; region at y=9000 vs true render: 0; bottom region vs true bottom: 0
   last part equals the first part (planted: part 1 stored as the last part): FIRED (pixels over 12 = 0)
   last-part check, stopping one part short (part 23 of 24): bottom 19412 vs height 20000: FIRED; at the real last part: bottom 20000 vs 20000: passes
== webkit phone-390
   overflow, a planted 420px box: FIRED (offenders 0 -> 2: div#planted spans 0..420 of 390 | the document scrolls sideways by 30px); after removing it: 0
   overflow, a box that escapes its scroller: FIRED (the document scrolls sideways by 511px)
   overflow, a wide box inside a closed <details>: not counted, as intended (content in a closed details is not rendered); after opening the details: FIRED (offenders 0 -> closed 0 -> open 2)
   44px targets, a planted 20px button: FIRED (button#planted-btn "x" 20x20)
   text at 200%, a planted 14rem box: FIRED (offenders at 100% 0, at 200% 2: the document scrolls sideways by 58px)
   text at 200%, planted 14px text that does not grow: FIRED (listed: p#planted-px 14px)
   keyboard, a planted button with no focus ring: FIRED (33 stops, listed: button[type=submit]#planted-ring "ringless")
   axe, a planted image with no alt text and a planted low-contrast pair: image-alt FIRED; color-contrast FIRED
   contrast gate, default colours, planted pair #8a8a8a on #999: FIRED (p#planted-low "planted low contrast text" 1.21:1 (needs 4.5) fg rgb(138, 138, 138) bg rgb(153, 153, 153))
   contrast gate, prefers-contrast: more, same planted pair: FIRED
   contrast gate, forced-colors: not run in WebKit (the media query matches but WebKit does not apply a forced palette)
   console errors, a planted console.error: FIRED
   non-GET requests, a planted POST: FIRED (POST /photography/analytics/photos; aborted in the browser, never sent)
== webkit desktop-1440
   overflow, a planted 1470px box: FIRED (offenders 0 -> 2: div#planted spans 0..1470 of 1440 | the document scrolls sideways by 30px); after removing it: 0
   overflow, a box that escapes its scroller: FIRED (the document scrolls sideways by 261px)
   overflow, a wide box inside a closed <details>: not counted, as intended (content in a closed details is not rendered); after opening the details: FIRED (offenders 0 -> closed 0 -> open 2)
   44px targets, a planted 20px button: FIRED (button#planted-btn "x" 20x20)
   text at 200%, a planted 46rem box: FIRED (offenders at 100% 0, at 200% 2: the document scrolls sideways by 32px)
   text at 200%, planted 14px text that does not grow: FIRED (listed: p#planted-px 14px)
   keyboard, a planted button with no focus ring: FIRED (33 stops, listed: button[type=submit]#planted-ring "ringless")
   axe, a planted image with no alt text and a planted low-contrast pair: image-alt FIRED; color-contrast FIRED
   contrast gate, default colours, planted pair #8a8a8a on #999: FIRED (p#planted-low "planted low contrast text" 1.21:1 (needs 4.5) fg rgb(138, 138, 138) bg rgb(153, 153, 153))
   contrast gate, prefers-contrast: more, same planted pair: FIRED
   contrast gate, forced-colors: not run in WebKit (the media query matches but WebKit does not apply a forced palette)
   console errors, a planted console.error: FIRED
   non-GET requests, a planted POST: FIRED (POST /photography/analytics/photos; aborted in the browser, never sent)
== webkit capture method on a 20,000 CSS px page at 2x (40000 device px, over the 16,384 limit)
   old method (fullPage + clip at y=9000) against the top of the page: pixels over 12 = 1263190 (differs from the top); against the true render at y=9000 (viewport screenshot after scrolling): pixels over 12 = 0
   new method (scroll, viewport screenshot) at y=9000 against the top: pixels over 12 = 1263190 (differs from the top, as it should)
   whole-page screenshot (no clip), image 780x40000 device px: top region vs true top: pixels over 12 = 0; region at y=9000 vs true render: 0; bottom region vs true bottom: 0
   last part equals the first part (planted: part 1 stored as the last part): FIRED (pixels over 12 = 0)
   last-part check, stopping one part short (part 23 of 24): bottom 19412 vs height 20000: FIRED; at the real last part: bottom 20000 vs 20000: passes
# done
```

Two things in that output need a plain statement. First, the old whole-page capture method was tested on a synthetic 20,000 px page at 2x (40,000 device px, over Chrome's 16,384 limit). In this Playwright and these engines it returned correct pixels, both with a clip and without one, so the repeat-the-top defect was not reproduced here; the part-by-part method does not depend on that. The two capture checks (last part reaches the bottom; last part differs from the first) were each made to fail on planted faults and fired. Second, forced-colors contrast was not run in WebKit because WebKit applies no forced palette.

## What the local server process sent

Every outbound `fetch` from the owner-role dev server process, logged by the preload for the whole session (the four capture runs, the forced-failure run and the probes; all of them used this one server). BLOCKED lines (a write, an RPC outside the read allowlist, an auth call, or another host's non-GET): 0. All POSTs to Supabase are RPC calls on the read allowlist (`analytics_read_*`, `analytics_count_*`, `analytics_site_actions`, `analytics_category_facets`, `analytics_posthog_delivery_health`); the latest definition of each in `supabase/migrations` was read for INSERT, UPDATE, DELETE and PERFORM statements and has none (`analytics_posthog_delivery_health` is a single SELECT). No request went to a host other than Supabase. The harness owner's cookie is a fabricated session; the `GET /auth/v1/user` rows below were answered by the preload while the owner scenario was on and did not leave the process.

| method | host and path | count |
| --- | --- | --- |
| GET | skywzpcekhntecegyjoj.supabase.co/auth/v1/user | 184 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/album_settings | 162 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/album_top_photo | 21 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/albums | 98 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/albums_summary | 84 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_collection_diagnostics | 26 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_daily_coverage | 34 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_diagnostic_coverage | 13 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_event_v2_classifications | 462 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_events_v2 | 78 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_intelligence_actions | 60 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_intelligence_finding_lifecycle | 60 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_intelligence_incidents | 34 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_intelligence_preferences | 69 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_intelligence_snapshot_current | 111 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_launch_recaps | 50 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_saved_reports | 28 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_sharing_annotations | 35 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/analytics_v2_archived_totals | 39 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/engagement_classification_corrections | 13 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/engagement_events | 13 |
| GET | skywzpcekhntecegyjoj.supabase.co/rest/v1/photo_metadata | 77 |
| POST | skywzpcekhntecegyjoj.supabase.co/rest/v1/rpc/analytics_category_facets | 25 |
| POST | skywzpcekhntecegyjoj.supabase.co/rest/v1/rpc/analytics_count_scheduled_gallery_browsers | 13 |
| POST | skywzpcekhntecegyjoj.supabase.co/rest/v1/rpc/analytics_posthog_delivery_health | 47 |
| POST | skywzpcekhntecegyjoj.supabase.co/rest/v1/rpc/analytics_read_launch | 39 |
| POST | skywzpcekhntecegyjoj.supabase.co/rest/v1/rpc/analytics_read_launches | 33 |
| POST | skywzpcekhntecegyjoj.supabase.co/rest/v1/rpc/analytics_read_scheduled_gallery_report | 110 |
| POST | skywzpcekhntecegyjoj.supabase.co/rest/v1/rpc/analytics_site_actions | 46 |


## Per-load summary

| surface | role | engine | width | captured (UTC) | Chicago date | HTTP | final URL path | title | images (broken/incomplete/total) | requests | non-GET aborted | console | page errors | failed | >=400 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home | owner | chromium | desktop-1440 | 2026-10-07 05:00:41 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | owner | chromium | phone-390 | 2026-10-07 05:00:19 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | owner | webkit | desktop-1440 | 2026-10-07 05:00:42 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | owner | webkit | phone-390 | 2026-10-07 05:00:21 | 2026-10-07 | 200 | /photography/analytics/home | Home · Photography reports | 0/0/3 | 122 | 0 | 0 | 0 | 0 | 0 |
| home | visitor | chromium | desktop-1440 | 2026-10-07 05:00:41 | 2026-10-07 | 200 | / | Home · Photography reports | 0/0/3 | 34 | 2 | 2 | 0 | 0 | 0 |
| home | visitor | chromium | phone-390 | 2026-10-07 05:00:20 | 2026-10-07 | 200 | / | Home · Photography reports | 0/0/3 | 34 | 2 | 2 | 0 | 0 | 0 |
| home | visitor | webkit | desktop-1440 | 2026-10-07 05:00:43 | 2026-10-07 | 200 | / | Home · Photography reports | 0/0/3 | 35 | 4 | 2 | 0 | 0 | 0 |
| home | visitor | webkit | phone-390 | 2026-10-07 05:00:22 | 2026-10-07 | 200 | / | Home · Photography reports | 0/0/3 | 33 | 2 | 1 | 0 | 0 | 0 |
| albums | owner | chromium | desktop-1440 | 2026-10-07 05:01:38 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 118 | 0 | 0 | 0 | 0 | 0 |
| albums | owner | chromium | phone-390 | 2026-10-07 05:00:49 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 118 | 0 | 0 | 0 | 0 | 0 |
| albums | owner | webkit | desktop-1440 | 2026-10-07 05:01:38 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 118 | 0 | 0 | 0 | 0 | 0 |
| albums | owner | webkit | phone-390 | 2026-10-07 05:00:50 | 2026-10-07 | 200 | /photography/analytics/albums | Albums · Photography reports | 0/0/0 | 118 | 0 | 0 | 0 | 0 | 0 |
| albums | visitor | chromium | desktop-1440 | 2026-10-07 05:01:38 | 2026-10-07 | 200 | /albums | Albums · Photography reports | 0/0/0 | 29 | 2 | 2 | 0 | 0 | 0 |
| albums | visitor | chromium | phone-390 | 2026-10-07 05:00:51 | 2026-10-07 | 200 | /albums | Albums · Photography reports | 0/0/0 | 29 | 2 | 2 | 0 | 0 | 0 |
| albums | visitor | webkit | desktop-1440 | 2026-10-07 05:01:43 | 2026-10-07 | 200 | /albums | Albums · Photography reports | 0/0/0 | 30 | 4 | 2 | 0 | 0 | 0 |
| albums | visitor | webkit | phone-390 | 2026-10-07 05:00:53 | 2026-10-07 | 200 | /albums | Albums · Photography reports | 0/0/0 | 28 | 2 | 1 | 0 | 0 | 0 |
| album-Re7kho | owner | chromium | desktop-1440 | 2026-10-07 05:02:42 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 211 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | owner | chromium | phone-390 | 2026-10-07 05:01:54 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 210 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | owner | webkit | desktop-1440 | 2026-10-07 05:02:41 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 211 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | owner | webkit | phone-390 | 2026-10-07 05:42:25 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 210 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho | visitor | chromium | desktop-1440 | 2026-10-07 05:02:42 | 2026-10-07 | 200 | /albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 103 | 2 | 2 | 0 | 0 | 0 |
| album-Re7kho | visitor | chromium | phone-390 | 2026-10-07 05:01:56 | 2026-10-07 | 200 | /albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 102 | 2 | 2 | 0 | 0 | 0 |
| album-Re7kho | visitor | webkit | desktop-1440 | 2026-10-07 05:02:45 | 2026-10-07 | 200 | /albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 104 | 4 | 2 | 0 | 0 | 0 |
| album-Re7kho | visitor | webkit | phone-390 | 2026-10-07 05:42:24 | 2026-10-07 | 200 | /albums/Re7kho | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 103 | 4 | 2 | 0 | 0 | 0 |
| album-DWdCET | owner | chromium | desktop-1440 | 2026-10-07 05:03:48 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 194 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | owner | chromium | phone-390 | 2026-10-07 05:03:01 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 193 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | owner | webkit | desktop-1440 | 2026-10-07 05:03:46 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 194 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | owner | webkit | phone-390 | 2026-10-07 05:43:09 | 2026-10-07 | 200 | /photography/analytics/albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 193 | 0 | 0 | 0 | 0 | 0 |
| album-DWdCET | visitor | chromium | desktop-1440 | 2026-10-07 05:03:47 | 2026-10-07 | 200 | /albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 86 | 2 | 2 | 0 | 0 | 0 |
| album-DWdCET | visitor | chromium | phone-390 | 2026-10-07 05:03:02 | 2026-10-07 | 200 | /albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 85 | 2 | 2 | 0 | 0 | 0 |
| album-DWdCET | visitor | webkit | desktop-1440 | 2026-10-07 05:03:47 | 2026-10-07 | 200 | /albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/0/50 | 85 | 2 | 1 | 0 | 0 | 0 |
| album-DWdCET | visitor | webkit | phone-390 | 2026-10-07 05:43:07 | 2026-10-07 | 200 | /albums/DWdCET | College Women's VB - Millikin at North Central - 0 | 0/1/50 | 86 | 4 | 2 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | chromium | desktop-1440 | 2026-10-07 05:05:17 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 211 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | chromium | phone-390 | 2026-10-07 05:04:06 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 210 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | webkit | desktop-1440 | 2026-10-07 05:05:15 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 211 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | owner | webkit | phone-390 | 2026-10-07 05:43:53 | 2026-10-07 | 200 | /photography/analytics/albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 210 | 0 | 0 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | chromium | desktop-1440 | 2026-10-07 05:05:09 | 2026-10-07 | 200 | /albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 103 | 2 | 2 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | chromium | phone-390 | 2026-10-07 05:04:05 | 2026-10-07 | 200 | /albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 102 | 2 | 2 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | webkit | desktop-1440 | 2026-10-07 05:05:12 | 2026-10-07 | 200 | /albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/0/67 | 102 | 2 | 1 | 0 | 0 | 0 |
| album-Re7kho-recap7 | visitor | webkit | phone-390 | 2026-10-07 05:43:50 | 2026-10-07 | 200 | /albums/Re7kho?recap=7 | HS Girls VB - JCA at ACC - 09-22-2026 · Album laun | 0/1/67 | 103 | 4 | 2 | 0 | 0 | 0 |
| photos | owner | chromium | desktop-1440 | 2026-10-07 05:06:05 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | owner | chromium | phone-390 | 2026-10-07 05:05:39 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 132 | 0 | 0 | 0 | 0 | 0 |
| photos | owner | webkit | desktop-1440 | 2026-10-07 05:05:55 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 132 | 0 | 0 | 0 | 0 | 0 |
| photos | owner | webkit | phone-390 | 2026-10-07 05:45:25 | 2026-10-07 | 200 | /photography/analytics/photos | Photos · Photography reports | 0/0/12 | 131 | 0 | 0 | 0 | 0 | 0 |
| photos | visitor | chromium | desktop-1440 | 2026-10-07 05:05:53 | 2026-10-07 | 200 | /photos | Photos · Photography reports | 0/0/12 | 42 | 2 | 2 | 0 | 0 | 0 |
| photos | visitor | chromium | phone-390 | 2026-10-07 05:05:31 | 2026-10-07 | 200 | /photos | Photos · Photography reports | 0/0/12 | 42 | 2 | 2 | 0 | 0 | 0 |
| photos | visitor | webkit | desktop-1440 | 2026-10-07 05:05:53 | 2026-10-07 | 200 | /photos | Photos · Photography reports | 0/0/12 | 43 | 4 | 2 | 0 | 0 | 0 |
| photos | visitor | webkit | phone-390 | 2026-10-07 05:45:18 | 2026-10-07 | 200 | /photos | Photos · Photography reports | 0/0/12 | 43 | 4 | 2 | 0 | 0 | 0 |
| sites | owner | chromium | desktop-1440 | 2026-10-07 05:06:34 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 140 | 0 | 0 | 0 | 0 | 0 |
| sites | owner | chromium | phone-390 | 2026-10-07 05:06:16 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 140 | 0 | 0 | 0 | 0 | 0 |
| sites | owner | webkit | desktop-1440 | 2026-10-07 05:06:18 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 140 | 0 | 0 | 0 | 0 | 0 |
| sites | owner | webkit | phone-390 | 2026-10-07 05:06:05 | 2026-10-07 | 200 | /photography/analytics/sites | Site · Photography reports | 0/0/0 | 140 | 0 | 0 | 0 | 0 | 0 |
| sites | visitor | chromium | desktop-1440 | 2026-10-07 05:06:25 | 2026-10-07 | 200 | /sites | Site · Photography reports | 0/0/0 | 33 | 2 | 2 | 0 | 0 | 0 |
| sites | visitor | chromium | phone-390 | 2026-10-07 05:06:05 | 2026-10-07 | 200 | /sites | Site · Photography reports | 0/0/0 | 33 | 2 | 2 | 0 | 0 | 0 |
| sites | visitor | webkit | desktop-1440 | 2026-10-07 05:06:24 | 2026-10-07 | 200 | /sites | Site · Photography reports | 0/0/0 | 34 | 4 | 2 | 0 | 0 | 0 |
| sites | visitor | webkit | phone-390 | 2026-10-07 05:06:04 | 2026-10-07 | 200 | /sites | Site · Photography reports | 0/0/0 | 32 | 2 | 1 | 0 | 0 | 0 |
| data | owner | chromium | desktop-1440 | 2026-10-07 05:07:36 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 132 | 0 | 0 | 0 | 0 | 0 |
| data | owner | chromium | phone-390 | 2026-10-07 05:06:48 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 132 | 0 | 0 | 0 | 0 | 0 |
| data | owner | webkit | desktop-1440 | 2026-10-07 05:07:29 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 132 | 0 | 0 | 0 | 0 | 0 |
| data | owner | webkit | phone-390 | 2026-10-07 05:44:49 | 2026-10-07 | 200 | /photography/analytics/data | Data · Photography reports | 0/0/0 | 132 | 0 | 0 | 0 | 0 | 0 |
| data | visitor | chromium | desktop-1440 | 2026-10-07 05:07:24 | 2026-10-07 | 200 | /data | Data · Photography reports | 0/0/0 | 30 | 2 | 2 | 0 | 0 | 0 |
| data | visitor | chromium | phone-390 | 2026-10-07 05:06:42 | 2026-10-07 | 200 | /data | Data · Photography reports | 0/0/0 | 30 | 2 | 2 | 0 | 0 | 0 |
| data | visitor | webkit | desktop-1440 | 2026-10-07 05:07:28 | 2026-10-07 | 200 | /data | Data · Photography reports | 0/0/0 | 31 | 4 | 2 | 0 | 0 | 0 |
| data | visitor | webkit | phone-390 | 2026-10-07 05:44:47 | 2026-10-07 | 200 | /data | Data · Photography reports | 0/0/0 | 31 | 4 | 2 | 0 | 0 | 0 |
| settings | owner | chromium | desktop-1440 | 2026-10-07 05:08:05 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | owner | chromium | phone-390 | 2026-10-07 05:07:48 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | owner | webkit | desktop-1440 | 2026-10-07 05:08:00 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | owner | webkit | phone-390 | 2026-10-07 05:07:43 | 2026-10-07 | 200 | /photography/analytics/settings | Settings · Photography reports | 0/0/0 | 130 | 0 | 0 | 0 | 0 | 0 |
| settings | visitor | chromium | desktop-1440 | 2026-10-07 05:07:50 | 2026-10-07 | 200 | /settings | Settings · Photography reports | 0/0/0 | 34 | 2 | 2 | 0 | 0 | 0 |
| settings | visitor | chromium | phone-390 | 2026-10-07 05:07:38 | 2026-10-07 | 200 | /settings | Settings · Photography reports | 0/0/0 | 34 | 2 | 2 | 0 | 0 | 0 |
| settings | visitor | webkit | desktop-1440 | 2026-10-07 05:07:54 | 2026-10-07 | 200 | /settings | Settings · Photography reports | 0/0/0 | 35 | 4 | 2 | 0 | 0 | 0 |
| settings | visitor | webkit | phone-390 | 2026-10-07 05:07:42 | 2026-10-07 | 200 | /settings | Settings · Photography reports | 0/0/0 | 35 | 4 | 2 | 0 | 0 | 0 |

## Gate results per load

Overflow offenders at each setting (0 = none), targets measured and under 44px, keyboard stops and stops with no ring, axe violation count (default), own contrast offenders (default, contrast-more, forced-colors).

| surface | role | engine | width | overflow default / contrast-more / forced / text-200 / text-312 | targets measured / under 44 | keyboard stops / no ring | Alt+Tab stops / no ring (WebKit) | forced-colors keyboard stops / no outline | axe violations (default) | contrast offenders default / more / forced |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 19 / 0 | 19 / 0 | - | 19 / 0 | 0 | 0 / 0 / 0 |
| home | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 45 | 19 / 0 | 19 / 0 | - | 19 / 0 | 0 | 0 / 0 / 0 |
| home | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 19 / 0 | 3 / 0 | 19 / 0 | - | 0 | 0 / 0 / - |
| home | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 45 | 19 / 0 | 3 / 0 | 19 / 0 | - | 0 | 0 / 0 / - |
| home | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 13 / 0 | 13 / 0 | - | 13 / 0 | 0 | 0 / 0 / 0 |
| home | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 45 | 13 / 0 | 13 / 0 | - | 13 / 0 | 0 | 0 / 0 / 0 |
| home | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 13 / 0 | 3 / 0 | 13 / 0 | - | 0 | 0 / 0 / - |
| home | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 45 | 13 / 0 | 3 / 0 | 13 / 0 | - | 0 | 0 / 0 / - |
| albums | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 49 / 0 | 51 / 0 | - | 51 / 0 | 1 | 0 / 0 / 0 |
| albums | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 178 | 49 / 0 | 49 / 0 | - | 49 / 0 | 0 | 0 / 0 / 0 |
| albums | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 49 / 0 | 3 / 0 | 51 / 0 | - | 1 | 0 / 0 / - |
| albums | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 178 | 49 / 0 | 1 / 0 | 49 / 0 | - | 0 | 0 / 0 / - |
| albums | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 49 / 0 | 51 / 0 | - | 51 / 0 | 1 | 0 / 0 / 0 |
| albums | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 178 | 49 / 0 | 49 / 0 | - | 49 / 0 | 0 | 0 / 0 / 0 |
| albums | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 49 / 0 | 3 / 0 | 51 / 0 | - | 1 | 0 / 0 / - |
| albums | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 178 | 49 / 0 | 1 / 0 | 49 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 91 / 0 | 94 / 0 | - | 94 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 88 / 0 | 92 / 0 | - | 92 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 91 / 0 | 7 / 0 | 93 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 87 / 0 | 7 / 0 | 90 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 82 / 0 | 83 / 0 | - | 83 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 80 / 0 | 82 / 0 | - | 82 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 82 / 0 | 2 / 0 | 83 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 79 / 0 | 2 / 0 | 81 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 76 / 0 | 79 / 0 | - | 79 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 73 / 0 | 77 / 0 | - | 77 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 76 / 0 | 7 / 0 | 78 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 73 / 0 | 7 / 0 | 76 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 65 / 0 | 66 / 0 | - | 66 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 63 / 0 | 65 / 0 | - | 65 / 0 | 0 | 0 / 0 / 0 |
| album-DWdCET | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 65 / 0 | 2 / 0 | 66 / 0 | - | 0 | 0 / 0 / - |
| album-DWdCET | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 63 / 0 | 2 / 0 | 65 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 91 / 0 | 94 / 0 | - | 94 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 88 / 0 | 92 / 0 | - | 92 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 91 / 0 | 7 / 0 | 93 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 88 / 0 | 7 / 0 | 91 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 82 / 0 | 83 / 0 | - | 83 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 80 / 0 | 82 / 0 | - | 82 / 0 | 0 | 0 / 0 / 0 |
| album-Re7kho-recap7 | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 82 / 0 | 2 / 0 | 83 / 0 | - | 0 | 0 / 0 / - |
| album-Re7kho-recap7 | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 80 / 0 | 2 / 0 | 82 / 0 | - | 0 | 0 / 0 / - |
| photos | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 43 / 0 | 46 / 0 | - | 46 / 0 | 1 | 1 / 1 / 0 |
| photos | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 18 | 43 / 0 | 46 / 0 | - | 46 / 0 | 1 | 1 / 1 / 0 |
| photos | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 43 / 2 | 5 / 0 | 46 / 0 | - | 1 | 1 / 1 / - |
| photos | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 18 | 43 / 2 | 5 / 0 | 46 / 0 | - | 1 | 1 / 1 / - |
| photos | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 29 / 0 | 32 / 0 | - | 32 / 0 | 1 | 1 / 1 / 0 |
| photos | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 6 | 29 / 0 | 32 / 0 | - | 32 / 0 | 1 | 1 / 1 / 0 |
| photos | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 29 / 2 | 4 / 0 | 32 / 0 | - | 1 | 1 / 1 / - |
| photos | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 6 | 29 / 2 | 4 / 0 | 32 / 0 | - | 1 | 1 / 1 / - |
| sites | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 24 / 0 | 27 / 0 | - | 27 / 0 | 1 | 0 / 0 / 0 |
| sites | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 22 | 24 / 0 | 27 / 0 | - | 27 / 0 | 1 | 0 / 0 / 0 |
| sites | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 24 / 0 | 1 / 0 | 27 / 0 | - | 1 | 0 / 0 / - |
| sites | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 22 | 24 / 0 | 1 / 0 | 27 / 0 | - | 1 | 0 / 0 / - |
| sites | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 38 / 0 | 41 / 0 | - | 41 / 0 | 1 | 0 / 0 / 0 |
| sites | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 37 | 38 / 0 | 41 / 0 | - | 41 / 0 | 1 | 0 / 0 / 0 |
| sites | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 38 / 0 | 2 / 0 | 41 / 0 | - | 1 | 0 / 0 / - |
| sites | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 37 | 38 / 0 | 2 / 0 | 41 / 0 | - | 1 | 0 / 0 / - |
| data | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 21 / 0 | 23 / 0 | - | 23 / 0 | 1 | 0 / 0 / 0 |
| data | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 21 / 0 | 23 / 0 | - | 23 / 0 | 1 | 0 / 0 / 0 |
| data | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 21 / 4 | 9 / 0 | 23 / 0 | - | 1 | 0 / 0 / - |
| data | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 21 / 4 | 9 / 0 | 23 / 0 | - | 1 | 0 / 0 / - |
| data | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 17 / 0 | 19 / 0 | - | 19 / 0 | 1 | 0 / 0 / 0 |
| data | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 3 | 17 / 0 | 19 / 0 | - | 19 / 0 | 1 | 0 / 0 / 0 |
| data | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 17 / 0 | 10 / 0 | 19 / 0 | - | 1 | 0 / 0 / - |
| data | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 3 | 17 / 0 | 10 / 0 | 19 / 0 | - | 1 | 0 / 0 / - |
| settings | owner | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 17 / 0 | 15 / 0 | - | 15 / 0 | 1 | 0 / 0 / 0 |
| settings | owner | chromium | phone-390 | 0 / 0 / 0 / 0 / 24 | 17 / 0 | 15 / 0 | - | 15 / 0 | 1 | 0 / 0 / 0 |
| settings | owner | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 17 / 2 | 3 / 0 | 15 / 0 | - | 1 | 0 / 0 / - |
| settings | owner | webkit | phone-390 | 0 / 0 / 0 / 0 / 26 | 17 / 2 | 3 / 0 | 15 / 0 | - | 1 | 0 / 0 / - |
| settings | visitor | chromium | desktop-1440 | 0 / 0 / 0 / - / - | 6 / 0 | 8 / 0 | - | 8 / 0 | 1 | 0 / 0 / 0 |
| settings | visitor | chromium | phone-390 | 0 / 0 / 0 / 0 / 4 | 6 / 0 | 8 / 0 | - | 8 / 0 | 1 | 0 / 0 / 0 |
| settings | visitor | webkit | desktop-1440 | 0 / 0 / 0 / - / - | 6 / 0 | 0 / 0 | 8 / 0 | - | 1 | 0 / 0 / - |
| settings | visitor | webkit | phone-390 | 0 / 0 / 0 / 0 / 4 | 6 / 0 | 0 / 0 | 8 / 0 | - | 1 | 0 / 0 / - |

## Findings (merged across role and engine)

Each row is one finding. "seen in" lists every role/engine combination that produced it.

| gate | surface | width | settings | detail | seen in |
| --- | --- | --- | --- | --- | --- |
| axe landmark-unique (moderate) | albums | desktop-1440 | default, contrast-more, forced-colors | section[aria-labelledby="launches-title"] | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe landmark-unique (moderate) | albums | desktop-1440 | default, contrast-more, forced-colors | section[aria-labelledby="undated-title"] | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | photos | desktop-1440 | default, contrast-more, forced-colors | .lead > a | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | photos | desktop-1440 | default, contrast-more, forced-colors | a | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | photos | desktop-1440 | default, contrast-more, forced-colors | .note:nth-child(2) > a | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | photos | desktop-1440 | default, contrast-more, forced-colors | #filters > .note > a | visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | photos | desktop-1440 | default, contrast-more, forced-colors | .note:nth-child(8) > a | visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | photos | phone-390 | default, contrast-more, forced-colors | .lead > a | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | photos | phone-390 | default, contrast-more, forced-colors | a | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | photos | phone-390 | default, contrast-more, forced-colors | .note:nth-child(2) > a | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | photos | phone-390 | default, contrast-more, forced-colors | #filters > .note > a | visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | photos | phone-390 | default, contrast-more, forced-colors | .note:nth-child(8) > a | visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | sites | desktop-1440 | default, contrast-more, forced-colors | .note:nth-child(4) > a | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | sites | desktop-1440 | default, contrast-more, forced-colors | .note:nth-child(5) > a | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | sites | phone-390 | default, contrast-more, forced-colors | .note:nth-child(4) > a | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | sites | phone-390 | default, contrast-more, forced-colors | .note:nth-child(5) > a | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | data | desktop-1440 | default, contrast-more, forced-colors | .gap > a | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | data | desktop-1440 | default, contrast-more, forced-colors | p > a | visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | data | phone-390 | default, contrast-more, forced-colors | .gap > a | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | data | phone-390 | default, contrast-more, forced-colors | p > a | visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | settings | desktop-1440 | default, contrast-more, forced-colors | a[target="_blank"] | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | settings | desktop-1440 | default, contrast-more, forced-colors | .note > a[target="_blank"][rel="noopener noreferrer"] | visitor/chromium, visitor/webkit |
| axe link-in-text-block (serious) | settings | phone-390 | default, contrast-more, forced-colors | a[target="_blank"] | owner/chromium, owner/webkit |
| axe link-in-text-block (serious) | settings | phone-390 | default, contrast-more, forced-colors | .note > a[target="_blank"][rel="noopener noreferrer"] | visitor/chromium, visitor/webkit |
| console error caused by an aborted request | home | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | home | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | home | desktop-1440 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | home | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | home | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | albums | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | albums | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | albums | desktop-1440 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | albums | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | albums | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | album-Re7kho | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | album-Re7kho | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | album-Re7kho | desktop-1440 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | album-Re7kho | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | album-Re7kho | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | album-Re7kho | phone-390 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | album-DWdCET | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | album-DWdCET | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | album-DWdCET | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | album-DWdCET | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | album-DWdCET | phone-390 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | album-Re7kho-recap7 | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | album-Re7kho-recap7 | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | album-Re7kho-recap7 | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | album-Re7kho-recap7 | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | album-Re7kho-recap7 | phone-390 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | photos | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | photos | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | photos | desktop-1440 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | photos | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | photos | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | photos | phone-390 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | sites | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | sites | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | sites | desktop-1440 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | sites | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | sites | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | data | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | data | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | data | desktop-1440 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | data | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | data | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | data | phone-390 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | settings | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | settings | desktop-1440 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | settings | desktop-1440 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error caused by an aborted request | settings | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/rum? | visitor/chromium |
| console error caused by an aborted request | settings | phone-390 | - | error: Failed to load resource: net::ERR_FAILED @ https://analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/4df4a60fa397/0.6725764202857331:179 | visitor/chromium |
| console error caused by an aborted request | settings | phone-390 | - | error: Beacon API cannot load https://analytics.ninochavez.co/cdn-cgi/rum?. Blocked by Web Inspector @  | visitor/webkit |
| console error or warning | home | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | home | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | albums | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | albums | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | album-Re7kho | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | album-Re7kho | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | album-DWdCET | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | album-DWdCET | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | album-Re7kho-recap7 | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | album-Re7kho-recap7 | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | photos | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | photos | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | sites | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | sites | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | data | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | data | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | settings | desktop-1440 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| console error or warning | settings | phone-390 | - | warning: window.styleMedia is a deprecated draft version of window.matchMedia API, and it will be removed in the future. @  | visitor/webkit |
| images | album-Re7kho | phone-390 | - | 0 broken, 1 incomplete of 67 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| images | album-DWdCET | phone-390 | - | 0 broken, 1 incomplete of 50 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| images | album-Re7kho-recap7 | phone-390 | - | 0 broken, 1 incomplete of 67 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | home | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | home | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | albums | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | albums | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | album-Re7kho | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | album-Re7kho | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | album-DWdCET | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | album-DWdCET | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | album-Re7kho-recap7 | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | album-Re7kho-recap7 | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | photos | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | photos | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | sites | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | sites | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | data | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | data | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | settings | desktop-1440 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| non-GET request (aborted before sending) | settings | phone-390 | - | POST analytics.ninochavez.co/cdn-cgi/rum ; POST analytics.ninochavez.co/cdn-cgi/challenge-platform/h/g/jsd/oneshot/... | visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | div.card spans 50..394 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | a-_v0ajlP spans 360..575 of 390 | owner/chromium, owner/webkit |
| overflow | home | phone-390 | text-312 | span.status spans 360..517 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | span-_v0ajlP spans 360..528 of 390 | owner/chromium, owner/webkit |
| overflow | home | phone-390 | text-312 | strong-_v0ajlP spans 360..496 of 390 | owner/chromium |
| overflow | home | phone-390 | text-312 | line spans 360..434 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | rect spans 393..401 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | rect spans 404..412 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | rect spans 415..423 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | strong-_v0ajlP spans 360..495 of 390 | owner/webkit |
| overflow | home | phone-390 | text-312 | a spans 360..575 of 390 | visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | span spans 360..528 of 390 | visitor/chromium, visitor/webkit |
| overflow | home | phone-390 | text-312 | strong spans 360..496 of 390 | visitor/chromium |
| overflow | home | phone-390 | text-312 | strong spans 360..495 of 390 | visitor/webkit |
| overflow | albums | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | li.card spans 101..452 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | div.card-head spans 139..413 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | a spans 139..413 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | label.pick spans 139..413 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | span.pick-text spans 234..401 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | span spans 234..401 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | dl spans 139..413 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | div spans 139..413 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | albums | phone-390 | text-312 | dt spans 139..413 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-Re7kho | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-Re7kho | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-Re7kho | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-DWdCET | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-DWdCET | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-DWdCET | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-Re7kho-recap7 | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-Re7kho-recap7 | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | album-Re7kho-recap7 | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | photos | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | photos | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | photos | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | photos | phone-390 | text-312 | span.hint spans 323..456 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | photos | phone-390 | text-312 | div.toggle spans 101..558 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | photos | phone-390 | text-312 | button.secondary spans 359..558 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | photos | phone-390 | text-312 | label.check spans 246..484 of 390 | owner/chromium, owner/webkit |
| overflow | photos | phone-390 | text-312 | span spans 333..484 of 390 | owner/chromium, owner/webkit |
| overflow | sites | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | section.intro spans 50..404 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | p.eyebrow spans 50..404 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | h1#site-title spans 50..404 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | div.controls spans 50..404 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | nav.group spans 50..404 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | span.chips spans 50..404 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | sites | phone-390 | text-312 | a.choice spans 50..395 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | data | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | data | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | data | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | settings | phone-390 | text-312 | div.identity spans 50..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | settings | phone-390 | text-312 | span spans 130..430 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | settings | phone-390 | text-312 | span.divider spans 383..396 of 390 | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow | settings | phone-390 | text-312 | fieldset spans 147..396 of 390 | owner/chromium, owner/webkit |
| overflow | settings | phone-390 | text-312 | legend spans 147..396 of 390 | owner/chromium, owner/webkit |
| overflow | settings | phone-390 | text-312 | label spans 147..396 of 390 | owner/chromium, owner/webkit |
| overflow | settings | phone-390 | text-312 | div.recaps spans 147..396 of 390 | owner/chromium, owner/webkit |
| overflow | settings | phone-390 | text-312 | h4#settings-recaps-heading spans 147..396 of 390 | owner/chromium, owner/webkit |
| overflow | settings | phone-390 | text-312 | p spans 147..396 of 390 | owner/chromium |
| overflow | settings | phone-390 | text-312 | span spans 234..399 of 390 | owner/webkit |
| overflow | settings | phone-390 | text-312 | span spans 234..405 of 390 | owner/webkit |
| overflow | settings | phone-390 | text-312 | a spans 147..413 of 390 | visitor/chromium, visitor/webkit |
| overflow (count) | home | phone-390 | text-312 | 45 offenders in total | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow (count) | albums | phone-390 | text-312 | 178 offenders in total | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| overflow (count) | photos | phone-390 | text-312 | 18 offenders in total | owner/chromium, owner/webkit |
| overflow (count) | sites | phone-390 | text-312 | 22 offenders in total | owner/chromium, owner/webkit |
| overflow (count) | sites | phone-390 | text-312 | 37 offenders in total | visitor/chromium, visitor/webkit |
| overflow (count) | settings | phone-390 | text-312 | 24 offenders in total | owner/chromium |
| overflow (count) | settings | phone-390 | text-312 | 26 offenders in total | owner/webkit |
| target under 44px | photos | desktop-1440 | default | select "Last 7 complete daysLast 30 complete day" 345x22 | owner/webkit, visitor/webkit |
| target under 44px | photos | desktop-1440 | default | select "Photo opensAlbum opensDownload requestsF" 345x22 | owner/webkit, visitor/webkit |
| target under 44px | photos | phone-390 | default | select "Last 7 complete daysLast 30 complete day" 324x22 | owner/webkit, visitor/webkit |
| target under 44px | photos | phone-390 | default | select "Photo opensAlbum opensDownload requestsF" 324x22 | owner/webkit, visitor/webkit |
| target under 44px | data | desktop-1440 | default | select#legacy-event-mT "Choose an actionPhoto opened · Bell Pepp" 443x22 | owner/webkit |
| target under 44px | data | desktop-1440 | default | select-mT "AudienceOperatorTestKnown crawlerSuspect" 218x22 | owner/webkit |
| target under 44px | data | desktop-1440 | default | select#v2-event-mT "Choose an actionSite page viewed · /blog" 443x22 | owner/webkit |
| target under 44px | data | phone-390 | default | select#legacy-event-mT "Choose an actionPhoto opened · Bell Pepp" 327x22 | owner/webkit |
| target under 44px | data | phone-390 | default | select-mT "AudienceOperatorTestKnown crawlerSuspect" 327x22 | owner/webkit |
| target under 44px | data | phone-390 | default | select#v2-event-mT "Choose an actionSite page viewed · /blog" 327x22 | owner/webkit |
| target under 44px | settings | desktop-1440 | default | select "Last 7 daysLast 30 daysLast 90 days" 186x33 | owner/webkit |
| target under 44px | settings | desktop-1440 | default | select "photo opensalbum opensdownload requestsf" 186x33 | owner/webkit |
| target under 44px | settings | phone-390 | default | select "Last 7 daysLast 30 daysLast 90 days" 327x22 | owner/webkit |
| target under 44px | settings | phone-390 | default | select "photo opensalbum opensdownload requestsf" 327x22 | owner/webkit |
| text contrast below WCAG AA (own computation) | photos | desktop-1440 | default, contrast-more | span.secondary "Previous" 3.05:1 (needs 4.5) fg rgb(23, 78, 166) bg rgb(255, 255, 255) [the element is span.secondary.off with aria-disabled="true", an inactive pager item: src/routes/analytics/photos/+page.svelte lines 294 and 296] | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| text contrast below WCAG AA (own computation) | photos | phone-390 | default, contrast-more | span.secondary "Previous" 3.05:1 (needs 4.5) fg rgb(23, 78, 166) bg rgb(255, 255, 255) [the element is span.secondary.off with aria-disabled="true", an inactive pager item: src/routes/analytics/photos/+page.svelte lines 294 and 296] | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| text that did not grow | album-Re7kho | phone-390 | text-200 | text 12px->12px x10 e.g. "575" | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| text that did not grow | album-Re7kho | phone-390 | text-312 | text 12px->12px x6 e.g. "575" | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| text that did not grow | album-DWdCET | phone-390 | text-200 | text 12px->12px x10 e.g. "118" | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| text that did not grow | album-DWdCET | phone-390 | text-312 | text 12px->12px x6 e.g. "118" | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| text that did not grow | album-Re7kho-recap7 | phone-390 | text-200 | text 12px->12px x10 e.g. "575" | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |
| text that did not grow | album-Re7kho-recap7 | phone-390 | text-312 | text 12px->12px x6 e.g. "575" | owner/chromium, owner/webkit, visitor/chromium, visitor/webkit |

Finding rows: 212 (from 611 raw observations).

## Not covered

- Physical devices, real iOS Safari, real Android Chrome. WebKit here is the engine on macOS, not iOS Safari: no dynamic island or safe areas, no collapsing address bar, no touch hit-testing of real fingers, no software keyboard, no iOS text rendering, no Dynamic Type.
- Increased contrast and forced colours as an operating system applies them. The emulation toggles the media query; Windows High Contrast themes other than the default forced palette were not tried, and macOS "Increase contrast" also changes native control drawing, which this does not.
- Largest text as a user setting. The root font size was scaled; the browser default font setting and iOS Dynamic Type were not. Android Chrome's text scaling also enlarges text sized in `px`, and Safari's page zoom scales everything; the "did not grow" lists describe a default-font-size setting only.
- A real signed-in session. The owner role is a harness owner on a local development server, not the production build, so anything that differs between a development and a production build is not seen in owner captures.
- Native form controls. The 44 px findings on `<select>` elements appear in WebKit only (22 px high on macOS WebKit, where the page's minimum height is not applied to a native menu button) and not in Chromium. iOS draws and sizes these controls differently, so those rows say what macOS WebKit measured, not what an iPhone would.
- Dark mode: the pages define none; nothing was captured where the render matched the default.
- Anything below the first screen that loads on interaction (dialogs, expanded sections, menus): nothing was clicked, so only the load state of each page was captured and gated.
- axe-core covers a subset of accessibility rules and cannot judge reading order, link purpose or whether text is understandable.
- A cold review of the captures: that is the next step and this folder was built to feed it.
