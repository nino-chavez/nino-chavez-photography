# Tasks: Vision Extraction + Identity + Embeddings v-next

Spec: `./SPEC.md` · Audit: `../../audits/vision-extraction-intent-audit.md`

Phases are independently shippable. Each delivers user-visible value before the next starts.

## Phase 0 — Prep & decisions

Provider decisions LOCKED 2026-06-08 (operator). Effort is not a deciding factor → pick on cost+accuracy, and for both the most accurate option is also the cheapest.

- [x] **Face provider: self-hosted InsightFace `buffalo_l` (RetinaFace detect + ArcFace embed).** Highest accuracy AND ~$0–5 (compute). RetinaFace leads on the deciding axis — detection recall on small/turned/motion-blurred action faces (= completeness of a person's set). Hosted InsightFace (Replicate/serverless, ~$5–20) is an acceptable zero-infra fallback, identical accuracy. NOT Rekognition (lower action-face recall, $20–40); NOT Google (no recognition); NOT Azure (access-gated).
- [x] **Image embedding: SigLIP or OpenCLIP ViT-L/14** (not CF Workers AI base ViT-B/32). Stronger retrieval; cost difference is rounding error at 20K.
- [x] **Caption embedding: a large text-embedding model** (`text-embedding-3-large` / Voyage-3). Negligible cost delta, better retrieval.
- [ ] Stand up the InsightFace inference path (local GPU/CPU batch or hosted) + SigLIP/OpenCLIP embedder. Effort accepted.
- [ ] Precision strategy: high-recall detection + **conservative clustering threshold + human-in-the-loop naming** (a false "that's your kid" match is worse than a miss for a sell-to-parents product).
- [ ] Update `.env.local` (operator) or formalize runtime credential injection for `OPENROUTER_API_KEY`, CF, and any face/embedding provider keys. Mint 1Password items per vault convention. (Runtime injection works today; prod Cloudflare Pages needs `OPENROUTER_API_KEY` set for live semantic search.)
- [x] Commit the 2026-06-08 plumbing changes (`enrich-local-photos.ts` OpenRouter branch, `upload-local-to-cloudflare.ts` 429 backoff). **Phase 1 branch.**
- [x] **cf_image_id collision fix (live bug).** `upload-local-to-cloudflare.ts` used the bare camera filename as the CF id → collided across albums (Sony resets numbering); the 5409 handler silently aliased rows to another album's CDN image. Fixed: id = `${albumKey}-${imageKey}` (globally unique); 5409 now errors instead of linking. 5 aliased frames already corrected live.

## Phase 1 — Text findability (highest leverage) — SHIPPED (branch `vnext-phase1`)

Verified end-to-end on the TRoiyO test album (Bell Pepper Open, 119 photos). Two latent prod bugs
were found and fixed in passing: (a) semantic search was fully broken — the security migration set
`search_path=''` on `match_photos`/`find_similar_photos`, hiding pgvector's `<=>` operator; (b) the
query embedder used a different model than the write path AND a now-revoked Google key.

- [x] Extend `buildCombinedPrompt()` with `caption` + `players[]`; `CombinedResponse` + `PlayerExtract` types updated.
- [x] Columns added via migration `20260608000000_vnext_phase1_...`: `caption TEXT` + `quality_score` (generated). **Decision: REPURPOSE the existing `embedding vector(768)` for caption-derived vectors** (no value lost, keeps the single HNSW index + match RPC, no dim migration). Documented in the migration header.
- [x] `enrich-local-photos.ts` writes caption → EXIF `ImageDescription`, players/team_colors → `UserComment` JSON; `sync-local-to-supabase.ts` reads them into `photo_metadata`.
- [x] `createSemanticDescription()` replaced — `generate-embeddings-metadata.ts` embeds the caption.
- [x] **Embedder standardized via new `src/lib/ai/embeddings.ts` (`embedText`).** NOT gemini (all Google keys revoked) — **OpenRouter `openai/text-embedding-3-large` @768** (only live gateway; honors Phase 0 "large model" lock; keeps the 768 column). Query + write share this one function.
- [x] Chatbot (`api/chat`) gains a free-text `query` → caption-embedding semantic branch; explore semantic fallback (`server.ts`) routes through `embedText`. Verified "diving save" / jersey-color / scene queries return relevant results.
- [x] "Best Photos" sort uses the generated `quality_score` weighted blend (not `emotional_impact` alone) — `server.ts` + `client.ts` + chat.
- [x] `src/types/database.ts` reconciled to the live 56-column schema (+ caption/quality_score); 8 phantom columns removed; `ai_confidence` deprecated + dropped from `PHOTO_COLUMNS`.
- [x] Resumable, idempotent, throttled `scripts/backfill-vnext.ts` — re-enrich (caption+players) + caption-embed. Proven on TRoiyO (119/119, $0.078; retried 5 max-token truncations on re-run). Full ~20K run is a separate queued batch.
- [x] Verified success criteria 1, 5, 6 on TRoiyO.

**Follow-ups before the full 20K backfill:** set `OPENROUTER_API_KEY` in Cloudflare Pages env (live semantic search); optional `REINDEX INDEX idx_photo_metadata_embedding` (HNSW rebuilt under low maintenance_work_mem during the generated-column table rewrite). During the full backfill the library temporarily mixes old enum-space and new caption-space vectors in `embedding`; global semantic search is only fully consistent once all rows are backfilled (per-album is consistent immediately).

## Phase 2 — Visual + jersey identity

- [ ] Add `image_embedding vector(N)` column + ANN index (N per SigLIP/ViT-L/14 — LOCKED).
- [ ] Build image-embedding generator (SigLIP / OpenCLIP ViT-L/14); generate for new + backfill.
- [ ] Add `match_photos_visual()` RPC (image→image, and CLIP text-encode→image for cross-modal).
- [ ] Wire "Visually Similar" (`photo/[id]`) to image embedding; wire a cross-modal path into explore.
- [ ] Promote `players[]`, `team_colors`, `player_count` into `PHOTO_COLUMNS` (`columns.ts:9`).
- [ ] Wire `find_photos_by_jersey` RPC to a real explore filter; add a jersey-number input widget (today: URL `?jersey=` only).
- [ ] Backfill image embeddings (~$2–10).
- [ ] Verify success criteria 2, 4.

## Phase 3 — Faces (provider-gated)

- [ ] Migrations: `players`, `teams`, `photo_players`, `photo_faces` (photo_id, bbox, embedding, cluster_id, player_id). Mine `OBSOLETE-...schema-v3` for shapes.
- [ ] Face pipeline: detect → embed → store `photo_faces` (InsightFace `buffalo_l` — RetinaFace + ArcFace, LOCKED). Batch over library.
- [ ] Cluster face embeddings into "same person" groups; assign `cluster_id`.
- [ ] Admin/user cluster-naming UI (extend `TagInput`/`admin/tags`): name a cluster → link to `players`.
- [ ] Migrate `user_tags.athlete_name` toward canonical `players`.
- [ ] Explore: face-cluster / named-player browse ("all photos of X").
- [ ] Privacy: per-person hide/opt-out; `photo_faces` service-role-only; tie to letspepper media-consent waiver.
- [ ] Backfill face processing ($0–40 per provider).
- [ ] Verify success criteria 3, 8.

## Cross-cutting

- [ ] Backfill orchestrator is resumable + idempotent (safe re-run; per-stage progress in a checkpoint table or column).
- [ ] All provider creds via 1Password / runtime injection; none committed.
- [ ] Update `project_album_pipeline` memory + AGENTS.md once the new-album path changes.
