# METHODOLOGY-AMENDMENTS — Nino Chavez Photography (Blueprint midstream)

Append-only, reverse-chronological. Convention:
`tools/blueprint/template/docs/methodology/methodology-amendments-convention.md`.

---

## 2026-06-11 — Pattern B front door ships the Pattern-A audience pills

**Trigger**: The live portal's front door showed Reviewer / Engineer / Operator "persona toggles." The operator flagged that rally-hq (canonical Pattern B) doesn't use them.
**Scope**: Candidate for methodology promotion.
**Status**: Active. Removed locally (the `audience-pills` block + the `audience-note` + the priority-based card-reorder JS in `index.html`).

The template's `portal/index.html` front door ships audience pills + priority-based card reordering — a **Pattern-A audience-switcher** concept (executive/evaluator/engineering). Pattern B is the drawer contract, not an audience switcher; its front door shouldn't carry them. Checked: `template/portal/index.html` has 12 audience-pill refs; `rally-hq/.../index.html` has **0** — rally-hq removed them but **never upstreamed it** as a template change or amendment, so every fresh Pattern B stamp (incl. photography) inherits them. This is a template-vs-canonical-consumer divergence, not a one-off.

**Proposed promotion**: drop the audience pills + reorder JS from the template's Pattern B `portal/index.html` (render the path cards in declared order), or gate them behind a manifest flag (`audience_switcher: true`, default false for Pattern B).

**References**:
- `template/portal/index.html` (pills present) vs `apps/rally-hq/blueprint/prototype/index.html` (pills absent)

---

## 2026-06-11 — The cited-spec-evidence chrome feature ships unstyled

**Trigger**: A prototype page's top bar rendered a broken `R2·R5 ▾` chip whose overlay ("Cited spec evidence … citation not found in manifest") spilled as **unstyled plain text at the bottom-left of the viewport**.
**Scope**: Candidate for methodology promotion.
**Status**: Active. Worked around by emptying `principles_cited` in our slice metadata (the chip is gated on `citationRows.length`, `proto-nav.js:458`).

`proto-nav.js` (canonical chrome) renders a cited-spec-evidence chip + overlay from `slice.findings_cited` / `slice.principles_cited`, resolving each against `MANIFEST.citations`. But **neither `shared.css` nor `proto-nav.js` ships any `.citation-chip` / `.citation-overlay` / `.citation-row` styles** — verified `grep -c citation shared.css` = 0 in both the consumer and `template/portal/shared.css`. So for any consumer that populates those fields, the feature renders unstyled and mispositioned. Two gaps compound it: (a) the styles are missing from canonical chrome; (b) when `MANIFEST.citations` is absent, every citation resolves to "(citation not found in manifest)" rather than the feature no-op'ing.

**Proposed promotion**: add the `.citation-*` styles to canonical `shared.css`, AND have `proto-nav.js` skip the chip when `MANIFEST.citations` is absent (so unresolved citations don't render a broken element).

**References**:
- `template/portal/proto-nav.js:201-262` (renders the feature) vs `template/portal/shared.css` (no `.citation-*` styles)

---

## 2026-06-11 — Reviewers and the SessionStart hook disagree on `blueprint.yml` placement

**Trigger**: Scaffolding with `blueprint.yml` at the repo root (mirroring rally-hq's 2026-06-11 move) made every executable stage reviewer fail — they look for `research/` and `prescription.yml` as siblings of `blueprint.yml` at one `--target`, and there were none at the root.
**Scope**: Candidate for methodology promotion.
**Status**: Active. Worked around locally (decisions/0005) by co-locating everything under `blueprint/` and running tooling with `--target=<repo>/blueprint`.

The reviewers resolve every artifact with `path.join(targetDir, 'research/…' | 'prescription.yml' | 'blueprint.yml')` — no subdir/prefix support (`prescription-evidence-reviewer.mjs:400`, `research-completeness-reviewer.mjs:349`). The SessionStart hook (`blueprint-session-start.py:46`) walks UP from cwd for `blueprint.yml`, so to fire at a repo-root session it must be at the repo root. **The two constraints are mutually exclusive for a `blueprint/`-subdir layout** — you satisfy the hook (root) XOR the reviewers (co-located), not both.

Verified the same break on **rally-hq** (the canonical reference): its root-`blueprint.yml` + `blueprint/`-artifacts split breaks its reviewers too. This is not a photography-specific quirk; any consumer that keeps the initiative in a `blueprint/` subdir of a product repo hits it.

**Update (2026-06-11, Stage 4):** it's worse — **different reviewers want different `--target`s.** The stage reviewers (pilot-lock / prescription-evidence / research-completeness) pass at `--target=<repo>/blueprint` (artifacts co-located with `blueprint.yml`). But `portal-pattern-b-conformance-reviewer` hardcodes the canonical portal path `blueprint/portal/` and so only passes at `--target=<repo-root>` (at `--target=blueprint` it sees the portal as `portal/` and BLOCKs "non-canonical path"). No single target satisfies both reviewer families today. A configurable initiative root would resolve all of them.

**Proposed promotion**: give the reviewers a configurable initiative root — read it from the `blueprint.yml` location, or add an `artifacts_root` / `initiative_root` field the reviewers + the hook both honor — so the subdir convention works with both. Reconcile rally-hq at the same time.

**References**:
- `blueprint/decisions/0005-co-located-initiative-root.md`
- `tools/blueprint/template/.claude/agents/blueprint/reviewers/{prescription-evidence,research-completeness}-reviewer.mjs`
- `tools/blueprint/template/.claude/hooks/blueprint-session-start.py:46-49`
- `apps/rally-hq/blueprint.yml` (same split, same break)

---

## 2026-06-11 — `init --pattern=B` initial stamp is unimplemented

**Trigger**: Running the methodology CLI's `init` for a Pattern B initiative hard-fails: `stamp.mjs:865` — "pattern B initial stamp not yet implemented." The HANDOFF/`consumers.yml` had recorded this initiative as Pattern A partly because A is the only pattern `init` scaffolds.
**Scope**: Candidate for methodology promotion.
**Status**: Active. Worked around locally by the documented copy-stamp of `template/portal/` (README §"Pattern B stamper": "Pattern B initiatives copy `template/portal/` by hand"). Chrome verified byte-identical via `stamp.mjs --mode=audit-chrome --pattern=B`.

The stamper implements Pattern A initial stamp + Pattern B `restamp-chrome`/`audit-chrome` (which both require an EXISTING portal), but **not** a Pattern B initial stamp. The consequence is subtle and costly: an agent reaching for `init` gets pushed toward Pattern A because that's the path that runs — a tooling default silently biasing a methodology decision (the variant/pattern determination). The narrow Pattern B substitution surface is already documented (`README.md:147` — project name in `_meta/index.json`, repo URL, brand) and is exactly what a copy-stamp does by hand.

**Proposed promotion**: implement `--mode=stamp --pattern=B` (copy `template/portal/` + the narrow substitutions + the post-stamp grep), so `init --pattern=B` works and Pattern B stops being the harder path.

**References**:
- `blueprint/decisions/0001-portal-pattern-b.md`
- `tools/blueprint/template/tools/blueprint-init/stamp.mjs:865`
- `tools/blueprint/template/portal/README.md:143-147`
