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
