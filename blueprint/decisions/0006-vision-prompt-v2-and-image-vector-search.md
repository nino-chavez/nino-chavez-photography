# ADR 0006 — Vision prompt v2 (caption jersey-number coverage) + image-vector semantic search

**Status:** Accepted
**Deciders:** Nino Chavez (delegated 2026-09-25: "plan and execute it... once we land on the going-forward approach")
**Supersedes (partially):** ADR 0002's embedder lock for the SEARCH-ranking role. The vision-MODEL
lock (`google/gemini-2.5-flash-lite`) and the caption-embedder's continued existence (still written,
still `openai/text-embedding-3-large`@768) are UNCHANGED — see "What this does not do" below.

## Context

An orchestrator-dispatched evaluation (worktree `.claude/worktrees/agent-a9ac18f4737ef6552`,
`REPORT.md`) scored two independent questions against production's own held-out data:

1. Does a caption-instruction change improve jersey-number findability in captions, and at what
   cost to `players[]` sightings precision?
2. Does image-vector semantic search beat the production caption-vector search?

Ground truth for both was labeled by Claude (Sonnet 5), not by Nino, from Cloudflare Images
"public"/"large" variants viewed directly — not from any model's own output. Scale: **65 held-out
photos across 5 albums** (question 1) and **40 search queries against the same 65-photo pool**
(question 2). A first pass at question 2 was invalidated by a request-shape bug (see "The $17
lesson" below) and fully rewritten before this ADR was drafted.

## Decision

### 1. Vision model: unchanged. Caption prompt: v2.

`google/gemini-2.5-flash-lite` stays locked (ADR 0002) — this was not re-opened. The
`players[]` extraction section of the ingest prompt (`buildIngestPrompt` in
`src/lib/ai/ingest-extraction.ts`) is byte-for-byte unchanged. Only the caption instruction's
first sentence changed, copied VERBATIM from the eval's winning isolation-test arm
(`scripts/eval/lib/v2-extraction.ts::buildV2Prompt`, that worktree):

> "Name the jersey number AND color of EVERY on-court player whose number you can actually read
> (not just the primary subject) — this is the single most important instruction, because a
> caption missing a readable number is a photo nobody can find by searching for that number."

Why an isolation test mattered: an earlier "improved" prompt (job (a) in REPORT.md) changed BOTH
the caption instruction AND added a `role`/legibility field to `players[]`, which by itself
measurably hurt sightings precision. The v2 isolation test changes ONLY the caption sentence,
holding `players[]` byte-for-byte identical to production, to separate the two effects.

**Evidence (65-photo TEST set, `gemini-2.5-flash-lite`):**

| Metric | Production (today) | v2 (this ADR) |
|---|---|---|
| Caption ground-truth number-coverage | 0.32 | 0.80 |
| `players[]` sightings precision | 0.775 | 0.724 |
| `players[]` sightings recall | 0.917 | 0.917 (unchanged) |

A model primed to assert every readable number also asserts a few more wrong ones — the
precision cost is real, not noise, and is the trade this ADR accepts. `EXTRACTION_VERSION` is
bumped (`ingest-v2:...` → `ingest-v3:...`) so only rows re-processed under the new prompt carry
the new caption-coverage behavior; existing rows are unaffected until reprocessed or backfilled.
`npm run caption:contract:test` still passes unchanged — the visible-facts contract (no
relationship/emotion/outcome/aesthetic claims, no swimwear terms) is independent of this change.

### 2. Semantic search: image vectors become the primary ranking signal.

`match_photos` / `match_photos_hybrid` rank by cosine similarity against
`photo_metadata.image_embedding` (`google/gemini-embedding-2`@768) instead of
`photo_metadata.embedding` (the caption-text vector, `openai/text-embedding-3-large`@768, which
stays written but is no longer the ranking column).

**Evidence (40 queries x 65 photos, recall@10 / mean reciprocal rank):**

| Vector space | Recall@10 | MRR |
|---|---|---|
| Caption vectors (current production captions) | 0.637 | 0.621 |
| Caption vectors (v2 captions) | 0.636 | 0.599 |
| **Image vectors (google/gemini-embedding-2@768)** | **0.820** | **0.768** |
| Image vectors (voyageai/voyage-multimodal-3.5@1024) | 0.713 | 0.612 |
| Best hybrid (caption + image, several fusion rules tried) | 0.685–0.709 | 0.672–0.725 |

Image vectors alone beat every hybrid fusion rule tried (flat average, weighted average) — a
hybrid drags the stronger image signal toward the weaker caption one. **No fusion**: this ADR
adopts image-vectors-only, not a caption+image blend.

`google/gemini-embedding-2` was chosen over `voyageai/voyage-multimodal-3.5` because it fits
`vector(768)` natively (zero dimension migration — voyage's smallest native dimension is 256, but
768 keeps this column's type identical to the existing caption-vector column and its HNSW index
type) and it scored higher on this eval.

**Per query-type breakdown, and why production relevance is narrower than the headline number:**

| Type | Caption (current) | Image (gemini) |
|---|---|---|
| Jersey (#N in color) | 0.384 | **0.883** |
| Action | 0.575 | **0.770** |
| Scene/context | **0.835** | 0.802 |
| Compositional | 0.755 | 0.827 |

Jersey-number queries never reach this vector search in production — `find_photos_by_jersey`
(a structured RPC over `photo_jersey_sightings`) handles them before either `match_photos` or
`match_photos_hybrid` runs (see `searchByJersey` in `src/lib/supabase/server.ts`). The
**production-relevant rows are action, scene, and compositional**: image vectors win on 2 of 3
(action, compositional) and are within 3 points on the third (scene, where caption search is
genuinely competitive — captions describe exactly the kind of thing a "scene" query asks about).
The jersey row is real evidence, but it evidences a capability this specific search path does not
exercise; do not cite it as this decision's primary justification.

### The $17 lesson (why this evidence needed a correction round before it was trustworthy)

The eval's first pass at image embeddings sent `input: [dataUrl]` — a plain array holding the
data-URL STRING — to OpenRouter's `/embeddings` endpoint. OpenRouter accepted this WITHOUT ERROR
and embedded the string AS TEXT: a full-resolution photo's base64 tokenizes into ~1-2 million
tokens, and the resulting vector carried no image semantics (verified: its similarity to a
matching and a non-matching text query was statistically indistinguishable). This cost
approximately $17 in real spend that the harness's own cost-logging silently recorded as $0
(hardcoded, "because embeddings are negligible") — so the harness's own budget-stop never fired.

The corrected shape — `input: [{ content: [{ type: 'image_url', image_url: { url: dataUrl } }] }]`
— is what `embedImage` (`src/lib/ai/embeddings.ts`) implements, with two standing guards this ADR
requires stay in place: resize to 768px long edge before embedding (keeps legitimate cost in the
fraction-of-a-cent range: measured $0.00012771/image live against a real production photo,
2026-09-25), and `assertImageSizedTokenCount`-equivalent logic that THROWS if a response's
`prompt_tokens` exceeds 3000 (a real 768px image-embed call runs ~258 tokens for this model; a
data-URL-as-text regression runs tens of thousands to millions). Never revert `embedImage` to the
plain-string input shape.

### Similarity thresholds — measured, not carried over

Text-query-to-image-vector cosine similarity runs much lower than text-to-text: recomputing
against the eval's own cached vectors (40 queries, zero additional spend), a TRUE match's score
runs **~0.30–0.48 (mean ~0.40)** for the production-relevant query types, and relevant/irrelevant
scores overlap substantially in this space (it is a measured floor, not a clean separator).
`match_photos`' threshold is LOWERED from 0.5 (the caption-space value) to 0.25 — at 0.5 this RPC
would have rejected every real match post-cutover, not just weak ones. `match_photos_hybrid`'s
0.15 default and the chat tool's explicit 0.2 were already below this floor and need no change
(checked, not assumed — see the migration file's comment for the exact numbers).

### NULL `image_embedding` — documented behavior

A row with `image_embedding IS NULL` (every row before the backfill runs; a very recent ingest
that predates this cutover) is excluded from `match_photos`/`match_photos_hybrid` ranking by a
`WHERE image_embedding IS NOT NULL` clause — the same graceful-exclusion pattern already used for
`sharpness IS NULL`. It stays reachable via structured filters, name/team lookup, and jersey
search; it simply doesn't surface from a descriptive/visual query until backfilled or reprocessed.

### Deployment sequencing (why this is two migrations, not one)

The column addition (`image_embedding`, `sharpness_measured`) is ADDITIVE — safe pre-merge per
ADR 0004. The RPC change (what `match_photos`/`match_photos_hybrid` rank on) is NOT safe to apply
independent of the app deploy: the function signatures are unchanged, so old app code (still
calling `embedText` for the query vector) would not error against the new RPC body — it would
silently rank a caption-space query vector against an image-space column and return
nonsense-ordered results. That is a correctness regression invisible to any health check, exactly
what ADR 0004's merge-gating rule exists to prevent. Apply order:

1. `supabase/migrations/20260925230000_photo_metadata_image_embedding.sql` (column + index) —
   additive, apply pre-merge.
2. `scripts/backfill-image-embeddings.ts` — backfill existing rows (resumable, cost-capped).
3. `supabase/migrations/20260925240000_match_photos_image_embedding.sql` (RPC change) + the app
   deploy that switches `embedSearchQuery` (`src/lib/supabase/server.ts`) and the chat tool
   (`src/routes/api/chat/+server.ts`) from `embedText` to `embedImageQuery` — TOGETHER, same
   deploy, last.

### What this does not do

- Does not change the vision model (`google/gemini-2.5-flash-lite` stays locked).
- Does not stop writing the caption embedding (`embedding` column, `embedText`) — it stays
  written at ingest for the `caption` column's own sake and any future caption-text feature; it is
  simply no longer the search-ranking column.
- Does not touch `find_similar_photos` (the photo-to-photo "similar photos" feature) — it still
  ranks on the caption-text `embedding` column. This eval scored TEXT-query → photo retrieval, not
  photo → photo similarity; switching that RPC too was out of scope and unevaluated here.
- Does not touch `quality_score` (generated) or the model-scored `sharpness` column.
  `sharpness_measured` (deterministic, `src/lib/ai/sharpness.ts`) is a companion signal, not a
  replacement.
- Does not update `scripts/verify-album.ts` / the publish gate, which check `embedding` presence
  but not `image_embedding`. Flagged as a follow-up, not fixed in this cycle.

## Caveats (read before treating this as more certain than it is)

- **Ground truth is Claude-labeled, not Nino-labeled.** A 20-photo spot-check sheet
  (`SPOTCHECK.md` in the eval worktree) exists for human verification; this ADR does not claim
  that verification happened.
- **n=65 photos / 40 queries.** Small enough that the eval's OWN first pass at question 2 was
  wrong for an entire round before a request-shape bug was caught — treat any single-digit-point
  difference between arms as within noise.
- **The jersey-query win may partly reflect team-color/scene clustering, not number-reading.**
  The eval's own stated caveat: 10 jersey queries' relevant sets are often several photos from the
  same album/team, so an image embedding that clusters by team-color-and-scene similarity (not by
  reading the number) could produce the same pattern. This is moot for production relevance
  (jersey queries don't reach this path), but matters if this evidence is ever cited for a
  decision that DOES route jersey queries through vector search.
- **`sharpness_measured` is not perfectly comparable across ingest vs. backfill.** New ingests
  compute it from the original uploaded file resized to 768px; the backfill computes it from
  Cloudflare's already-JPEG-compressed 1600px 'large' delivery variant resized to 768px. Both are
  legitimate Laplacian-variance measurements, but they are not pixel-identical pipelines — a
  before/after comparison across that boundary should account for this, not assume the two are
  interchangeable.
- **No production monitoring exists yet for the new thresholds.** 0.25 is a measured floor from a
  40-query eval, not a value tuned against live traffic. If search starts returning too few or
  too many results in practice, revisit it with real query logs before re-deriving it from the
  eval data again.

## What would reverse this

- A larger-scale replication (more queries, a larger photo pool) that shows the image-vector
  recall advantage shrinking toward caption-vector parity, OR evidence that the advantage is
  substantially explained by visual-scene clustering rather than genuine query understanding.
- A smarter fusion rule (e.g., rank-based combination rather than flat/weighted cosine averaging)
  that beats image-vectors-alone — untested in this eval, called out there as "the most promising
  next step."
- Production evidence that the 0.25 `match_photos` threshold is miscalibrated (too few or too
  many results) once real query logs exist.
- A caption-embedding provider/model change that closes the recall gap on action/compositional
  queries specifically (scene/context is already close to parity).

## References

- `.claude/worktrees/agent-a9ac18f4737ef6552/.temp/eval/REPORT.md` — the full evaluation, all three
  rounds (the request-shape correction is documented inline as "Round... correction round" and
  "Round 3 (final)").
- `.claude/worktrees/agent-a9ac18f4737ef6552/scripts/eval/lib/v2-extraction.ts` — verbatim source of
  the adopted caption instruction.
- `.claude/worktrees/agent-a9ac18f4737ef6552/scripts/eval/lib/embed.ts` — verbatim source of the
  corrected image-embedding request shape, reused in `src/lib/ai/embeddings.ts`.
- `blueprint/decisions/0002-know-vs-infer-domain-model.md` — the ADR this one partially supersedes
  (embedder-for-search role only; vision-model lock and KNOW/INFER domain model untouched).
- `blueprint/decisions/0004-migration-safety-and-convergence.md` — the additive-vs-merge-gated rule
  this ADR's two-migration sequencing follows.
- `blueprint/prescription.yml` (P3) — updated to point at this ADR.
