# Rebaseline: design around arrival and the photo task

## Production port, authorized October 30

Nino's “ship it” authorizes the approved photography preview to become the native site. The homepage now uses the original spotlight pool, randomized start, eight-second automatic progression and 1.2-second crossfade, with fixed event actions and visible pause/step controls. Browse Galleries, Browse Timeline, About & contact and Saved remain explicit. The complete fourteen-photo Selected Works strip lives at `/photography/work`.

The native app reads live published gallery and timeline data through its existing server loaders and access controls. It does not ship the study's JSON snapshots. Direct gallery arrivals show the ordered photo grid before popularity suggestions. Date jumps clear the sticky year/month bar; reduced motion makes them instant. Existing photo addresses, native viewer, saved photos, original downloads and private-share routes retain their owners. Profile, writing and coverage links open separate tabs.

The production review and evidence are recorded in [the design review](../docs/design/concepts/photography-20261030/REVIEW.md). The sections below preserve the design history; statements limiting earlier work to a static preview do not describe this production port.

## Current direction: artful photography with immediate actions

Nino declined the arrival study in PR 237 and clarified why on October 30: the design had become sterile and resembled basic photography templates. Finding event photos is still the homepage's functional priority, but it must coexist with the site's photographic character. The original full-bleed hero and overlays deliberately joined those needs: the photograph establishes the experience; immediate actions lead to Nino's info, recent events and finding a gallery.

This clarification supersedes the utilitarian search-first presentation and any rule below that forbids all text overlays. Use full-bleed photography on the homepage with deliberately placed, legible controls. Preserve complete frames when inspecting or downloading photographs; the full-bleed hero may use an intentional responsive composition. Do not mistake a user job for a visual style, remove the artist from the experience, or treat passing tests/cold review as user acceptance. Recover the original owned design and assets before choosing new visual treatments. No new approval prompt is needed merely to execute this explicit direction.

### Automatic Selected Works progression, corrected October 30

Nino clarified that the original hero's automatic progression must return; manual-only browsing did not fulfill the request. Scope is preserve: change the homepage Selected Works motion and its playback control while keeping the full-bleed compositions, randomized starting offset, fixed event actions, gallery browsing and date timeline.

The canonical `PremiumHero.svelte` advances every eight seconds and crossfades for 1.2 seconds. The preview follows that cadence, preloads the next composition, and keeps the current photograph if the next cannot load. Previous/next and native swiping remain available; an explicit Pause/Play control stops or resumes automatic advancement. Manual input resets the interval, repeated input cancels an in-progress fade, and wrapping from last to first uses the same fade. Nothing moves the event finder, recent-gallery actions, keyboard focus or page scroll.

Autoplay pauses when the hero is offscreen, the tab is hidden, a dialog is open, a pointer gesture is active, or an input/photograph region has focus. Returning starts a fresh interval. Reduced motion starts paused; a visitor may explicitly press Play to opt into instant photo changes without a fade. Changing the system preference to reduced motion stops playback. Local navigation preserves the visitor's explicit pause choice and image index. Desktop and phone browser recordings cover automatic progression, a settled photograph, pause/resume and manual interruption; focused tests also cover reduced motion, offscreen suspension and loading failure. This corrects the manual-only motion brief below; it is not a new design direction or a native-site port.

### Browsing and Selected Works recovery, requested October 30

Nino asked to name the navigation Browse Galleries, restore Browse Timeline with the date bar, and make the recent-event actions harder to overlook. He also identified the lost randomized, scrolling homepage spotlight photographs for Selected Works. This extends the same full-bleed direction; the earlier single fixed hero is superseded. The visitor needs three clear paths: find an event, browse photographs by date, and explore the selected work.

Browse Galleries opens the existing event index without the hero. Browse Timeline restores the public archive's sticky year/month bar, chronological month previews, scroll-following active date, and direct date jumps. A public snapshot from the existing `/photography/api/timeline` endpoint supplies all 49 months and 294 featured photos, read October 30 (local time). It does not substitute recent events for the archive. Month links open the complete live month in a new tab; the local viewer opens the featured photograph and returns to its exact trigger. The study notes disclose the snapshot and six-photo month previews. The native route and database are unchanged.

