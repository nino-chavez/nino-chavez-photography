# Interactive Photography comparison: validation

This is a local review of original gold, warm coral and cool mint. Nino selected Cool mint, then asked whether the earlier gold had actually been compared. Gold was omitted from the coral/mint comparison, not rejected on evidence. It is restored here; mint remains the default and current selection. No accent update has been deployed. Blog and Profile were not edited.

This branch must never be merged into production. The interaction changes and chosen palette will move into a separate clean implementation PR after selection; the local comparison bridge, framing exception, unused palette and opt-in comparison tests stay here. This resolves the source review's concern about the prototype being mistaken for a release candidate.

The parent opened native whole-screen Chromium captures at 1440, 390 and 320 pixels. Six real-data journeys (three colors at two widths) submitted a photo search, selected Girls, saved from the viewer, removed and restored the same photo with keyboard Undo, returned focus to the card, opened Saved and verified persistence after reload. `encounters.json` records the states; the final captures have no horizontal overflow. The 320-pixel reduced-motion viewer had no running animations.

Focused tests cover query/filter/chip/share agreement, preserving unrelated URL parameters, phone filter selection, saved-state synchronization, stacked notices, accent switching without closing the photo, viewport switching, and keeping the ordinary host on graphite/silver with its framing protection. The existing home/archive suite also covers photo return, empty-state recovery, keyboard modal boundaries and reduced motion. The phone filter test was updated to expand the new collapsed Sport section before choosing a radio; its focus-boundary assertion remains intact.

The two comparison-server tests are explicitly opt-in with `PHOTOGRAPHY_ACCENT_REVIEW=1`; they are excluded from ordinary test runs that only start the application's Vite server. Verification includes both the skipped default path and the enabled local-preview path.

The initial cold review led to a shorter mobile introduction, one filter-sheet heading, and opaque neutral next/previous buttons so colors in the photograph do not look like control accents. A cool desktop screenshot captured before the message bridge settled was replaced after asserting the real Search button computed mint. Review receipts are retained beside the captures.

Runtime compilation, Svelte checks, reader audit and the full build are checked separately from these browser observations. Existing unrelated VideoPlayer accessibility warnings remain. No physical-phone, authenticated account, private-album, or visitor usability test is claimed.

The preview requires this retained worktree and two local servers: the comparison at `http://photo-accent.localhost:8840/` and the native app at port 8841. The local-only bridge and narrow public-route framing exception activate only on `photo-accent.localhost`; the production palette remains unchanged. The native review runtime uses its own `.temp/photo-accent-runtime-gold` state directory. No database, auth, deployment configuration or dependency was changed.

## Original gold follow-up

Original gold restores `#D4AF37` with its historical hover and pressed shades. Gold has 8.30:1 contrast against graphite; its pressed shade has 6.18:1. These ratios support legibility, not a preference ranking. The new comparison tests pass for the mint default, coral/mint/gold switching, unchanged open-photo source and the ordinary-host restriction. Parent review opened the gold desktop wrapper, phone wrapper, phone filter sheet and phone viewer. The three choices fit the phone toolbar; selected filters and saved photos retain non-color cues. Screenshots and `encounters.json` were refreshed with all six journeys.

The independent follow-up reviewer opened the five requested gold/mint captures and returned PASS with no material visible issue. The full build and reader audit passed after the gold addition; Svelte checks still report zero errors and two existing VideoPlayer warnings. `gold-cold-review.txt` and the focused check logs retain the follow-up receipts.
