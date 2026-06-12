# Deprecation & Convergence Ledger — north-star rebuild

## 🚨 MIGRATION SAFETY RULE (learned the hard way, 2026-06-08)
There is ONE database and it is PROD. Prod serves `main`'s code, not this branch. Therefore:
- **ADDITIVE migrations** (new columns/tables/functions, data fixes) are safe to apply pre-merge — `main` ignores what it doesn't select.
- **DESTRUCTIVE migrations** (DROP COLUMN, table rename, anything `main` still SELECTs) **BREAK PROD** the moment they apply, because `main`'s `PHOTO_COLUMNS` still references the column. They are **MERGE-GATED**: apply only after this branch is merged to `main` and deployed (so prod code no longer selects the dropped thing).
- Incident: H1 dropped `ai_confidence` → every prod gallery read 500'd ("column does not exist") → restored via `20260608050000_restore_ai_confidence_prod_hotfix`. The drop is now deferred to post-merge.
- The data-access seam (`PHOTOS_READ` in columns.ts) is what makes the post-merge drop a 1-line flip instead of a 70-site change.
- **Rule:** before ANY `DROP`/rename migration, confirm `main`'s code (not just this branch) no longer references it — i.e., merged + deployed. Until then: additive only.



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
| ~~3~~ | ~~`ai_confidence`~~ | — | — | ✅ **DONE (H1)** — column dropped; writer (sync) + 3 transforms + types removed | — |
| ~~4~~ | ~~Agentic extras (`ball_position`/`venue_type`/`crowd_density`/`key_moment`)~~ | — | — | ✅ **DONE (H1)** — columns dropped; sole writer `run-enhanced-extraction.ts` deleted | — |
| 5 | `photo_metadata.players[]` JSONB (2 shapes) + singular `jersey_number` | photo_metadata | `photo_players` (resolved) + `photo_jersey_sightings` (Slice 2, LIVE — 2,272 sightings backfilled) | **MERGE-GATED drop**: `DROP COLUMN players, jersey_number` only at the cutover (a drop; `main` may select them). Relational replacement is already populated. | MEDIUM |
| ~~6~~ | ~~`createSemanticDescription()` enum-string embedding fallback~~ | — | — | ✅ **DONE** — fallback + interface removed; captions are the only embedding source | — |
| 7 | Dual migration dirs: `database/migrations/` (33, manual) vs `supabase/migrations/` (15, CLI-applied) | repo | `supabase/migrations/` is canonical (CLI-applied, in sync with remote) | **Hygiene H2**: archive `database/migrations/` legacy SQL to `database/migrations/_archive/`; keep only the CLI dir authoritative; `database/` reserved for generated + seed | MEDIUM — confusion over which is applied |
| 8 | `exec_sql` + its 8 callers | `src/lib/supabase/server.ts` | typed aggregation RPCs (contract §7) | **Kernel-RPC slice**: replace the 8 callers, then `DROP FUNCTION exec_sql` (anon already revoked) | MEDIUM — arbitrary-SQL surface |
| 9 | `find_photos_by_jersey` (defined in a never-applied migration; not in live DB) | `database/migrations/add-enhanced-metadata-fields.sql` | Slice 2 jersey-finding RPC | **Slice 2**: ship the real RPC; the dead definition goes to `_archive` with H2 | LOW |
| 10 | Two-bucket enrich prompt + enrich→EXIF-keyword→sync round-trip | `enrichment-prompts.ts`, `enrich-local-photos.ts`, `sync-local-to-supabase.ts` | unified structured ingest (contract §5) writing directly to DB | **Ingest-pipeline slice** | MEDIUM |

## Convergence sequence (prod-safe order)

