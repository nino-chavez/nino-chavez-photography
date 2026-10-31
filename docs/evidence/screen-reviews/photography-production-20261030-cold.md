---
surface: photography production
kind: cold
build: native-port-20261030
device: Chromium on macOS; 1440x900, 390x844, 320x568, 612x344
reviewer: Operator f202cc27-9417-4696-bd9f-d4338c78df41, runtime gpt-5.6-terra medium
implementer: Codex parent
cold: true
states: [home, gallery-search, empty-search, album, photo, selected-work, timeline]
verdict: revise
---

The reviewer opened the frozen [capture packet](photography-production-20261030/manifest.json) using only the [visitor-job brief](photography-production-20261030/cold-brief.txt). Runtime receipt confirms completion and the model above. This is appearance review, not physical-device or visitor testing. Its original findings follow.

## REVISE

The photography is dominant and the principal visitor paths are present, but the homepage makes its three interactive offers compete rather than clarifying a next action. The rest of the capture set is broadly on-direction.

1. **What is happening / next action**

   - Homepage: a full-bleed Selected Works presentation with an immediately available event search, recent-gallery route, and navigation to timeline/contact.
   - Gallery browse: a visitor can search for an event, team, or date, then open an event gallery.
   - Gallery link: the event name, date, photo count, album search, and image grid make the destination clear.
   - Viewer: the complete photograph is presented against a dark scrim with close, sharing/download controls, and next-photo navigation.
   - Timeline: a visitor can move by year and month into date-organized photographs.

2. **Eye order**

   - Homepage: photograph first; the oversized “Find your event.” second; then the search field/button. In desktop [capture-07], the neighboring image panels and recent-gallery cards interrupt that otherwise strong order.
   - Browse Galleries: heading first, search row second, event image/card third. This is clear.
   - Album: event title first, image grid second, album-search/download controls third.
   - Viewer: photograph first, close/action controls second, count/navigation third.
   - Timeline: month’s photographs first, date navigation second.

3. **Competition**

   Necessary fix: [capture-07] has three equally assertive visual systems at once: the triptych artwork, the Selected Works control panel, and the search/recent-gallery panel. The result is visually appealing but makes the homepage’s intended first action less decisive.

   Optional polish: [capture-01] and [capture-03] give Search, three filters, and Clear filters almost equal weight. It remains usable, but the search path is visually busier than it needs to be.

4. **Remove, combine, demote, disclose**

   - Demote or consolidate the Selected Works playback/step controls on the homepage, particularly on desktop [capture-07] and mobile [capture-05]/[capture-12]. They compete directly with finding an event.
   - Demote “Saved” in the top navigation; it has equal visual prominence but is not part of the stated arrival task.
   - Keep the photographic identity, full bleed, and direct event search. Do not replace them with a conventional gallery-template hero.
   - In the photo viewer, disclose the destination/context more clearly on mobile: [capture-10] exposes only “1 / 36,” unlike the useful title visible in [capture-11]. This is a weak point for an incoming gallery visitor who opens a photo and then needs to orient or return.

5. **Classification**

| Element | Classification | Capture IDs |
|---|---|---|
| Full-bleed photography and dark presentation | Correct | 05, 07, 09, 12 |
| Event search as a homepage action | Correct | 05, 07, 12 |
| Recent-gallery route/cards | Correct | 07, 12 |
| Selected Works navigation/playback controls | Usable but weak | 05, 07, 09, 12 |
| Browse-Galleries search/results relationship | Correct | 01, 02, 03 |
| Filter row / Clear filters | Usable but weak | 01, 02, 03, 04 |
| No-results state | Correct | 04 |
| Incoming-gallery event context and photo grid | Correct | 06, 08 |
| Lightbox complete-frame presentation | Correct | 10, 11, 14 |
| Mobile lightbox contextual title | Usable but weak | 10 |
| Timeline’s date-first browsing surface | Correct | 15, 17 |
| Homepage desktop triptych alongside search | Appealing but wrong | 07 |
| Decorative intensity of Selected Works controls | Unnecessary at current prominence | 05, 07, 09, 12 |

No motion verdict: the supplied `.webm` recordings were not observable in playback here. I reviewed the PNG captures only and did not infer motion behavior from stills.

## Parent release disposition

The parent opened the native desktop and phone frames before dispatch, then checked each finding against those frames and the user's accepted preview. The independent verdict remains REVISE; it is not represented as an independent PASS.

- Homepage competition: retain the approved treatment. The user explicitly rejected a utilitarian finder and asked to keep the full-bleed photo dominant while making actions clearer. The desktop triptych, visible playback/step controls, search and recent-gallery actions match that accepted preview. In the rendered frame, the 38px finder heading and solid Search/View gallery actions outrank the 13px Selected Works control label. The three controls retain 44px targets and explicit pause access. Demoting or hiding them would reopen the choice the user just approved with “ship it”. This is a product judgment, not a claim of measured visitor performance.
- Saved prominence: retain the approved navigation. Its plain text link is quieter than the outlined contact control and solid event actions. No new attention treatment was added.
- Filter controls: optional polish; the rendered Search is solid light, while filters and Clear filters are outlined. Search has a visible label, a functional empty result and Clear filters recovery. No blocked path was found.
- Mobile photo title: the existing native lightbox shows a count and clear Close, Share and Download controls. The event context is visible before opening and restored on close; keyboard focus returns to the same photo. The separate incoming photo route retains its existing event context. Improving metadata within the mobile lightbox remains optional; this port preserves that existing viewer.
- Motion: no independent playback verdict. The parent observed native automatic progression in the in-app browser. Two normal-speed Chromium recordings show progression, a held pause and resume; separate clock-controlled behavior tests cover manual scroll, focus, reduced-motion changes and navigation. Stills do not prove motion quality.

Release disposition: accept the native port within the explicitly approved design. Functional tests and source review remain separate gates. This does not claim user research, private-gallery review or physical-phone validation.
