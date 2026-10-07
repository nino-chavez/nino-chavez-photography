# `/data` speed, before and after

Numbers from lab loads on one Mac. They are not field data. No production measurement was taken: this branch is not deployed, and the instructions for this pass ruled out production writes and Cloudflare changes. A production run of `scripts/measure-analytics-performance.mjs` against `https://analytics.ninochavez.co/data` is still to do once it ships.

## What the page waited on

Timed read by read with a scratch timer on the development server (the timer was removed before the commit). Before, the page waited for all of this before sending a byte:

| read | finished at | note |
| --- | --- | --- |
| album names, album visibility, freshness, incidents, delivery diagnostics, site actions | 50 to 120 ms | each its own quick query |
| gallery summary (daily counts, traffic classes, sources, browser estimate, evidence rows) | about 520 ms | the summary, then the evidence rows and the browser estimate one after the other |
| recorded event counts | about 1,900 ms | starts after the summary; reads every event row in the dates asked for (1,000 rows at a time), then looks up each event's latest traffic class |

The event counts were the wait: about 1.4 s after everything else had finished. Step 8 had added the browser estimate to every load, but that is one call inside the 520 ms.

## What changed

- The event counts no longer hold the page. They are a streamed part (SvelteKit's streamed promises, the same way the linked journeys already were). The page is sent without them, shows "Loading the detailed event counts. The rest of this page is ready.", and fills them in when they arrive. If they cannot be read the section says so and the headline changes with it (`withNotRead`, tested).
- They start as soon as the public album names are read (about 60 ms), not after the gallery summary.
- The gallery summary reads its three parts (summary, evidence rows, browser estimate) together instead of one after another.

## Local production build, same settings for both

`scripts/measure-analytics-performance.mjs` against a production build served by `wrangler pages dev` (workerd) on this Mac, reading production Supabase with the project's `.env.local` passed as bindings to that process only. No Cloudflare or PostHog credentials, so those two calls do not happen on either side. 10 loads per page and device, a fresh browser context for every load, 1,500 ms between loads, pages in round-robin, Chromium 153 (headless shell), the script's fixed mobile throttle (150 ms, 1.6 Mbps, 4x CPU). Before is `f25bbcb` (the parent). After is this branch. Both measured in one sitting, one server at a time. Milliseconds, median / 90th percentile (nearest rank). Raw results: `perf/before-local.json`, `perf/after-local.json`.

| device | page | measure | before | after |
| --- | --- | --- | --- | --- |
| desktop | `/data` | first response | 2,010 / 2,279 | 372 / 399 |
| desktop | `/data` | last byte of the page | 2,014 / 2,289 | 1,521 / 1,679 |
| desktop | `/data` | largest contentful paint | 2,056 / 2,368 | 1,572 / 1,712 |
| mobile | `/data` | first response | 1,908 / 2,125 | 349 / 422 |
| mobile | `/data` | last byte of the page | 2,000 / 2,308 | 1,648 / 1,851 |
| mobile | `/data` | largest contentful paint | 2,400 / 2,544 | 1,620 / 1,836 |
| desktop | `/home` | last byte of the page | 350 / 374 | 345 / 358 |
| mobile | `/home` | last byte of the page | 356 / 477 | 342 / 409 |

`/home` was measured as a page whose server work this pass did not change, to show the noise between two sittings: its numbers sit within it.

The page now ends sooner, by 0.5 s at the median on desktop and 0.35 s on a phone, because the event counts begin earlier and the summary's parts run together. The remaining 1.2 s is the event-count read itself. It was not made faster.

## Why first paint did not follow the first response

The first response moved from about 2.0 s to about 0.4 s: that is the page's markup, including the headline, leaving the server. In the browser the headline and first paint moved less (`perf/headline-*.json`, Chromium, 10 cold loads each; headline = the moment the `h1` is laid out):

| device | before: headline / first paint | after: headline / first paint |
| --- | --- | --- |
| desktop | 1,956 / 1,996 | 1,657 / 1,672 |
| mobile | 2,024 / 2,440 | 1,574 / 1,572 |

The reason is in the local server, not the page. `wrangler pages dev` compresses responses and holds a compressed stream until it ends, so a browser (which asks for compression) gets nothing until the last byte. Read with and without compression by `curl`, 7 loads each (`perf/first-byte.json`):

| build | compression | first body byte | headline in the markup | last byte |
| --- | --- | --- | --- | --- |
| before | none | 1,924 ms | 1,924 ms | 1,925 ms |
| before | gzip | 1,985 ms | 1,985 ms | 1,986 ms |
| after | none | 430 ms | 430 ms | 1,480 ms |
| after | gzip | 1,512 ms | 1,512 ms | 1,512 ms |

Whether Cloudflare's edge sends the page's first part to a browser before the last part is ready is not known from this run. Streaming gives the edge the chance. The measured gain that does not depend on it is the shorter last byte and the shorter largest contentful paint above.

## What this does not show

- Production timing, and production's `/data` with its Cloudflare read (the earlier production medians were 2.4 s desktop and 3.3 s phone, with phone loads from 2.0 to 14.0 s). The Cloudflare read was not touched.
- Whether the event-count read can be made faster. A call that counts the rows in the database, instead of reading each one, would probably remove most of the 1.2 s (not tried). That is a database function, which this pass may not add.
- A cold production Worker or database cache.
