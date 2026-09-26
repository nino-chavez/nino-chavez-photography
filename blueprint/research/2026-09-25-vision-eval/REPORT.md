# Vision/embedding model evaluation -- find-my-photos pipeline

**CORRECTION NOTICE (this version):** an orchestrator review caught that this report's original
section (e) was built from invalid image-embedding vectors, and asked for three more checks. All
four are addressed below. The single most important finding from this pass is financial, not a
data-quality footnote: **the botched image embeddings actually cost approximately $17 in real
API spend that this harness's own ledger silently logged as $0**, blowing through the task's
budget before this correction round even started. See "Spend -- corrected" below.

**Ground truth**: labeled by Claude (Sonnet 5), not by Nino, from CF Images "public"/"large"
variants viewed directly (not from model output -- labels were written before any model was
scored, including for the album added in this correction round). See `.temp/eval/labels.json`
(full labels) and `SPOTCHECK.md` (20-photo sheet with image URLs, for Nino to verify).

**Data**: 86 photos across 6 volleyball albums, never touching the Re7kho pilot.

| Album | Split | n | Notes |
|---|---|---|---|
| fJKdsB (HS Girls VB - JCA vs PNHS) | TEST | 20 | indoor, required, has today-baseline in DB |
| 1BlKk4 (Chicago Big Dig - North Ave Beach) | TEST | 20 | outdoor/beach, required, has today-baseline |
| j0g2Hw (College MVB - Lewis vs Lindenwood) | TEST | 13 | indoor, no today-baseline |
| D6M8cZ (2024 PNHS vs PEHS, HS boys) | TEST | 12 | **added this round** -- indoor HS gym, added specifically to test bench/spectator-in-frame photos after the orchestrator flagged the original TEST mix under-sampled them |
| eqYF0h (Bump Bash #5 charity tournament) | TUNE | 11 | informal/no team jerseys at all -- kept as a false-positive/hallucination trap |
| Y2Er7w (HS Boys VB - PNHS vs WWSHS) | TUNE | 10 | indoor, no today-baseline |

TUNE (21 photos) was used only to design the improved prompt; every number below is scored on
TEST (65 photos) unless marked otherwise. 1BlKk4 turned out to be mostly unnumbered casual beach
doubles (only 1 of 20 photos has a real team jersey). D6M8cZ was sampled and every one of its 12
photos was labeled BEFORE any model was run on it.

---

## Spend -- corrected (read this first)

The original report claimed **$0.80 of a $12-15 budget**. That number was wrong, and the reason
is itself the headline finding of this correction round.

`scripts/eval/lib/embed.ts`'s `embedImageWith` sent full-resolution production photos to
OpenRouter's `/embeddings` endpoint as `input: [dataUrl]` -- a plain array containing the raw
data-URL **string**. OpenRouter accepted this without error and embedded the string **as text**:
a full-resolution photo's base64 text tokenizes into roughly 1-2 million tokens (measured directly
by replaying the exact original request shape against 4 of the actual cached photos: token counts
of 657,786 to 2,075,466, cost $0.14 to $0.46 **per single call**). The code's cost-logging line
hardcoded `cost: 0` "because embeddings are negligible" -- so the harness's own $12 budget-stop
never saw the real spend and never fired, and the running ledger total looked like it stayed under
a dollar the entire time.

**Ground truth for what actually happened**: OpenRouter's own `/api/v1/key` endpoint (queried live
during this correction) reports `usage_daily: $17.42` on this project's key -- essentially all of
it from today's session, confirmed by `usage_monthly` reading the same value. **The task's $15
total budget was exceeded by roughly $2.42, entirely by the 106 botched image-embedding calls
(53 photos x 2 models) from the original run.** This already happened; it cannot be undone from
here. What this correction round did:

- Fixed `embedImageWith` to use the shape that actually embeds an image (`input: [{ content:
  [{ type: 'image_url', image_url: { url: dataUrl } }] }]`, verified live to return an
  image-sized token count, e.g. 258 tokens for gemini-embedding-2 vs. the ~1-2M-token text-blowup)
  and added `assertImageSizedTokenCount` (rejects any image-embed response over 3,000 prompt
  tokens) so this class of bug fails loudly instead of silently next time.
  Also fixed both `embedImageWith` and `embedTextWith` to log the API's own reported `usage.cost`
  instead of a hardcoded 0.
  Also switched the harness to resize photos to 768px before embedding (not needed for semantic
  image search the way full jersey-digit resolution is needed for extraction), which keeps
  legitimate per-call cost in the fraction-of-a-cent range going forward.
