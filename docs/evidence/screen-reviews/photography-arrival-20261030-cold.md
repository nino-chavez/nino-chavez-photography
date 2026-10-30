# Photography arrival study: cold review

Reviewed the frozen [first-pass packet](photography-arrival-20261030/manifest-pass-1.json). Reviewer was given only the [audience, job and capture list](photography-arrival-20261030/cold-brief.txt). Operator dispatch 6f0623c6-5935-4eb9-aca8-f88aa8f26a7b completed with runtime-reported gpt-5.6-terra, high effort. Parent opened the actual frames before dispatch and verified the report against them.

## Reviewer output

**Recommend the sheet gallery model.** It is the only arrival frame that supports the core task—recognizing and selecting from a 49-photo event—without first committing the visitor to an arbitrary photo.

| Surface / model | Verdict | What the capture shows |
|---|---|---|
| Homepage | Clear as shown | The desktop and phone both lead with “Find your event photos,” a plainly labelled search field, and recent galleries with date, team/category, title, count, and image. That gives an arriving visitor several ways to identify an event. |
| Sheet gallery | Revise | The photo grid puts many choices on screen immediately: five columns on desktop and two on phone, with event identity, count, saving, sharing, download, and a discovery control visible. It best fits a gallery-link recipient who needs to find photos. On phone, the header consumes roughly the first 435 px before the first row begins. |
| Beside gallery | Wrong for the task | The desktop frame makes one arbitrary image dominant and reduces the event to six small alternatives. On phone, the selected first image occupies the only photo area visible; there is no visible evidence of the broader set at arrival. That makes “find mine” feel like sequential inspection rather than selection. |
| Sequence gallery | Wrong for the task | The first photo is almost the entire gallery body on both devices. “Photo 1 of 49” and a next arrow communicate a sequence, but not a set a visitor can search or scan. It is appropriate as a photo-viewing mode, not an event-gallery arrival. |
| Direct photo link | Clear as shown | The phone frame identifies the event and position (“Photo 35 of 49”), prioritizes the linked photograph, provides previous/next controls, actions, and a conspicuous route back to the gallery. That matches a visitor who already has the photo. |
| Saved photos | Clear as shown | The page makes the saved state and browser-local scope explicit, gives one download action for the selection, preserves event context, and shows the saved images at useful size. |

The strongest implication is structural: the sheet makes the collection visible as a collection; beside and sequence make it visible as a single-photo experience. For a 49-photo event, that distinction outweighs the aesthetic appeal of a hero image.

Material fixes:

1. Use the sheet as the gallery-link arrival; retain beside/sequence only as inspection modes after a photo is chosen.
2. Compact the sheet’s phone header. In `sheet-gallery-phone.png`, the first images start around mid-screen after title, metadata, two buttons, divider, tabs, and discovery control.
3. Make “Find a photo” read and look like an intentional primary discovery control. In every gallery frame it is a small right-aligned triangle-plus-label; the stills do not make its purpose or interaction model clear.
4. Preserve the grid when entering photo inspection, with a clear return path equivalent to the direct photo frame’s “Back to gallery.” This keeps browsing from becoming a dead-end single-photo mode.
5. On the homepage phone list, consider a slightly larger event thumbnail or stronger event-card grouping: the first card’s image is narrow beside three text lines, so title/date—not the visual—does most of the event-recognition work.

Not demonstrated by these stills: whether search or “Find a photo” works, what it searches, card/photo click targets, save persistence or recovery, share/download outcomes, keyboard/swipe navigation, loading/error states, or accessibility behavior.

## Parent verification and disposition

- Confirmed: the phone grid starts at approximately 435px. Compact its header before selection.
- Confirmed: direct photo event identity, full-set count and all actions are visible. Existing tests verify the return and action behavior separately.
- Confirmed: the beside/sequence entries subordinate collection discovery to the first photo; retain as comparison evidence, not the recommended gallery entry.
- Adopt the search-control clarity concern. Use a visible search icon and “Search photos”; do not make descriptive search a compulsory first step for a 49-photo set.
- The homepage already preserves full names, dates and full cover frames. Reduce the artificial thumbnail box on phone; do not crop faces or sacrifice event identification for a larger picture.
- A still cannot establish behavior. The interaction/download evidence is recorded separately in the owning REVIEW.md.

## Final phone review

A fresh reviewer saw only the three [final phone captures and arrival jobs](photography-arrival-20261030/final/cold-brief.txt). Operator dispatch 8d17db75-2d65-4265-8fec-95ab7675b69f completed with runtime-reported gpt-5.6-terra, medium effort. The parent opened the shortened gallery and revised home captures and rechecked the unchanged photo viewer; the visible claims below match the frames. This is rendered review, not user selection or physical-device validation.

- Homepage — Pass. “Find your event photos” and the search control own the screen; recent galleries provide a useful fallback.

- Gallery link — Pass. Event identity, gallery-wide share/download, photo count, search, and save controls are clear without competing with the images.

- Photo link — Pass. The selected photo dominates; its event context, gallery return path, previous/next navigation, and save/share/download controls are immediately legible.
