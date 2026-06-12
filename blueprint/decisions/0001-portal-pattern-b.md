# ADR 0001 — Portal Pattern B (redesign-review-portal), copy-stamped

**Status:** Accepted (operator-locked 2026-06-11)
**Deciders:** Nino Chavez (operator), Blueprint midstream init session

## Context

The grounded plan inherited from the agent-os workflow (`HANDOFF.md` §"Methodology migration") and the methodology's `consumers.yml` row both recorded **Pattern A** for this initiative. Verifying that against the canonical decision tree (`tools/blueprint/docs/portal-and-tier-ladder.md:68-84`) showed Pattern A does not fit:

- Pattern A is a platform-portal for a product with **multiple distinct surfaces and multiple audiences** (executive / evaluator / engineering) each needing a different lane. The photography product is a **single-surface visual gallery**; its audiences (photo-seeking athletes/fans + the operator) do not split into A's audience model.
- The north-star work has a **current-state-vs-proposed shape** (old gallery → event-album discovery → find-my-photos), which is exactly Pattern B's reason for being.
- The canonical Pattern B references are `rally-hq` and `website-nc-v3` — the operator's own single-product web properties. `rally-hq` is also the canonical **midstream** worked example, so midstream + Pattern B is a proven combination (variant and pattern are orthogonal axes).
- Stack fit: the product is SvelteKit + Cloudflare Pages. Pattern A's shell is Astro + React `@blueprint/ui` (`@blueprint/ui-svelte` is demand-driven, unshipped); Pattern B is zero-build static HTML + Pages Functions, native to the existing deploy.

The HANDOFF's `init --pattern=A` command was a **tooling artifact, not a methodology read**: the stamper only implements Pattern A initial stamp (`stamp.mjs:865` hard-fails on `--pattern=B`).

## Decision

1. **Portal pattern = B** (redesign-review-portal).
2. The portal is created by the documented **copy-stamp of `template/portal/`** (`template/portal/README.md:147` — "Pattern B initial stamp is still deferred; Pattern B initiatives copy `template/portal/` by hand"). This is the canonical Pattern B mechanism, not a divergence.
3. **Structure:** `blueprint.yml` at the **repo root** (mirrors rally-hq's 2026-06-11 move so the tooling resolves it at the target root); the portal at `blueprint/portal/`; initiative artifacts under `blueprint/`.
4. Canonical chrome stays **byte-identical** to template (`shared.css`, `_portal-shell.js`, etc. — 9/9 verified via `stamp.mjs --mode=audit-chrome --pattern=B`). Brand/token overrides live in `blueprint/portal/project-tokens.css` (the consumer overlay), sourced via the forge workflow from the live gallery — NOT rally-hq's Midnight & Indigo, NOT the chrome.

## Consequences

- `consumers.yml` must be corrected (`pattern: A` → `B`) when the scaffold lands.
- The `init --pattern=B` gap is recorded as a methodology amendment (the First-Principle "missing capability" response); implementing the initial-stamp is deferred to a methodology session per the methodology-freeze-during-consumer-migration rule.
- Chrome currency is enforced by `portal-chrome-canonical-reviewer`; restamp via `stamp.mjs --mode=restamp-chrome --pattern=B`.

## References

- `tools/blueprint/docs/portal-and-tier-ladder.md` §"Choosing between Pattern A and Pattern B", §"Pattern B canonical shell"
- `tools/blueprint/docs/variant-selection.md` (midstream; rally-hq worked example)
- `tools/blueprint/template/portal/README.md:46-79` (copy-stamp recipe)