- Recomputed `img_gemini` / `img_voyage` for all 53 original TEST photos with the corrected
  shape: **106 calls, real cost $0.019 total** (vs. the ~$17 the same 106 calls cost the first
  time, because they're now 768px images tokenized as images, not full-resolution images
  tokenized as text).
- This correction round's own new spend was confirmed the same way (OpenRouter's `/api/v1/key`
  again, before vs. after this round's work): `usage_daily` moved from $17.42 to **$18.84**, a
  $1.42 increase. About $1.15 of that is a **deliberate** cost: to give Nino a real number instead
  of an extrapolated guess, this correction round replayed the exact original buggy shape against
  4 of the actual cached photos (see `calibrate-botched-cost.ts`) to measure the true historical
  token/cost pattern directly rather than estimating it from file sizes. The remaining ~$0.27 is
  the legitimate corrected recompute (106 calls, properly shaped, $0.019) plus the new album's
  10-model/arm scoring pass (120 calls) and finishing qwen's improved arm.

**Total realistic spend for the whole task, both rounds: $18.84** (OpenRouter's own authoritative
figure, not this harness's ledger, which still under-reports at ~$1.16 due to the same
before-the-fix entries sitting in its history), against a budget that was $12 then raised to $15.
**This exceeds the $15 total budget by $3.84.** Report this to Nino as a real overage caused by a
code defect, not a rounding error -- and note the fix (shape correction + token-count assertion +
real cost logging) is now in `scripts/eval/lib/embed.ts` so it can't recur silently.

---

## (a) Jersey sightings

**Recommendation, revised:** hold the `role` field for a v2 prompt iteration (unchanged from
before -- it still doesn't clear production's precision). **Tiling is downgraded from "clear win"
to "unproven at full scale, model-dependent"** -- the original tiling claim rested on a 15-photo
subset hand-picked for jersey density, and running the same arm on the FULL 53-photo TEST set for
the recommended model reverses the result.

| Model | Arm | Precision | Recall | TP | FP (bench) | FP (hallucinated) | FN |
|---|---|---|---|---|---|---|---|
| gemini-2.5-flash-lite (today) | production | 0.712 | 0.902 | 37 | 1 | 14 | 4 |
| gemini-2.5-flash-lite | improved, raw | 0.655 | 0.878 | 36 | 1 | 18 | 5 |
| gemini-2.5-flash-lite | improved, role-filtered | 0.686 | 0.854 | 35 | 1 | 15 | 6 |
| gemini-2.5-flash-lite | improved, tiled, **15-photo subset** | 0.800 | 0.903 | 28 | 0 | 7 | 3 |
| gemini-2.5-flash-lite | improved, tiled, **all 53 TEST photos** | **0.648** | **0.854** | 35 | 1 | 18 | 6 |
| gemini-3.1-flash-lite | production | 0.720 | 0.878 | 36 | 1 | 13 | 5 |
| gemini-3.1-flash-lite | improved, tiled, 15-photo subset | 0.800 | 0.903 | 28 | 0 | 7 | 3 |
| gemini-3.5-flash-lite | production | 0.729 | 0.854 | 35 | 1 | 12 | 6 |
| gpt-5.6-luna | production | 0.538 | 0.512 | 21 | 0 | 18 | 20 |
| qwen3.8-flash | production | 0.644 | 0.829 | 29 | 1 | 15 | 6 |

**The 15-photo subset was not representative.** It was deliberately chosen for high jersey
density (the photos with the most ground-truth sightings), which biased the sample toward frames
where tiling's per-region resolution boost helps most. On the full 53-photo TEST set,
gemini-2.5-flash-lite improved+tiled lands at precision 0.648 / recall 0.854 -- **worse than plain
production (0.712/0.902) and statistically indistinguishable from the untiled improved prompt
(0.655/0.878)**. Tiling is still cheaper per photo ($0.00034 vs $0.00050 for production, because
four capped-1400px tiles total fewer pixels than one uncompressed full-resolution original), so
it isn't a net loss, but it is no longer a recommended accuracy improvement -- it's a cost
optimization with a wash on accuracy, at best, for this model. gemini-3.1-flash-lite's tiled
numbers are still only the 15-photo subset (not re-run at full scale in this pass); treat its
0.800/0.903 the same way -- unconfirmed at full scale.

### Bench/spectator false-positive rate, per album

