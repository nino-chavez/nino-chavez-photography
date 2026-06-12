# Blueprint Portal Conventions

**Version 5 (2026-06-11).** Canonical convention set for blueprint **portal-mode** projects (static HTML + Cloudflare Pages Functions). For React/the platform design system projects, use `template/prototype/` instead.

---

## The Core Rule

**The product UI must be visually indistinguishable from what would actually ship. Anything that exists only because this is a prototype lives in the harness chrome, never in the page body.**

Reviewers should be able to look at any page and answer "yes, this is what we'd ship" without mentally subtracting prototype scaffolding. The harness chrome — top bar (brand + breadcrumb switchers), proposed/compare/shipped toggle, flow stepper, command palette, strategy/shipped drawers, annotation FAB, AI chat FAB — are all fixed-position overlays. None live inside `.proposed-view` or `.shipped-view`.

---

## The Canvas Rule

**The canvas belongs to the portal; the theme belongs to the mock.**

The portal canvas — the page background the chrome renders on — is portal-owned and stays light on every page. A product surface keeps whatever theme it ships with (including fully dark, like a courtside scoring UI), but that theme lives *inside* the mock view, never on the page body. Before this rule, dark-themed mocks restyled `<body>` and the portal flipped light/dark page to page — reviewers read the inconsistency as sloppiness rather than per-surface theming intent.

The mechanical form: `proto-nav.js` frames each `.proposed-view` / `.shipped-view` per the page's `mock_frame` meta field —

| `mock_frame` | Rendering | Use for |
|---|---|---|
| `"desktop"` (default) | Browser-window frame: light portal-owned bar (three dots + the production route from `currentState.route` / `surface`) above the mock, card border + radius + shadow around it | Full-page web surfaces — landing, dashboards, marketing pages |
| `"phone"` | Centered ≤420px phone bezel | Handheld product surfaces — one-handed courtside tools |
| `"none"` | No frame | Document-style pages read on the canvas (comparisons, study content), or pages with bespoke in-view device presentations a single frame can't wrap (e.g., a two-variant phone rail) |

The frame is the one sanctioned chrome touch of the page body: it wraps the product UI, it never alters it. The frame bar stays light regardless of the mock's theme — it's portal chrome, not product UI. In split (compare) mode the panel rules deliberately override the frame container styles; the frame bar rides inside each panel.

What this forbids: page-level `body { background: ... }` or `body { color: ... }` theming. Theme the mock's own root element inside the view instead (e.g., `.proposed-view { background: var(--arena-900); }` scoped in the page's `<style>` if the whole proposed surface is dark).

---

## The shell, top-down

Every prototype page (not the front door / studio catalog) renders with this chrome:

1. **Top bar** (single fixed bar, dark) — brand mark, global portal nav (Front door / Prototype / Docs), and the manifest-driven breadcrumb (`Prototype › <Slice> › <Page>`). The breadcrumb segments are **switcher menus**, not static labels: the slice segment opens a dropdown of all slices; the page segment opens a dropdown of the current slice's pages plus the flows touching it (start-flow deep-links). Also hosts the compact `PROPOSED / COMPARE / SHIPPED` pill and the citation chip.
2. **Page's own header** — whatever the page renders inside `.proposed-view`. Production-indistinguishable.
3. **Page body** — the proposed surface, full-bleed. No persistent rail competes with it for viewport width.
4. **Flow stepper** — the sequential mode (prev/next + position), rendered only when `?flow=<flow-id>` is in the URL.
5. **Drawer triggers** — Strategy and Shipped drawers open from buttons in the top bar. The strategy drawer carries the slice context (summary, production surface, citations, flows).
6. **Command palette** — Cmd/Ctrl+K, searches pages / slices / docs from the manifest.
7. **AI chat FAB** — bottom-right, always available.
8. **Annotation FAB** — bottom-left, opt-in (`localStorage.setItem('blueprint-anno-enabled','true')`).

This stack is built by `proto-nav.js` + `proto-annotate.js` + `chat-widget.js`. Pages don't render any of it directly.

---

## Slice schema

Slices group related pages under one persona / audience / surface. A slice can have 1 page (single-page slice) or many.

`_meta/slices/<slice-id>.json`:

```json
{
  "id": "<slice-id>",
  "label": "Human-readable label",
  "color": "brand|accent|neutral",
  "summary": "One-paragraph description. Kept under ~200 chars.",
  "production_surface": "src/routes/.../*.svelte — comma- or path-list of the production files",
  "primary_persona": "P1 Persona Name (S<n> Stage Name)",
  "findings_cited": ["Finding #1", "Finding #2"],
  "principles_cited": ["R1", "R2"],
  "phase": "MVP|Phase 1|Phase 2|Phase 3",
  "pages": ["page-id-1", "page-id-2"],
  "flows_touching_this_slice": ["flow-id"]
}
```

Listed in `_meta/index.json` under the top-level `slices` array.

---

## Page schema

`_meta/<page-id>.json`:

```json
{
  "id": "<page-id>",
  "title": "Human-Readable Title",
  "group": "<group-id>",
  "slice": "<slice-id>",
  "destination": "product|blueprint",
  "surface": "<production-surface-this-maps-to>",
  "phase": "MVP|Phase 1|Phase 2|Phase 3",
  "route": "/pages/<page-id>.html",
  "summary": "One-sentence description used on the studio catalog card.",
  "mock_frame": "desktop|phone|none",
  "strategy": {
    "decision": "What design choice does this page make?",
    "why": "Which finding/rule does it implement? Inline markdown allowed.",
    "shipped": "How does the shipped product render this surface today?",
    "gap": "Proposed vs shipped in one row.",
    "question": "What needs primary-research validation?"
  },
  "currentState": {
    "route": "/path/in/shipped/app",
    "summary": "What exists today.",
    "sourceFiles": ["src/routes/.../+page.svelte"],
    "annotation": "How does the proposed differ?"
  }
}
```

The `slice` field links the page to a slice (which feeds the breadcrumb switchers and the slice-context block in the strategy drawer). Pages declare only `window.PROTO_PAGE = { id: '<page-id>' };` in the HTML — everything else loads from the JSON.

`mock_frame` is optional and defaults to `"desktop"` — see "The Canvas Rule" above for the three values and when to use each.

### The `destination` field (required)

`destination` declares what kind of surface the page is, and is the field the prototype-vs-production traceability sweep keys on:

| Value | Meaning | Traceability sweep |
|---|---|---|
| `product` | The page proposes a real product surface. It has — or will have — a production-code projection (`surface` / `currentState.sourceFiles` name it). | **Walked.** The 4-link chain (research → meta → prototype HTML → production code) is verified for this page. |
| `blueprint` | The page is strategic / positioning / study content with no production projection by design — a competitor comparison, a partnership proposal, a pilot-integration sketch, a market teardown. | **Skipped.** There is no production code to diff against; walking it would false-flag it as "missing implementation." |

**Why this field exists.** On a 2026-05 rally-hq migration sweep, every prototype page was promoted into production routes (`src/routes/`) because nothing declared which pages were product-bound versus positioning-only. Production then rendered fictional pilot integrations and unsigned partnership terms at full SEO-indexable status. `destination` is the mechanical guard: only `product` pages map to product surfaces; `blueprint` pages stay in the portal (which is wholly `noindex` — see the HTML contract) and are never promoted or sweep-walked. See `docs/case-studies/prototype-vs-production-traceability-sweep.md` § "When to run".

**Why two values, not three.** Rally HQ's local taxonomy carried a third value, `noindex-only` (a production route excluded from indexing). That value is degenerate in the canonical portal model: every portal page is already `noindex` via the page HTML contract, and positioning content lives in the portal as `blueprint`-destination pages rather than as deindexed production routes. Consumers running a drive-from-prototype workflow where positioning content ships as real production routes may extend the enum locally; the canonical schema stays at `product | blueprint` to match the only mechanism that reads the field (the traceability sweep).

---

## Page HTML contract

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>{Page Title} — PROJECT_NAME</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/shared.css">
  <link rel="stylesheet" href="/project-tokens.css">
</head>
<body data-compare-root data-view="proposed">
  <section class="proposed-view">
    <!-- What we'd ship. Production-indistinguishable. -->
  </section>
  <section class="shipped-view">
    <!-- Mock or screenshot of what exists today. -->
  </section>
  <script>
    window.PROTO_PAGE = { id: '<page-id>' };
  </script>
  <script src="/proto-nav.js"></script>
  <script src="/chat-widget.js" defer></script>
  <script src="/proto-annotate.js" defer></script>
