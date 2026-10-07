# Performance for build step 9 (acceptance)

Lab measurements of the report pages, compared with the last measurement taken before the rebuild. Numbers only: no verdict on whether a page is fast enough. Lab loads on one Mac are not field data and not real-user INP.

Script: `scripts/measure-analytics-performance.mjs` (fixed for this step, see "What changed in the script"). Raw results: `performance-production.json`, `performance-local-old.json`, `performance-local-new.json` beside this file.

## How the loads were taken

- Browser: Chromium 153.0.8010.12 (Playwright headless shell), a fresh context for every load, so the browser cache is cold every time.
- Desktop: 1440x900, no throttling. Mobile: 390x844 with the script's fixed throttle (150 ms round trip, 1.6 Mbps down, 4x CPU slowdown), the same as the baseline.
- 10 loads per page and device. Round-robin over the pages (load 1 of every page, then load 2 of every page), 2 seconds between loads on production, so one page is never loaded twice in a row.
- Every non-GET request was aborted before it left the browser and counted. On production those are two Cloudflare scripts the host injects into every page (a Web Analytics beacon and a bot-challenge script), not part of the app. The baseline did not abort them.
- Percentiles are nearest-rank: the 90th percentile of 10 loads is the 9th value.
- "First byte" is the request sent to the first byte. These pages stream: the first byte arrives early and the HTML document completes later, when the data-dependent part has been sent. "Document" is the request sent to the last byte of the HTML, and is the server-time figure that follows the data. "End" is navigation start to the last byte, so it includes connection setup. The baseline has only "first byte from navigation start" and "end".
- "All resources" is bytes received on the wire for everything the page loaded, counted by the browser's network layer, including cross-origin images. The baseline's resource figure counts only what the browser could measure (cross-origin images read as 0), so the two are not comparable and are not compared.

## Baseline

