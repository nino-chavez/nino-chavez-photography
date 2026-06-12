# ADR 0004 — Migration safety (additive vs merge-gated) + the no-bridge convergence rule

**Status:** Accepted (operator directive 2026-06-08; learned from a prod incident)
**Deciders:** Nino Chavez (operator)
**Source:** `DEPRECATED.md` §"MIGRATION SAFETY RULE" + §"Rule for every future slice" — ported here as the anti-regression decision of record.

## Context

There is **ONE database and it is PROD.** Prod serves `main`'s code, not a feature branch. A branch that dropped `ai_confidence` early caused every prod gallery read to 500 ("column does not exist") until it was restored by a hotfix migration. The lesson is structural, not incidental.

## Decision

### Migration safety

- **ADDITIVE migrations** (new columns/tables/functions, data fixes) are safe to apply **pre-merge** — `main` ignores what it doesn't select.
- **DESTRUCTIVE migrations** (DROP COLUMN, rename, anything `main` still SELECTs) are **MERGE-GATED**: apply only after the branch merges to `main` and deploys, so prod code no longer references the dropped thing.
- Before any DROP/rename: confirm **`main`'s** code (not just the branch) no longer references it.
- DDL is applied via `supabase db push` (CLI keychain-authed; `exec_sql` is SELECT-only and cannot run DDL).
- The data-access seam (`PHOTOS_READ` / `PHOTOS_WRITE` in `columns.ts`) makes a post-merge drop a 1-line flip instead of a ~70-site change.

### No-bridge convergence (operator directive)

The committed system must read **as if the north-star design was there from the start.** No transitional/bridge/legacy artifacts survive a commit. A slice is not DONE until the thing it replaces is **removed and its consumers repointed** — not merely bypassed. Every deprecated artifact gets a row in the convergence ledger with a **near** removal trigger (≤ the next slice), never an open-ended "deprecated but kept."

Definition-of-done for every slice: (a) the superseded artifact is removed from code AND schema, (b) consumers repointed, (c) the ledger updated, (d) `npm run check` green.

## Consequences (for the #10 ingest, cycle 1)

- The `extraction_version` add was **additive** → applied pre-merge safely (slice 1).
- The `players` column **DROP is MERGE-GATED** and gated on #10 (the legacy sync is its last writer) — prescription R2, slice 4. Do not drop until the new ingest is the only writer AND the branch is merged + deployed.
- `sport_type` is **RECOMMEND KEEP** — a trigger-enforced correct mirror of `albums.sport`; dropping it cascades into 6 live objects + a seam-flip redeploy. The seam exists if ever wanted; the pragmatic call is to keep it as a documented denormalization (open decision, operator hasn't overruled the keep).

## References

- `blueprint/research/current-state/convergence-ledger.md` (the live state tracker — ported `DEPRECATED.md`)
- `.agent-os/specs/vision-extraction-identity-vnext/DEPRECATED.md`
- `blueprint/prescription.yml` (R2 removal_trigger; slices 4–5)
