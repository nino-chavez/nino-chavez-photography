# Interactive Photography comparison: validation

This is a local review of warm coral and cool mint. No direction has been selected for production. Blog and Profile were not edited.

This branch must never be merged into production. The interaction changes and chosen palette will move into a separate clean implementation PR after selection; the local comparison bridge, framing exception, unused palette and opt-in comparison tests stay here. This resolves the source review's concern about the prototype being mistaken for a release candidate.

The parent opened native whole-screen Chromium captures at 1440, 390 and 320 pixels. Four real-data journeys (two colors at two widths) submitted a photo search, selected Girls, saved from the viewer, removed and restored the same photo with keyboard Undo, returned focus to the card, opened Saved and verified persistence after reload. `encounters.json` records the states; the final captures have no horizontal overflow. The 320-pixel reduced-motion viewer had no running animations.

Focused tests cover query/filter/chip/share agreement, preserving unrelated URL parameters, phone filter selection, saved-state synchronization, stacked notices, accent switching without closing the photo, viewport switching, and keeping the ordinary host on graphite/silver with its framing protection. The existing home/archive suite also covers photo return, empty-state recovery, keyboard modal boundaries and reduced motion. The phone filter test was updated to expand the new collapsed Sport section before choosing a radio; its focus-boundary assertion remains intact.

The two comparison-server tests are explicitly opt-in with `PHOTOGRAPHY_ACCENT_REVIEW=1`; they are excluded from ordinary test runs that only start the application's Vite server. Verification includes both the skipped default path and the enabled local-preview path.

The initial cold review led to a shorter mobile introduction, one filter-sheet heading, and opaque neutral next/previous buttons so colors in the photograph do not look like control accents. A cool desktop screenshot captured before the message bridge settled was replaced after asserting the real Search button computed mint. Review receipts are retained beside the captures.

Runtime compilation, Svelte checks, reader audit and the full build are checked separately from these browser observations. Existing unrelated VideoPlayer accessibility warnings remain. No physical-phone, authenticated account, private-album, or visitor usability test is claimed.

The preview requires this retained worktree and two local servers: the comparison at `http://photo-accent.localhost:8840/` and the native app at port 8841. The local-only bridge and narrow public-route framing exception activate only on `photo-accent.localhost`; the production palette remains unchanged. The native review runtime uses its own `.temp/photo-accent-runtime-final` state directory. No database, auth, deployment configuration or dependency was changed.
