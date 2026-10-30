---
surface: public-photography
kind: cold
build: live-2026-10-30
device: macOS Chrome desktop and phone browser viewports
reviewer: gpt-5.6-terra high, dispatch 948796cc-4d25-4b81-a636-9f202010c3c0
implementer: prior production implementation
cold: true
states: [home, archive, gallery, viewer]
verdict: revise
---

Packet and map: [photography-20261030-baseline](photography-20261030-baseline/).
The parent opened all seven frames before dispatch. Browser phone emulation is not physical-device acceptance. The public homepage rotates its starting photo per visit.

**Revise.** The photography is immediately compelling, and finding an event is visible, but the event-to-photo path needs a clearer hierarchy for someone trying to locate a specific set or image.

What the eye finds:

- **Frames 1, 5:** photographs first, then the site identity/navigation, then the “Find your event” search.
- **Frames 2, 6:** page title and instruction first, search/filter controls second, event cards third.
- **Frames 3, 4, 7:** the selected photo or album title first, then download/share and navigation controls.

| Element | Classification | Visual finding |
|---|---|---|
| Homepage photography and event finder (1, 5) | Correct | Establishes both the work and a concrete next step without explanation. |
| Event search and filters (2, 6) | Usable but weak | Clear controls, but mobile leaves “Latest photos” isolated on its own row. Combine filters/sort or make that final control full-width. |
| Event-card titles and metadata (2, 6) | Defect | Several desktop event names truncate before the distinguishing detail, while a separate year repeats information already in the title. Preserve more of the title; demote or remove redundant year labels. |
| “Popular in this album” first (3) | Appealing but wrong | Attractive photography, but it competes with the returning visitor’s likely need to browse the whole event or find a particular image. Demote it below the main photo browsing surface. |
| Lightbox action set (4, 7) | Usable but weak | Download, share, close, count, and next-photo controls are visible. A save action is not visibly represented in the image view, despite “Saved” being a primary site destination. |
| Desktop lightbox utility controls (4) | Unnecessary / weak | Icon-only zoom controls add visual weight before their purpose is clear; the photo, close action, and next-photo control should remain dominant. |

Material observations:

1. **Frame 2:** event titles are the decision-making content, but ellipses hide important distinctions. The card overlay is visually strong yet less informative than it needs to be.
2. **Frame 6:** the mobile filter layout reads as two related controls plus one orphaned control. This makes filtering feel more laborious than the desktop version.
3. **Frame 3:** search within the album is well labeled, but “Popular in this album” occupies the first browsing position. That is a mismatch for a person returning to locate a specific photo.
4. **Frames 4 and 7:** the image viewer clearly supports download and sharing, but not visibly saving. Mobile also reduces the viewer context to a count, action icons, and the image; it does not visibly identify the photo.
5. **Frames 1 and 5:** the visual work itself is the strongest part. Keep the selected-photographs presentation and the direct event-finding language; they explain the site quickly.

Parent disposition: title truncation, disconnected mobile sort, repeated popularity emphasis and missing visible save in the viewer are supported by the supplied frames. Concepts test clearer names, tighter archive controls, immediate full-set browsing and a labelled save action. No claim about task completion speed or accessibility acceptance follows from these captures.
