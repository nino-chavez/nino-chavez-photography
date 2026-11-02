# Compare original gold, coral and mint in the real Photography gallery

Nino selected Cool mint after the coral/mint comparison. His follow-up question identified that the original gold had not been compared directly against those candidates. This preview restores that missing option while keeping mint as the current selection. It uses the same photographs, layout and interactions for all three choices. The approved graphite base stays. Blog and Profile stay as they are. This is a review branch, not a production release.

The historical Photography accent is `#D4AF37`, verified in `src/app.css` before merge `9026f5a`. The November 1 fleet study explicitly proposed retaining it. The initial independent Photography study included the current gold baseline, Graphite & silver, Gallery chalk and Charcoal & champagne. The later interactive study included only coral and mint; it did not establish that gold was inferior. The restored option uses the historical gold accent, hover and pressed hues in the same current layout and interaction design. It does not restore the entire old site design.

Do not merge this review branch, including after an accent is selected. Keep it as the comparison artifact. After selection, create a clean implementation branch from current main and transfer only the product interaction changes and selected palette. Exclude `AccentStudy.svelte`, the comparison toolbar, the local framing/cache exception, the unselected study palettes, and the opt-in comparison spec. That production change gets its own PR and validation. The review preview stays available until the decision is recorded.

## Surfaces

- Guided: public photo explorer, filters, saved photos, photo viewer and feedback.
- Fixed: real content, routes, brand typography, image crop rules, accessibility semantics, privacy, account/admin/Analytics palettes and backend contracts.
- Open: original gold, warm coral and cool mint, selected/focus/pressed color states, concise search/filter labels and restrained feedback.

The audience is a visitor finding and keeping sports photographs. They must recognize what is searchable, see which filters apply, know that a save worked, and return from a photo to their place in the results.

## Three color directions

| Role | Original gold | Warm coral | Cool mint |
| --- | --- | --- | --- |
| Accent | `#D4AF37` | `#F29A79` | `#7ECFC4` |
| Hover | `#E3C358` | `#FFB594` | `#A5E8DA` |
| Pressed | `#B8962E` | `#DD815F` | `#64B5AA` |
| Quiet selected surface | `#373121` | `#3A2925` | `#233734` |

All three share graphite `#181A1C`, paper-white `#F0EFEB`, muted text `#B4BBC0` and surface `#292C2F`. Accent indicates action and selection. Photos keep their own color; no image grading or tinted overlay changes. A selected control also has a check, filled icon, label or pressed state, so color is not the only cue.

The original saved Reel frames support testing a colored action accent on a dark composition. They do not decide which color belongs to this site. The earlier Apps choice does not apply to Photography.

## Objects, actions and states

| Object | Action | Visible result |
| --- | --- | --- | --- |
| Photo search | Enter query, submit, clear | Query stays visible; results reflect it; empty results offer recovery |
| Filters | Choose, remove, clear all | Selected control, complete chip, count and share state agree |
| Photo | Open, advance, close | Large image; keyboard controls; return to the triggering card |
| Saved photo | Save, remove, Undo | Filled heart, Saved count and viewer agree; reload retains the choice |
| Comparison | Switch accent or viewport | Current search, selection and open photo survive the change |

## Motion

Motion explains an action or a change of state. Press feedback is brief. A save settles into a filled icon; notifications stack without covering each other. Loading follows actual requests. No artificial waits, decorative scroll reveals or automatic image recoloring are added. Reduced-motion preference suppresses transitions and transforms, including JavaScript-driven transitions.

## Acceptance journey

At 1440 and 390 pixels, search real photos, apply a filter, inspect its chip, save a result, open it, remove it and Undo. Switch the accent while the viewer is open. Close and confirm focus returns to the card. Check the mobile filter dialog, empty search recovery, reload persistence and 320-pixel overflow. Repeat essential actions with keyboard and reduced motion.

The preview runs locally on `photo-accent.localhost:8840`; the native app uses port 8841. The accent bridge only activates on that hostname. Public hosts retain the approved palette. Both servers and the review worktree must remain available while this preview is being reviewed.

The comparison-specific Playwright tests require `PHOTOGRAPHY_ACCENT_REVIEW=1` and the two running review servers. Without that explicit opt-in, those two tests are skipped; the normal application tests do not depend on the comparison server.
