# Album Ingest Workflow

New-album processing is a **single command** that writes directly to the database — no EXIF round-trip, no 3-script chain.

> **History:** the legacy `enrich-local-photos.ts → sync-local-to-supabase.ts → run-pipeline.ts` chain (which wrote AI metadata into each file's EXIF, then shelled out to `exiftool` to read it back) was removed in the **#10 ingest cutover** (2026-06). See `blueprint/prescription.yml` and `blueprint/decisions/0002` / `0004`. The backfill/re-enrich tooling (`backfill-vnext.ts`, `enrichment-prompts.ts`) is unrelated and stays.

## Overview

`scripts/ingest-album.ts` does, per image in one pass (bounded concurrency, resumable):

1. **Upload** to Cloudflare Images with the album-scoped id `${albumKey}-${imageKey}` (a 5409 "already exists" is an error, never an alias).
2. **Extract** via the single structured, sport-aware prompt (`src/lib/ai/ingest-extraction.ts` `extractOne`) — caption, `play_type`, `photo_category`, numeric quality sub-scores, and `players[]` for sightings. It **never** emits sport.
3. **Embed** the caption via `embedText` (OpenRouter `text-embedding-3-large` @768) — the same seam the query path uses.
4. **Write** `photo_metadata` directly (UPSERT) + `photo_jersey_sightings` (from `players[]`, dedup_key). It **never** writes the deprecated `players` JSONB column and **never** sets `sport_type` (the `enforce_album_sport` trigger mirrors it from `albums.sport`).

It is **reprocess-in-place / idempotent**: re-running an album updates rows, never duplicates.

## Prerequisites

**Environment** (`.env.local`):

```
VITE_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...        # vision + embeddings (the only live AI gateway)
CF_ACCOUNT_ID=...
CF_IMAGES_API_TOKEN=...
```

**The `albums` row must exist first.** Sport is album-authoritative — a new album needs an `albums` row with its `sport` (operator-curated) before ingest, or its photos get `sport_type=NULL`. Seed via `database/seed/album-sports.json` + `load-album-sports.ts`. The runner fails loudly if the album row is missing.

## Quick start

```bash
npm run ingest:album -- \
  --dir /path/to/album \
  --album-key xSqPJB \
  --album-name "FUTURE — Fall 2025" \
  --sport volleyball \
  --upload-date 2025-11-03 \
  --unlisted          # hide on the live gallery until you publish
# add --dry-run to preview, --overwrite to force re-extraction
```

Flags: `--dir` (required) · `--album-key` (defaults to the folder-name slug) · `--album-name` · `--sport` (detected from `--album-name` when omitted) · `--upload-date YYYY-MM-DD` · `--concurrency 4` · `--limit N` · `--unlisted` · `--dry-run` · `--overwrite`.

Progress is checkpointed to `.temp/ingest-<album-key>.checkpoint.json` — interrupt and re-run to resume.

## Verify

Confirm the rows after a run (adapt `.temp/verify-bpo.ts`): `photo_metadata` count for the album, every row with `caption` + `embedding` + `play_type` + quality sub-scores + `cf_image_id` + `extraction_version`, `photo_jersey_sightings` populated, `sport_type` matching `albums.sport`. Then drop `--unlisted` (publish) when it looks right.
