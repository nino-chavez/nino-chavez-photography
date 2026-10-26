# Photo strip homepage — October 26, 2026

Nino selected C — Photo strip: “go with photo strip.” The selected structure and rejected alternatives are preserved in [the initiative comparison](https://github.com/nino-chavez/public-site-rethink/pull/11). This change replaces the single-photo split opening with an uncropped horizontal strip, visible previous/next controls, a substantial phone portrait and an event finder directly below. It retains neutral charcoal, independent navigation, native photo viewing, public gallery ranking, archive search, dates, Saved and collection routes.

The production sequence is stable and uses the exact original files from the comparison. Desktop includes two landscapes; narrow screens use twelve portraits. Six portraits repeat below recent galleries as ordinary entry points to the viewer. No inferred album membership, new identity metadata, or gallery-data writes are introduced. The existing album loader is unchanged.

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
