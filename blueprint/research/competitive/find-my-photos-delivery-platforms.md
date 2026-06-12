# Competitive — find-my-photos delivery platforms

**Stage 1, leg 2 (midstream — scoped).** Scoped to the pilot's job-to-be-done: an athlete/fan **finding their own photos** in an event gallery and getting them out (download/share). Out of scope by product decision (`decisions/0003`): print-sales marketplaces and face-recognition *naming* products — they solve a different job and we explicitly don't build them.

**Method note (honest):** this is a **category-pattern** analysis of how event/sports-photo delivery tools approach self-find, mapped onto our discover → find → download/share loop. Named-vendor specifics (exact UX, current feature matrices) should be verified against a live walkthrough once the pilot's `concrete_reference` event is named — that anchor sharpens *which* comparables matter most. Patterns below are the durable part; vendor specifics are the part to re-check.

## The category and how it solves "find me"

Event/sports-photo delivery platforms (the SmugMug / PhotoDay / sports-day-gallery family) converge on a small set of self-find mechanisms:

| Find mechanism | How it works | Fit for our pilot |
|---|---|---|
| **Face self-search** | Subject uploads a selfie; the gallery returns their matches. | **Rejected** — we don't do faces/recognition (decisions/0003). Privacy + "false 'that's you'" risk. |
| **Bib / jersey number search** | Viewer types a number; OCR'd numbers index the photos. | **Direct analog** — this is our `find_photos_by_jersey` over `photo_jersey_sightings`. Strongest aligned pattern. |
| **QR / access code per subject** | Each athlete gets a code linking to their photos. | Possible future affordance; needs per-athlete resolution we don't have (no naming graph). Out of cycle 1. |
| **Album / event browse + filter** | Manual scroll, date/team filters. | Our baseline (Albums event-discovery + lean Explore). The fallback when self-find misses. |
| **Email/SMS "your photos are ready"** | Push when a subject is tagged/identified. | Requires identity resolution + contact capture — out of scope (no naming, no accounts-for-athletes in cycle 1). |

## What to adopt

1. **Jersey/number self-search as the headline find path.** The category validates that a typed identifier (bib/number) is the highest-intent, lowest-friction self-find for sports. We already have the relational substrate (`photo_jersey_sightings`); the #10 ingest keeps new albums immediately findable-by-jersey. **This is the differentiated bet** — most generic galleries lean on face-search (which we reject) or manual browse (high friction); number-search is the precise middle.
2. **Color as a disambiguator.** Jersey *color* alongside number narrows "every #7" to "the #7 in red." The ingest extracts team_color into sightings — a cheap precision lever the generic browse-only galleries lack.
3. **Get-it-out friction must be near-zero.** The category's download/share UX (one-tap download, copy-link, batch ZIP) is table stakes. We have Favorites → ZIP + per-photo download/copy-link already; keep parity.

## What to avoid (anti-patterns for *our* product)

- **Face recognition as the primary find path** — privacy surface + false-positive cost; explicitly out (decisions/0003).
- **Gating finds behind a purchase** — the category's sales-first funnels bury "find me" under "buy prints." Our model is operator/no-sales; find-and-download is the whole loop, not a teaser for a store.
- **Per-person accounts / naming graphs** — heavy identity infrastructure for a job that jersey/color sightings already serve, human-resolved.

## Implication for the prescription

The competitive read **confirms** the #10 ingest's priorities: writing `photo_jersey_sightings` (items R2/P5) is not just cleanup — it's the mechanism behind the category's strongest self-find pattern, minus the face/sales baggage we reject. No net-new pattern is introduced (so per the midstream variant, Stage 6 can skip a standalone market-research doc).

## TODO (post anchor-event)

- Name 2–3 specific comparable galleries the pilot's event-type athletes would actually have used; walk their self-find UX live; record screenshots here.
- Verify the jersey/number-search precision bar those tools set (what's "good enough" recall for "every photo of #7").
