# Deprecation & Convergence Ledger — north-star rebuild

**Principle (operator directive, 2026-06-08):** the committed system must read as if the
north-star design was there from the start. No transitional/bridge/legacy artifacts survive a
commit. A slice is not DONE until the thing it replaces is **removed and its consumers
repointed** — not merely bypassed. This file is the authoritative anti-regression tracker: every
row is a thing that must be *gone* by its removal trigger. A future session that finds any of
these still live should remove it, never revive it.

Convergence is sequenced for prod safety (don't break the live site), but never deferred
indefinitely — each item has a near removal trigger, not "someday."

| # | Deprecated artifact | Where | Replacement | Removal trigger | Regression risk |
|---|---|---|---|---|---|
| 1 | `photo_metadata.sport_type` (trigger-mirror) + `enforce_album_sport` trigger | photo_metadata | `albums.sport` via `photos_read` view (sport is album-level only) | **Convergence migration C1**: create `photos_read` view, repoint every sport read/filter to it, then `DROP COLUMN sport_type` + drop trigger | **HIGH** — a session could re-add per-photo sport guessing |
| 2 | Per-photo sport in the vision prompt + "95% volleyball / default volleyball" bias | `src/lib/ai/enrichment-prompts.ts` (BUCKET1, PORTFOLIO_CONTEXT) | `albums.sport` (operator-set) + taxonomy-driven structured extraction | **AI-layer slice**: replace two-bucket prompt with the structured extraction; the prompt must not emit/bias sport | **HIGH** — this bias caused the original 18-album corruption |
| 3 | `photo_metadata.ai_confidence` | photo_metadata (21,128 set, 0 consumers) | none (contract: not carried) | **Hygiene migration H1**: `DROP COLUMN` | LOW |
| 4 | Agentic extras: `ball_position`, `venue_type`, `crowd_density`, `key_moment` | photo_metadata (~145 rows, 0 consumers) | none (not in contract's photos table) | **Hygiene migration H1**: `DROP COLUMN` | LOW |
| 5 | `photo_metadata.players[]` JSONB (2 shapes) + singular `jersey_number` | photo_metadata | `photo_players` (resolved) + sightings store (Slice 2) | **Slice 2 convergence**: after backfill into the relational model, `DROP COLUMN players, jersey_number` | MEDIUM |
| 6 | `createSemanticDescription()` enum-string embedding fallback | `scripts/generate-embeddings-metadata.ts` | caption embedding only | **NOW** (this commit) — remove the `|| createSemanticDescription(photo)` fallback | MEDIUM — silent regression to enum embeddings |
| 7 | Dual migration dirs: `database/migrations/` (33, manual) vs `supabase/migrations/` (15, CLI-applied) | repo | `supabase/migrations/` is canonical (CLI-applied, in sync with remote) | **Hygiene H2**: archive `database/migrations/` legacy SQL to `database/migrations/_archive/`; keep only the CLI dir authoritative; `database/` reserved for generated + seed | MEDIUM — confusion over which is applied |
| 8 | `exec_sql` + its 8 callers | `src/lib/supabase/server.ts` | typed aggregation RPCs (contract §7) | **Kernel-RPC slice**: replace the 8 callers, then `DROP FUNCTION exec_sql` (anon already revoked) | MEDIUM — arbitrary-SQL surface |
| 9 | `find_photos_by_jersey` (defined in a never-applied migration; not in live DB) | `database/migrations/add-enhanced-metadata-fields.sql` | Slice 2 jersey-finding RPC | **Slice 2**: ship the real RPC; the dead definition goes to `_archive` with H2 | LOW |
| 10 | Two-bucket enrich prompt + enrich→EXIF-keyword→sync round-trip | `enrichment-prompts.ts`, `enrich-local-photos.ts`, `sync-local-to-supabase.ts` | unified structured ingest (contract §5) writing directly to DB | **Ingest-pipeline slice** | MEDIUM |

## Convergence sequence (prod-safe order)

- **Now**: #6 (enum-fallback removal — code, no prod risk).
- **Hygiene H1** (next, prod-safe — columns have 0 consumers): drop #3, #4.
- **Convergence C1** (sport native): `photos_read` view → repoint sport consumers → drop #1. The single most important one for "looks native."
- **Slice 2** (in flight): lands #5 (drop `players[]`/`jersey_number` after relational backfill) + #9.
- **Hygiene H2**: reconcile #7, archive #9's dead def.
- **Later slices**: #2 (AI layer), #8 (kernel RPC), #10 (unified ingest).

## Rule for every future slice
Definition-of-done includes: (a) the superseded artifact is removed from code AND schema, (b)
consumers repointed, (c) this ledger updated (row removed when done), (d) `npm run check` green.
If you cannot remove it safely in the same slice, it gets a row here with a removal trigger ≤ the
next slice — never an open-ended "deprecated but kept."
