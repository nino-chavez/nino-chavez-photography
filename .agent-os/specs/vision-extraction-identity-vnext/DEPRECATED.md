# Deprecation & Convergence Ledger — north-star rebuild

## 🚨 MIGRATION SAFETY RULE (learned the hard way, 2026-06-08)
There is ONE database and it is PROD. Prod serves `main`'s code, not this branch. Therefore:
- **ADDITIVE migrations** (new columns/tables/functions, data fixes) are safe to apply pre-merge — `main` ignores what it doesn't select.
- **DESTRUCTIVE migrations** (DROP COLUMN, table rename, anything `main` still SELECTs) **BREAK PROD** the moment they apply, because `main`'s `PHOTO_COLUMNS` still references the column. They are **MERGE-GATED**: apply only after this branch is merged to `main` and deployed (so prod code no longer selects the dropped thing).
- Incident: H1 dropped `ai_confidence` → every prod gallery read 500'd ("column does not exist") → restored via `20260608050000_restore_ai_confidence_prod_hotfix`. The drop was deferred to post-merge and finally applied in `20260609020000` (see row 3).
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
| ~~1~~ | ~~`photo_metadata.sport_type` mirror + `enforce_album_sport` trigger~~ | photo_metadata | — | 🔒 **KEEP (decision 2026-06-09)** — correct trigger-enforced denormalization of `albums.sport`, not cruft. Dropping cascades into 6 live objects (`albums_summary`, `timeline_month_sports`, `find_photos_by_jersey`, `find_similar_photos`, `match_photos`, the trigger) + a `photos_read` seam-flip redeploy, for zero visible gain. Seam exists if ever needed. | — |
| 2 | Two-bucket vision prompt's per-photo sport extraction + "default volleyball" bias | `src/lib/ai/enrichment-prompts.ts` (BUCKET1, PORTFOLIO_CONTEXT) | `albums.sport` (operator-set) + taxonomy-driven structured extraction | ✅ **bias removed** (the corruption cause is gone; model told sport is album-known). Full two-bucket→structured-prompt replacement **rides with #10**. | resolved (bias); LOW remainder |
| ~~3~~ | ~~`ai_confidence`~~ | — | — | ✅ **DONE** — dropped in `20260609020000` (H1's early drop broke prod → restored → re-dropped post-merge); writer (sync) + 3 transforms + types removed | — |
| ~~4~~ | ~~Agentic extras (`ball_position`/`venue_type`/`crowd_density`/`key_moment`)~~ | — | — | ✅ **DONE (H1)** — columns dropped; sole writer `run-enhanced-extraction.ts` deleted | — |
| 5 | `photo_metadata.players[]` JSONB (2 shapes) + singular `jersey_number` | photo_metadata | `photo_players` (resolved) + `photo_jersey_sightings` (Slice 2, LIVE — 2,272 sightings backfilled) | **MERGE-GATED drop**: `DROP COLUMN players, jersey_number` only at the cutover (a drop; `main` may select them). Relational replacement is already populated. | MEDIUM |
| ~~6~~ | ~~`createSemanticDescription()` enum-string embedding fallback~~ | — | — | ✅ **DONE** — fallback + interface removed; captions are the only embedding source | — |
| ~~7~~ | ~~Dual migration dirs: `database/migrations/` vs `supabase/migrations/`~~ | repo | `supabase/migrations/` is canonical (CLI-applied, in sync with remote) | ✅ **H2 DONE** — `supabase/migrations/` declared canonical (README banner); rebuild-era dupes removed from `database/migrations/` (now a frozen legacy archive). Sole residual: #9's dead def (below). | — |
| ~~8~~ | ~~`exec_sql` + its 8 callers~~ | `src/lib/supabase/server.ts` | typed aggregation RPCs (contract §7) | ✅ **callers DONE** — 0 real callers in `src` (remaining mentions are comments documenting the anon-safe GROUP BY replacements). `DROP FUNCTION` **deferred/optional**: SELECT-only + service-role-only (anon revoked) + useful for diagnostics → kept, not urgent. | — |
| ~~9~~ | ~~`find_photos_by_jersey` legacy INT def~~ | `database/migrations/add-enhanced-metadata-fields.sql` | Slice 2 jersey RPC (`supabase/migrations/20260609000001` + `…010000`, LIVE) | ✅ **RESOLVED** — RPC shipped; the legacy def's whole host file (it created the now-dropped #4 agentic-extras columns too) sits in `database/migrations/`, which H2's `README.md` banner declares a **frozen legacy archive** → already archived by location. No file surgery: renaming for filename-clarity would break a stale `scripts/apply-enhanced-migration.ts` + audit/spec references for marginal gain. | — |
| 10 | Two-bucket enrich prompt + enrich→EXIF-keyword→sync round-trip | `enrichment-prompts.ts`, `enrich-local-photos.ts`, `sync-local-to-supabase.ts` | unified structured ingest (contract §5) writing directly to DB | **Ingest-pipeline slice** | MEDIUM |

## Convergence sequence (prod-safe order)

- ✅ **#6 DONE**: enum-fallback removed.
- ⚠️ **Hygiene H1 PARTIAL**: #4 (agentic extras — `main` doesn't select them) dropped safely. #3 (`ai_confidence`) drop **reverted** (broke prod; `main` selects it) → column restored, branch code already doesn't use it, **drop is MERGE-GATED**. Writers/readers removed in branch code; `run-enhanced-extraction.ts` deleted.
- ✅ **Data-access seam DONE**: `PHOTOS_READ`/`PHOTOS_WRITE` in columns.ts; all ~70 read sites + the 1 write routed through it. Schema cutover is now a 1-line flip.
- ⛔ **Convergence C1 SHELVED** (was: `photos_read` view → flip `PHOTOS_READ` → drop #1 `sport_type` + trigger): **superseded by the 2026-06-09 KEEP decision on #1** (see row 1 / the `sport_type` bullet below). The seam (`PHOTOS_READ`) is built and stays available if the call is ever reversed, but `sport_type` is kept as a documented denormalization, so C1 does not execute.
- ✅ **#2 DONE (bias)**: the "default to volleyball" bias removed from PORTFOLIO_CONTEXT (the corruption cause); model told sport is album-known. Vestigial `sport_type` field stays (trigger-overridden); full field removal rides with the prompt replacement (#10).
- ✅ **H2 DONE**: `supabase/migrations/` declared canonical (README banner); 8 rebuild-era dupes removed from `database/migrations/` (now a frozen legacy archive).
- ✅ **#8 callers DONE**: the 8 `exec_sql` aggregation callers were replaced with anon-safe typed queries (0 real callers left in `src`; remaining mentions are explanatory comments). The `DROP FUNCTION` itself is **deferred/optional** — `exec_sql` is SELECT-only + service-role-only (anon revoked) + useful for diagnostics, so it's kept, not urgent.
- ✅ **Rebuild MERGED + DEPLOYED** (PR #6/#7/#8): event-discovery model live on prod; exec_sql cluster fixed (#8 done); timeline regression fixed.
- ✅ **`ai_confidence` DROPPED** (20260609020000): genuinely inert; H1 loop closed.
- **Remaining drops — each has a LIVE tendril, so they are a dedicated migration, not leaf drops:**
  - ✅ **6 vanity columns DROPPED** (20260609030000): `match_photos` recreated without the 4 vanity output cols (all 3 callers use only `image_key`; re-granted to anon + verified anon-callable), `normalize_composition` dropped, then the 6 cols dropped.
  - **`players`**: still WRITTEN by the new-album sync pipeline — **gated on the #10 ingest rebuild** (switch sync to write sightings, not players).
  - **`sport_type`**: ⚠️ **RECOMMEND KEEP.** It's a trigger-enforced CORRECT mirror of `albums.sport`, not harmful cruft. Dropping it cascades into 6 live objects (`albums_summary`, `timeline_month_sports`, `find_photos_by_jersey`, `find_similar_photos`, `match_photos`, the trigger) + needs a `photos_read` seam-flip redeploy — high cost/risk for a column that's already correct. The seam exists if we ever want it, but the pragmatic call is to keep it as a documented denormalization.
  - **`jersey_number`**: still in live `PHOTO_COLUMNS` (used) — keep.
  - **`exec_sql` function**: now zero callers (#8) → droppable, but it's SELECT-only + service-role-only (secured) and useful for diagnostics — optional, not urgent.
- ✅ **Slice 2 RPC shipped**: relational jersey-finding is live (`find_photos_by_jersey` text-sig, `20260609000001` + `…010000`). #5's `players[]`/`jersey_number` drop is the only Slice-2 leftover — gated on #10 (sync still writes `players`).

### Remaining work (as of 2026-06-09 — everything else above is DONE or a deliberate KEEP)
- **#10 unified ingest** — the one substantial item left. Legacy `enrich-local-photos.ts` + `sync-local-to-supabase.ts` (two-bucket prompt → EXIF round-trip) are still present; scoped in `INGEST-REBUILD-10.md` (slice 1 `extraction_version` done), not built. Operator-in-the-loop (needs local photos to verify).
- **#5 `players[]` / `jersey_number` drop** — gated on #10 (sync still writes `players`).
- **#2 full prompt replacement** — two-bucket → structured extraction; rides with #10. (The dangerous bias is already removed.)

**Deliberate KEEPs (not incomplete):** #1 `sport_type` mirror + trigger, `jersey_number`, the `exec_sql` function.

## IA re-architecture (product model: discover event → find photos → share; no sales)
Done on vnext-phase1: Albums→event-discovery (search all + sport/year), nav reshape (Albums leads, Explore folded into Search), Explore-defacet (lean search-results: search+sport+category+play_type+jersey), Collections re-based on `quality_score` (4 kept, 5 aesthetic ones cut), vanity aesthetic chips removed from live photo displays.

| # | Deprecated artifact | Where | Removal trigger | Risk |
|---|---|---|---|---|
| ~~11~~ | ~~Vanity aesthetic columns: `composition`, `lighting`, `color_temperature`, `time_of_day`, `emotion`(categorical), `action_intensity`~~ | photo_metadata | ✅ **DONE** — code-deprecated (010ac29: removed from PHOTO_COLUMNS + Photo type + database.ts + transformPhotoRow + all consumers) **and** 6 columns `DROP`ped (`20260609030000_cutover_drop_vanity_columns`); numeric sub-scores kept. | — |
| 12 | Dead components referencing vanity facets | src/lib | ✅ **DONE** (010ac29): `FilterPanel.svelte` + `ContextualCursor.svelte` deleted (0 importers); `Lightbox.svelte` de-vanity'd (it's live, 7 importers); `photo-utils.ts` generators de-vanity'd. | — |
| — | Favorites → "My Selection" + batch download (zip worker exists) | src/routes/favorites | IA slice not yet done (feature + product call) | — |

## Rule for every future slice
Definition-of-done includes: (a) the superseded artifact is removed from code AND schema, (b)
consumers repointed, (c) this ledger updated (row removed when done), (d) `npm run check` green.
If you cannot remove it safely in the same slice, it gets a row here with a removal trigger ≤ the
next slice — never an open-ended "deprecated but kept."