Selected Works uses the canonical `src/lib/portfolio.ts` pool: twelve portraits and two landscapes, with source alt text. The desktop hero restores single-landscape and portrait-triptych compositions within the approved full-bleed canvas; phones use the portrait set. A randomized starting offset is chosen once per page load and stays stable through local navigation. The Selected Works page has the full fourteen-photo strip and a full-frame viewer. Recent-gallery rows now have a translucent background and a large, contrasting View gallery action; the whole event is one link. Navigation remains visible on phones.

Motion brief: visitors operate the finder and browse photographs. Native horizontal scrolling/swiping and instant previous/next controls change the work; the event overlays do not move. Date jumps are instant and focus the visible month heading. There is no timer, entrance sequence, scroll hijack or automatic progression; reduced motion retains the same instant behavior. Repeated input goes directly to the chosen frame or date. Browser Back restores timeline context; closing a photograph restores focus without changing scroll. Review all paths on desktop, phone and a short phone, plus a second randomized start. Keep the full-bleed image, owned assets, factual labels, direct-gallery jobs and independent-site links.

### Clearer actions, approved October 30

Nino approved a bounded clarity pass on the preview: retain the dominant full-bleed photograph and make the existing actions apparent. The event form now has a visible Search button. “Just added” becomes “Recent galleries”; each event has a written “View gallery” action and an internal-navigation arrow. “Info” becomes “About & contact” with an outlined control. The same photo, crop, scrim, hero size and placement of the action groups remain. Short screens retain the recent-event jump; the header wraps when needed to keep the full labels readable. This is a preserve pass, not another concept or a native-site implementation.

### Refit implemented in the working preview

Intent: **refit** of the restored full-bleed direction, scoped to the local design preview. The user supplied the direction directly; another three-layout exercise would reopen a settled choice. The live Svelte routes are not changed by this study.

```text
Homepage: photograph fills the screen
  Top edge: identity / Info / Saved
  Lower edge: find an event / two newest event links
  Scroll: recent event photographs / full archive
Gallery link: event context / fitted full-photo rows
Photo link: chosen image / event context / Save, Share, Download
```

Fixed: use owned photographs; let them establish the homepage; make event access and Info immediate; preserve source facts, photo/download frames and independent-site links. Guided: readable overlays at the image edges, with faces clear; use the original charcoal and Montserrat identity. Open choices resolved here: one stable lead photo, search at the lower left, two latest events at the lower right, and a compact Info dialog. On short phones, the recent-event jump replaces the two shortcuts so the photo and search remain visible.

Source: `PremiumHero.svelte` and the homepage at commit `7437b0c762b2dd895fd28ee5644dffcd3b706c21` establish the owned full-bleed/scrim approach. `static/images/hero/flickday/fd-12.webp` and its mobile derivative provide the original lead. The preview references existing assets through a relative symlink, not a new asset library. Montserrat comes from the existing local font. No new illustration, synthetic photograph, biography, slogan or claim was created.

Palette: charcoal `#181818`, field charcoal `#222222`, near-white `#f5f5f2`, secondary text `#c1c1bb`; the photograph supplies color. Montserrat is reserved for identity and major headings; existing Arial/Helvetica remains on controls and metadata. The hero alone carries the expressive scale. Recent events use large photographic covers with text below. Info introduces volleyball and action-sports coverage, including club, high school and college matches evidenced by the published galleries, followed by verified contact, coverage, Instagram and profile destinations. No automatic animation or timed slide change was added.

Useful grafts from the rejected study: complete public galleries, the contextual photo viewer, working save/download/share, and returning to the same originating event or photo. Gallery rows now reuse `src/lib/gallery/photo-row-layout.ts`, retaining order and true aspect ratios. Grid Save controls keep accessible names while removing repeated text labels. The generic search-first homepage, portrait letterboxes and review toolbar at the top were removed. The original rejected versions remain recoverable in git and their frozen evidence packets.

