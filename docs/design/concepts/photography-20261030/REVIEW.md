# Photography comparison, October 30, 2026

Three working directions are ready for a named choice. Production routes have not changed.

| Direction | What leads | Tradeoff |
|---|---|---|
| A — Gallery wall | A continuous selection of complete photographs | Strongest portfolio introduction; event browsing moves to its own page. |
| B — Event desk | Search, dates and identifiable event rows | Direct for returning visitors; the portfolio has less prominence. |
| C — Work + galleries | Selected photographs beside a finder and recent galleries | Both jobs are visible immediately; the opening shows fewer photographs than A. |

The [experience brief](../../../../prototype/EXPERIENCE-BRIEF.md) owns the reader, scope and preservation requirements. Selection is pending; no design approval is inferred from passing checks. The [baseline review](../../../evidence/screen-reviews/photography-20261030-baseline-cold.md) records the current site's visible problems. The three directions use the same neutral palette to make their structural differences easier to compare.

## Preview and boundaries

Serve this directory on loopback. Its `index.html` accepts `?c=A`, `?c=B` and `?c=C`. Navigate through Photographs, Galleries and Saved; switch direction while viewing a gallery to compare the same content. Search “Chicago Point,” open that event, open a photograph, save it, then close and return to results.

This is a static design comparison with real public content, not a production backend. `data.js` retains the canonical source URL for every gallery and photo. Eight recent public gallery cards and twelve-photo samples from the newest four were read from the live DOM on October 30, 2026. Dates come from published album titles and detail pages. Gallery 18s/17s context is preserved. Older entries, the full archive, collection/date pages and downloads open their actual public destinations. Local saves use a separate preview storage key. Share copies the canonical public link.

Portfolio images are the existing public set in `src/lib/portfolio.ts`, referenced at their published URLs. The fixed ordering makes this comparison repeatable; the production port must preserve the approved per-visit starting variation without moving the images mid-visit. No private/unlisted galleries, share tokens, original media ingestion, identity detection or database calls are involved.

## Checks and limits

The dedicated Playwright suite exercises all three directions at 1440×1000 and 390×844, plus a 320×568 failure/recovery pass. It checks event and photo search, no matches, save/remove/persistence, blocked storage, image-request failure, keyboard viewer navigation, return focus, query preservation, no page errors and new-tab profile/writing links. Seven tests passed. A visible 2000px-wide element proves the overflow detector can fail before it is removed.

The first capture pass exposed a blank decoded-image frame despite loaded requests. Photo tiles now request synchronous decoding, and happy-state captures wait for visible images to have natural dimensions and finish decoding. That is a rendering check, separate from the search and navigation assertions. A fresh pass captured the gallery with photographs visible.

Run the focused suite with `PHOTOGRAPHY_RETHINK=1` and `PLAYWRIGHT_BASE_URL` pointing to this static server. It skips by default so it does not become a production-app dependency. No Svelte component or app route was edited; the production reader receipt and native build are not claimed for this prototype.

Captures and their source hashes are retained in [the comparison packet](../../../evidence/screen-reviews/photography-20261030-concepts/manifest.json). These are real browser renders on macOS, including phone-width emulation. Physical phone, VoiceOver, full native-gallery regression, production deployment and acceptance in real use remain untested. OS contrast and bold-text settings were not read. The parent personally opened the home, archive, gallery, viewer and no-results captures before cold review.

The [cold comparison review](../../../evidence/screen-reviews/photography-20261030-concepts-cold.md) is preserved verbatim with the parent’s verification. Its archive-context defect is contradicted by the exact named captures. Its hierarchy and sidebar critiques are recorded as selection tradeoffs; this is not an unqualified design acceptance.

## Selection

Pending Nino's named choice. The three directions remain available. After selection, record what is retained from the rejected alternatives, port the choice to the native Svelte routes, repeat the rendered comparison and required project checks, then complete commit review and CI before merging.
