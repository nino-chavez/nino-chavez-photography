# Photography refit, October 30, 2026

The current preview restores an owned full-bleed photograph and puts useful actions over its edges: event search, the two latest galleries and About & contact. The image remains the first impression. Recent-event covers follow below. Gallery links still open the complete event; photo links open their chosen photograph with Save, Share and Download.

Nino approved a further clarity pass while preserving the dominant photograph. Search now has a visible label and solid button. Recent galleries names the event shortcuts, each with an underlined View gallery action. About & contact replaces Info and has a visible outline. The image, crop, scrim and hero height remain unchanged; the navigation wraps on narrow phones so its labels stay complete.

The [action-clarity capture packet](../../../evidence/screen-reviews/photography-actions-20261030/manifest.json) records the current source and four browser frames. The parent opened all four before a cold reviewer assessed only those frames and the visitor's jobs. All four passed: desktop home, phone home, short-phone home and phone gallery. The review found the photograph still leads, the finder remains legible, and the actions are recognizable and coherently grouped. No material visible issue was found. Operator dispatch `3d9b385d-7fc9-47c7-a35f-c1aa19ed4780` completed successfully; its runtime receipt reports `gpt-5.6-terra`, medium reasoning. This is visual review, not real-visitor testing.

All twelve focused Chromium journeys pass with the new labels. An initial parallel run had one blank-app failure alongside a local static-server broken pipe; the complete serial rerun passed without source changes. The new packet includes 1440×1000, 390×844 and 320×568 viewports. This pass remains confined to the preview; it does not port the design to production Svelte routes.

Open `arrival/?page=home` for the revised homepage. The [experience brief](../../../../prototype/EXPERIENCE-BRIEF.md) records Nino's explicit correction and the refit scope. This is a working design artifact; live Svelte routes, publication and private-gallery access are unchanged. Passing checks do not mean Nino accepted the rendered design.

The lead and font are original assets already in this repository, exposed to the static server through the relative `assets` symlink. `arrival/app.source.js` imports the native fitted-row helper; the generated bundle keeps photo order and aspect ratios without forcing landscapes into portrait boxes. The prior complete-gallery, contextual viewer, save/download/share and return behavior survives. The design toolbar now follows the page so it cannot define the first impression.

Twelve focused Chromium checks pass on desktop and phone viewports, including a short 320×568 viewport. They exercise event search, the latest-event shortcut and return focus, Info and focus restoration, full-gallery/photo links, natural photo proportions, selection persistence, actual JPEG/ZIP download, failure recovery, query escaping and cross-site new tabs. The parent opened the [revised capture packet](../../../evidence/screen-reviews/photography-refit-20261030/manifest.json); these are browser captures, not physical-phone or visitor-acceptance evidence.

The [cold review and disposition](../../../evidence/screen-reviews/photography-refit-20261030-cold.md) pass the revised home, gallery, viewer, saved, recent-event and no-results states. Info was revised to introduce the actual photographic practice; a fresh review passes its desktop and phone frames. The affected desktop/phone journeys pass again. The final manifest verifies twenty files.

The earlier studies and their reviews follow as rejected history. The current preview's source and image hashes are recorded in the new packet; previous capture packets remain frozen.

---

# Rejected arrival study, October 30, 2026

The homepage helps a visitor find photos from their event. A gallery link skips event discovery. A photo link opens that photo directly, keeping its event and the route to the rest of the gallery visible.

Nino chose event-photo finding as the homepage priority after rejecting the earlier layout alternatives. The [experience brief](../../../../prototype/EXPERIENCE-BRIEF.md) records this choice, the arrival jobs and the remaining production decision.

## Try the complete journey

Open `arrival/?page=home`, search “Chicago Point” or “10/24/2026”, open the event, inspect a photo, save two, then download the selection. Direct arrivals are `arrival/?gallery=aBZN7D` and `arrival/?gallery=aBZN7D&photo=DSC00189`. The review bar exposes those entries and the gallery task alternatives.

The revised proof contains all 49 Chicago Point photos and all 36 Picture Day photos, read from their published API on October 30. The earlier 12-photo samples are not reused. Public source URLs are retained in `arrival/data.js`. All images retain their full frame. The archive contains eight recent public events; the other six open the live gallery in a new tab. No private/unlisted galleries, credentials, database connections or publication changes are involved.

Downloads finish the task: the existing public download proxy supplies a JPEG, and the existing `client-zip` dependency builds selected-photo ZIPs. Sharing copies the public photo URL with its album key. Saved state uses a separate preview-only localStorage key and openly falls back to page-lifetime storage when persistence is blocked. The same event identity remains visible in the viewer, including the position in the complete gallery.

## Gallery task comparison

| Model | Finding photos | Inspecting and keeping photos |
|---|---|---|
| Browse, then inspect | Full gallery grid; multiple images available for recognition | Open the photo, with Save, Share and Download; close to the same tile |
| Inspect beside the gallery | Large current photo beside a smaller grid on desktop | Current photo's actions remain associated; the phone stacks the two areas |
| One photo at a time | First image is open; the whole set is behind a disclosure | Immediate detailed viewing; finding another image needs sequencing or opening the grid |

The proposed combination is the first model for gallery links and the full viewer for photo links. This follows the choice the link has already supplied. The other models remain inspectable; there is no claim that a usability study established the recommendation.

## Validation and limits

The focused Playwright suite passes ten checks across 1440×1000 and 390×844, with a separate 320×568 failure/recovery case. It covers complete gallery counts, home search and return context, direct photo context, keyboard navigation, save/remove/persistence, clipboard fallback markup, canonical share links, query escaping, download failure/retry, new-tab cross-site links and horizontal overflow. The overflow assertion was deliberately made to fail with an injected wide element before the element was removed.

