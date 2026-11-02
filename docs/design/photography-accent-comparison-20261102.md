# Compare warm and cool accents in the real Photography gallery

Nino is choosing the Photography site's accent direction. The preview uses the same photographs, layout and interactions for both choices. The approved graphite base stays. Blog and Profile stay as they are. This is an unselected review branch, not a production release.

Do not merge this review branch, including after an accent is selected. Keep it as the comparison artifact. After selection, create a clean implementation branch from current main and transfer only the product interaction changes and selected palette. Exclude `AccentStudy.svelte`, the comparison toolbar, the local framing/cache exception, the unselected study palettes, and the opt-in comparison spec. That production change gets its own PR and validation. The review preview stays available until the decision is recorded.

## Surfaces

- Guided: public photo explorer, filters, saved photos, photo viewer and feedback.
- Fixed: real content, routes, brand typography, image crop rules, accessibility semantics, privacy, account/admin/Analytics palettes and backend contracts.
- Open: warm coral versus cool mint, selected/focus/pressed color states, concise search/filter labels and restrained feedback.

The audience is a visitor finding and keeping sports photographs. They must recognize what is searchable, see which filters apply, know that a save worked, and return from a photo to their place in the results.

## Two color directions

| Role | Warm coral | Cool mint |
| --- | --- | --- |
| Accent | `#F29A79` | `#7ECFC4` |
| Hover | `#FFB594` | `#A5E8DA` |
| Pressed | `#DD815F` | `#64B5AA` |
| Quiet selected surface | `#3A2925` | `#233734` |

Both share graphite `#181A1C`, paper-white `#F0EFEB`, muted text `#B4BBC0` and surface `#292C2F`. Accent indicates action and selection. Photos keep their own color; no image grading or tinted overlay changes. A selected control also has a check, filled icon, label or pressed state, so color is not the only cue.

The original saved Reel frames support testing a colored action accent on a dark composition. They do not decide which color belongs to this site. The earlier Apps choice does not apply to Photography.

## Objects, actions and states

| Object | Action | Visible result |
| --- | --- | --- |
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
