# Ingest Rebuild (#10) — unified structured ingest, no EXIF round-trip

**Status:** Scoped, not implemented. The last legacy path of the north-star rebuild. Implement fresh.
**Unlocks:** the `players` column drop (#5), provenance/versioning, confidence-scored extraction, native new-album processing.

## Why
New-album processing is the only part of the system still on the pre-rebuild pattern. It's a 3-script
chain (`run-pipeline.ts` → `enrich-local-photos.ts` → `sync-local-to-supabase.ts` → `upload-local-to-cloudflare.ts`)
with a wasteful, lossy **EXIF round-trip**: enrich writes AI metadata INTO each file's EXIF
(`caption`→ImageDescription, `players`/`team_colors`→UserComment JSON, classification→Keywords), then
sync shells out to `exiftool` to read it back and INSERT. It also (a) writes the dead `players` JSONB
instead of `photo_jersey_sightings`, (b) parses `sport_type` from a Keyword regex instead of the
album-authoritative `albums.sport`, and (c) still uses the legacy two-bucket prompt shape.

## Target architecture — one pass, direct to DB
A single ingest module that, per album, does NOT touch EXIF at all:

1. **Require the `albums` row** (operator-curated `sport`/`category`). Fail loudly if missing — sport is
   album-authoritative; a new album MUST declare its sport before ingest (the trigger mirrors it to
   `photo_metadata.sport_type`). Seed via `database/seed/album-sports.json` + `load-album-sports.ts`.
2. **Per image, in one pass (bounded concurrency):**
   - **Upload** to Cloudflare Images with album-scoped id `${albumKey}-${imageKey}` (Phase 0 fix —
     never the bare filename; 5409 = error, never alias). Capture `cf_image_id`.
   - **Extract** via the structured, taxonomy-driven, **sport-aware** prompt (the album's known sport →
     constrain `play_type` to `PLAY_TYPES_BY_SPORT[sport]`; NEVER guess sport). Returns: `caption`,
     `play_type`, `photo_category`, the numeric quality sub-scores (sharpness/composition_score/
     exposure_accuracy/emotional_impact), and `players[]` (jersey_number TEXT, team_color, action,
     position) for sightings. NOT the deprecated vanity facets.
   - **Embed** the caption via `embedText` (OpenRouter text-embedding-3-large@768) — same seam as query.
   - **Write directly to `photo_metadata`** (UPSERT by photo_id/image_key+album_key): caption, embedding,
     play_type, photo_category, sub-scores, cf_image_id, dates, `extraction_version`. `sport_type` is set
     by the `enforce_album_sport` trigger from `albums.sport` — the writer does NOT send it.
   - **Write `photo_jersey_sightings`** from `players[]` (the same shred logic as
     `backfill-jersey-sightings.ts`, with `dedup_key`). NOT the `players` JSONB column.
3. **Refresh `albums_summary`** once at the end.

## Kills (cruft removed)
- The EXIF round-trip (enrich-to-EXIF + sync-from-EXIF + the `exiftool` dependency).
- The `players` JSONB write → enables dropping the `players` column (ledger #5).
- `sport_type`-from-keyword parsing → album-authoritative only.
- The legacy two-bucket prompt shape → the structured taxonomy/sport-aware prompt (`buildCombinedPrompt`
  is already most of the way there; finalize it as the single ingest prompt and retire `BUCKET1_PROMPT`/
  `ENHANCED_AGENTIC`/the two-bucket variants).
- The 3-script `execSync` orchestration → one module with a `--dry-run`, resumable checkpoint, 429 backoff
  (reuse the `backfill-vnext.ts` patterns).

## Adds
- **`extraction_version`** column (provenance) — stamp each row so future model changes re-process only
  stale rows instead of a blind full re-run. (Additive migration.)
- Optional: extraction **confidence** per field for a future review queue (defer unless needed).

## Slices
1. **Migration (additive):** add `photo_metadata.extraction_version`.
2. **Extraction module:** finalize the sport-aware structured prompt (input: album sport; output: the kept
   fields + players[]); a `extractOne(imageBuffer, {albumSport, albumName})` returning the typed result.
3. **Ingest runner:** `scripts/ingest-album.ts --dir --album-key --album-name --upload-date [--dry-run]`
   that does upload + extract + embed + direct DB write + sightings, per image, resumable.
4. **Cutover:** repoint `run-pipeline.ts` (or replace it) to the new runner; delete `enrich-local-photos.ts`,
   `sync-local-to-supabase.ts`, the EXIF write/read code; drop the `players` column (now unwritten).
5. **Verify:** process a fresh test album end-to-end; assert DB rows have caption+embedding+play_type+
   scores+cf_image_id, sightings populated, `sport_type` matches the album, no EXIF written, re-run idempotent.

## Acceptance
- A new album processes via ONE command, writes directly to the DB (zero `exiftool` calls), populates
  `photo_metadata` (album-correct sport via trigger) + `photo_jersey_sightings`, embeds captions, and is
  resumable/idempotent. The 3 legacy scripts + the EXIF round-trip are gone. `players` column droppable.

## Reference
- Reuse: `backfill-vnext.ts` (concurrency/backoff/checkpoint/lenient-caption parse), `backfill-jersey-sightings.ts`
  (shred→sightings + dedup_key), `embeddings.ts` (`embedText`), `taxonomy.ts` (`PLAY_TYPES_BY_SPORT`),
  `upload-local-to-cloudflare.ts` (CF upload + the `${albumKey}-${imageKey}` id + 5409-as-error).
- Credentials: [[photography-live-credentials]] (OpenRouter for vision+embed; CF Images token from 1Password).