A real single-photo JPEG reached the browser with JPEG magic bytes. A real ZIP containing only `aBZN7D-DSC00124.jpg` and `aBZN7D-DSC00125.jpg` reached the browser; ZIP integrity passed and both entries contain image bytes. This proves browser delivery in the test environment, not a physical-device save or real visitor acceptance. No outgoing share was sent. The parent also tested slash-formatted date search in the in-app browser.

Run the study tests with `PHOTOGRAPHY_ARRIVAL=1` and `PLAYWRIGHT_BASE_URL` pointing to the static comparison server. Captures default to ignored `.temp/photography-arrival/captures` so later test runs cannot overwrite the reviewed packet. Build the browser bundle from `arrival/app.source.js` with the existing esbuild dependency; it includes the installed client-zip implementation. No production Svelte route or configuration has changed, so a native production build/reader receipt is not claimed.

The retained [capture packet](../../../evidence/screen-reviews/photography-arrival-20261030/) contains whole browser viewports, including phone-width emulation. The parent opened the actual home, gallery, viewer and saved frames before cold review. Physical phone and VoiceOver checks are not claimed; OS accessibility appearance settings were not measured. The first cold review recommends the gallery grid and calls for a shorter phone header. That revision moves the first row from about 435px to 351px at 390px width, keeps full photo frames, and replaces the ambiguous disclosure label with a visible search icon and “Search photos.” The [review and disposition](../../../evidence/screen-reviews/photography-arrival-20261030-cold.md) retain the original findings. Final captures are in the packet’s `final/` directory. A fresh final phone review passes the homepage, gallery-link and photo-link frames. Production selection remains open.

---

# Photography comparison, October 30, 2026

The first three layouts were rejected by Nino. They remain below as reference; no production selection was made.

| Direction | What leads | Tradeoff |
|---|---|---|
| A — Gallery wall | A continuous selection of complete photographs | Strongest portfolio introduction; event browsing moves to its own page. |
| B — Event desk | Search, dates and identifiable event rows | Direct for returning visitors; the portfolio has less prominence. |
| C — Work + galleries | Selected photographs beside a finder and recent galleries | Both jobs are visible immediately; the opening shows fewer photographs than A. |

The [experience brief](../../../../prototype/EXPERIENCE-BRIEF.md) owns the reader, scope and preservation requirements. Selection is pending; no design approval is inferred from passing checks. The [baseline review](../../../evidence/screen-reviews/photography-20261030-baseline-cold.md) records the current site's visible problems. The three directions use the same neutral palette to make their structural differences easier to compare.

## Preview and boundaries

Serve this directory on loopback. Its `index.html` accepts `?c=A`, `?c=B` and `?c=C`. Navigate through Photographs, Galleries and Saved; switch direction while viewing a gallery to compare the same content. Search “Chicago Point,” open that event, open a photograph, save it, then close and return to results.

This is a static design comparison with real public content, not a production backend. `data.js` retains the canonical source URL for every gallery and photo. Eight recent public gallery cards and twelve-photo samples from the newest four were read from the live DOM on October 30, 2026. Dates come from published album titles and detail pages. Gallery 18s/17s context is preserved. Older entries, the full archive, collection/date pages and downloads open their actual public destinations. Local saves use a separate preview storage key. Share copies the canonical public link.

Portfolio images are the existing public set in `src/lib/portfolio.ts`, referenced at their published URLs. The fixed ordering makes this comparison repeatable; the production port must preserve the approved per-visit starting variation without moving the images mid-visit. No private/unlisted galleries, share tokens, original media ingestion, identity detection or database calls are involved.

## Checks and limits

The dedicated Playwright suite exercises all three directions at 1440×1000 and 390×844, plus a 320×568 failure/recovery pass. It checks event and photo search, no matches, save/remove/persistence, blocked storage, image-request failure, keyboard viewer navigation, return focus, query preservation, no page errors and new-tab profile/writing links. Eight tests passed. A visible 2000px-wide element proves the overflow detector can fail before it is removed.

The first capture pass exposed a blank decoded-image frame despite loaded requests. Photo tiles now request synchronous decoding, and happy-state captures wait for visible images to have natural dimensions and finish decoding. That is a rendering check, separate from the search and navigation assertions. A fresh pass captured the gallery with photographs visible.

Run the focused suite with `PHOTOGRAPHY_RETHINK=1` and `PLAYWRIGHT_BASE_URL` pointing to this static server. It skips by default so it does not become a production-app dependency. No Svelte component or app route was edited; the production reader receipt and native build are not claimed for this prototype.

Captures and their source hashes are retained in [the comparison packet](../../../evidence/screen-reviews/photography-20261030-concepts/manifest.json). These are real browser renders on macOS, including phone-width emulation. Physical phone, VoiceOver, full native-gallery regression, production deployment and acceptance in real use remain untested. OS contrast and bold-text settings were not read. The parent personally opened the home, archive, gallery, viewer and no-results captures before cold review.

The [cold comparison review](../../../evidence/screen-reviews/photography-20261030-concepts-cold.md) is preserved verbatim with the parent’s verification. Its archive-context defect is contradicted by the exact named captures. Its hierarchy and sidebar critiques are recorded as selection tradeoffs; this is not an unqualified design acceptance.

Commit review found one unescaped month query value in the preview result count. The regression check failed on the original code, the output is now escaped, and the full eight-check suite passes. This repair changes no visible normal-state design. The cold-review packet stays frozen at its recorded hashes; later regression-run screenshots are kept separately while the comparison is open.

## Earlier selection status

Nino rejected all three directions. They remain available as rejected reference. These layouts must not be ported. The arrival study above owns the next product decision and any later native implementation.
