# DESIGN-PRINCIPLES — Stage 3 (Midstream)

The midstream variant **inherits** the existing product's design language and notes the delta — it does not invent a new system. The gallery already has a mature, codified design system; this document points at it, records what the north-star rebuild changed, and adds the Blueprint design rules + testing baseline for the **portal** (Pattern B redesign-review surface).

## Inherited system (source of truth)

The live gallery's design system is canonical at `.agent-os/design/` — primarily `design-principles.md` (v1.0.0), `DESIGN_SYSTEM.md`, `component-patterns.md`, `TYPOGRAPHY_GUIDELINES.md`, and the tokens in `src/app.css` (Tailwind 4 `@theme`). The load-bearing principles the portal must respect:

| # | Principle | Essence |
|---|---|---|
| 1 | **Content-first hierarchy** | Photos are the product, UI is infrastructure. ≥60% content / ≤40% chrome above the fold; no "scroll to see photos." |
| 2 | **Inline utility pattern** | Controls are inline pills, not block containers. Filters collapse to pills → dropdowns. |
| 3 | **Gestalt / proximity** | Controls live near what they control (sort above the grid, pagination below, filters in header). |
| 4 | **Typography as data viz** | Size reflects information hierarchy, not importance. Counts are `text-xs` muted; titles compact; "1,234" not "Showing 1,234 photos." |
| 5 | **Progressive disclosure** | Smallest/simplest state by default; complexity opt-in. Everything collapsed on mobile. |
| 7 | **Chrome budget** | Header ≤120px desktop / ≤100px mobile; every component justifies its vertical space. |
| 8 | **Minimal defaults** | Collapsed / hidden / empty by default. Default sort = quality (best-first). |
| 9–10 | **Interaction + responsive** | Subtle hover (scale 1.02, lift 4px), tap feedback; mobile-first, 48px touch targets, MOTION tokens for animation. |

**Visual identity (tokens, `src/app.css`):** dark **charcoal** ground (`#18181b`), **gold** accent (`#eab308`), **Inter** body / **Montserrat** display. Semantic tokens (`--card-bg`, `--text-primary`, `--focus-ring`, button/filter/chip tokens) carry the system; gold is the single accent.

## Delta — what the north-star rebuild changed (do NOT re-inherit the stale parts)

The inherited `design-principles.md` predates the rebuild (2025-10-26). Two sections are **superseded**:

1. **Principle 6 (Visual Data Layers / Emotion Colors) is partly retired.** The categorical "emotion" facet + the six vanity aesthetic columns (composition/lighting/color_temperature/time_of_day/emotion/action_intensity) and the "emotion halos / Find Similar by emotion" affordance were **dropped** (ADR-0002; convergence-ledger #11/#12). **Kept:** the numeric quality sub-scores (sharpness / composition_score / exposure_accuracy / emotional_impact) → `quality_score`, which drives the default "best-first" sort. Visual treatments still must encode data + be actionable, but emotion-as-color is gone.
2. **The IA shifted to the find-my-photos model** (ADR-0003): event-album **discovery** → **find-my-photos** (jersey-number / jersey-color sightings, human-resolved) → **download/share**. No sales, no faces, no per-person naming. The default album sort is descending date; Collections re-based on `quality_score`. The find-me mechanism is `find_photos_by_jersey` over `photo_jersey_sightings` — which the #10 ingest populates.

## Blueprint design rules (Stage 2 methodology, applied)

1. **Match the existing product** — the portal uses only components/patterns the gallery already ships (inline pills, card grid, lightbox, the charcoal/gold system). Anything new is marked PROPOSED.
2. **Customer terminology** — "find my photos", "albums", "event", jersey number/color. NOT "identity resolution", "vision extraction", "embeddings" on customer-facing surfaces (those are `/inspect`-register only).
3. **Lead with the positive** — "here you are" framing; find-and-download, never a sales gate.
4. **One action per page** — each portal page has one primary action (find, download, share).
5. **Progressive disclosure** — inherited Principle 5; strategy/current-state drawers are opt-in, collapsed by default.

## Portal-specific (Pattern B)

- **Brand inheritance:** the portal inherits the gallery's identity via `blueprint/portal/project-tokens.css` (`[data-theme="photography"]` — dark charcoal + gold, Inter/Montserrat). Canonical chrome (`shared.css`) stays byte-identical; brand lives only in the overlay (decisions/0001).
- **Drawer contract:** per-page strategy drawer (the design rationale + research cite) + current-state drawer + the PROPOSED/COMPARE/SHIPPED toggle + the chat FAB. Note: because the north-star **already shipped**, "current-state" = the pre-rebuild gallery and "SHIPPED" = the live find-my-photos product (the comparison axis is historical, not speculative).
- **Voice:** the portal's review surfaces read in the Solution-Architecture / strategy register; the demo copy serves the surface, not the other way round.

## Testing baseline (portal)

Per the methodology Stage 2 baseline, sized for a static Pattern B portal:

| Category | Setup |
|---|---|
| Lint/type | The portal is zero-build static HTML; the gallery app keeps `npm run check` (svelte-check + taxonomy) green as the CI gate. |
| E2E smoke | Playwright `@smoke` happy-path per portal flow (drawer toggle, comparison toggle, chat FAB opens) once pages exist. |
| Performance | Lighthouse-CI on the deployed portal preview — stakeholders judge polish by load speed. |
| Security | Gitleaks/GitGuardian (already on the repo) + no secrets in `functions/api/chat.js`. |

Skip: heavy unit suites (static UI), mutation testing, coverage gates.