Validation: the parent opened whole-screen desktop and phone renders. Twelve focused browser checks pass, including short-phone access to search, Info focus return, latest-event return focus, natural image proportions, complete gallery counts, saved state, canonical links, real JPEG/ZIP delivery, failure recovery and query escaping. Phone captures are browser emulation, not physical-device proof. The revised packet is `docs/evidence/screen-reviews/photography-refit-20261030/`.

The arrival study below remains an unselected functional experiment. Its complete-gallery, contextual photo-link, save, download, share and return behavior can inform the next design; its generic visual presentation must not set the direction.

Nino rejected all three October 30 concepts: “none of htese. think first principles of hte job to be done when landing on the site or coming to the site from a gallery link”. The previous comparison is retained as rejected work, not a production direction.

The next design starts from separate arrival paths and reaches a useful outcome. It must not ask someone with an event-gallery link to rediscover their event or interpret the site structure before seeing their photos. Homepage arrival must explain what is here and provide a direct route to the visitor's purpose. Establish the jobs, context already supplied by the link, uncertainties and supported final actions before drawing another layout. Any role priority remains a product hypothesis unless evidence supports it.

## Arrival jobs

Nino selected **“Find photos from their event”** as the homepage's clearest first path on October 30. This is a product priority, not an observed traffic distribution. Portfolio exploration and requesting coverage remain secondary.

| Arrival | Context already supplied | Next question | Useful outcome |
|---|---|---|---|
| Homepage | Photographer/site, possibly an event or team name | Where are the photos from my event? | Identify the correct event by name, date and cover, then open it |
| Gallery link | Event and access path | Which photographs do I want? | Recognize photos in the full event set, inspect them, download or share; save several for one download |
| Photo link | A specific photo and its event | Can I keep this, share it, or see the rest? | Open that image immediately, with download/share/save and a clear route into its event |
| Return to saved photos | A previous browser-local selection | Where are the photos I chose? | Resume or download the selection, with the browser-local limit visible |

The direct gallery must not start with an unrelated portfolio, event search or popularity subset. A gallery recipient should see the complete set before choosing a photograph; a photo recipient has already made that choice. The viewer therefore preserves the event name, date and full-set position. Closing returns to the originating photo. Saving is a step toward collecting/downloading; it is not an account or social feature.

## Surfaces

- Homepage: find an event; recent public galleries; search and recovery.
- Full gallery: 49-photo Chicago Point and 36-photo Picture Day examples, including all photos, saved selection and optional description search.
- Direct photo: full-frame image, event identity, Save, Share, Download, Previous/Next and return.
- Saved photos: browser-local selection grouped by event; remove and download.
- Download/share: real JPEG and selected ZIP delivery through the existing public service; canonical URL copy with album disambiguation.
- Secondary selected work and coverage links; profile/writing open new tabs.

## Decisions before presentation

Search by event/team/date belongs on the homepage. Descriptive photo search stays inside the selected gallery and is optional; it does not promise name or face recognition. The source supports visible-number/description matching, not reliable person identity. Download offers preserve the existing full-size and 1600px image variants and the existing personal-use/recruiting notice. A generated ZIP reaching the browser is not proof that the person saved it to their device.

Three complete gallery task models are compared in the [arrival study](../docs/design/concepts/photography-20261030/arrival/index.html): a photo grid followed by a viewer; a selected photo beside the gallery; and one photo at a time with a gallery disclosure. They share the same event, all 49 photos and final actions. The comparison now asks how someone finds and keeps photos, not which front-page arrangement looks best. The homepage priority is fixed by Nino's answer, so it is not reopened in those variants.

Proposed convergence: show the grid for a gallery link, open the viewer for a photo link, and keep event discovery on the homepage. Inspecting one arbitrary photo first makes event recognition slower in principle; the side-by-side layout competes for thumbnail space and becomes sequential on a phone. These are design judgments to check against renders, not measured visitor outcomes. Production selection is still pending.

## State and recovery

