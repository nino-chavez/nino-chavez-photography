# Mechanical tier for the third fix pass

Measured results of automated gates on the captured screens, kept apart from the captures so a cold reviewer can judge the screens from the images alone. This file says what was run, what each gate returned and what was not covered. It judges nothing about whether a screen is good.

Source tree: branch `fix/analytics-acceptance-3` at 423551e. Captures were taken on 2026-10-07 between 20:33 and 22:02 UTC (Chicago date 2026-10-07). Most surfaces were captured more than once while the code was still changing; the files and the numbers below are the last capture of each surface, role, engine and width (`harness/assemble3.py`), taken after the last edit to that surface.

## Result in one table

Over 104 page loads (13 surfaces, visitor and owner, Chromium and WebKit, phone and desktop; default, contrast-more and forced-colors on every load, 200% and 312% text on the phone loads):

| gate | result |
| --- | --- |
| tests | `npm run analytics:contract:test`: 547 tests, all pass (537 before this pass). Every sentence this pass changes has a test: the download window sentences (four cases), the arrival sentence, the recovered-date rule (all, some, none), the verdict word (above, below, level, one earlier launch), the unsorted share (most, not most, half, 50.4%, none, unread), the recap lead and its sentence splitter, the stale next step on both sides of the day its first week ends, the timing sentence in both stored positions, the launch-over evidence, the next steps, and the two Data start dates |
| `npm run check` | 0 errors. 5 warnings in 4 files this pass did not touch (`AlbumCard.svelte`, `VideoPlayer.svelte`, `routes/albums/+page.svelte`, `routes/explore/+page.svelte`) |
| `npm run build` on Node 22.22.0 | passes, including `check:head`, the navigation contract test and `reader:check:gallery`, after the receipt in `docs/reader-audits/gallery-interface.json` was recorded for the final interface source (digest `sha256:b7947fe9...`, 203 source files). The receipt says the review was the worker's own and what it did not cover |
| overflow, at all five settings | 0 offenders at default, contrast-more and forced-colors on 104 loads each, and at 200% and 312% on 52 phone loads each. The header's navigation links are not offenders at 312%: they are inside a scroller whose links take focus |
| 44 px targets | 0 under 44 px of 2,176 measured |
| text that did not grow at 200% and 312% | 0 groups of 7,348 texts compared |
| keyboard, Tab only | 2,362 stops (default, with WebKit's Alt+Tab pass), 0 without a visible ring; 1,138 stops in forced colours, 0 without an outline |
| axe (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice), 260 runs at default, contrast-more and forced colours | 0 violations |
| own text contrast, same settings | 0 below WCAG AA of 21,160 checked |
| console errors, page errors, failed requests, HTTP status 400 or more | 0 |
| non-GET requests | 0 sent. 0 aborted: the local server serves no analytics script. Every request of the 15,680 was a GET |
| requests to another `*.ninochavez.co` host | 0 |
| images | 0 broken. The two album reports on a phone report 49 and 32 images "incomplete": these are the photo tiles beyond the first 12, which are hidden until "Show all" and so are never fetched (lazy-loaded, `display: none`) |
| first screen and navigation reach at large text (`harness/firstscreen.mjs`, changed this pass) | at 200% and 312%, on 8 pages, in Chromium and WebKit: 32 of 32 pass (2 engines, 2 sizes, 8 pages), none fail. The old assertion ("the navigation is one row") encoded the second pass's design and is replaced by two: every link, once focused as Tab focuses it, ends fully inside the row (or the wrapped rows) and clear of the fade; and a row that scrolls shows an arrow |
| rendered words (`harness/words.mjs`, new) | 0 hits in 52 loads (13 surfaces, both roles, phone and desktop) for "collector", "linked-journey", "denominator", "backfill", "Grid showings", "src=", "Downloads, week", "event snapshot" and the stale "while attention is still arriving"; 4 of 4 planted hits were found. Four stored recaps still say "tagged links" in their own text; that phrase is not on the list |
| dates on Data (`harness/isodates.mjs`, new) | 0 ISO dates in the words of the Data page for either role; a planted one was found for both |

## Forced failures

Every gate was made to fail once on purpose, on the local harness, in each engine and at each width, then the plant was removed.

- The ten gates of the second pass (`harness/forced.mjs`, unchanged in logic; output in `forced-failures.txt`, first section): 54 checks fired, none did not fire.
- The first-screen and navigation gate, three plants in each engine (second section): a header that fills the first screen (heading at 1,138 px of 844), an arrow that is not drawn, and a row whose tabbed-to link ends up under the fade (`scroll-padding-inline: 0`). Each plant was made on a page that passed first. 6 of 6 fired.
- The rendered-words gate (third section): a sentence with "collector" planted into Home fired on all four Home loads (visitor and owner, phone and desktop) and on no other.
- The ISO-date check (fourth section): a sentence with "2026-09-29" planted into Data fired for both roles.

The first run of the new navigation gate failed on the real page, which is how its two defects were found (status.md, "The navigation decision"): at 312% it reported "Albums" and "Data" not reachable, and after the fade was made narrower it still reported "Albums". The gate passed only after the code changed, not after the gate did.

## What differs from the second pass

| item | value |
| --- | --- |
| Visitor role | The same local development server as the owner role, plain GETs, no sign-in cookie. So the visitor pages here have no Cloudflare page loads and no PostHog results: they show "not available right now" (Site, Home) and "could not be read" (Data) |
| Owner role | A harness owner answered by `preload.mjs` on the local server (`ADMIN_EMAILS` is a test value), read-only. No real sign-in |
| Server | This worktree's `vite dev` on Node 22.22.0, reading production Supabase with `.env.local` exported into the process by `node --env-file`. `preload.mjs` aborts the process on any Supabase write, any RPC outside the read allowlist, and any auth call other than the user check |
| Findings text | Served from a read-only dry run of the next scheduled refresh, not from the stored snapshot. `harness/dryrun.mjs` runs the real launch evidence loader and the real rules through the same preload (reads only), writes the findings to a file, and `preload.mjs` returns them in place of the findings in the stored snapshot row. Without it the captures would show the words of the last refresh ("collector", the repeated median, "Open the album report..."), which the code no longer produces and the first scheduled run after deploy replaces. Stored recap text is not replaced |
| Engines | Chromium (Playwright headless shell), WebKit (Playwright build). WebKit is not Safari |
| Settings | default, contrast-more, forced-colors, 200% text and 312% text |
| Home's traffic read | Home reads how the newest launch's counted opens were sorted for its first week: one more `analytics_read_scheduled_gallery_report` call, for the album, matching the preload's read allowlist. `harness/trafficprobe.mjs` is the probe that showed the gallery's last 7 days hold no unsorted opens, which is why the sentence is about the launch |

## Not covered

- A screen reader, and a person using the owner forms.
- Cloudflare page loads and PostHog results with real numbers: the development server has no credentials, so those panels were only seen in their not-available states.
- Safari on a device at an accessibility text size, and a person tabbing or swiping the navigation row.
- The stored findings and recaps as production will store them after deploy: the findings are a dry run, the recaps are as stored.
- The Playwright specs under `tests/` were not run. A search of `tests/` and `scripts/` for the header's classes, the comparison table's labels and region name, the Albums columns, and the words this pass changed found none of them.
