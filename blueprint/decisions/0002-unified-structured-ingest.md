# 0002 — Unified structured ingest: one pass, direct to DB, no EXIF round-trip

**Status:** Accepted · **Date:** 2026-06-10

## Context

New-album processing was the last pre-rebuild surface: a 3-script chain (`enrich-local-photos` → `sync-local-to-supabase` → `upload-local-to-cloudflare`) with a wasteful, lossy **EXIF round-trip** — enrich wrote AI metadata into each file's EXIF, then sync shelled out to `exiftool` to read it back and INSERT. It also wrote the deprecated `players` JSONB instead of relational sightings, parsed `sport_type` from a keyword regex instead of `albums.sport`, and used the legacy two-bucket prompt.

## Decision

A single ingest runner (`scripts/ingest-album.ts`) does one pass per image, directly to the DB: upload to Cloudflare Images (album-scoped id `${albumKey}-${imageKey}`) → sport-aware structured extraction (caption, category, play_type, quality sub-scores, `players[]`) → embed the caption → UPSERT `photo_metadata` (deterministic `photo_id`) → write `photo_jersey_sightings`. No EXIF write-back, zero `exiftool`. It also reads the camera/lens/exposure EXIF the files already carry (Sony A7 V / GM glass) and real GPS when present — never the `(0,0)` null-island placeholder.

## Consequences

- Idempotent re-runs: `photo_id = ${albumKey}-${imageKey}` (the live schema has no `unique(album_key, image_key)`), and a Cloudflare 5409 ("already exists") is treated as idempotent reuse, not a fatal alias.
- The `players` JSONB write is gone → the column became droppable once the relational backfill completed (46,702 sightings).
- Album-sport gate: the runner requires/bootstraps the `albums` row; sport is detected from the album name and never guessed.
- Operator workflow: point at a folder; the runner derives the `album_key` from the folder name. **Open gap:** there is no "reprocess an existing album in place" mode — running on the same files with a new folder name creates a *duplicate* album (this happened with bpo-2026 vs TRoiyO). Reprocess in place via `--album-key <existing>`.
