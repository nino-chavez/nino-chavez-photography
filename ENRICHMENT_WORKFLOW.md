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

Flags: `--dir` (required) · `--album-key` (defaults to the folder-name slug) · `--album-name` · `--sport` (detected from `--album-name` when omitted) · `--upload-date YYYY-MM-DD` · `--concurrency 4` · `--limit N` · `--unlisted` · `--dry-run` · `--overwrite` · `--prune` (delete DB rows whose file is gone from `--dir`; report-only without this flag) · `--replace` (see **Replace** below) · `--skip-hdr` (see **HDR serving** below).

Progress is checkpointed to `.temp/ingest-<album-key>.checkpoint.json` — interrupt and re-run to resume.

## Replace (re-exporting an album in place)

A re-export of an already-ingested album (same folder, same filenames — e.g. after fixing HDR/SDR
settings in Lightroom and re-exporting) maps every file to the SAME `photo_id`/`cf_image_id` it
already has. Before `--replace` existed, re-running ingest against a re-export re-extracted the
caption/quality-scores from the NEW bytes but **skipped the Cloudflare Images upload** (the
reprocess-in-place short-circuit that avoids CF churn when nothing changed) — so the DB refreshed
from the new file while the served photo silently stayed the OLD pixels, permanently mismatched.

`--replace` closes that gap. Before touching anything, ingest hashes every local file and compares
it to the album's stored `content_hash`, then prints a plan:

```
🔁 Replace plan: 12 changed (replace in place), 31 unchanged (skip), 0 new
   ~ DSC09484 (content hash changed since last ingest)
   ~ DSC09457 (content hash changed since last ingest)
   …
```

