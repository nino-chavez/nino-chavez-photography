# template/portal/templates/

Page-archetype reference templates for Pattern B portals. Promoted from the blueprint-redesign dogfood (`dogfood-v1` @ commit `cc4f62f`) per methodology wave 12 (2026-05-26).

## What's here

| File | What it is |
|---|---|
| `wedge-page.html` | Canonical L4 template for "wedge pages" — comparison-toggle surfaces that present a proposed-state body against a current-state body. Used in Pattern B portals for prescription documentation (gap inventories, ADR walk-throughs, distribution-shape diagrams, etc.). |

## Page archetypes (L4 in atomic-design vocabulary)

Methodology amendment 2026-05-26 § Stage 2 design-system dictionary names L4 templates as the load-bearing missing layer in Stage 2 design-system work. Each `template/portal/templates/<archetype>.html` file documents one canonical archetype with `{{PLACEHOLDER}}` markers; consumers copy the file into their `portal/pages/` directory + substitute.

## How consumer initiatives use this

For a new wedge page in a Pattern B portal:

1. `cp template/portal/templates/wedge-page.html portal/pages/<wedge-id>.html` (where `<wedge-id>` is referenced from `_meta/index.json#pages`).
2. Substitute `{{PAGE_TITLE}}`, `{{WEDGE_ID}}`, `{{PROPOSED_BODY}}`, `{{CURRENT_BODY}}` per the inline comments.
3. Author per-wedge metadata at `_meta/<wedge-id>.json` (declare `slice`, `phase`, `surface`, `summary`, `strategy`, `currentState`).
4. Register the wedge in `_meta/index.json#pages[]`.
5. Optionally register a slice in `_meta/index.json#slices[]` + author `_meta/slices/<slice-id>.json`.

## Origin

`wedge-page.html` was extracted from the blueprint-redesign dogfood's portal (commit `0add322` on `dogfood/self-redesign`). The dogfood's 5 wedge pages all consume this template shape; the template captures the M1 header brand strip + M2 compare-toggle root + M3 meta-strip + M4 cross-reference block molecules from `template/methodology/design/EXAMPLE-design-system.md`.
