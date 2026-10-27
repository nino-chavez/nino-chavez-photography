# Photo strip homepage — October 26, 2026

Nino selected C — Photo strip: “go with photo strip.” The selected structure and rejected alternatives are preserved in [the initiative comparison](https://github.com/nino-chavez/public-site-rethink/pull/11). This change replaces the single-photo split opening with an uncropped horizontal strip, visible previous/next controls, a substantial phone portrait and an event finder directly below. It retains neutral charcoal, independent navigation, native photo viewing, public gallery ranking, archive search, dates, Saved and collection routes.

The base sequence uses the exact original files from the comparison; the October 27 follow-up below varies its starting point per visit. Desktop includes two landscapes; narrow screens use twelve portraits. The initial release repeated six portraits below recent galleries; the approved follow-up below removes that duplication. No inferred album membership, new identity metadata, or gallery-data writes are introduced. The existing album loader is unchanged.

## Rendered checks

The parent inspected the actual desktop and mobile whole-screen captures, next-frame states, narrow screen, viewer, and empty/unavailable states. The latter two are injected client-data fixtures rendered through the native component, not observed production outages. Populated captures and search use the real public gallery data. Four viewport sizes: 1280×900, 1280×720, 390×844 and 320×568. These are browser emulations, not physical-device acceptance.

The ten homepage Playwright checks passed: complete frame proportions, strip paging, keyboard focus and viewer return, real event search, native navigation, responsive overflow and JavaScript-disabled access. Additional checks exercised repeated input under reduced motion, image-request failure with working search, and empty/unavailable fixtures. No page JavaScript errors were observed during capture. The Svelte tool reported no issues; its optional attachment suggestion was not applied to the retained dialog binding. `npm run check` reports no errors and five pre-existing warnings outside the changed page. Production build includes the refreshed interface-reader receipt.

## Cold review and source check

The independent cold reviewer opened the listed captures before reading implementation details. Operator dispatch `1ff81c7e-a977-4c02-979f-64642e26f2ce` completed with runtime `gpt-5.6-terra`, high. Its initial report:

Visible findings:

- `desktop-next.png` and `mobile-next.png`: advancing the photograph strip leaves a conspicuous empty black block to the right of the final visible image. It reads as an unfinished gallery frame rather than deliberate negative space, especially on phone where about one fifth of the hero is blank. Smallest remedy: have the final visible image fill the remaining strip width, using the established crop behavior.

- `desktop-full.png` and `mobile-full.png`: “Skin Abrasions” appears among the newest event galleries with unrelated imagery. For a parent trying to identify a volleyball event, it weakens the event-list signal. Smallest remedy: keep non-event work out of “Recent galleries,” or label and place it as a separate collection.

Untested interaction: the captures make the event search, event links, photograph navigation, and viewer controls visually clear, but cannot establish that they work.

Opened captures: `desktop.png`, `mobile.png`, `small-mobile.png`, `short-desktop.png`, `desktop-full.png`, `mobile-full.png`, `desktop-next.png`, `mobile-next.png`, `mobile-viewer.png`.

The parent reproduced the blank next-frame state. Network-complete images could still be waiting for asynchronous decoding at the instant of paging. Eager loading alone did not fix the immediate capture. The strip now loads its finite fourteen-image edit at low priority after the lead and uses synchronous decoding to avoid a blank paint on reveal. The final `desktop-next.png` and `mobile-next.png` were captured immediately after Next and show the adjacent photographs. Full frames are preserved; cropping was not the remedy. Original image payload totals 1,282,454 bytes and duplicate image URLs are reused by the browser.

The taxonomy suggestion was not applied: “Recent galleries” intentionally lists the existing public galleries, including non-sports photography. Hiding a real gallery based on its title would expand this presentation change into a publication decision.

One focused independent check (dispatch `3c6f009f-a47e-476b-b479-8b4638f1cdee`, runtime `gpt-5.6-terra`, medium) ran after the eager-loading change and before the final decoding fix:

Opened exactly: `desktop-next.png`, `mobile-next.png`, `mobile-unavailable.png`, `desktop-empty.png`.

- `desktop-next.png`: a large black unfilled region remains to the right of the two loaded photos. The two photos themselves are contiguous; no gap appears between them.
- `mobile-next.png`: no visible photo-strip gap; the loaded photograph fills the strip width.
- `mobile-unavailable.png`: event finder remains clear; recovery copy plainly says recent galleries are temporarily unavailable and directs visitors to the event archive.
- `desktop-empty.png`: event finder remains clear; empty-state copy says new event galleries will appear when published.

The unavailable and empty captures are treated as injected fixture states, not production-outage evidence. This is static capture review only; it does not establish actual-device or interaction acceptance.

The parent reopened the cited images rather than accepting the mobile no-gap claim. The final decoding fix was verified in fresh desktop and mobile frames; no further broad review was requested. Empty/unavailable fixtures keep the event finder and recovery copy clear. Physical touch, VoiceOver and a full-site regression audit remain outside this review.

## Follow-up: one photo presentation and direct navigation

Nino explicitly requested removal of the repeated grid and a Photographs link to the strip. The homepage now has one visible photographic presentation, followed by the event finder and recent galleries. The `photographs` fragment belongs to the strip wrapper on both desktop and mobile; the removed grid's unused styles and default viewer argument are gone.

Header and footer Photographs links use native fragment navigation. The first cross-route test reproduced SvelteKit's focus-reset behavior overriding the fragment's scroll margin: the strip landed at viewport zero beneath the sticky header. Native fragment navigation preserves the margin. The focused homepage suite now checks returning from Events through the header link and returning from the footer, along with the existing viewer, paging, search and no-JavaScript paths. The negative run failed on the header offset before the correction.

Fresh whole-page and anchor-landing captures are `desktop-no-grid.png`, `mobile-no-grid.png`, `desktop-photographs-link.png` and `mobile-photographs-link.png`. The parent opened the captures. A bounded independent cold review (Operator dispatch `6ee2c8f3-cd02-4bb3-ac64-37e278bf9e24`, confirmed runtime `gpt-5.6-terra`, medium) found no material visible issue. Its visual verdict does not establish interaction behavior; the browser tests cover the changed navigation. Physical-device and VoiceOver acceptance remain untested.

The first public-site run found an intermittent footer return failure at 320px. A small browser probe reproduced it once in ten runs: the page had finished loading, the link called `scrollIntoView`, and focus remained on the footer because the strip wrapper was not focusable. Making that destination programmatically focusable with `tabindex="-1"` passed ten repeated probes and moves keyboard focus with the view. The new focus assertion failed before the correction; all ten homepage checks pass locally afterward. Final navigation captures are unchanged. Trace recording itself timed out during teardown and is not used as evidence for the page failure.

## Random starting point — October 27, 2026

Nino requested a random opening on each homepage visit. This preserves the selected photo-strip design: the same photographs, full frames, charcoal, navigation, event finder and viewer. Each server load chooses a starting point and rotates the existing desktop and mobile sequences. That choice is included in the original HTML and stays unchanged through hydration, photo viewing, and same-page navigation. There is no timed reshuffle; random draws can repeat across separate visits.

The homepage response is private and not stored, so a browser or shared cache cannot reuse one opening for every visit. A 60-second cache holds only completed, successful public-gallery data within a warm worker; failed reads are retried. Concurrent cache misses load independently, so one cancelled request cannot leave another awaiting its database work. This follows [Cloudflare's guidance to share completed data rather than request-owned I/O](https://developers.cloudflare.com/workers/observability/errors/#cannot-perform-io-on-behalf-of-a-different-request). It retains the prior freshness window without changing album ranking or visibility. Cold workers can still read the database. Photograph-file caching is unchanged.

The new visit check failed before the change because all eight openings were identical. All eleven homepage checks pass afterward: varying server-rendered openings, unchanged order after hydration, all fourteen desktop or twelve mobile photos retained exactly once, stable same-visit navigation, viewer images matching strip order, event discovery, keyboard return and no-JavaScript access. Svelte analysis reports no issues; the retained dialog binding receives only an optional suggestion. Type checking reports zero errors and five existing warnings elsewhere.

The parent opened the real desktop and mobile captures. Two different openings per viewport are recorded in `random-desktop-1.png`, `random-desktop-2.png`, `random-mobile-1.png` and `random-mobile-2.png`; `random-visits.json` records their first image and cache header. These are actual public-gallery data and browser viewports, not physical-device or VoiceOver acceptance.

The independent cold review completed in Operator dispatch `da422c87-ecb6-4488-b72e-d64a7641844f` (reported runtime `gpt-5.6-terra`, high). It called the first desktop/mobile captures clear, but claimed missing navigation and event search in the second pair. The parent reopened those exact two files: both show the full Nino Chavez header, navigation, strip controls, event finder and recent galleries. Those two findings are not supported by the captured frames, so no layout change was made in response. The production build and refreshed interface receipt pass.

The commit review caught a request-owned promise in the first cache implementation. The repair caches only completed successful results. All eleven homepage checks pass against the built Cloudflare runtime. Two cancelled requests were followed by six successful concurrent responses and another successful response; each included real recent-gallery data. An initial local build lacked its build-time environment and exercised the unavailable state instead. That run is not counted as gallery acceptance; the corrected build uses the project's existing settings without changing environment files.