- ✅ **#6 DONE**: enum-fallback removed.
- ⚠️ **Hygiene H1 PARTIAL**: #4 (agentic extras — `main` doesn't select them) dropped safely. #3 (`ai_confidence`) drop **reverted** (broke prod; `main` selects it) → column restored, branch code already doesn't use it, **drop is MERGE-GATED**. Writers/readers removed in branch code; `run-enhanced-extraction.ts` deleted.
- ✅ **Data-access seam DONE**: `PHOTOS_READ`/`PHOTOS_WRITE` in columns.ts; all ~70 read sites + the 1 write routed through it. Schema cutover is now a 1-line flip.
- **Convergence C1** (sport native — MERGE-GATED): `photos_read` view → flip `PHOTOS_READ` (1 line, the seam) → drop #1 (`sport_type` + trigger). Cannot apply pre-merge (`main` selects `sport_type`). Executes at the cutover.
- ✅ **#2 DONE (bias)**: the "default to volleyball" bias removed from PORTFOLIO_CONTEXT (the corruption cause); model told sport is album-known. Vestigial `sport_type` field stays (trigger-overridden); full field removal rides with the prompt replacement (#10).
- ✅ **H2 DONE**: `supabase/migrations/` declared canonical (README banner); 8 rebuild-era dupes removed from `database/migrations/` (now a frozen legacy archive).
- ⏸️ **#8 DEFERRED (rationale)**: `exec_sql` security hole is already closed (anon revoked, service-role-only); the DROP is merge-gated; replacing 8 aggregation callers with typed RPCs is large for marginal gain (service_role is all-powerful regardless). Folded into the #10 ingest rebuild, not done speculatively.
- ✅ **Rebuild MERGED + DEPLOYED** (PR #6/#7/#8): event-discovery model live on prod; exec_sql cluster fixed (#8 done); timeline regression fixed.
- ✅ **`ai_confidence` DROPPED** (20260609020000): genuinely inert; H1 loop closed.
- **Remaining drops — each has a LIVE tendril, so they are a dedicated migration, not leaf drops:**
  - ✅ **6 vanity columns DROPPED** (20260609030000): `match_photos` recreated without the 4 vanity output cols (all 3 callers use only `image_key`; re-granted to anon + verified anon-callable), `normalize_composition` dropped, then the 6 cols dropped.
  - **`players`**: still WRITTEN by the new-album sync pipeline — **gated on the #10 ingest rebuild** (switch sync to write sightings, not players).
  - **`sport_type`**: ⚠️ **RECOMMEND KEEP.** It's a trigger-enforced CORRECT mirror of `albums.sport`, not harmful cruft. Dropping it cascades into 6 live objects (`albums_summary`, `timeline_month_sports`, `find_photos_by_jersey`, `find_similar_photos`, `match_photos`, the trigger) + needs a `photos_read` seam-flip redeploy — high cost/risk for a column that's already correct. The seam exists if we ever want it, but the pragmatic call is to keep it as a documented denormalization.
  - **`jersey_number`**: still in live `PHOTO_COLUMNS` (used) — keep.
  - **`exec_sql` function**: now zero callers (#8) → droppable, but it's SELECT-only + service-role-only (secured) and useful for diagnostics — optional, not urgent.
- **Slice 2** (in flight): lands #5 (drop `players[]`/`jersey_number` after relational backfill) + #9.
- **Hygiene H2**: reconcile #7, archive #9's dead def.
- **Later slices**: #2 (AI layer), #8 (kernel RPC), #10 (unified ingest).

## IA re-architecture (product model: discover event → find photos → share; no sales)
Done on vnext-phase1: Albums→event-discovery (search all + sport/year), nav reshape (Albums leads, Explore folded into Search), Explore-defacet (lean search-results: search+sport+category+play_type+jersey), Collections re-based on `quality_score` (4 kept, 5 aesthetic ones cut), vanity aesthetic chips removed from live photo displays.

| # | Deprecated artifact | Where | Removal trigger | Risk |
|---|---|---|---|---|
| 11 | Vanity aesthetic columns: `composition`, `lighting`, `color_temperature`, `time_of_day`, `emotion`(categorical), `action_intensity` | photo_metadata | ✅ **CODE-DEPRECATED** (commit 010ac29): removed from PHOTO_COLUMNS + Photo type + database.ts + transformPhotoRow + all consumers; numeric sub-scores kept. Only the DB `DROP COLUMN` remains — **MERGE-GATED to the cutover**. | LOW (code done) |
| 12 | Dead components referencing vanity facets | src/lib | ✅ **DONE** (010ac29): `FilterPanel.svelte` + `ContextualCursor.svelte` deleted (0 importers); `Lightbox.svelte` de-vanity'd (it's live, 7 importers); `photo-utils.ts` generators de-vanity'd. | — |
| — | Favorites → "My Selection" + batch download (zip worker exists) | src/routes/favorites | IA slice not yet done (feature + product call) | — |

## Rule for every future slice
Definition-of-done includes: (a) the superseded artifact is removed from code AND schema, (b)
consumers repointed, (c) this ledger updated (row removed when done), (d) `npm run check` green.
If you cannot remove it safely in the same slice, it gets a row here with a removal trigger ≤ the
next slice — never an open-ended "deprecated but kept."
