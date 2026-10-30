---
surface: public-photography-concepts
kind: cold
build: photography-concepts-v1
reviewer: gpt-5.6-terra high, dispatch 9e973868-7774-4280-b090-058a57894388
implementer: Codex parent
cold: true
device: Chromium on macOS at 1440x1000 and 390x844
states: [home, archive, gallery, viewer, no-results]
verdict: revise
---

The exact [brief](photography-20261030-concepts/cold-brief.txt), [manifest](photography-20261030-concepts/manifest.json) and screenshots are preserved beside this record. The parent opened the listed captures before dispatch. This is a concept comparison; no human has selected a production direction.

## Independent report

**Verdict: revise.** The comparison exposes a useful split—A leads with the work, B leads with retrieval, C tries to join both—but the hierarchy still changes too much by viewport and some archive frames lose the context needed to act.

Eye order:

| Alternative | Desktop | Phone | Tradeoff |
|---|---|---|---|
| A | photographs → gallery search → more photographs | title → search → wall | Strongest portfolio impression; event retrieval is secondary. |
| B | find gallery → search → recent events | same | Clearest route to a specific event; less immediate evidence of the photography. |
| C | selected work → find gallery → event list | find gallery → selected work → event list | Best attempt at both jobs, but desktop and phone assign different first priorities. |

1. **C’s desktop/phone priority reverses. — usable but weak**
   `C-home-desktop.png` leads with “Selected photographs” and two large images; `C-home-phone.png` leads with “Find your gallery.” Both orders are defensible individually, but they communicate two different home-page promises. Choose one primary job and keep it first across breakpoints; retain the other as the immediate second action.

2. **B is the clearest retrieval model, but its desktop home spends too much attention on a decorative side rail. — usable but weak**
   In `B-home-desktop.png`, the visitor’s path is clear: heading, search, month, recent events. The left “Photographs by Nino Chavez” rail competes for a third of the screen while contributing neither event choice nor a strong enough view of the work. Demote or combine it with a compact selected-work module. `B-home-phone.png` improves substantially by removing that competition.

3. **Archive context disappears in supplied comparison frames. — defect**
   `B-archive-desktop.png` starts at “8 galleries · Recent public galleries” with no visible page title, search, or navigation context. `C-archive-phone.png` begins directly with a two-column grid, also without a visible retrieval path or page identity. A returning visitor can recognize event cards, but these frames do not visibly help them find a different event. Preserve a clear archive label and a discoverable search/filter affordance at this viewport state.

4. **C’s gallery screen answers the action job well; its desktop composition is more coherent than B’s. — correct**
   `C-gallery-desktop.png` and `C-gallery-phone.png` establish the gallery, then surface share, download, in-gallery search, photo count, and photographs without making one control drown out the image set. The preview/live-site disclosure is necessary and visibly distinguished. `B-gallery-desktop.png` remains readable, but its permanent left rail creates a cramped content well and makes the gallery feel less like the main subject.

5. **C’s viewer and empty state are the most complete visible recovery/action surfaces. — correct**
   `C-viewer-desktop.png` and `C-viewer-phone.png` give the photograph visual priority while keeping close, next/previous, share, save, and download legible. `C-empty-phone.png` clearly names the failed result and offers both a local reset and broader recovery. Screenshots cannot establish whether these controls work, retain state, or preserve place, but their visible hierarchy supports those jobs.

The useful direction is not an unqualified choice of C: take B’s explicit event-first retrieval hierarchy, combine it with C’s compact work proof and gallery/viewer treatment, and make the resulting primary promise stable between desktop and phone.

## Parent verification and disposition

The reviewer correctly identifies the tradeoff: A emphasizes photographs, B emphasizes retrieval, C puts both in view. Its preference for C's gallery and viewer is a visual judgment, not behavior proof.

Finding 3 is **not supported by its named files**. The parent reopened `B-archive-desktop.png` and `C-archive-phone.png` after the report. Both visibly include site navigation, the “Event galleries” title, Find a gallery input, Search button and Month control above their results. No search/navigation removal occurred and no fix is justified by this claim. The unchanged captures and hashes are retained.

Findings 1 and 2 describe genuine choices for Nino to judge. C deliberately brings the finder before photographs on a narrow phone while keeping both in the opening view; desktop puts them alongside each other. A prioritizes photographs throughout; B prioritizes retrieval throughout. Flattening that distinction before the choice would undo the requested comparison. B's selected-photo rail occupies useful portfolio space at the cost of event-list width; C's common full-width gallery avoids that cost. These remain explicit tradeoffs, not accepted production decisions.

No unqualified cold-accept claim is made. The comparison is ready for Nino's named choice; the chosen native port still needs its own cold and direction-conformance reviews. No additional agent review was dispatched after this bounded comparison review.