</body>
</html>
```

**Use absolute paths (`/shared.css`, `/project-tokens.css`, `/proto-nav.js`)** — relative paths break when Cloudflare Pages serves the file from a different URL than expected.

---

## Docs viewer manifest

The docs viewer (`docs/index.html`) renders its sidebar from `_meta/index.json` `docs.tiers[]`. The viewer itself is canonical chrome — never edit its HTML, JS, or styles in a consumer repo. To add docs to your portal, edit the manifest:

```json
{
  "name": "Your Project Blueprint",
  "...": "...",
  "docs": {
    "tiers": [
      {
        "label": "Strategic artifacts",
        "blurb": "Positional briefs — read these to understand <em>why</em>.",
        "designed": true,
        "docs": [
          { "id": "strategy", "title": "Strategy" },
          { "id": "research-synthesis", "title": "Research Synthesis" }
        ]
      },
      {
        "label": "Working documents",
        "blurb": "Operational scaffolds — read these to understand <em>how the work happens</em>.",
        "designed": false,
        "docs": [
          { "id": "validation-plan", "title": "Validation Plan" }
        ]
      }
    ],
    "default": "strategy"
  }
}
```

Schema fields:

| Field | Required | Meaning |
|---|---|---|
| `docs.tiers[]` | yes | Ordered list of sidebar groups. Empty tiers render no label. |
| `docs.tiers[].label` | yes | Tier header (e.g., "Strategic artifacts"). |
| `docs.tiers[].blurb` | no | One-line explainer under the label. Limited HTML allowed (`<em>`). |
| `docs.tiers[].designed` | no, default `false` | If `true`, docs in this tier get the designed treatment (hero block + structured callouts + proto-ref styling) when rendered. Strategic-tier docs typically use `true`; operational scaffolds use `false`. |
| `docs.tiers[].docs[]` | yes | List of `{ id, title, source? }`. The `id` is the markdown filename (without `.md`) in `_docs/`; the `title` is the human label; `source` is an optional repo-relative path (see "Source field" below). |
| `docs.default` | no | Slug of the doc to open when no `?doc=` param is given. Falls back to the first doc in the first non-empty tier. |

Each `id` must correspond to a markdown file at `_docs/<id>.md`. Either author the file directly there, OR declare a `source` field and let `scripts/prep-deploy.sh` sync it from the canonical authoring path at build time.

**Source field — canonical-path authoring**

When your strategic artifacts live in the canonical doc-discipline directories (`decisions/`, `research/`, `content/`) instead of directly in `_docs/`, add a `source` field to each `docs.tiers[].docs[]` entry:

```json
{ "id": "01-prescription", "title": "Prescription", "source": "decisions/01-prescription.md" }
```

`source` is resolved against the portal's parent directory. For a portal at `<repo>/portal/`, the source above resolves to `<repo>/decisions/01-prescription.md`. For a portal at `<repo>/blueprint/portal/`, it resolves to `<repo>/blueprint/decisions/01-prescription.md`. The sync script (`scripts/prep-deploy.sh`) copies each source → `_docs/<id>.md` at build time. Entries without a `source` field are assumed to already exist at `_docs/<id>.md` and are not synced.

Full rationale: methodology repo `docs/decisions/0003-portal-docs-manifest-driven-sync.md`.

**Why data-driven, not hardcoded**: prior versions of the docs viewer shipped with 13 doc slugs baked into the HTML, the TITLES map, and the STRATEGIC_DOCS Set. Consumer projects copied the template and shipped a docs viewer full of project-specific vocabulary from whichever flagship project the template was extracted from. The data-driven shape means the canonical template ships with zero project-specific defaults — every consumer gets a working viewer by editing one manifest. Full incident: `docs/case-studies/case-study-v3-portal-css-gap.md` § "Follow-up — docs viewer".

---

## One confident preview, not a deliberation venue

The portal is a stakeholder review surface. Each route shows ONE confident take of what the team is proposing — not three competing variants walked through page-by-page, and not a tour of every option considered. The PROPOSED / COMPARE / SHIPPED toggle is the comparison primitive (proposed vs what exists today). It is not variant-walking.

If you want to ship `home-a.html` + `home-b.html` as side-by-side variants, the answer is: complete the convergence in Stage 2, write the ADR explaining why one was chosen, ship the chosen one. Variant deliberation belongs in `decisions/` ADRs and `prototype/DESIGN.md` — not in the portal.

Full methodology rule + Pattern A/B specifics: `template/docs/methodology/confident-preview-rule.md`. Enforced at Stage 2 → 3 by `design-principles-reviewer` (greenfield) and at Stage 3 completion by `portal-pattern-b-conformance-reviewer`.

---

## Tokens & typography

Visual tokens split across two files. Both load on every page; the cascade picks the override.

| File | Owner | Editable in a consumer repo? |
|---|---|---|
| `shared.css` | Blueprint methodology (canonical chrome — tokens + layout primitives + chrome components) | **No.** Re-stamped from `$BLUEPRINT_HOME/template/portal/shared.css` via `stamp.mjs --mode=restamp-chrome --pattern=B`. `portal-chrome-canonical-reviewer` diffs your copy against canonical and fails the gate on drift. |
| `project-tokens.css` | Initiative (token overrides + project-specific components) | **Yes.** Loaded after `shared.css`, so any `:root { --brand-600: ... }` here wins. New project components live here. |

Why this split exists: on 2026-05-25 a Blueprint consumer (website-nc-v3) truncated 268 lines from its `shared.css` mid-edit, then restored the missing chrome by `curl`-ing from a peer consumer's deploy (`blueprint.rallyhq.app`). That promoted the peer's project-specific drift into a "canonical" position no doc declared and the methodology bump path didn't propagate. The overlay split makes the canonical file mechanically diffable and re-stampable; consumer overrides have a clean home.

**Rule of thumb:** if it's a token, override in `project-tokens.css :root`. If it's a new component, add it in `project-tokens.css`. If you want to edit chrome itself (button base styles, drawer behavior), the change belongs upstream in `template/portal/shared.css` via a methodology PR — not in your consumer copy.

**Default fonts** in the template: Inter (display + body) + JetBrains Mono (data). For projects that need a hero display font (sport, editorial, etc.), override `--font-hero` in `project-tokens.css :root` and reserve it for h1 / hero moments — never for body or small headings.

---

## Comparison toggle

Pages with a meaningful "different from shipped" story include both `.proposed-view` and `.shipped-view` sections inside `<body data-compare-root data-view="proposed">`. `proto-nav.js` auto-injects the toggle into the top bar. Pages with no shipped equivalent can omit `.shipped-view` and the toggle won't render. Compare mode gets the full viewport — one reason the persistent slice rail was retired (see Versioning, v4).

---

## Flow definitions

Multi-page journeys live in `_meta/index.json` under `flows`:

```json
{
  "id": "main-journey",
  "label": "Main journey",
  "summary": "How a primary persona moves through the product.",
  "pages": ["page-a", "page-b", "page-c"]
}
```

Append `?flow=<flow-id>` to any prototype URL and `proto-nav.js` renders the flow stepper (prev/next page links + position) — the portal's sequential navigation mode.

Flows declared in `flows_touching_this_slice` on a slice get listed in the breadcrumb's page-switcher menu and in the strategy drawer's slice context, with "Start flow →" deep-links to the flow's first page.

---

## Anti-patterns (reject any PR that does these)

| Anti-pattern | Why it fails |
|---|---|
| Inline `font-family: var(--font-hero)` on body text | Display fonts are unreadable at small sizes. Never. |
| Hardcoded hex colors | Token defaults in `shared.css`, overrides in `project-tokens.css`. |
| Direct edits to `shared.css` in a consumer repo | Canonical chrome. `portal-chrome-canonical-reviewer` will fail the gate. Re-stamp via `stamp.mjs --mode=restamp-chrome --pattern=B`; put overrides in `project-tokens.css`. |
| `curl`-ing a peer consumer's deployed CSS to "restore canonical" | The deployed sibling is not canonical — it has the peer's project drift baked in. Re-stamp from `$BLUEPRINT_HOME/template/portal/shared.css` instead. |
| "This is a mock" framing inside `.proposed-view` | Product UI must look like production. Put framing in the strategy panel via per-page JSON. |
| Page-level `body { background: ... }` theming | The canvas belongs to the portal (see "The Canvas Rule"). Theme the mock's root element inside the view; declare `mock_frame` instead of hand-rolling bezels or window chrome. |
| Page-level `@media (prefers-color-scheme: dark)` blocks | Theme handling belongs in tokens. |
| Full PROTO_PAGE data inline | Whole point of `_meta/*.json` is centralization. |
| Hard-coded path arrays in nav code | `proto-nav.js` derives nav from `_meta/index.json`. Don't reinvent. |
| Relative paths to shell assets (`./shared.css`, `../project-tokens.css`, `../proto-nav.js`) | Pages serves the same file at multiple URLs; relative paths break. Absolute only. |
| Heavy JS deps (React, Vue) | Portal is plain HTML / CSS / vanilla JS. Adding a framework requires explicit conversation. |
| Real customer data anywhere | Synthetic personas only. No real PII even in placeholders. |
| Direct edits to `_docs/` | `_docs/` is auto-copied by `scripts/prep-deploy.sh`. Edit canonical source. |
| Editing page chrome (top bar, drawers, palette) per-page | All harness chrome is built by proto-nav.js. Pages don't render it directly. |

---

## Stage 7 (Iterate) — annotation overlay

Stakeholders enable per-browser annotation mode via:

```js
localStorage.setItem('blueprint-anno-enabled', 'true')
location.reload()
```

A 💬 FAB appears bottom-left. Toggle "Annotating" then click any element on the page to drop a note. Notes persist in localStorage keyed by page id. Console helpers: `window.blueprintAnno.export()`, `window.blueprintAnno.clear()`.

Notes are per-browser. Cross-stakeholder sync is a Phase-2 task — would add a Pages Function backed by Cloudflare KV.

---

## OWNER-SPEC docs

Three OWNER-SPEC.md files ship with the shell — `proto-nav.OWNER-SPEC.md`, `proto-annotate.OWNER-SPEC.md`, `functions/api/chat.OWNER-SPEC.md`. They document each tool's purpose, alternatives considered, failure modes seen, coupling, and maintainer playbook. Don't modify them unless you're modifying the underlying tool — the `last_attested` date in the frontmatter is mechanically lint-checked.

For project-specific tools added on top of the shell, follow the same pattern: `tools/<tool-name>/OWNER-SPEC.md` per the upstream blueprint `owner-spec-pattern.md`.

---

## Deploy

```bash
# From your project's blueprint/ root:
./portal/scripts/prep-deploy.sh
cd portal
wrangler pages deploy . --project-name <PROJECT_SLUG>-blueprint --branch main --commit-dirty=true
```

The `wrangler.toml` at `portal/` root is required so wrangler detects `functions/` and compiles them as Pages Functions.

### Required env vars on the Pages project

- `OPENROUTER_API_KEY` — powers the chat function. Stored as Pages secret. Source: 1Password `blueprint-global` item (or rotate per-project).

### Optional: custom subdomain

```bash
# Attach <PROJECT_SLUG>-blueprint.<your-domain> as custom domain in the
# Cloudflare Pages dashboard, or via the Pages API + DNS API.
# See the rally-hq blueprint commits for a worked example.
```

---

## Versioning

**v5 (2026-06-11)** — the canvas rule + mock frame primitive. New optional page-meta field `mock_frame` (`desktop` default | `phone` | `none`); `proto-nav.js` frames each `.proposed-view` / `.shipped-view` (browser-window bar with route for desktop surfaces, ≤420px bezel for handheld ones) so per-surface themes — including fully dark mocks — live inside a portal-owned frame instead of restyling the page body. New anti-pattern: page-level `body { background: ... }` theming. Additive for existing consumers: the default `desktop` frame applies on next chrome sync; pages that should not be framed declare `"mock_frame": "none"`.

**v4 (2026-06-11)** — navigation consolidation: retired the persistent slice rail (`.proto-slice-sidebar`) and the footer "Jump to" select (`.proto-footer-nav`, the v1 holdover that survived v2 as a hidden affordance). Breadcrumb segments became manifest-driven switcher menus (slice segment → all slices; page segment → current slice's pages + flow entries); added the Cmd/Ctrl+K command palette over pages / slices / docs; slice context moved into the strategy drawer; the flow stepper (`?flow=`) is the only sequential mode. Rationale: full-bleed mockups are the content — the rail spent permanent viewport width on slice-scoped wayfinding needed only occasionally, and compare mode needs the whole viewport (cognitive audit + operator decision, 2026-06-11).

**v3 (2026-06-03)** — added the required per-page `destination` field (`product | blueprint`). Aligns the page schema with `docs/case-studies/prototype-vs-production-traceability-sweep.md`, which already keys on the field to decide which metas get the 4-link walk. Existing consumers add `destination` to each `_meta/<page-id>.json` in the same PR that pulls this convention bump; `portal-pattern-b-conformance-reviewer` BLOCKs on missing or invalid values.

**v2 (2026-05-23)** — slice architecture: slice-aware per-page metadata, slice sidebar, slice header bar, top brand bar, retired the v1 footer nav. Multi-page slices (one slice can have many pages) are first-class.

**v1 (earlier 2026-05-23)** — initial portal shell with `_meta/*.json` page metadata, footer nav, comparison toggle, annotation overlay, chat widget.

Material changes (renaming tokens, changing required metadata fields, breaking the page HTML contract) bump the major version and require updating all existing pages in the same PR.