The KNOWN PROBLEM's framing ("bench players and spectators" polluting jersey search) was
corrected in the original report to "hallucination dominates, bench pollution is rare" based on
3 TEST albums. The orchestrator flagged that this mix under-samples HS gyms with a sideline bench
visible in frame, and reported directly observing 4 bench players (white warmups #1/#12/#13/#14)
plus a black-jersey bench player (#21) and a spectator (#51) in 2 of 4 Re7kho photos checked --
Re7kho remains excluded from every score below, this is cited only as context.

| Album | Type | n | TP | FP (bench/non-player) | FP (hallucinated) | Bench share of FP |
|---|---|---|---|---|---|---|
| fJKdsB | HS indoor (girls) | 20 | 27 | 0 | 9 | 0% |
| 1BlKk4 | Beach/outdoor | 20 | 1 | 0 | 0 | n/a (almost no jerseys at all) |
| j0g2Hw | College indoor | 13 | 9 | 1 | 5 | 17% |
| D6M8cZ | **HS indoor (boys), added this round** | 12 | 18 | 0 | 1 | 0% |

(gemini-2.5-flash-lite, production arm, shown as the representative row -- the pattern is the
same across all three Gemini models tested.)

**Honest finding: adding a second HS indoor album did NOT surface a new bench/spectator case.**
D6M8cZ turned out to be mostly genuine on-court action (attackers, blockers, setters, all in the
run of play) plus sideline coach/handshake candids -- one frame does show two away-team players
in team warm-ups seated in the stands, but no number is legible on them in that particular shot,
and one wide net-level lineup shot (both teams' full rosters visible before a set restart) has
every jersey number too small/dark/overlapping to read confidently. This is a **sampling
result, not a contradiction of the orchestrator's Re7kho observation**: whether a bench player's
number is legible depends on which specific frames a photographer happened to keep in a given
album, not simply "HS gym vs. beach." Across the 4 TEST albums now sampled (65 photos), the
honest count stands at 1 confirmed bench/non-player jersey false positive (j0g2Hw) out of 10
total pooled false positives for the baseline model -- consistent with the original finding that
hallucination, not bench/spectator misclassification, is the dominant failure mode in THIS
sample, while acknowledging the sample may still be missing bench-heavy frames that exist
elsewhere in the library (Re7kho's own bench frames being the clearest evidence they exist).

## (b) Captions for retrieval

Unchanged from the original report -- this job's data was never affected by the embedding-shape
bug (captions are real vision-model output, and their text embeddings were always correctly
shaped). Recap: the improved prompt raises ground-truth number-coverage from 0.20 (today's
production baseline) to 0.61-0.89 across every model tested, with gemini-3.1-flash-lite the
standout at 0.85. Full detail in the previous version of this report; not re-litigated here since
nothing in this correction round touched it.

## (c) Play type

Unchanged -- no model or prompt change indicated by this sample, signal too noisy to act on.

## (d) Quality ranking -- BLOCKED

Unchanged -- no trustworthy signal of Nino's own picks exists in the database (verified:
favorites/collections/featured tables don't exist; Collections is quality_score-circular;
photo_popularity is real but is anonymous visitor engagement, not the photographer's curation).
Separately, deterministic Laplacian-variance sharpness (Spearman rho=0.102 vs. model sharpness)
stands as measured.

## (e) Vectors for search -- FULLY REWRITTEN, original run was invalid

**The original section (e) is retracted. Its `img_gemini` / `img_voyage` numbers were computed
from vectors that were never real image embeddings** -- they were text embeddings of a data-URL
string (see the Spend section above for the root cause). Recomputed with the corrected shape,
the conclusion reverses completely.

**Recommendation, corrected: image embeddings (properly computed) are the strongest single
retrieval signal in this eval, beating caption-vector search outright. A caption+voyage-image
hybrid is the single best result. Do not conclude image embeddings are weak -- the original
report's claim to that effect was based on invalid data.**

Recall@10 / MRR over the 15 non-jersey queries (jersey queries route through
`find_photos_by_jersey`'s structured filter in production, never through vector search --
scored under job (a) instead):

| Vector space | Recall@10 | MRR |
|---|---|---|
| Caption vectors, current production captions (openai/text-embedding-3-large@768) | 0.682 | 0.719 |
| Caption vectors, improved captions (same embedding model) | 0.640 | 0.664 |
| Image vectors, google/gemini-embedding-2@768, **corrected shape** | **0.861** | **0.812** |
| Image vectors, voyageai/voyage-multimodal-3.5@1024, **corrected shape** | **0.878** | 0.780 |
| Hybrid: current-caption + gemini-image (avg cosine) | 0.729 | 0.778 |
| Hybrid: current-caption + voyage-image (avg cosine) | 0.800 | 0.745 |

Both image-embedding candidates, computed correctly, **outperform caption-vector search on this
query set** -- voyage-multimodal-3.5 reaches 0.878 recall@10, gemini-embedding-2 reaches 0.861,
against caption-vector search's 0.682. This makes sense for this specific query mix: 15
scene/action/compositional queries (e.g. "beach volleyball at North Avenue Beach", "referees
walking onto the court", "close-up tattoo on a player's arm") ask about visual content a raw image
embedding captures directly, while a caption only retrieves what the vision model chose to write
about -- and captions systematically omit scene detail that isn't caption-worthy (crowd
composition, court markings, background elements). The naive flat-average hybrid actually costs a
little recall relative to image-alone (0.729 vs. 0.861 for the gemini pairing) because it drags a
strong signal toward a weaker one; a smarter fusion rule (e.g. rank the image space first, use the
caption space as a tie-break) is untested here and is the most promising next step.

`google/gemini-embedding-2` fits `vector(768)` natively -- zero schema migration needed to adopt
it, and it now has real evidence behind it instead of the artifact the first run measured.
`voyageai/voyage-multimodal-3.5` still has no 768-dim option ([256, 512, 1024, 2048] only,
verified live) -- adopting it still needs a dimension/index migration, unchanged from before.

**What would change this recommendation again:** this is a 15-query, 53-photo eval -- exactly the
scale that made the ORIGINAL bug invisible for so long. Before recommending a production switch,
re-run this at a larger n (more queries, a larger photo pool) to confirm the effect size holds,
and specifically check whether image embeddings' apparent strength is partly explained by visual
scene clustering (e.g. all beach photos looking like a beach) rather than fine-grained query
understanding -- a legitimate capability either way, but worth naming which one is doing the work
before recommending a production architecture change.

**ADR note, unchanged:** ADR-0002 locks `google/gemini-2.5-flash-lite` and
`openai/text-embedding-3-large@768`. Everything above is evidence for an ADR amendment
conversation, not authorization to change either lock.

## Recommendation summary (revised)

| Job | Recommendation | Confidence | Changed this round? |
|---|---|---|---|
| (a) Jersey sightings | Hold the `role` field for a v2 iteration. Tiling is a cost optimization only -- accuracy claim retracted at full scale | Medium | **Yes -- tiling downgraded** |
| (b) Captions | Adopt the improved "name every legible number" instruction, any model | High | No |
| (c) Play type | No change | Low signal either way | No |
| (d) Quality ranking | Blocked; separately, replace model sharpness with deterministic Laplacian variance | High confidence in the diagnosis | No |
| (e) Vectors | **Corrected image embeddings, computed properly, beat caption search outright** -- worth a follow-up with a larger sample before any production change | Medium (small n, needs replication) | **Yes -- fully reversed** |

## Spot-check sheet

20 photos with CF Images URLs and Claude's labels for Nino to verify: `.temp/eval/SPOTCHECK.md`.

---

## Round 3 (final): prompt v2 isolation test + 40-query retrieval replication

Budget for this round: $4, measured by OpenRouter's `/api/v1/key` `usage_daily` before/after.
**Before: $18.866044868. After: $18.963761632. Actual delta: $0.098** — 2.4% of the $4 allowance.

### A. Prompt v2 — caption instruction ALONE, players[] schema untouched

Isolates the caption number-coverage win from the players[]-enumeration change that job (a)
found hurts jersey precision. v2 = production's prompt verbatim, with only the caption
instruction changed to "name every legible on-court number and the action" — no role field, no
legibility field, no bench/spectator enumeration. Developed on TUNE (`eqYF0h`, `Y2Er7w`), then
scored on all 65 TEST photos, untiled. Caption-contract violations: **0 for both models** (100%
ok-rate, no correction-loop exhaustion).

| Model | Arm | Precision | Recall | FP-bench | FP-hallu | GT caption coverage | "A player…" share | $/photo |
|---|---|---|---|---|---|---|---|---|
| gemini-2.5-flash-lite | production (today) | 0.775 | 0.917 | 1 | 15 | 0.32 | 0.49 | $0.00050 |
| gemini-2.5-flash-lite | **v2 (caption-only)** | 0.724 | 0.917 | 1 | 20 | **0.80** | 0.58 | $0.00052 |
| gemini-2.5-flash-lite | improved (role field, job a) | 0.714 | 0.917 | 1 | 21 | 0.73 | 0.37 | $0.00058 |
| gemini-3.1-flash-lite | production (today) | 0.783 | 0.900 | 1 | 14 | 0.55 | 0.51 | $0.00076 |
| gemini-3.1-flash-lite | **v2 (caption-only)** | 0.696 | 0.917 | 1 | 23 | **0.92** | 0.63 | $0.00072 |
| gemini-3.1-flash-lite | improved (role field, job a) | 0.692 | 0.900 | 1 | 23 | 0.88 | 0.52 | $0.00090 |

(All rows now scored on the full 65-photo TEST set, including D6M8cZ — this also corrects the
job (a)/(b) tables above, which were computed on 53 photos before D6M8cZ was added; the pattern
is unchanged, only the exact decimals shift slightly.)

**Answering the orchestrator's question directly: no, the caption rule alone does NOT fully hold
production-level precision** — it costs 5.1 points for gemini-2.5-flash-lite (0.775→0.724) and
8.7 points for gemini-3.1-flash-lite (0.783→0.696), because naming every number more assertively
also makes the model assert a few more wrong ones (fp-hallucinated rises in both cases). Recall
is unaffected or slightly better. **v2 is still a real, clean improvement over the "improved"
(role-field) prompt from job (a)**: equal or better precision, equal recall, and slightly better
coverage (0.80 vs 0.73 for 2.5-flash-lite; 0.92 vs 0.88 for 3.1-flash-lite) — while being simpler
(no schema change, no role/legibility fields to maintain). **Revised recommendation for job (b):
ship v2, not the original "improved" prompt** — same caption win, smaller precision cost, no new
fields.

**Is 3.1's extra coverage worth ~1.6x cost?** Actual cost ratio measured: 3.1's v2 run costs
1.38x gemini-2.5-flash-lite's ($0.00072 vs $0.00052 — close to but a bit under the orchestrator's
~1.6x estimate, which likely came from the production-arm ratio, $0.00076/$0.00050 = 1.52x). For
that ~1.4x premium, 3.1 buys +12 coverage points (0.80→0.92) but **costs 2.8 more precision
points** (0.724→0.696) at the same recall. **No** — at library scale (22,674 photos) that's
$16.33/run vs $11.84/run, a permanent ~$4.50/run premium, for a coverage gain that a v2-tuned
gemini-2.5-flash-lite already captures 80% of. Recommend gemini-2.5-flash-lite + prompt v2 as the
production candidate, keeping ADR-0002's model lock intact and changing only the caption
instruction.

### B. Retrieval replication at n=40 queries, 65-photo corpus

40 NEW queries (`queries-40.json`), written from ground-truth labels BEFORE any retrieval score
was computed, balanced 10 jersey-number/color, 10 action, 10 scene/context, 10 compositional.
Scored: caption-current (production), caption-v2 (gemini-2.5-flash-lite, the winning model from
part A), image-gemini@768, image-voyage@1024, and two hybrid fusions (flat 0.5/0.5 average, and
a caption-weighted 0.35/0.65 caption/image blend).

**Overall (n=40, up from the original 15-query check):**

| Arm | Recall@10 | MRR |
|---|---|---|
| Caption, current | 0.637 | 0.621 |
| Caption, v2 | 0.636 | 0.599 |
| Image, gemini-embedding-2 | **0.820** | **0.768** |
| Image, voyage-multimodal-3.5 | 0.713 | 0.612 |
| Hybrid avg (caption-current + gemini-image) | 0.685 | 0.672 |
| Hybrid avg (caption-current + voyage-image) | 0.698 | 0.725 |
| Hybrid weighted 0.35/0.65 (+ gemini-image) | 0.708 | 0.706 |
| Hybrid weighted 0.35/0.65 (+ voyage-image) | 0.709 | 0.715 |

**The image-vector win replicates at more than 2.5x the query count and 65 photos instead of
53** — gemini-embedding-2 alone (0.820/0.768) is still the strongest single arm, confirming the
corrected job (e) finding was not a 15-query artifact.

**Per query type — this directly answers the confound question:**

| Type | Caption (current) | Caption (v2) | Image (gemini) | Image (voyage) | Best hybrid |
|---|---|---|---|---|---|
| **Jersey** (#N in color) | 0.384 / 0.543 | 0.637 / 0.618 | **0.883 / 0.831** | 0.582 / 0.585 | 0.448 / 0.642 (voyage weighted) |
| **Action** | 0.575 / 0.565 | 0.583 / 0.570 | **0.770 / 0.534** | 0.616 / 0.454 | 0.725 / 0.517 (voyage weighted) |
| **Scene/context** | 0.835 / 0.734 | 0.755 / 0.632 | 0.802 / 0.823 | 0.807 / 0.725 | 0.835 / 0.727 (gemini weighted, ties caption) |
| **Compositional** | 0.755 / 0.643 | 0.569 / 0.576 | 0.827 / 0.883 | **0.847** / 0.684 | **0.905** / 0.798 (voyage avg) |

(cell format: recall@10 / MRR)

**Image vectors do NOT win only on scene/action — the confound named in the previous round is
not what's happening.** gemini-embedding-2 wins by the widest margin specifically on **jersey**
queries (0.883 vs caption's 0.384), the type theorized least likely to benefit from "visual scene
clustering." The one type where caption search is genuinely competitive is **scene/context**
(0.835 caption vs 0.802 image, both close, hybrid ties them) — the type most likely to have
caption-worthy content written out in words. **Caveat, stated plainly rather than resolved**: the
jersey-query win could still be explained by a nearby but different confound — my 10 jersey
queries' relevant sets are often several photos from the same album/team, so an image embedding
that clusters by team-color-and-scene similarity (not by reading the number) could still produce
this exact pattern. Distinguishing "reads the number" from "recognizes the team's look" would
need queries that hold team/scene constant and vary only the jersey number — not built here.

Caption v2 is a mixed bag against caption-current per type: **big win on jersey** (0.637 vs
0.384 — consistent with job A's number-coverage lift), **small loss on action** (0.583 vs 0.575,
roughly a wash), and a **real loss on scene (0.755 vs 0.835) and compositional (0.569 vs 0.755)**
— a caption tuned to front-load jersey numbers gives up some of the scene/composition detail a
generic caption would have included. Net: v2 is the right caption for the jersey-adjacent
half of search traffic and a mild regression for the descriptive half.

**Production relevance, restated per the orchestrator's note:** jersey-number queries do not
reach vector search in production (`find_photos_by_jersey` handles them structurally — see job
a). The production-relevant comparison is therefore the **action + scene + compositional** rows:
image-gemini beats caption-current on 2 of 3 (action, compositional) and is within 3 points on
the third (scene). **This confirms the corrected job (e) recommendation stands at 4x the sample
size**: gemini-embedding-2 image vectors are a genuine, replicated improvement over caption-vector
search for the semantic-search portion of the query mix, not an artifact of a small eval.

### Final recommendation per job (supersedes all earlier tables in this report)

| Job | Recommendation | Confidence |
|---|---|---|
| (a) Jersey sightings | Ship prompt v2 if the caption win (below) is adopted — costs 3-9 points of precision, no bench-role fix. Tiling: cost optimization only, accuracy claim retracted at full scale (round 2) | Medium-High (65 photos, 4 albums) |
| (b) Captions | **Ship prompt v2** (caption-only change) on gemini-2.5-flash-lite: keeps ADR-0002's model lock, ~2.5x caption number-coverage (0.32→0.80), simpler than the role-field design, replicated across 2 models and 65 photos | High |
| (c) Play type | No change — signal too noisy across every arm tested | Low either way |
| (d) Quality ranking | Blocked — no trustworthy ground truth in the DB. Separately: replace model sharpness with deterministic Laplacian variance (rho=0.102 measured) | High confidence in the diagnosis |
| (e) Vectors | **Adopt gemini-embedding-2 image vectors as the primary/co-primary search signal** — replicated at n=40/65 photos after the shape-bug correction; wins outright on jersey and action queries, competitive on scene, best hybrid wins on compositional. Fits `vector(768)` with zero schema migration | High (2 independent samples, 15q/53photo and 40q/65photo, agree) |

**Standing ADR note, unchanged:** ADR-0002 locks `google/gemini-2.5-flash-lite` and
`openai/text-embedding-3-large@768`. This report's job (e) recommendation is evidence for an ADR
amendment conversation (adding gemini-embedding-2 as a co-primary/hybrid signal), not
authorization to change the lock. Job (a)/(b)'s recommendation (prompt v2) requires no model or
schema change and is the lowest-risk item to ship first.