| Object | Actions | States | Return or recovery |
|---|---|---|---|
| Event | Search, open | Recent, matching, no match | Keep query and focus when returning; link to full archive; private galleries use the received link |
| Photo | View, navigate, save, share, download | Available, image loading/failure | Full-frame image; meaningful alt; return to original tile; retain event context |
| Selection | Save/remove, view, download | Empty, populated, storage unavailable | Local browser persistence; visible temporary-save warning if storage fails |
| Download | Choose size, prepare, cancel | Preparing, browser handoff, failure | No success claim on failed fetch; selection survives; retry stays available |
| Share | Copy public URL | Ready, copied, clipboard unavailable | Selectable canonical link includes the album key; no outgoing message is sent |

The neutral charcoal canvas, full photo frames and independent-site boundaries survive. Typography and spacing serve recognition and action: readable event titles outside photographs; full-set context in the viewer; visible actions without hover. No new animation, account, payment, taxonomy, metadata inference, image processing or access mechanism.

## Evidence and boundary

The parent opened the live gallery and share menu. Opening the first Popular image in the 49-photo Chicago Point event produced “1 / 12” and an action-based title, with no visible Save. This is an observed context discontinuity, not a measured abandonment rate. Source inspection confirmed the existing individual, all-gallery and saved-selection download paths. The study uses only explicitly public gallery keys and retrieves all 49 and 36 image records from the published API; the retained `arrival/data.js` records those sources. It neither changes production routes nor touches private/unlisted data. Sharing points to the existing live site; saves use a separate preview key. The archive has eight recent examples; the other six open their public live galleries.

The prior brief follows for provenance. Its three layouts are superseded; its factual source, privacy, independent-site and full-photo constraints survive.

---

# Photography: see the work, find your gallery

Intent: **rethink**, requested by Nino on October 30, 2026. This comparison reopens public presentation, not publication, taxonomy, image processing or access control. The existing analytics brief remains separate.

## Surfaces

- Homepage and selected photographs.
- Public event-gallery discovery, including search and no results.
- Event gallery and photo search.
- Photo viewer, saved photographs and return to the originating photo.

## Reader and job

A new visitor wants to see the photography. A player, parent or client returning after an event wants a particular gallery and photograph. They may arrive at the homepage, a shared event, or a shared photo, often on a phone.

The screen must answer: whose work is this; which event is shown; how do I find mine; what can I do with a photograph; how do I return to the same place?

Copy mode: interface documentation. Carry factual precision and concrete verbs from the canonical voice guide; do not import essay rhythm or invent Nino's experiences. Preserve event names, age groups, dates, photo identifiers, privacy and licensing terms. Split already-published names into title/context/date without changing their meaning. No new taxonomy or inferred identities.

## Observed baseline

The parent opened live home, archive, gallery and viewer, plus phone-width home/archive/viewer. The [cold baseline](../docs/evidence/screen-reviews/photography-20261030-baseline-cold.md) identifies truncated event names, a detached mobile sort control, popularity content preceding the main gallery, and no visible save action in the viewer. These are rendered observations, not measured usability outcomes.

The current charcoal and complete photo frames remain useful. Two overlapping searches and dense card overlays require visitors to interpret the interface before using it.

## Character and limits

Character: photographic, direct, spacious, legible, grounded.

Anti-goals: a social feed; a generic creator landing page; text over faces; an analytics dashboard; a copy of the profile or publication.

Theme is fixed neutral charcoal, independent of system appearance. Use #181818 canvas, #222222 fields, #f5f5f2 primary text, #b9b9b3 supporting text and #555552 control boundaries. Photographs supply color. One sans-serif family, Arial/Helvetica, follows the current home and leaves the photography distinct from the editorial blog. Body 16px; metadata at least 14px; headings sized by task rather than repeated giant introductions. Keep readable text outside image areas.

Density: desktop opening shows complete photographs and a visible route to galleries; B/C show at least two identifiable gallery choices. Phone opening shows a photograph (A), gallery choice (B), or finder plus photograph (C). Home is at most three 900px desktop screens; A's selected-work gallery is allowed longer because scrolling photographs is the task. Archive shows eight real recent galleries in this comparison. Gallery sample contains twelve photos, explicitly labelled as a preview beside the real total.

