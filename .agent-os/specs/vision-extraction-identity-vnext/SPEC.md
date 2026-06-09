# Specification: Vision Extraction + Identity + Embeddings v-next

> Grounding audit: `.agent-os/audits/vision-extraction-intent-audit.md`. Cost validation: `.temp/backfill-cost-probe.json` (measured 2026-06-08).

## Goal

Re-point the AI pipeline from an editorial/aesthetic catalog toward **people-finding and real search** — the actual job-to-be-done for sports photography. Three capabilities, applied to new albums and backfilled across the ~20K library:

1. **Caption-based + visual embeddings** — replace the enum-tag-string embedding (which can't serve descriptive, scene, jersey-color, or named queries) with (a) an embedding of an AI-generated natural-language caption for text/RAG search and (b) a CLIP image embedding for visual similarity and cross-modal text→image search.
2. **Identity** — promote the multi-player data already extracted but dropped on read, model canonical players/teams, and add face detection + clustering so a viewer can find every photo of a person by face, not just jersey.
3. **Hygiene** — cut/repurpose dead metadata, reconcile the stale type, and fix the "Best Photos" sort to use the quality blend that already exists.

## User Stories

**Viewer (player / parent / recruiter / fan):**
- As a parent, I want to find every photo of my kid by face (after naming them once), so I don't have to scan 119 frames per album.
- As a player, I want to search "number 12 in the red jersey" or "diving save near the sideline" and get relevant photos, so I can find myself by how I'd describe the moment.
- As a fan, I want "more like this" on a photo to return visually similar shots (same kind of moment/framing), not just shots sharing enum tags.
- As a recruiter, I want to filter an album by team and player, so I can pull one athlete's set quickly.

**Photographer (Nino — cull, curate, sell):**
- As the photographer, I want "Best Photos" to actually rank by the weighted quality blend (sharpness/composition/exposure/emotional), so my best work surfaces first.
- As the photographer, I want per-player galleries to fall out of the data automatically, so I can deliver/sell by athlete without manual tagging every frame.

## Core Requirements

### Functional

- **Caption extraction.** Enrichment emits a `caption` (one NL sentence, ≤30 words, includes visible jersey numbers, jersey/team colors, action, scene) and a `players[]` array (`{jersey_number, team_color, action}`, multi-player) alongside the existing buckets. Validated: +$0.00006/photo, captions usable.
- **Caption embedding.** Embed the caption (not the enum string). Powers descriptive/scene/name text search and the chatbot RAG.
- **Image (CLIP) embedding.** Embed each image into a joint text-image space. Powers "visually similar" and cross-modal text→image (CLIP text-encode the query, match image vectors).
- **Identity model.** New `players` and `teams` tables; `photo_players` link (from extracted `players[]` + jersey OCR); `photo_faces` (bbox + face embedding + cluster_id + nullable player_id). Migrate `user_tags.athlete_name` toward canonical `players`.
- **Face clustering + naming.** Cluster face embeddings into "same person" groups; admin/user names a cluster once → links cluster to a player → all that player's photos become findable by face.
- **Promote dropped data.** Add `players[]`, `team_colors` to `PHOTO_COLUMNS` (`columns.ts:9`); wire the existing `find_photos_by_jersey` RPC to a real explore filter (today jersey is URL-param only, no input widget).
- **Search/consumer surfaces.** Explore gains player, team, jersey-input, and face-cluster filters; chatbot retrieves over caption embeddings + gains player/face tools; "Best Photos" sort switches from `emotional_impact`-alone (`server.ts:177`) to the `photo-scoring.ts` weighted blend.
- **Hygiene.** Deprecate `ai_confidence` (fully dead); repurpose or stop extracting the filter-only-invisible fields (`composition`, `time_of_day`, `color_temperature`) and near-dead `time_in_game` unless a consumer is added; reconcile `src/types/database.ts` with the live schema.
- **Backfill.** Re-enrich + re-embed (caption + image) + face-process the ~20K library as phased batch jobs.

### Non-Functional

- Enrichment continues via OpenRouter `google/gemini-2.5-flash-lite` (benchmark: cheapest AND best on classification). Provider creds injected at runtime / 1Password (`OpenRouter photography`, `Cloudflare photography`); `.env.local` updates need operator approval.
- Backfill is a resumable batch job (checkpoint progress; safe to re-run). Enrichment ~1.5h at concurrency 10; throttle to provider limits (CF Images ~4/s — upload already has 429 backoff + concurrency 3).
- Face data carries a **privacy/consent** posture: tie to the letspepper media-consent waiver; support per-person hide/opt-out; faces table is service-role only.
- Vector columns get appropriate ANN indexes (HNSW already on the text embedding; add for image embedding) given ~20K rows.

## Decisions (operator-confirmed 2026-06-08)

- **Embeddings: both** caption (text) + CLIP (image).
- **Identity: include face grouping** (not jersey-only).
- **Reprocess: backfill the whole ~20K library.**
- **Providers (effort discounted → pick on cost+accuracy):**
  - Faces: **self-hosted InsightFace `buffalo_l`** (RetinaFace + ArcFace). Highest accuracy and ~$0–5; RetinaFace wins the deciding axis (recall on turned/blurry action faces). Hosted InsightFace is the zero-infra fallback.
  - Image embedding: **SigLIP / OpenCLIP ViT-L/14** (not base ViT-B/32).
  - Caption embedding: **large text-embedding model** (`text-embedding-3-large` / Voyage-3).

## Reusable Components

### Existing to leverage
- `buildCombinedPrompt()` (`src/lib/ai/enrichment-prompts.ts`) — extend with the caption + players delta (validated in the cost probe).
- OpenRouter enrichment path (`enrich-local-photos.ts`, added 2026-06-08) — caption/players ride the same call.
- `players[]`, `team_colors`, `player_count` columns (`add-enhanced-metadata-fields.sql`) + `find_photos_by_jersey` RPC — already exist, just unread. Promote, don't rebuild.
- `match_photos()` RPC + `findSimilarPhotos()` pattern (`server.ts`) — reuse for caption-embedding search; clone for image-embedding search.
- `user_tags` + `TagInput`/`TagDisplay`/`admin/tags` — the naming UI to extend toward canonical players + face-cluster naming.
- `photo-scoring.ts` weighted blend — already written; wire into the default sort.
- `OBSOLETE-...schema-v3` migration — mine it for the `detected_jersey_numbers[]` / `main_subject_bbox` / `human_verified` shapes before reinventing.

### New required
- `caption` generation in the prompt + `caption_embedding` column (re-embed library).
- `image_embedding` column + image-embedding generator using **SigLIP / OpenCLIP ViT-L/14** (LOCKED; not base ViT-B/32).
- `players`, `teams`, `photo_players`, `photo_faces` tables + migrations.
- Face pipeline: detect → embed → cluster → name, using **self-hosted InsightFace `buffalo_l`** (LOCKED — RetinaFace detect + ArcFace embed; highest action-face recall, ~$0–5). Hosted InsightFace is the zero-infra fallback. Precision comes from a conservative clustering threshold + human-in-the-loop naming, not the provider.
- Resumable backfill orchestrator (`scripts/backfill-vnext.ts`) with per-stage checkpointing.
- Explore filter controls (player, team, jersey input, face cluster); chatbot tools.

## Technical Approach (summary)

1. **Extraction** — append the validated caption + players delta to `buildCombinedPrompt`; parse into new columns. Keep flash-lite via OpenRouter.
2. **Embeddings** — `caption_embedding` (Gemini text embed of caption; standardize on one model id, fixing the `gemini-embedding-001` vs `embedding-001` mismatch at `server.ts:1270`); `image_embedding` (CLIP). Two `match_*` RPCs.
3. **Identity** — migrations for players/teams/faces; backfill `photo_players` from `players[]`; face pipeline populates `photo_faces`; cluster + admin naming links clusters→players; migrate `user_tags`.
4. **Consumers** — explore filters + jersey input + face browse; chatbot RAG over captions + player/face tools; fix Best-Photos sort; promote columns in `PHOTO_COLUMNS`.
5. **Hygiene** — deprecate/repurpose dead fields; regenerate `database.ts` from live schema.
6. **Backfill** — phased (below), resumable, throttled.

## Phasing

- **Phase 1 — Text findability (highest leverage, lowest risk):** caption extraction + caption embedding + chatbot RAG + schema/type reconciliation + Best-Photos sort fix. Backfill enrichment + caption embeddings (~$12).
- **Phase 2 — Visual + jersey identity:** image/CLIP embedding + "visually similar" + promote `players[]`/`team_colors` + jersey input UI + `find_photos_by_jersey` wired. Backfill image embeddings (~$2–10).
- **Phase 3 — Faces:** provider decision → `photo_faces` + detect/embed/cluster + admin cluster-naming + canonical players/teams + `user_tags` migration + privacy/opt-out. Backfill face processing ($0–40).

## Cost & Runtime (validated 2026-06-08)

| Component | Basis | 20K |
|---|---|---|
| Re-enrichment (caption+players) | measured $0.000609/photo | $12.18 |
| Caption embeddings | ~40 tok/photo | <$0.20 |
| Image/CLIP embeddings | SigLIP / OpenCLIP ViT-L/14 (LOCKED) | ~$2–10 |
| Face detect+embed | self-hosted InsightFace `buffalo_l` (LOCKED) | ~$0–5 |
| **Total** | | **~$15–$20** |

With providers locked (self-hosted faces), cost lands at the bottom of the earlier range. Runtime is the real constraint: enrichment ~1.5h @ concurrency 10; faces add a longer pass. Plan as queued batch jobs.

## Out of Scope

- Replacing the enrichment model (benchmark settled it — flash-lite stays).
- Realtime/at-upload face recognition (backfill + new-album batch only).
- Cross-portfolio identity beyond this Supabase project.
- Editing `.env.local` without operator approval (runtime credential injection stands until then).
- A full reputation/voting tagging system (the minimal `user_tags` approval flow is enough).

## Success Criteria

1. "diving save near the sideline" returns relevant photos via caption embedding (today: impossible).
2. "more like this" returns visually similar shots via image embedding, not enum-tag overlap.
3. Naming one face cluster surfaces all of that person's photos by face.
4. Explore exposes player, team, jersey-input, and face filters; jersey filter no longer URL-only.
5. "Best Photos" ranks by the weighted quality blend, not `emotional_impact` alone.
6. `database.ts` matches the live schema; `ai_confidence` and other dead fields removed or given a consumer.
7. Backfill completes over the ~20K library, resumable, within the validated cost envelope.
8. Faces carry an opt-out/consent posture and are service-role-only.
