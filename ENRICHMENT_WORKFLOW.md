# Album Ingest Workflow

New-album processing is a **single command** that writes directly to the database — no EXIF round-trip, no 3-script chain.

> **History:** the legacy `enrich-local-photos.ts → sync-local-to-supabase.ts → run-pipeline.ts` chain (which wrote AI metadata into each file's EXIF, then shelled out to `exiftool` to read it back) was removed in the **#10 ingest cutover** (2026-06). See `blueprint/prescription.yml` and `blueprint/decisions/0002` / `0004`. The backfill/re-enrich tooling (`backfill-vnext.ts`, `enrichment-prompts.ts`) is unrelated and stays.

## Overview

`scripts/ingest-album.ts` does, per image in one pass (bounded concurrency, resumable):

0. **Content-hash gate.** sha256 the file bytes; refuse — loudly, before uploading anything — if that hash already exists under a different `photo_id` ("same shoot exported to a second folder"). Backed by `photo_metadata.content_hash` + a partial `UNIQUE` index (see **Migrations** below).
1. **Upload** to Cloudflare Images with the album-scoped id `${albumKey}-${imageKey}` (a 5409 "already exists" is an error, never an alias).
2. **Extract** via the single structured, sport-aware prompt (`src/lib/ai/ingest-extraction.ts` `extractOne`) — caption, `play_type`, `photo_category`, numeric quality sub-scores, and `players[]` for sightings. It **never** emits sport. As of [ADR 0006](blueprint/decisions/0006-vision-prompt-v2-and-image-vector-search.md) (2026-09-25), the caption instruction names every legible on-court jersey number (prompt v2) — see that ADR for the coverage-vs-precision tradeoff this measurably costs `players[]` sightings.
3. **Embed** the caption via `embedText` (OpenRouter `text-embedding-3-large` @768) — written for the `caption` column, but no longer the search-ranking seam (see step 3b).
3b. **Embed the image** via `embedImage` (OpenRouter `google/gemini-embedding-2` @768 — `src/lib/ai/embeddings.ts`) + compute deterministic sharpness (`computeSharpness`, `src/lib/ai/sharpness.ts`). `image_embedding` is the primary semantic-search ranking vector as of ADR 0006; `sharpness_measured` is a deterministic companion to the model-scored `sharpness` column, not a replacement.
4. **Write** `photo_metadata` directly (UPSERT) + `photo_jersey_sightings`. A reprocessed photo's sightings are **replaced** — its prior `source='players_new'` rows are deleted, then the fresh set is inserted — so a re-run converges instead of leaving stale sightings beside new ones. It **never** writes the deprecated `players` JSONB column and **never** sets `sport_type` (the `enforce_album_sport` trigger mirrors it from `albums.sport`).

It is **reprocess-in-place / idempotent**: re-running an album updates rows, never duplicates. The run summary reports sightings **stored** (post-dedup), not sightings sent — those can differ when two players in a photo shred to the same `dedup_key`.

Two more things the runner does that aren't "per image":

- **Album-name check.** After the run, the album name is checked against the naming standard, `[Level Division Sport] - [Event or matchup] - [MM-DD-YYYY]` (e.g. `HS Girls VB - JCA at ACC - 09-22-2026`; owner: `checkAlbumName` in `src/lib/utils/canonical-album-naming.ts`). Only the parts the facts decide are checked: the prefix must match `albums.level`/`division`/`sport` (omitted when no level or division is known) and the last segment must be the capture date (`MM-DD-YYYY to MM-DD-YYYY` for a multi-day album). The event or matchup is yours to write. On a mismatch it prints the issues and the standard name; it never renames.
- **Missing/renamed files.** After the local `--dir` listing is read, any DB row for the album with no matching file is reported as a removal candidate. Pass `--prune` to actually delete those rows (cascades to their sightings) and best-effort delete their Cloudflare Images; without `--prune` it's report-only.

## Prerequisites

**Supabase environment** (`.env.local`):

```
VITE_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Runtime tokens come from 1Password.** These are the owned field mappings; do not assume the
generic `credential` field for the Cloudflare bundle, and do not fall back to a stale token in
`.env.local`:

| Environment variable | 1Password reference |
|---|---|
| `OPENROUTER_API_KEY` | `op://Developer Secrets/OpenRouter photography/credential` |
| `CF_ACCOUNT_ID` | `op://Developer Secrets/Cloudflare photography/account_id` |
| `CF_IMAGES_API_TOKEN` | `op://Developer Secrets/Cloudflare photography/images_api_token` |

Inject them for the process that runs the album:

```bash
CF_ACCOUNT_ID="$(op read 'op://Developer Secrets/Cloudflare photography/account_id')" \
CF_IMAGES_API_TOKEN="$(op read 'op://Developer Secrets/Cloudflare photography/images_api_token')" \
OPENROUTER_API_KEY="$(op read 'op://Developer Secrets/OpenRouter photography/credential')" \
npm run ingest:album -- \
  --dir /path/to/album \
  --album-name "HS Girls VB - Team A vs Team B - 08-25-2026" \
  --sport volleyball \
  --unlisted
```

**The `albums` row must exist first.** Sport is album-authoritative — a new album needs an `albums` row with its `sport` (operator-curated) before ingest, or its photos get `sport_type=NULL`. Seed via `database/seed/album-sports.json` + `load-album-sports.ts`. The runner fails loudly if the album row is missing.

## Quick start

```bash
CF_ACCOUNT_ID="$(op read 'op://Developer Secrets/Cloudflare photography/account_id')" \
CF_IMAGES_API_TOKEN="$(op read 'op://Developer Secrets/Cloudflare photography/images_api_token')" \
OPENROUTER_API_KEY="$(op read 'op://Developer Secrets/OpenRouter photography/credential')" \
npm run ingest:album -- \
  --dir /path/to/album \
  --album-key xSqPJB \
  --album-name "FUTURE — Fall 2025" \
  --sport volleyball \
  --upload-date 2025-11-03 \
  --unlisted          # hide on the live gallery until you publish
# add --dry-run to preview, --overwrite to force re-extraction
```

Flags: `--dir` (required) · `--album-key` (defaults to the folder-name slug) · `--album-name` · `--sport` (detected from `--album-name` when omitted) · `--upload-date YYYY-MM-DD` · `--concurrency 4` · `--limit N` · `--unlisted` · `--dry-run` · `--overwrite` · `--prune` (delete DB rows whose file is gone from `--dir`; report-only without this flag).

Progress is checkpointed to `.temp/ingest-<album-key>.checkpoint.json` — interrupt and re-run to resume.

## Migrations

Additive-only. Apply `supabase/migrations/20260925210000_photo_metadata_content_hash.sql`
**before** running ingest against this version of the script — it adds `photo_metadata.content_hash`
(nullable) and a partial `UNIQUE` index on it. Ingest writes `content_hash` unconditionally and
does not fall back if the column is missing, so running ingest against an un-migrated database
fails on the first photo.

**Same situation, same fix, for image vectors** (ADR 0006): apply
`supabase/migrations/20260925230000_photo_metadata_image_embedding.sql` **before** running this
version of ingest — it adds `photo_metadata.image_embedding` (`vector(768)`) and
`sharpness_measured` (nullable). Ingest writes both unconditionally; running it against an
un-migrated database fails on the first photo, same as `content_hash` above.

`supabase/migrations/20260925240000_match_photos_image_embedding.sql` (the RPC change that makes
`match_photos`/`match_photos_hybrid` rank on `image_embedding` instead of the caption-text
`embedding`) is a SEPARATE, later step — it must ship in the same deploy as the app-side
query-embedder switch (`embedSearchQuery` in `src/lib/supabase/server.ts`, and the chat tool in
`src/routes/api/chat/+server.ts`), and only after `scripts/backfill-image-embeddings.ts` has
caught up existing rows. See ADR 0006's "Deployment sequencing" for the full apply order and why
the RPC migration is merge-gated where the column migration is not.

## Verify

`npm run verify:album -- --album-key <KEY> [--dir /path/to/album]` (`scripts/verify-album.ts`) is
the standing replacement for "adapt someone's `.temp` script". It checks:

- row count equals the file count in `--dir` (when passed)
- every row has `caption`, `embedding`, `cf_image_id`, `extraction_version`, all 4 quality
  sub-scores, and `play_type` whenever `photo_category` is `"action"`
- every row's `sport_type` matches `albums.sport`
- the ingest checkpoint (if present) has no entries left in `failed`
- at least one `photo_jersey_sightings` row exists for the album

Exits non-zero on any failure. `scripts/publish-album.ts` imports and runs the same check as a
publish gate — see **Publish** below — so there is one place these rules live, not two.

## Publish

`npm run publish:album -- --album-key <KEY> [--scope lpo] [--dry-run]` flips `album_settings` to
`visibility='public'`. It runs `verify-album`'s checks first and **refuses to publish** on
failure unless you pass `--force "<reason>"`, which prints the reason and publishes anyway.
`--unpublish` is never gated — hiding a bad album is always safe.

## Recovering historical color data

Before the 2026-09 fix, `normColor()` kept only the first word of a jersey/team color
("light blue" → "light"), so 2,471 live `photo_jersey_sightings` rows carry `team_color` in
`('light', 'dark', 'neon')` — a bare modifier with no color. `scripts/backfill-sighting-colors.ts`
recovers the full color from `photo_metadata.players` (only populated for pre-north-star albums;
a new-style ingest never fills it) when exactly one candidate matches on jersey number + the old
truncated color, and reports `recoverable` / `ambiguous` / `unrecoverable` / `collision` per
album. Run `npx tsx scripts/backfill-sighting-colors.ts --dry-run` and review the report before
anyone runs `--apply`. Run `--apply` before `photo_metadata.players` is ever dropped
(`.agent-os/specs/vision-extraction-identity-vnext/DEPRECATED.md` row 5) — that column is the
only recovery source and the drop is irreversible for this purpose.

## Backfilling image vectors (existing rows)

New ingests write `image_embedding`/`sharpness_measured` directly (see **Overview** step 3b). The
~20K rows ingested before ADR 0006 need `npm run backfill:image-embeddings` (`scripts/backfill-image-embeddings.ts`):
resumable checkpoint, bounded concurrency + 429 backoff, `--dry-run` (reports the row count and a
projected cost with ZERO OpenRouter calls), `--limit`, `--album-key`, and a hard `--max-cost`
(default $5) that stops the run once the running total (the API's own reported `usage.cost`, not
an estimate) reaches it. `--dry-run` degrades gracefully if the column migration hasn't landed yet
— see the script's own header comment.

## Known gaps (not fixed here — orchestrator's call)

- **The SQL `norm_color()` function** (migration `20260609000000`, used by `find_photos_by_jersey`
  and the other people-finding RPCs) still keeps only the first word — the same bug `normColor()`
  in TypeScript just fixed. It's applied to BOTH sides of a filter comparison, so color *search*
  still works (matching stays coarse — "light blue" and "light gray" still count as the same
  filter value), but any UI that displays a raw `team_color` value now shows the full color while
  the SQL search path still treats it as its first word only. Changing that function is a
  production RPC edit, out of scope for this pass.
- **The content-hash gate can't see pre-migration rows.** Every row ingested before
  `20260925210000_photo_metadata_content_hash.sql` has `content_hash = NULL`, and a NULL never
  collides with anything (the partial unique index excludes NULLs by design). A duplicate of an
  already-ingested, not-yet-reprocessed shoot will slip through until that original row is
  reprocessed (which backfills its hash).
