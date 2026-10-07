# Redirects, checked on the production build

Branch `feat/analytics-old-addresses` at 6cffd17, 2026-10-07.

## How this was checked, and which column came from what

- **Worker** column: `wrangler pages dev` serving the production build (`.svelte-kit/cloudflare`). The report host is simulated with a `Host` header, which the worker does pass through. This is the only run in which `reroute`, SvelteKit's base check and `handle` happen in their real order. It had no database settings, so it can only be asked for answers that need none: a redirect, or a 404.
- **Second hop** column: the worker asked for the `Location` itself. Anything but 308 means the redirect is one hop. The 500 and 503 come from pages that need the database, which this worker does not have; they are not redirects. `/settings` needs none and answers 200.
- **Landing** column: the vite dev server asked for the *internal* address of the `Location` (`/photography/analytics/...`), reading production through the write-blocking preload. Dev answers 404 to any path outside `/photography`, including `/sites` and `/albums` on the report host, so it cannot be asked for clean addresses. Rows the dev server answered 404 for clean addresses in an earlier run are not in this table.
- A real redirect carries `X-Frame-Options: DENY`, set by the app's hook. An edge Page Rule forward does not.

## The reroute is load-bearing (forced failure)

With `oldAddressReroute` removed from `src/hooks.ts`, a rebuild, and the same worker, `/gallery?section=photos&period=7` answers **404 with no `X-Frame-Options`** and `/gallery/export.csv?period=7` answers 404: SvelteKit refuses a path outside `/photography` before `handle` runs, so the redirect never fires. With the reroute restored, the same request answers `308 -> https://analytics.ninochavez.co/photos?period=7`. The unit tests that call `handle` directly pass either way; only this run shows it.

A second forced failure, on the mapping itself: three deliberate faults in `old-addresses.ts` (the CSV target spelled `/photoz`, the `measurement` case renamed, Home given a query) made 12 of 47 tests in `old-addresses.test.ts` and `hooks.server.test.ts` fail; restored, all 47 pass.

## The table

Every old address in this table answers 308 once, with a `Location` on the report host. Methods other than GET and HEAD are not redirected.

