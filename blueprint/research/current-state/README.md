# Current state — Stage 1 (Midstream Targeted Diagnose)

**Cycle 1 scope:** the **#10 ingest rebuild** (new-album processing). Per the midstream discipline, the diagnose is **scoped to the prototype's blast radius** (`tools/blueprint/docs/variant-selection.md` §"Midstream — hybrid pipeline"), not a full-product audit. New-album ingest is the only system path still on the pre-rebuild pattern; library reads, search, identity browse, and the IA are already rebuilt + live.

## Provenance

Ported from the agent-os spec workflow this initiative is migrating off:

| File | Source | What it is |
|---|---|---|
| `vision-extraction-intent-audit-2026-06-08.md` | `photography/.agent-os/audits/` | The grounded, file:line-cited diagnose that **drove** the north-star rebuild. |
| `convergence-ledger.md` | `photography-vnext-p1/.agent-os/specs/.../DEPRECATED.md` | The live anti-regression tracker: every deprecated artifact + its removal trigger. |

> **Read the audit as the *pre-rebuild* diagnose.** It describes the system that motivated the rebuild; much of it is now **resolved**. The status table below reconciles it against today.

## What the audit found vs. where it stands now

| Audit finding (2026-06-08, pre-rebuild) | Status today |
|---|---|
| **F1** — embedding is tag-overlap (Gemini enum-string), query≠write model mismatch | **RESOLVED** — captions are the only embedding source (ledger #6 DONE); one `embedText()` seam, `text-embedding-3-large`@768 (ADR-0002, prescription P3). |
| **F2** — identity under-modeled (singular `jersey_number`, `players[]` dropped on read) | **PARTIAL** — relational `photo_jersey_sightings` live (2,272 backfilled, ledger #5); the `players[]` JSONB write is the **last legacy tendril**, killed by the #10 ingest (prescription R2). No faces / no naming, by product decision (ADR-0003). |
| **F3** — dead/invisible metadata (`ai_confidence`, vanity facets) | **RESOLVED** — `ai_confidence` + the 6 vanity columns dropped (ledger #3/#4/#11/#12). |
| **F4** — curation signal built but not used (sort on `emotional_impact` alone) | Addressed in the IA rebuild (Collections re-based on `quality_score`); not a #10 concern. |
| **F5** — schema drift in `database.ts` | Addressed in the rebuild; the seam (`columns.ts`) is now authoritative. |

**Net for cycle 1:** the only audit finding still live in the ingest path is **F2's `players[]` write** — exactly what the #10 prescription's R2 + P5 close.

## Open items the ingest rebuild must respect (from the convergence ledger)

- **#10 itself** — the two-bucket enrich → EXIF-keyword → sync round-trip (prescription R1/R4/R5).
- **#5 `players` drop** — gated on #10 (the legacy sync is its last writer); MERGE-GATED (ADR-0004).
- **#1 `sport_type`** — RECOMMEND KEEP (correct trigger-mirror; dropping cascades into 6 live objects). Album-authoritative sport is preserved, not revised (prescription P2).

## Out of cycle-1 scope (available for a future cycle)

- `timeline-ux-audit-2025-01-28.md` (`.agent-os/audits/`) — a different surface (timeline UX), outside the ingest blast radius. Port when a cycle touches it.
- The faces subsystem + per-person naming (NORTH-STAR §4.5) — **shelved** by ADR-0003 (no faces, no naming).

## Competitive (Stage 1 second leg)

`research/competitive/` — scoped to event-photo find-my-photos *delivery* platforms (discover → find → download/share). Out of scope: print-sales / face-recognition-naming platforms (the product model excludes both — ADR-0003). **TODO:** populate once the pilot's `concrete_reference` event is named (anchors the comparable set).
