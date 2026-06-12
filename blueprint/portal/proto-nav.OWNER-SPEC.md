---
tool: proto-nav.js
last_attested: 2026-06-11
max_unattested_days: 90
couples_with:
  - prototype/_meta/index.json
  - prototype/_meta/*.json
  - prototype/_meta/slices/*.json
  - prototype/shared.css (CSS selectors .proto-top-bar, .strategy-panel, .current-state-panel, .proto-flow-breadcrumb, .compare-toggle, .mock-frame-desktop/.mock-frame-phone/.mock-frame-bar)
  - prototype/CONVENTIONS.md (page HTML contract)
convention_version: 1
---

# Owner-spec: proto-nav.js

## Purpose

`proto-nav.js` is the portal shell's navigation + chrome renderer. On every prototype page load it:

1. Fetches `/_meta/index.json` (the portal manifest).
2. Pre-loads every per-page `_meta/<id>.json` (plus the current slice's `_meta/slices/<id>.json`) into a title cache.
3. Renders the top bar: brand mark, global portal nav, and the manifest-driven breadcrumb whose segments are switcher menus (see "Navigation model" below).
4. Renders the Cmd/Ctrl+K command palette over pages, slices, and docs.
5. Renders the right "Strategy" drawer from the current page's `strategy` field — including the slice-context block (slice summary, production surface, citations, flows touching the slice).
6. Renders the left "Shipped state" drawer from the current page's `currentState` field.
7. Renders the proposed/split/shipped comparison toggle when the page has both `.proposed-view` and `.shipped-view` sections.
8. Renders the flow stepper when `?flow=<flow-id>` is in the URL.
9. Frames each view section per the canvas rule (`meta.mock_frame`, see "Mock frame" below).

It's the load-bearing piece that makes N separate HTML pages feel like one cohesive prototype studio.

## Navigation model (2026-06-11)

**There is no persistent rail.** Wayfinding lives in three transient affordances plus one sequential mode — all manifest-driven:

- **Breadcrumb switchers.** The top-bar breadcrumb (`Prototype › <Slice> › <Page>`) is not a static label — each segment is a switcher menu. The slice segment opens a dropdown of ALL slices (from `_meta/index.json` `slices`); the page segment opens a dropdown of the current slice's pages plus the flows touching that slice (start-flow deep-links). Where-you-are and where-you-can-go are the same control.
- **Flow stepper.** `?flow=<flow-id>` renders the stepper (prev/next + position within the flow). This is the only sequential navigation mode.
- **Command palette.** Cmd/Ctrl+K opens a palette searching pages, slices, and docs from the manifest. Keyboard-first jump-anywhere. The opener is also exposed as `window.openBlueprintPalette()` so pages that render their own chrome (the docs viewer, which has no breadcrumb to host a `⌘K` hint) can surface a visible search affordance that routes back through the single palette proto-nav owns.
- **Slice context in the strategy drawer.** The slice's summary, production surface, citations, and flows render inside the strategy drawer — slice orientation is on-demand, not permanently on-screen.

**Why (cognitive audit + operator decision, 2026-06-11):** full-bleed mockups ARE the content — the portal's core rule is that the proposed surface must read as production. The persistent rail charged a permanent viewport-width tax to serve slice-scoped wayfinding that is only occasionally needed, and compare mode (proposed | shipped side-by-side) needs the entire viewport to be honest at production widths.

**Retired pieces:**

- **Slice rail** (`.proto-slice-sidebar` — fixed-left 240px, visible ≥1080px). Its pages-in-slice list and start-flow buttons moved into the breadcrumb's page switcher; its slice summary moved into the strategy drawer's slice-context block.
- **Footer "Jump to" select** (`.proto-footer-nav` — the v1 footer holdover that survived v2 as a hidden affordance). Superseded by the breadcrumb page switcher + the command palette.

## Mock frame (canvas rule, 2026-06-11)

**The canvas belongs to the portal; the theme belongs to the mock.** `buildMockFrames()` reads `meta.mock_frame` — `"desktop"` (default), `"phone"`, or `"none"` — and frames each `.proposed-view` / `.shipped-view`:

- **desktop** — adds `.mock-frame-desktop` to the view and injects a `.mock-frame-bar` (three window dots + the production route from `currentState.route` / `surface`) as its first child. The view reads as a browser window onto the product.
- **phone** — adds `.mock-frame-phone` (≤420px bezel, centered). No bar.
- **none** — no frame. For document-style pages (comparisons, study content) that are read on the canvas rather than mocked as product surfaces, and for pages with bespoke in-view device presentations the single frame can't wrap (e.g., a two-variant phone rail).

**Why:** before this, themed mocks restyled the page body (`body { background: var(--arena-900) }` on a dark scoring surface), so the portal canvas flipped light/dark page to page and reviewers read the inconsistency as sloppiness rather than per-surface theming intent. The frame makes the boundary explicit: the portal canvas stays light everywhere; whatever theme the product surface ships with lives inside the frame. This is the one sanctioned chrome touch of the page body — the frame wraps the product UI, never alters it. Split mode's panel rules in `shared.css` deliberately out-specify the frame container styles; the frame bar rides inside the panel. The frame clip is `overflow: clip` (not `hidden`) so `position: sticky` inside mocks keeps working against the viewport.

## Why this shape

**Alternatives considered + rejected:**

- **React SPA with React Router** (the blueprint-example `prototype/` model). Rejected because portal-mode projects carry no React requirement and the static-HTML model is faster to read + zero build tax. The proto-nav.js IIFE achieves equivalent UX in vanilla JS.
- **Auto-discovery via `import.meta.glob`** (reference-initiative pattern). Rejected because we're not on Vite. Replaced with a `_meta/index.json` manifest + explicit page list. Trade-off: adding a page requires updating the manifest, but it's one JSON edit and prevents silent slice rot.
- **Hard-coded PAGES array in JS** (what we had pre-2026-05-23). Rejected because every nav change required editing JS. Manifest-driven is more authorable.
- **Inline strategy/currentState data in each HTML page** (what we had pre-refactor). Rejected because it duplicated content across the HTML and was hard to query — the chat function couldn't easily ingest per-page strategy. The `_meta/*.json` split makes the data machine-readable.
- **Persistent slice rail** (the v2 model, 2026-05-23 → 2026-06-11). Rejected after the 2026-06-11 cognitive audit — see "Navigation model" above for the rationale and where each rail affordance moved.

## Inputs/outputs

**Reads at runtime:**
- `/_meta/index.json` — manifest: `name`, `tagline`, `groups`, `slices`, `pages` (array of ids), `flows` (array of `{id, label, summary, pages}`), `docs.tiers` (palette's docs index).
- `/_meta/<page-id>.json` for each page in the manifest — schema documented in `CONVENTIONS.md`.
- `/_meta/slices/<slice-id>.json` for the current page's slice — feeds the breadcrumb switchers and the strategy drawer's slice context.
- The DOM: looks for `window.PROTO_PAGE.id` on each page to identify which metadata file to load.
- `window.location.search` for `?flow=<flow-id>` parameter.

**Reads from index.html OR pages/*.html (per-page):**
- Optional `[data-compare-root]` element to attach the comparison toggle's data-view state to.
- Optional `[data-compare-toggle-mount]` element to anchor the toggle (otherwise auto-injects above `.proposed-view`).

**Writes to DOM:**
- Appends `.proto-top-bar` (brand mark + breadcrumb switcher menus + compare pill + citation chip + global nav) to `<body>` (always).
- Appends the command palette overlay to `<body>` (hidden until Cmd/Ctrl+K).
- Appends `.strategy-panel` to `<body>` if the page has `strategy` metadata (carries the slice-context block when the page belongs to a slice).
- Appends `.current-state-panel` to `<body>` if the page has `currentState` metadata.
- Appends `.proto-flow-breadcrumb` (the flow stepper) to `<body>` if `?flow=<id>` matches a flow whose pages include the current page id.
- Injects `.compare-toggle` into the page's compare-toggle mount point (or above the first `.proposed-view`).

**Side effects:**
- Mutates `window.PROTO_PAGE` to merge in the loaded metadata (so chat-widget.js can read the full context).
- Adds/removes `.open` class on panel elements when their toggle buttons are clicked.
- Sets `data-view` attribute on the compare-root element when the toggle is clicked.
- Document-level `keydown` listener for the palette (Cmd/Ctrl+K to open, Escape to close).

## Failure modes seen

1. **Manifest load fails (404 or JSON parse error)** — proto-nav logs a warning and proceeds with an empty manifest. The top bar still renders with brand mark + global nav. **Symptom:** breadcrumb segments render as plain labels with empty switcher menus; the command palette has nothing to list.
2. **Per-page metadata file missing** — proto-nav logs `meta load failed for <id>` and that page renders without strategy/current-state drawers. The breadcrumb page switcher and palette won't list the page. **Cause:** Page added to `_meta/index.json` but the corresponding `_meta/<id>.json` file wasn't created.
3. **Flow stepper pushes content under top bar** — proto-nav assumes any page using a flow has CSS handling for `body:has(.proto-flow-breadcrumb)` which adds top padding. If a page sets `padding-top: 0` explicitly, the stepper overlaps content. **Workaround:** That page CSS should respect the `:has()` selector or add its own top margin to top-level elements.
4. **Multiple `<body data-compare-root>` elements** — should never happen but if it does, only the first is used for compare toggle state. Subsequent ones get no toggle behavior.

## Coupling

- **Coupled with `CONVENTIONS.md` v1 page contract** — if the page HTML contract changes (e.g., renaming `data-compare-root` or `[data-compare-toggle-mount]`), update the constants in this file in lockstep.
- **Coupled with `shared.css`** — class names `.proto-top-bar`, `.strategy-panel`, `.current-state-panel`, `.compare-toggle`, `.proto-flow-breadcrumb`, `.flow-nav-btn`, plus the breadcrumb-switcher and palette class families, are referenced in JS string templates. CSS renames must update JS.
- **Coupled with `_meta/*.json` schema** — the `strategy.{decision,why,shipped,gap,question}` and `currentState.{route,summary,sourceFiles,annotation}` keys, and the slice schema (`label`, `summary`, `production_surface`, `pages`, `flows_touching_this_slice`), are accessed directly. Schema changes require updating both the JSON files and this file.
- **Used by** `chat-widget.js` — chat-widget reads `window.PROTO_PAGE` after proto-nav has merged the metadata. If chat-widget loads before proto-nav, it sees only `{ id }`.

## Maintainer playbook

**Add a new page:**

1. Create `_meta/<new-id>.json` per the schema in `CONVENTIONS.md`.
2. Add `<new-id>` to the `pages` array in `_meta/index.json` (and to its slice's `pages` array).
3. Create `pages/<new-id>.html` with `window.PROTO_PAGE = { id: '<new-id>' };` and the standard script imports.
4. The page automatically appears in its slice's breadcrumb page switcher, the command palette index, and the studio catalog.

**Add a new flow:**

1. Add an entry to the `flows` array in `_meta/index.json`: `{ id, label, summary, pages: [...] }`.
2. Each page in the flow's `pages` array must exist in the `pages` array.
3. The flow becomes accessible via `?flow=<flow-id>` on any of its pages, and is listed (with a start-flow deep-link) in the page switcher of any slice it touches.

**Add a new audience group:**

1. Add an entry to the `groups` array in `_meta/index.json`.
2. Reference the new `group` id in per-page metadata.
3. Groups surface on the studio catalog (front door); prototype-page chrome organizes by slice, not group. No further code change.

**Danger zones:**

- **Don't change the `init()` function's load order.** Manifest must load before per-page metadata before any DOM rendering.
- **Don't read `_meta/<id>.json` synchronously.** All loads are async; the title cache assumes this.
- **Don't reorder the drawer attachment** — strategy/current-state panels assume they're appended after the page body; the z-index expectations in `shared.css` assume that order.

## Known limits

- **No support for nested manifests** (e.g., manifest-of-manifests). If we ever split into sub-portals, the schema needs a `subPortals` field.
- **No client-side route changes** — every navigation (switcher menus, palette, stepper) is a full page load. Acceptable at portal scale; would need React Router-equivalent for >100 pages.
- **Title cache is per-page-load** — every page fetches the full manifest + all per-page metadata. For ~12 pages this is ~30KB of JSON, fast on Cloudflare's CDN. At >50 pages we'd want a lazy-load model.
- **No A/B variant rendering** — if a future need is "show version A vs version B" of a page, proto-nav has no concept of variants. Compare toggle handles proposed-vs-shipped only.
- **Annotation overlay is a separate file (`proto-annotate.js`)** — not coupled to proto-nav. Both expect `window.PROTO_PAGE.id` to be set before they init.