The last measurement of this script on production before the rebuild is `docs/implementation/analytics-intelligence-20260930/evidence/performance-live.json`, measured 2026-09-30T08:46:37Z against `https://analytics.ninochavez.co/sites` and `/gallery`, committed in `707a2c8` (PR #179). It has 3 loads per page and device, taken one after another.

It differs from the current measurement in these conditions: 3 loads instead of 10; the 3 loads of one page ran back to back, so loads 2 and 3 followed a load of the same page seconds earlier; non-GET requests were not aborted; and it predates six days of changes (PRs #180 to #208, including everything in this rebuild and #191 to #193). Only `/sites` and `/gallery` were measured, so the new pages that replaced `/gallery` have no baseline of their own. Its cache state is the same unknown as now: production Worker and database caches were not controlled in either run.

Because of that, a second comparison was made locally, with the same script, machine and session for both sides:

- Before: commit `196bd11` (the parent of the #196 merge, the last state before the launch read model), `vite build`, served by `wrangler pages dev` (Cloudflare workerd) on this Mac.
- After: `a8bfd28`, built and served the same way.
- Both servers had answered a request to each page before load 1, so their in-process caches were warm for it. Both read production Supabase with the project's `.env.local` passed as bindings to that one process (nothing copied). Neither has a Cloudflare Analytics or PostHog token, so those provider calls do not happen in either local table. The local server does not compress responses, so local document and transfer sizes are larger than production's and mean something only between the two local tables.
- The pre-rebuild tree was first served under `wrangler` (where the write-blocking preload does not apply) and each old address was requested once with `curl`; the same addresses were then requested from the same tree under `vite dev` with the preload: 0 blocked requests, only GETs and read-allowlist RPCs to Supabase, no other host. The write check therefore came after those first requests, not before; it covers the same code on the same addresses. The current tree had been through the preload for all of its pages during the captures: 0 blocked.

Old address and new page used for the local comparison (from the redirect table in the audit README, "Old addresses (build step 8)"):

| new page | old address it replaced | old path measured locally |
| --- | --- | --- |
| `/` Home | `/` (a redirect to `/sites`) and the `/gallery` overview | `/sites`, `/operator` |
| `/albums` | `/gallery?section=albums` | `/operator?section=albums` |
| `/albums/<key>` | `/gallery?scope=album&albums=<key>` and `/gallery?section=albums&scope=album&albums=<key>` | both, with `Re7kho` |
| `/photos` | `/gallery?section=photos` | `/operator?section=photos` |
| `/sites` | `/sites` | `/sites` |
| `/data` | `/gallery?section=measurement` and `section=sources` | `/operator?section=measurement`, `/operator?section=sources` |
| `/settings` | `/gallery?section=preferences` | `/operator?section=preferences` |

Locally the paths carry the app's internal base (`/photography/analytics/...`); the old `/gallery` is `/photography/analytics/operator`, and Home is `/photography/analytics/home`.

## What changed in the script

`scripts/measure-analytics-performance.mjs` was stale against the routes: its default pages were `/sites,/photos` (changed in step 8) and its interaction step clicked tabs that no longer exist. Changes: default pages are all nine surfaces; up to 15 loads per page and device (was 5), round-robin with a configurable pause (`ANALYTICS_MEASURE_GAP_MS`); non-GET requests aborted and counted; `requestStart`, first-byte time, document time and network-layer bytes recorded; per page and device medians and 90th percentiles written into the JSON (`summary`) and printed; the interaction step is off unless `ANALYTICS_MEASURE_INTERACTIONS=1` and now clicks the navigation links of the current pages; a page that never shows an `h1` is recorded as an error instead of crashing the run.

### Side by side

Medians over the loads shown below (n = 3 for the baseline, 10 for the others). "end" is navigation start to the last byte of the HTML; LCP is largest contentful paint. All times in milliseconds.

#### Production: the 2026-09-30 baseline against now

The old `/gallery` was one page holding what Home, the album index, the photo explorer, data quality and settings now hold separately, so each new page is set beside it.

| device | before: page | before: end / LCP | now: page | now: end / LCP |
| --- | --- | --- | --- | --- |
| desktop | `/sites` | 1,510 / 1,584 | `/sites` | 184 / 272 |
| desktop | `/gallery` | 885 / 968 | `/` | 447 / 512 |
| desktop | `/gallery` | 885 / 968 | `/albums` | 371 / 436 |
| desktop | `/gallery` | 885 / 968 | `/albums/Re7kho` | 650 / 764 |
| desktop | `/gallery` | 885 / 968 | `/photos` | 351 / 424 |
| desktop | `/gallery` | 885 / 968 | `/data` | 2,407 / 2,480 |
| desktop | `/gallery` | 885 / 968 | `/settings` | 85 / 148 |
| mobile | `/sites` | 235 / 1,208 | `/sites` | 245 / 1,296 |
| mobile | `/gallery` | 560 / 1,708 | `/` | 514 / 1,412 |
| mobile | `/gallery` | 560 / 1,708 | `/albums` | 575 / 1,428 |
| mobile | `/gallery` | 560 / 1,708 | `/albums/Re7kho` | 837 / 1,992 |
| mobile | `/gallery` | 560 / 1,708 | `/photos` | 672 / 1,560 |
| mobile | `/gallery` | 560 / 1,708 | `/data` | 3,305 / 3,140 |
| mobile | `/gallery` | 560 / 1,708 | `/settings` | 222 / 1,172 |

#### Local: before the rebuild (196bd11) against now (a8bfd28)

Same machine, same script, same session. "document" is request sent to the last byte of the HTML; "wire" is KiB on the wire (uncompressed locally). `/sites` is omitted: see Limits.

| device | before: page | before: document / LCP / wire KiB | now: page | now: document / LCP / wire KiB |
| --- | --- | --- | --- | --- |
| desktop | `/operator` | 509 / 660 / 232.8 | `/home` | 384 / 448 / 164.4 |
| desktop | `/operator?section=albums` | 246 / 300 / 193.0 | `/albums` | 284 / 324 / 138.1 |
| desktop | `/operator?scope=album&albums=Re7kho` | 350 / 412 / 221.1 | `/albums/Re7kho` | 700 / 760 / 2,370.4 |
| desktop | `/operator?section=albums&scope=album&albums=Re7kho` | 106 / 156 / 184.9 | `/albums/Re7kho` | 700 / 760 / 2,370.4 |
| desktop | `/operator?section=photos` | 383 / 480 / 327.6 | `/photos` | 407 / 448 / 254.8 |
| desktop | `/operator?section=measurement` | 2,012 / 2,064 / 195.7 | `/data` | 2,022 / 2,064 / 146.0 |
| desktop | `/operator?section=sources` | 266 / 312 / 192.3 | `/data` | 2,022 / 2,064 / 146.0 |
| desktop | `/operator?section=preferences` | 525 / 740 / 232.8 | `/settings` | 2 / 44 / 136.5 |
| mobile | `/operator` | 634 / 1,284 / 232.8 | `/home` | 513 / 868 / 164.5 |
| mobile | `/operator?section=albums` | 386 / 688 / 193.0 | `/albums` | 476 / 888 / 138.2 |
| mobile | `/operator?scope=album&albums=Re7kho` | 430 / 1,128 / 221.2 | `/albums/Re7kho` | 799 / 1,184 / 238.9 |
| mobile | `/operator?section=albums&scope=album&albums=Re7kho` | 251 / 588 / 185.0 | `/albums/Re7kho` | 799 / 1,184 / 238.9 |
| mobile | `/operator?section=photos` | 430 / 1,524 / 304.4 | `/photos` | 536 / 924 / 236.2 |
| mobile | `/operator?section=measurement` | 1,953 / 2,244 / 195.8 | `/data` | 2,035 / 2,396 / 146.0 |
| mobile | `/operator?section=sources` | 378 / 660 / 192.4 | `/data` | 2,035 / 2,396 / 146.0 |
| mobile | `/operator?section=preferences` | 558 / 1,144 / 232.8 | `/settings` | 183 / 528 / 136.6 |


### Production, current main

Server caches are warm in an unknown way: the pages were captured on this same production host in the hour before, so load 1 here is not a guaranteed cold start, and a Worker or database cache from an earlier visitor may serve any load.

measured 2026-10-07T05:23:58.715Z against https://analytics.ninochavez.co; 10 loads per page and device, round-robin over the pages (load 1 of every page, then load 2 of every page, ...), 2000 ms between loads; a fresh browser context for each load, so the browser cache is cold every time. "first byte" = request sent to first byte; "document" = request sent to the last byte of the HTML (these pages stream: the first byte arrives early and the document completes when the data-dependent HTML has been sent, so this is the server-time figure that follows the data); "end" = navigation start to last byte of the document (includes connection setup). Sizes in KiB. Percentiles are nearest-rank (the 90th percentile of 10 loads is the 9th value).

| device | page | n | first byte med / p90 (ms) | document med / p90 (ms) | document, load 1 / loads 2+ median (ms) | end med / p90 (ms) | document KiB med | all resources KiB med / p90 | LCP med / p90 (ms) | requests med | CLS max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | `/` | 10 | 19 / 30 | 417 / 1,511 | 1,511 / 417 | 447 / 1,561 | 6.9 | 186.5 / 187.0 | 512 / 1,632 | 31 | 0.000 |
| desktop | `/albums` | 10 | 16 / 19 | 291 / 368 | 291 / 315 | 371 / 439 | 12.8 | 160.8 / 161.2 | 436 / 504 | 26 | 0.000 |
| desktop | `/albums/Re7kho` | 10 | 17 / 26 | 610 / 745 | 547 / 614 | 650 / 771 | 12.2 | 2,391.8 / 2,393.0 | 764 / 860 | 100 | 0.000 |
| desktop | `/albums/DWdCET` | 10 | 17 / 24 | 630 / 791 | 630 / 640 | 665 / 829 | 12.3 | 1,702.1 / 1,702.5 | 748 / 908 | 83 | 0.000 |
| desktop | `/albums/Re7kho?recap=7` | 10 | 15 / 34 | 589 / 710 | 690 / 589 | 664 / 804 | 12.7 | 2,095.3 / 2,096.0 | 744 / 908 | 90 | 0.000 |
| desktop | `/photos` | 10 | 17 / 21 | 285 / 452 | 353 / 285 | 351 / 493 | 13.2 | 276.9 / 277.2 | 424 / 572 | 39 | 0.000 |
| desktop | `/sites` | 10 | 17 / 25 | 146 / 1,233 | 200 / 146 | 184 / 1,268 | 6.8 | 182.2 / 182.5 | 272 / 1,348 | 30 | 0.000 |
| desktop | `/data` | 10 | 16 / 22 | 2,375 / 3,516 | 2,375 / 2,448 | 2,407 / 3,609 | 14.0 | 167.1 / 167.5 | 2,480 / 3,164 | 27 | 0.000 |
| desktop | `/settings` | 10 | 17 / 19 | 53 / 70 | 49 / 54 | 85 / 167 | 3.7 | 158.7 / 158.9 | 148 / 264 | 31 | 0.002 |
| mobile | `/` | 10 | 17 / 24 | 486 / 1,496 | 491 / 486 | 514 / 1,526 | 7.1 | 187.4 / 187.9 | 1,412 / 2,432 | 31 | 0.000 |
| mobile | `/albums` | 10 | 19 / 21 | 544 / 648 | 628 / 544 | 575 / 732 | 12.8 | 161.1 / 161.5 | 1,428 / 1,588 | 26 | 0.000 |
| mobile | `/albums/Re7kho` | 10 | 18 / 28 | 745 / 1,017 | 989 / 745 | 837 / 1,152 | 12.2 | 260.6 / 261.3 | 1,992 / 2,300 | 39 | 0.000 |
| mobile | `/albums/DWdCET` | 10 | 19 / 26 | 682 / 992 | 992 / 682 | 725 / 1,024 | 12.3 | 262.5 / 263.4 | 1,872 / 2,168 | 39 | 0.000 |
| mobile | `/albums/Re7kho?recap=7` | 10 | 17 / 20 | 850 / 1,090 | 939 / 850 | 905 / 1,122 | 12.7 | 261.7 / 262.3 | 2,052 / 2,276 | 39 | 0.000 |
| mobile | `/photos` | 10 | 16 / 36 | 580 / 763 | 1,261 / 580 | 672 / 807 | 13.2 | 258.8 / 259.3 | 1,560 / 1,700 | 37 | 0.000 |
| mobile | `/sites` | 10 | 18 / 26 | 204 / 2,874 | 203 / 284 | 245 / 2,908 | 6.7 | 182.5 / 183.4 | 1,296 / 3,944 | 30 | 0.000 |
| mobile | `/data` | 10 | 17 / 24 | 3,275 / 6,639 | 2,046 / 4,498 | 3,305 / 6,670 | 14.0 | 167.2 / 167.6 | 3,140 / 4,308 | 27 | 0.000 |
| mobile | `/settings` | 10 | 16 / 21 | 188 / 253 | 185 / 188 | 222 / 290 | 3.7 | 159.0 / 159.2 | 1,172 / 1,224 | 31 | 0.000 |

Loads that did not return 200, showed "report unavailable", or logged an error: 0 of 180.

Non-GET requests aborted before sending: 360 across 180 loads.


### Baseline: production before the rebuild (2026-09-30)

measured 2026-09-30T08:46:37.922Z; source file `docs/implementation/analytics-intelligence-20260930/evidence/performance-live.json` (committed in `707a2c8`, PR #179). Run with the previous version of this script: 3 loads of the same page one after another, mobile and desktop, no aborted requests, no pause between loads (so loads 2 and 3 followed a load of the same page seconds earlier). The file has no request-start time, so only start-to-first-byte (includes connection setup) and end are comparable, and its "resources" figure counts only what the browser could measure (cross-origin images are not counted), so it is not comparable with the all-resources figure in the other tables.

| device | page | n | first byte from navigation start, load 1 / median / max (ms) | end median / max (ms) (comparable with "end" above) | document KiB med | measurable resources KiB med | LCP median / max (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | `/sites` | 3 | 58 / 52 / 58 | 1,510 / 4,339 | 6.5 | 142.5 | 1,584 / 4,604 |
| desktop | `/gallery` | 3 | 76 / 76 / 897 | 885 / 911 | 24.2 | 166.3 | 968 / 992 |
| mobile | `/sites` | 3 | 53 / 53 / 56 | 235 / 1,241 | 6.5 | 142.5 | 1,208 / 2,212 |
| mobile | `/gallery` | 3 | 42 / 42 / 46 | 560 / 562 | 24.2 | 166.3 | 1,708 / 1,712 |


### Local, before the rebuild (commit 196bd11)

Production build served by `wrangler pages dev` on this Mac (Cloudflare workerd), reading production Supabase with the project's `.env.local` as bindings for the process. No provider token for Cloudflare Analytics or PostHog is in `.env.local`, so those provider calls are absent in both local tables. Responses are not compressed by the local server, so document and transfer sizes are larger than production's and are comparable only between the two local tables.

measured 2026-10-07T05:42:02.869Z against http://127.0.0.1:8802/photography/analytics; 10 loads per page and device, round-robin over the pages (load 1 of every page, then load 2 of every page, ...), 500 ms between loads; a fresh browser context for each load, so the browser cache is cold every time. "first byte" = request sent to first byte; "document" = request sent to the last byte of the HTML (these pages stream: the first byte arrives early and the document completes when the data-dependent HTML has been sent, so this is the server-time figure that follows the data); "end" = navigation start to last byte of the document (includes connection setup). Sizes in KiB. Percentiles are nearest-rank (the 90th percentile of 10 loads is the 9th value).

| device | page | n | first byte med / p90 (ms) | document med / p90 (ms) | document, load 1 / loads 2+ median (ms) | end med / p90 (ms) | document KiB med | all resources KiB med / p90 | LCP med / p90 (ms) | requests med | CLS max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | `/operator` | 10 | 508 / 679 | 509 / 680 | 922 / 509 | 510 / 683 | 25.7 | 232.8 / 232.8 | 660 / 888 | 29 | 0.005 |
| desktop | `/operator?section=albums` | 10 | 245 / 393 | 246 / 394 | 394 / 246 | 248 / 396 | 24.2 | 193.0 / 193.0 | 300 / 444 | 24 | 0.000 |
| desktop | `/operator?section=photos` | 10 | 382 / 459 | 383 / 460 | 404 / 383 | 384 / 461 | 24.3 | 327.6 / 327.6 | 480 / 608 | 37 | 0.000 |
| desktop | `/operator?section=measurement` | 10 | 2,011 / 2,117 | 2,012 / 2,118 | 2,118 / 2,012 | 2,014 / 2,120 | 27.0 | 195.7 / 195.7 | 2,064 / 2,172 | 24 | 0.000 |
| desktop | `/operator?section=sources` | 10 | 265 / 372 | 266 / 373 | 253 / 284 | 267 / 374 | 23.5 | 192.3 / 192.3 | 312 / 416 | 24 | 0.000 |
| desktop | `/operator?section=preferences` | 10 | 524 / 662 | 525 / 663 | 646 / 525 | 527 / 666 | 25.7 | 232.8 / 232.8 | 740 / 824 | 29 | 0.005 |
| desktop | `/operator?scope=album&albums=Re7kho` | 10 | 349 / 425 | 350 / 426 | 381 / 350 | 352 / 428 | 17.9 | 221.1 / 221.2 | 412 / 472 | 29 | 0.001 |
| desktop | `/operator?section=albums&scope=album&albums=Re7kho` | 10 | 105 / 144 | 106 / 145 | 179 / 106 | 109 / 147 | 16.2 | 184.9 / 185.0 | 156 / 188 | 24 | 0.000 |
| mobile | `/operator` | 10 | 491 / 544 | 634 / 686 | 611 / 655 | 636 / 688 | 25.7 | 232.8 / 232.8 | 1,284 / 1,344 | 29 | 0.000 |
| mobile | `/operator?section=albums` | 10 | 253 / 271 | 386 / 401 | 289 / 386 | 387 / 403 | 24.2 | 193.0 / 193.0 | 688 / 704 | 24 | 0.016 |
| mobile | `/operator?section=photos` | 10 | 297 / 360 | 430 / 492 | 454 / 430 | 432 / 493 | 24.3 | 304.4 / 327.7 | 1,524 / 1,592 | 37 | 0.000 |
| mobile | `/operator?section=measurement` | 10 | 1,808 / 2,018 | 1,953 / 2,164 | 1,953 / 2,013 | 1,954 / 2,166 | 27.0 | 195.8 / 195.8 | 2,244 / 2,464 | 24 | 0.000 |
| mobile | `/operator?section=sources` | 10 | 249 / 299 | 378 / 431 | 281 / 379 | 380 / 433 | 23.5 | 192.4 / 192.4 | 660 / 724 | 24 | 0.000 |
| mobile | `/operator?section=preferences` | 10 | 416 / 484 | 558 / 625 | 506 / 580 | 559 / 626 | 25.7 | 232.8 / 232.8 | 1,144 / 1,280 | 29 | 0.000 |
| mobile | `/operator?scope=album&albums=Re7kho` | 10 | 327 / 456 | 430 / 558 | 461 / 430 | 432 / 559 | 17.9 | 221.2 / 221.2 | 1,128 / 1,244 | 29 | 0.000 |
| mobile | `/operator?section=albums&scope=album&albums=Re7kho` | 10 | 103 / 140 | 251 / 253 | 253 / 251 | 252 / 254 | 16.2 | 185.0 / 185.0 | 588 / 596 | 24 | 0.014 |

Loads that did not return 200, showed "report unavailable", or logged an error: 20 of 180.
- desktop /sites load 1: status 200, unavailable 1, errors []
- desktop /sites load 2: status 200, unavailable 1, errors []
- desktop /sites load 3: status 200, unavailable 1, errors []
- desktop /sites load 4: status 200, unavailable 1, errors []
- desktop /sites load 5: status 200, unavailable 1, errors []
- desktop /sites load 6: status 200, unavailable 1, errors []
- desktop /sites load 7: status 200, unavailable 1, errors []
- desktop /sites load 8: status 200, unavailable 1, errors []
- desktop /sites load 9: status 200, unavailable 1, errors []
- desktop /sites load 10: status 200, unavailable 1, errors []

Non-GET requests aborted before sending: 0 across 180 loads.


### Local, current main (a8bfd28)

Same method, machine and session as the table above.

measured 2026-10-07T05:33:04.917Z against http://127.0.0.1:8801/photography/analytics; 10 loads per page and device, round-robin over the pages (load 1 of every page, then load 2 of every page, ...), 500 ms between loads; a fresh browser context for each load, so the browser cache is cold every time. "first byte" = request sent to first byte; "document" = request sent to the last byte of the HTML (these pages stream: the first byte arrives early and the document completes when the data-dependent HTML has been sent, so this is the server-time figure that follows the data); "end" = navigation start to last byte of the document (includes connection setup). Sizes in KiB. Percentiles are nearest-rank (the 90th percentile of 10 loads is the 9th value).

| device | page | n | first byte med / p90 (ms) | document med / p90 (ms) | document, load 1 / loads 2+ median (ms) | end med / p90 (ms) | document KiB med | all resources KiB med / p90 | LCP med / p90 (ms) | requests med | CLS max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | `/home` | 10 | 384 / 431 | 384 / 432 | 447 / 384 | 386 / 433 | 6.4 | 164.4 / 164.4 | 448 / 480 | 28 | 0.000 |
| desktop | `/albums` | 10 | 283 / 425 | 284 / 426 | 426 / 284 | 285 / 428 | 12.4 | 138.1 / 138.2 | 324 / 476 | 23 | 0.000 |
| desktop | `/albums/Re7kho` | 10 | 698 / 721 | 700 / 722 | 678 / 706 | 701 / 724 | 12.9 | 2,370.4 / 2,370.5 | 760 / 776 | 97 | 0.000 |
| desktop | `/albums/DWdCET` | 10 | 542 / 674 | 543 / 674 | 860 / 543 | 544 / 676 | 13.0 | 1,680.6 / 1,680.6 | 596 / 728 | 80 | 0.000 |
| desktop | `/albums/Re7kho?recap=7` | 10 | 718 / 941 | 719 / 942 | 719 / 720 | 721 / 943 | 13.6 | 2,073.7 / 2,073.8 | 780 / 996 | 87 | 0.000 |
| desktop | `/photos` | 10 | 406 / 493 | 407 / 494 | 393 / 440 | 408 / 495 | 13.2 | 254.8 / 254.8 | 448 / 532 | 36 | 0.000 |
| desktop | `/sites` | 10 | 65 / 111 | 65 / 111 | 53 / 67 | 67 / 112 | 4.5 | 157.4 / 157.4 | 104 / 156 | 27 | 0.000 |
| desktop | `/data` | 10 | 2,020 / 2,188 | 2,022 / 2,190 | 1,880 / 2,117 | 2,024 / 2,192 | 15.0 | 146.0 / 146.0 | 2,064 / 2,232 | 24 | 0.000 |
| desktop | `/settings` | 10 | 2 / 4 | 2 / 4 | 4 / 2 | 4 / 7 | 3.1 | 136.5 / 136.6 | 44 / 56 | 29 | 0.000 |
| mobile | `/home` | 10 | 470 / 650 | 513 / 693 | 454 / 611 | 514 / 695 | 6.4 | 164.5 / 164.5 | 868 / 1,040 | 28 | 0.000 |
| mobile | `/albums` | 10 | 402 / 595 | 476 / 670 | 439 / 536 | 478 / 672 | 12.4 | 138.2 / 138.2 | 888 / 1,080 | 23 | 0.000 |
| mobile | `/albums/Re7kho` | 10 | 718 / 1,564 | 799 / 1,646 | 686 / 1,083 | 800 / 1,648 | 12.9 | 238.9 / 238.9 | 1,184 / 2,036 | 36 | 0.000 |
| mobile | `/albums/DWdCET` | 10 | 804 / 1,233 | 881 / 1,316 | 790 / 896 | 883 / 1,318 | 13.0 | 241.0 / 241.0 | 1,260 / 1,708 | 36 | 0.000 |
| mobile | `/albums/Re7kho?recap=7` | 10 | 1,008 / 1,281 | 1,091 / 1,361 | 948 / 1,112 | 1,093 / 1,362 | 13.6 | 239.5 / 239.5 | 1,500 / 1,744 | 36 | 0.000 |
| mobile | `/photos` | 10 | 455 / 626 | 536 / 708 | 536 / 551 | 538 / 710 | 13.2 | 236.2 / 236.3 | 924 / 1,104 | 34 | 0.000 |
| mobile | `/sites` | 10 | 90 / 132 | 190 / 190 | 190 / 190 | 191 / 192 | 4.5 | 157.4 / 157.5 | 544 / 544 | 27 | 0.000 |
| mobile | `/data` | 10 | 1,946 / 2,267 | 2,035 / 2,351 | 2,035 / 2,163 | 2,037 / 2,352 | 15.0 | 146.0 / 146.0 | 2,396 / 2,720 | 24 | 0.000 |
| mobile | `/settings` | 10 | 2 / 2 | 183 / 184 | 175 / 183 | 184 / 185 | 3.1 | 136.6 / 136.6 | 528 / 532 | 29 | 0.000 |

Loads that did not return 200, showed "report unavailable", or logged an error: 0 of 180.

Non-GET requests aborted before sending: 0 across 180 loads.

## Limits

- Locally, `/sites` cannot be compared. The old `/sites` renders its "Traffic report unavailable" page without a Cloudflare token (the script excludes unavailable reports, so the old local `/sites` rows have n = 0), and the new `/sites` renders its reduced no-provider form (about 4.6 KiB of HTML). The local `/settings` row is small for the same reason: its provider calls are absent. Production is the only place those two pages are measured with their real content.

- Production caches were not controlled and the pages were captured on the same host minutes earlier, so "load 1" is not a guaranteed cold start. The spread inside a column (median against the 90th percentile) is the better guide to how much of a figure is cache state.
- A single Mac, a single network path, Chromium only. The mobile profile is a throttle, not a phone.
- The baseline is six days older than the measurement, covers two pages, and ran under different conditions (above). The local before and after tables are the like-for-like comparison, with the limits stated there: no provider calls, no compression, a different network path from the production edge.