| # | Host | Old address | Worker | Location | Second hop (worker) | Landing (dev, internal path) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | analytics.ninochavez.co | `/gallery` | 308 | `https://analytics.ninochavez.co/` | 500 | 200 |
| 2 | analytics.ninochavez.co | `/gallery?section=overview` | 308 | `https://analytics.ninochavez.co/` | 500 | 200 |
| 3 | analytics.ninochavez.co | `/gallery?section=overview&period=7&measure=downloads&compare=publication_age` | 308 | `https://analytics.ninochavez.co/` | 500 | 200 |
| 4 | analytics.ninochavez.co | `/gallery?scope=album&albums=Re7kho&period=custom&start=2026-09-25&end=2026-10-02` | 308 | `https://analytics.ninochavez.co/albums/Re7kho` | 500 | 200 |
| 5 | analytics.ninochavez.co | `/gallery?section=albums` | 308 | `https://analytics.ninochavez.co/albums` | 503 | 200 |
| 6 | analytics.ninochavez.co | `/gallery?section=albums&scope=album&albums=Re7kho` | 308 | `https://analytics.ninochavez.co/albums/Re7kho` | 500 | 200 |
| 7 | analytics.ninochavez.co | `/gallery?section=albums&scope=selected&albums=Re7kho,fJKdsB,jq1Rp7` | 308 | `https://analytics.ninochavez.co/albums?compare=Re7kho%2CfJKdsB%2Cjq1Rp7` | 503 | 200 |
| 8 | analytics.ninochavez.co | `/gallery?section=photos` | 308 | `https://analytics.ninochavez.co/photos` | 500 | 200 |
| 9 | analytics.ninochavez.co | `/gallery?section=photos&period=7&measure=downloads&photo_rank=rising&photo_page=1` | 308 | `https://analytics.ninochavez.co/photos?period=7&measure=downloads&photo_page=1&photo_rank=rising` | 500 | 200 |
| 10 | analytics.ninochavez.co | `/gallery?section=photos&period=custom&start=2026-09-25&end=2026-10-02&scope=album&albums=Re7kho&traffic=conservative&compare=none` | 308 | `https://analytics.ninochavez.co/photos?period=custom&start=2026-09-25&end=2026-10-02&scope=album&albums=Re7kho&traffic=conservative&compare=none` | 500 | 200 |
| 11 | analytics.ninochavez.co | `/gallery?section=photos&compare=publication_age&period=7` | 308 | `https://analytics.ninochavez.co/photos?period=7&compare=publication_age` | 500 | 200 |
| 12 | analytics.ninochavez.co | `/gallery?section=sources` | 308 | `https://analytics.ninochavez.co/data#arrivals` | 500 | 200 |
| 13 | analytics.ninochavez.co | `/gallery?section=sources&period=7` | 308 | `https://analytics.ninochavez.co/data?period=7#arrivals` | 500 | 200 |
| 14 | analytics.ninochavez.co | `/gallery?section=sources&scope=album&albums=Re7kho` | 308 | `https://analytics.ninochavez.co/albums/Re7kho` | 500 | 200 |
| 15 | analytics.ninochavez.co | `/gallery?section=measurement` | 308 | `https://analytics.ninochavez.co/data` | 500 | 200 |
| 16 | analytics.ninochavez.co | `/gallery?section=measurement&period=90&event_page=3` | 308 | `https://analytics.ninochavez.co/data?period=90` | 500 | 200 |
| 17 | analytics.ninochavez.co | `/gallery?section=analytics-preferences` | 308 | `https://analytics.ninochavez.co/settings` | 200 | 200 |
| 18 | analytics.ninochavez.co | `/gallery?section=preferences` | 308 | `https://analytics.ninochavez.co/settings` | 200 | 200 |
| 19 | analytics.ninochavez.co | `/gallery?section=bogus` | 308 | `https://analytics.ninochavez.co/` | 500 | 200 |
| 20 | analytics.ninochavez.co | `/gallery?scope=album&albums=NoSuchAlbum1` | 308 | `https://analytics.ninochavez.co/albums/NoSuchAlbum1` | 500 | 404 |
| 21 | analytics.ninochavez.co | `/gallery/export.csv?period=7&measure=photo_opens` | 308 | `https://analytics.ninochavez.co/photos/export.csv?period=7&measure=photo_opens` | 500 | 200 text/csv |
| 22 | analytics.ninochavez.co | `/gallery/export.csv?period=custom&start=2026-09-25&end=2026-10-02&scope=album&albums=Re7kho&measure=downloads&compare=none&shortlist=` | 308 | `https://analytics.ninochavez.co/photos/export.csv?period=custom&start=2026-09-25&end=2026-10-02&measure=downloads&scope=album&albums=Re7kho&compare=none&shortlist=` | 500 | 200 text/csv |
| 23 | analytics.ninochavez.co | `/photography/analytics/operator` | 308 | `https://analytics.ninochavez.co/` | 500 | 200 |
| 24 | analytics.ninochavez.co | `/photography/analytics/operator?section=photos&period=7` | 308 | `https://analytics.ninochavez.co/photos?period=7` | 500 | 200 |
| 25 | analytics.ninochavez.co | `/photography/analytics/operator/export.csv?period=7` | 308 | `https://analytics.ninochavez.co/photos/export.csv?period=7` | 500 | 200 text/csv |
| 26 | analytics.ninochavez.co | `/photography/analytics?period=30` | 308 | `https://analytics.ninochavez.co/` | 500 | 200 |
| 27 | ninochavez.co | `/photography/analytics/operator?section=measurement&period=7` | 308 | `https://analytics.ninochavez.co/data?period=7` | 500 | 200 |
| 28 | ninochavez.co | `/photography/analytics` | 308 | `https://analytics.ninochavez.co/` | 500 | 200 |
| 29 | ninochavez.co | `/photography/analytics/operator/export.csv?period=7` | 308 | `https://analytics.ninochavez.co/photos/export.csv?period=7` | 500 | 200 text/csv |
| 30 | 127.0.0.1:5420 | `/photography/analytics/operator?section=photos&period=7` | 308 | `http://127.0.0.1:5420/photography/analytics/photos?period=7` | 500 | 200 |
| 31 | 127.0.0.1:5420 | `/photography/analytics/operator?scope=album&albums=Re7kho` | 308 | `http://127.0.0.1:5420/photography/analytics/albums/Re7kho` | 500 | 200 |