Native scroll, links, input labels and browser Back remain familiar. No automatic animation, horizontal scroll trap, scroll hijacking or timed carousel. No motion is introduced; feedback is immediate. A whole-photo viewer has visible Close, Previous, Next and Save, keyboard arrows/Escape, focus containment, and return focus to the originating tile. Keep controls outside faces. Image failures retain description and a public source link.

## Three structures

```text
A Gallery wall          B Event desk              C Work + galleries
Identity / navigation   Identity / navigation     Identity / navigation
Selected work + finder  Search / date filters     Photo pair | Event finder
Full-frame photo wall   Month / event rows        Photo pair | Recent galleries
Recent galleries        Selected-work link        Recent gallery cards
```

A gives the work the strongest introduction and uses a separate gallery archive. B gives a returning visitor the shortest route, with a chronological list and persistent event context beside an open gallery. C places selected work and gallery discovery alongside one another, stacking the finder before photographs on phones. The same content and working gallery/viewer/saved states appear in each; these are structural alternatives, not palette choices.

Hierarchy: photographs carry the portfolio; name/date/cover identify an event; the open photograph owns the viewer. No popularity badges or per-photo category pills. Search is named for its scope: “Find a gallery” versus “Search this gallery.” Global photo search, dates, collections, contact and cross-site links remain available through real public links where the comparison does not reproduce their backend.

## Objects, ownership and recovery

| Object | Owner | Actions | States | Reverse / return |
|---|---|---|---|---|
| Selected photograph | Nino, existing public asset | Open, move between photos | Available, loading, unavailable | Close to same tile |
| Gallery | Existing public archive | Search name/date, open, share | Populated, no matches, unavailable | Clear search; preserve query and focused gallery |
| Photo sample | Existing public gallery | Open, search number/description | Populated, no matches, image failure | Clear search; close to same photo |
| Saved photo | Visitor in this preview browser | Save, remove, reopen | Empty, populated, storage unavailable | Remove; state stays independent of production |
| Download/share | Existing live gallery | Open live source for download; copy canonical link | Success, clipboard unavailable | Keep viewer open; expose selectable link on failure |
| Cross-site link | Profile/publication | Open separate site | Link available | New tab preserves photography context |

Entry/return: homepage → filtered archive → gallery → viewer → originating photo → filtered archive. A direct gallery link offers “All galleries”; a filtered entry offers “Back to results.” Search state lives in the URL. Browser Back reverses navigation and focus/scroll are restored. Saved opens the saved photograph without losing its gallery identity.

## Evidence and prototype boundary

All images are existing public originals/derivatives. Eight event cards and twelve-photo samples from the four newest public galleries were captured from the live DOM on October 30. Sources are retained in `data.js`; no private or unlisted content, database connection, secret, or production data write is used. Other archive entries link to their real public gallery in a new tab. The review bar discloses the finite comparison and download boundary. Prototype saving is local only; sharing copies a real public URL.

Original Instagram references: [concrete words](https://www.instagram.com/p/DeZw-SxhfC-/), [grouping and whitespace](https://www.instagram.com/p/DehgzGJt7mJ/). Both were inspected earlier in this conversation; the profile repository's `docs/design/concepts/profile-20261030/REFERENCES.md` owns that evidence. Apply understandable action labels, keep related information together, and remove competing emphasis. Do not import the videos' unverified performance claims.

## What survives a production port

Public-only loaders, canonical photo URLs, unlisted capability safety, URL filters, pagination/video behavior, save/download/share, collections/date routes, visible-only view tracking, image proportions, native keyboard paths and independent photography navigation. Preserve Nino's per-visit portfolio rotation without moving images during a visit. Profile/writing open new tabs. No database or configuration changes are in scope.

Selection is pending. Nino's named choice becomes the direction; the two rejected concepts stay available for comparison and useful details can be retained explicitly. The comparison itself changes no production route.
