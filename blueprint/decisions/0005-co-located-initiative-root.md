# ADR 0005 — Co-locate the initiative under `blueprint/`; run tooling with `--target=blueprint`

**Status:** Accepted (2026-06-11)
**Deciders:** Nino Chavez (operator), Blueprint midstream init session
**Relates to:** a methodology bug (see "The bug" below) — amendment owed upstream.

## Context

The scaffold first placed `blueprint.yml` at the **repo root** (mirroring rally-hq's 2026-06-11 move) with artifacts under `blueprint/`. Running the executable stage reviewers against that layout **failed at both targetings**:

- `--target=<repo-root>` → reviewers read `variant: midstream` from the root `blueprint.yml` but look for `research/` and `prescription.yml` at the **root** (not `blueprint/`) → BLOCK.
- `--target=<repo>/blueprint` → artifacts resolve, but there's no `blueprint.yml` there → reviewers default to greenfield / "no blueprint.yml."

Verified the same failure on **rally-hq** (the canonical reference): its root-`blueprint.yml` + `blueprint/`-artifacts split breaks its reviewers too.

### The bug (root cause)

The reviewers resolve every artifact with `path.join(targetDir, 'research/…' | 'prescription.yml' | 'blueprint.yml')` — **no subdir/prefix support** (`prescription-evidence-reviewer.mjs:400`, `research-completeness-reviewer.mjs:349`). So `blueprint.yml` MUST be a sibling of the artifacts at one `--target`.

Meanwhile the SessionStart hook (`blueprint-session-start.py:46`) **walks UP** from cwd for `blueprint.yml`, so for it to fire at a repo-root session, `blueprint.yml` must be at the repo root. **The two constraints are mutually exclusive for a subdir layout** — you can satisfy the hook (root) XOR the reviewers (co-located), not both. rally-hq chose the hook and silently broke its reviewers.

## Decision

**Co-locate everything under `blueprint/`** — `blueprint.yml`, `research/`, `prescription.yml`, `decisions/`, `portal/`. `blueprint/` is the self-contained **initiative root**. Run all Blueprint tooling with `--target=<repo>/blueprint`.

Rationale:
1. It makes the **stage gates actually function** (the point of running the pipeline) — all reviewers resolve from `blueprint/`.
2. It keeps the **production app's repo root clean** (no `research/`/`decisions/`/`prescription.yml`/`portal/` polluting a live SvelteKit app root).
3. It matches the HANDOFF's original validated on-ramp (`--target=<repo>/blueprint`).

The earlier "root placement" detail (locked decision (d)) was premised on rally-hq's layout working; that premise is falsified. The operator's actual intent — contained in `blueprint/`, not a sibling — is better served by co-location.

## Consequences

- **SessionStart hook:** with `blueprint.yml` under `blueprint/`, the hook will **not** auto-fire for sessions opened at the repo root (it only finds `blueprint.yml` at cwd-or-ancestor). Mitigations, deferred to hook-wiring (HANDOFF step 4): cd into `blueprint/` for blueprint work, OR a wrapper that also probes `blueprint/blueprint.yml`, OR accept manual context-load (as this session did). Not a blocker — the auto-loader isn't installed yet.
- **Methodology amendment owed:** the reviewers should accept a configurable initiative root (e.g., read `blueprint.yml` location or an `artifacts_root`) so the subdir convention works with both the hook and the reviewers. Filed per the First Principle; implementation deferred to a methodology session (freeze-during-consumer-migration). rally-hq should be reconciled at the same time.

## References

- `tools/blueprint/template/.claude/agents/blueprint/reviewers/prescription-evidence-reviewer.mjs:400`, `research-completeness-reviewer.mjs:349`
- `tools/blueprint/template/.claude/hooks/blueprint-session-start.py:46-49`
- `apps/rally-hq/blueprint.yml` (root placement — same bug)