Requests that must not redirect (worker):
- POST analytics.ninochavez.co `/gallery?/saveReport`: 404 (no redirect)
- POST analytics.ninochavez.co `/photography/analytics/operator?/saveReport`: 404 (no redirect)
- POST ninochavez.co `/photography/analytics/operator?/saveReport`: 404 (no redirect)
- GET ninochavez.co `/gallery`: 404 (no redirect)
- GET analytics.ninochavez.co `/gallery/other`: 404 (no redirect)
- GET analytics.ninochavez.co `/sites?period=7&section=profile`: 500 (no redirect)
- HEAD analytics.ninochavez.co `/gallery?section=photos&period=7`: 308 -> https://analytics.ninochavez.co/photos?period=7
- the app's own redirect carries X-Frame-Options: DENY (an edge Page Rule forward would not)

All rows: one 308 hop from the worker, no second hop, and the landing page answers as expected.

## Limits of the mapping

- A fragment on an old address (`#photos`, `#sources`) is never sent to the server. It survives the redirect and lands on a page that has no such anchor, so it does nothing. Where a section maps to a place on a page, the redirect carries its own anchor instead (`/data#arrivals`).
- `period=custom` with dates has no equal on `/data`, which reads 7, 30 or 90 days. It is dropped there and kept everywhere the page reads dates (`/photos`, `/photos/export.csv`).
- `compare=publication_age` on a photo view reads as no comparison there: same-age comparison is the album index's job.
- `intelligence_snapshot` and `event_page` are not carried over.
- A browser that cached the earlier `/photography/analytics/operator` -> `/gallery` 308 takes one extra hop and still lands correctly.

## Production edge, before this change is deployed

`curl -s -D -` against `https://analytics.ninochavez.co`, 2026-10-07 03:41 UTC. A response with `x-frame-options: DENY` came from the app. One without it came from the edge or from SvelteKit's base check.

| Request | Answer | Source |
| --- | --- | --- |
| `/gallery`, `/gallery?section=albums`, `/gallery?section=photos&period=7`, `/gallery/export.csv?period=7` | 200 | the app (old report, still deployed) |
| `/photos`, `/photos/export.csv` | 404, no `x-frame-options` | SvelteKit's base check, before `handle`: the proof that the new addresses are not intercepted by any rule, and that they need the reroute |
| `/` | 200 | the app (Home) |
| `/albums`, `/data`, `/settings` | 200 | the app |
| `/?section=overview` | 301 -> `/photography/analytics/sites?section=overview` | **Page Rule 49cd0626** (the edge; no `x-frame-options`) |
| `/?period=7` | 301 -> `/photography/analytics/sites?period=7` | **Page Rule 49cd0626** |
| `/photography/analytics/operator`, `/photography/analytics` | 308 -> `/gallery` | the app (the old redirect this change replaces) |

Findings, with nothing changed on Cloudflare:

1. No Page Rule intercepts `/gallery`, `/gallery/export.csv`, `/photos` or `/photos/export.csv`, so none of the new redirects is hidden.
2. Rule 49cd0626 catches every root address with a query, so the app never sees one: `/?section=overview` goes to the site report, not to Home. That is why no redirect to Home carries a query. If a link to `/?x=1` is ever expected to open Home, that rule is the thing in the way.
3. The rule's destination is the internal path (`/photography/analytics/sites?...`, read from the 301's `Location`), which the app then redirects again to `/sites`, so every root link with a query takes two hops. Proposed change for Nino to approve, not made: set the rule's forward target to `https://analytics.ninochavez.co/sites?$1` (the same query handling, the clean path), which makes it one hop. The rule's stored pattern is as DEPLOY.md documents; it was not read through the API in this session.