- **Changed** files (hash differs from what's stored) get their Cloudflare image deleted, then
  re-uploaded under the SAME id — Cloudflare Images' upload endpoint refuses re-using an id that
  already exists (error 5409; see [Delete Images](https://developers.cloudflare.com/images/storage/manage-images/delete-images/)
  and [Upload using API](https://developers.cloudflare.com/images/storage/upload-images/methods/),
  both read while building this) — then re-extracts and updates the row, so album URLs, photo ids
  and photo page URLs never change.
- **Unchanged** files (hash matches) are skipped entirely: no Cloudflare operation, no re-extraction,
  no AI cost.
- **New** files (no prior row for this local key) are ingested normally regardless of `--replace`.

Without `--replace`, ingest **refuses** the moment it detects a changed file (unless `--dry-run` is
also passed, which only previews the plan and does nothing). This is a deliberate change of default
behavior: a plain re-run against a re-export used to silently proceed with mismatched pixels; now it
stops and tells you to pass `--replace`.

```bash
npx tsx scripts/ingest-album.ts --dir /path/to/re-export --album-key <KEY> --dry-run   # preview the plan
npx tsx scripts/ingest-album.ts --dir /path/to/re-export --album-key <KEY> --replace   # act on it
```

**Known limitation**: a row ingested before the 2026-09-25 content-hash migration has
`content_hash = NULL` (same gap `verify-album.ts`'s duplicate gate already documents). A row with a
null stored hash is always classified `unchanged` — never forced into `changed` — since there is
nothing to compare against. Reprocess that album once WITHOUT `--replace` first (which backfills
its `content_hash`); from then on `--replace` sees real changes on any later re-export.

Pure classification logic lives in `src/lib/ingest/replace-plan.ts` (`npm run replace-plan:test`).

## SDR/HDR drift check

Lightroom's HDR JPEG export (Ultra HDR / ISO gain-map format) is a normal SDR-viewable JPEG with a
gain map appended (MPF second image + `XMP-hdrgm` metadata) that HDR-aware decoders (Chrome,
Safari 26+) apply for a boosted render — everyone else, including Cloudflare Images and R2 serving
bytes as-is, sees the SDR base only (verified this session: Cloudflare Images' variants for a
gain-map source come back pixel-identical to the base). An aggressive SDR grade in Lightroom can
make that base look visibly wrong in places (crushed shadows, blown highlights, a face going dark
while the background blows out) even though the HDR-rendered version looks fine.

Every ingest of a gain-map JPEG runs a drift check (`src/lib/ai/hdr-gainmap.ts`) and prints a
**warning only** (never blocks the run) above a calibrated threshold:

```
⚠️  SDR/HDR drift high for DSC09484.jpg: stdLog2Gain=1.11 (threshold 0.85) spread=3.72 —
    the non-HDR fallback may look visibly off in some region of the frame. Lightroom settings:
    SDRBrightness=+97 SDRContrast=-36 SDRClarity=-22 SDRHighlights=-64 SDRShadows=+57 SDRWhites=-76
```

**What's measured, and why**: the score is the standard deviation of per-pixel `log2(HDR linear
luma / SDR-base linear luma)` across the frame — how NON-UNIFORM the gain map's correction is, not
how big it is on average. The mean of that value does NOT separate a bad export from a good one (it
mostly reflects scene dynamic range); calibrated 2026-09-26 against both real albums this session
(DWdCET/Milliken, Re7kho/acc-v-jca) — 12 files spanning every distinct SDR-setting group present,
6 flagged (Milliken's own "+97/-36" group, stdLog2Gain 0.87-1.28) and 6 not (Milliken's "+42/+14"
group plus other sampled files, 0.46-0.82) — `SDR_DRIFT_THRESHOLD = 0.85` sits in the resulting gap.
Running the check over full albums confirms it: every one of Milliken's 25 flagged photos (of 43)
carries the `+97/-36` settings; none of its 18 unflagged `+97/-36` files score above 0.84.

Standalone, over any local folder, no network calls, writes nothing:

```bash
npx tsx scripts/check-sdr-drift.ts --dir /path/to/album [--threshold 0.85]
```

Unit tests for the pure detection/parsing pieces: `npm run hdr-gainmap:test`.

## HDR serving (web-sized gain-map copies)

A gain-map original is served as-is on the photo detail page and in the lightbox when one exists,
falling back to the existing Cloudflare Images variant otherwise — a strict upgrade for browsers
that render Ultra HDR (Chrome, Safari 26+) and no change at all for everyone else, since the format
is backward-compatible by design.

Cloudflare Images can't be the delivery path for this (it strips the gain map on ingest — see
above), so ingest instead resizes the original with the gain map intact
(`src/lib/ai/hdr-resize.ts`) and uploads the result to the `photo-gallery-hdr` R2 bucket at a
deterministic key, `hdr/${photo_id}.jpg`. `photo_metadata.hdr_web_available` (additive migration
`20260926130000_photo_metadata_hdr_web.sql`) is the only thing that gates whether the site ever
requests that key — no key column needed, since the key is always derivable from the id.
`src/routes/api/hdr/[id]/+server.ts` streams it from R2 via the `HDR_ORIGINALS` binding
(`wrangler.toml`); the `<img>` on both surfaces falls back to Cloudflare Images `onerror`, so a
missing/stale object never breaks the page.

**Resizing without losing the gain map — the pipeline, proven this session on DSC09484**:
1. Extract the base JPEG (any plain JPEG decoder, including `sharp`, already ignores the MPF
   trailer) and the gain-map JPEG (`exiftool -mpimage2 -b`).
2. Read the gain map's own metadata config (`ultrahdr_app -m 1 -j <file> -f cfg` — any decode call
   writes it; the values describe the gain map's pixel encoding, not its resolution, so they carry
   over unchanged).
3. Resize BOTH to the exact same target dimensions (`sharp`, `fit: 'fill'`).
4. Re-encode via `ultrahdr_app -m 0` (encode scenario 4: recombine an existing SDR + gain-map pair).
5. Copy the `XMP-hdrgm` metadata block from the ORIGINAL onto the re-encoded output
   (`exiftool -TagsFromFile … -XMP-hdrgm:all`) — `ultrahdr_app`'s own encoder does NOT write it
   (verified: `grep`-ing the namespace string found it in the source and not in the raw encoder
   output), and real decoders (ImageMagick's UHDR delegate, confirmed; presumably Chrome/Safari,
   which key off the same namespace) need it to recognize the file as HDR at all. `exiftool`
   correctly rewrites the MPF byte offsets when it touches a file's segments — verified: the gain
   map still extracts to the right dimensions and `ultrahdr_app` still decodes the edited file.

Proven end-to-end this session: DSC09484 (5.47 MB, 2731×4096) → 1067×1600, 727 KB, `exiftool`
confirms `XMP-hdrgm:Version 1.0` present and the gain map extracts cleanly; a real object was
uploaded to and downloaded back from the production `photo-gallery-hdr` R2 bucket, byte-identical,
gain map intact, then deleted (the bucket itself was left in place, empty, since the wrangler.toml
binding needs it to exist — no album content was uploaded).

**Known gap**: the re-encoded file's MPF `MPImageType` sub-tag reads "Undefined" instead of "Gain
Map Image" (not `exiftool`-writable — confirmed). ImageMagick's UHDR delegate still recognizes the
result as HDR (keys off the XMP block), so this is treated as a cosmetic gap in a secondary signal,
documented rather than silently accepted. If a decoder ever turns out to require the exact
`MPImageType` value, this is the next thing to fix.

`buildWebHdrCopy` requires `ultrahdr_app` (`brew install libultrahdr`) and `exiftool`
(`brew install exiftool`) on the machine running ingest — both already installed on this machine.
It returns `null` (never throws) when either is missing, when the source has no gain map, or when
any pipeline step fails; the caller falls back to leaving `hdr_web_available=false`, same as before
this feature existed. Uploading the result to R2 shells out to `wrangler r2 object put ... --remote`
(needs `wrangler login`, or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in the environment — the
same account already used for Cloudflare Images). Pass `--skip-hdr` to skip the build/upload step
entirely (the drift check above still runs — it's free and local); useful on a machine without
`wrangler`/`ultrahdr_app`/`exiftool` set up, or to iterate faster.

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

**Same again, for HDR serving**: apply `supabase/migrations/20260926130000_photo_metadata_hdr_web.sql`
before running this version of ingest — it adds `photo_metadata.hdr_web_available` (`boolean NOT
NULL DEFAULT false`). Unlike the two above, ingest does NOT write this column unconditionally on
every row — only on a row it actually (re)uploads a Cloudflare image for (see **HDR serving**
above) — so an un-migrated database fails only on a photo whose Cloudflare image gets (re)written
this run, not on every photo.

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

**Announce.** When an album goes from hidden to public, publishing also starts the standing
gallery-announce campaign (Nino, 2026-09-25/26): the Let's Pepper social publisher picks up to 10
photos, writes a facts-only caption and alt text, queues an Instagram + Facebook carousel **held for
2 hours**, and sends a phone alert (ntfy) you can cancel it from. It then posts at the next noon or 5pm Central slot. The account comes from
`gallery_scope`: `lpo` posts from letspepper.open, anything else from nino.chavez.photo, with
flickday.media as a Collab that must be accepted in the Instagram app for each post. Re-publishing an
already-public album does not announce again; `--announce` announces one anyway, `--no-announce`
publishes without it. The builder and posting Worker live in the letspepper repo
(`scripts/social-publish/`, see its SETUP.md "Arming gallery-announce").

**Latest gallery.** The same hidden -> public transition also stamps
`album_settings.published_at = now()` (never on `--unpublish`, never on re-publishing an
already-public album — see `src/lib/albums/publish-target.ts`'s `resolvePublishTarget`, the pure
rule the script and its tests share). This is what `ninochavez.co/photography/latest`,
`/api/latest`, `/api/galleries/recent`, and the Instagram bio page `/photography/links` sort
on — the public album with the newest `published_at`, falling back to capture date
(`albums_summary.latest_photo_date`) for the many albums published before this column existed.
Requires migration `20260926140000_album_settings_published_at.sql` — until it's applied, a
hidden -> public publish fails loudly (the write errors, `publish-album.ts` exits 1) rather than
silently skipping the stamp.

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
