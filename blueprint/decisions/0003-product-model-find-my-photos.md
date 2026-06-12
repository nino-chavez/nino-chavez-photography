# ADR 0003 — Product model: discover → find-my-photos → download/share (no sales, no faces, no per-person naming)

**Status:** Accepted (operator-locked; current model as of 2026-06-09)
**Deciders:** Nino Chavez (operator)
**Supersedes (on the monetization + identity axis):** NORTH-STAR-REDESIGN §1's "people-finding **and selling**" + faces + per-person naming ambition

## Context

NORTH-STAR-REDESIGN.md (2026-06-08 18:14) framed the job-to-be-done as "people-finding **and selling**" — a parent/recruiter/player finding photos AND the photographer selling per athlete/event — with a full faces subsystem (RetinaFace + ArcFace) and canonical per-person naming.

Later the same day and after, the model narrowed. Three converging, dated sources:

- **HANDOFF.md TL;DR** (2026-06-08 21:11): "The product model is event-album discovery → find-my-photos → download/share (**NO sales, NO faces, NO per-person naming**)." NORTH-STAR-REDESIGN carries a SUPERSEDED banner.
- **Memory `find-my-photos-demand-signal`** (operator statement 2026-06-09): the demand is athletes asking "did you get that?"; the model is "discover → find-my-photos → download/share (no sales, no per-person naming — **jersey/color sightings only, human-resolved**)."
- **This session's pilot lock** (2026-06-11): `monetization_side` = "operator / none — no sales, no per-person naming."

## Decision

The product is **find-my-photos for a live volleyball action-sports gallery**:

1. **Discover** the event/album (search all + sport/year).
2. **Find my photos** — the athlete finds their own moments, primarily **by jersey number / jersey color** sightings (`photo_jersey_sightings`, `find_photos_by_jersey`). Sightings are **human-resolvable**, not authoritative naming.
3. **Download / share** — favorites → batch ZIP (worker exists) + per-photo download / copy-link.

**Explicitly out of scope** (do not build / do not re-introduce from NORTH-STAR):
- **No sales / no print marketplace / no per-athlete selling.**
- **No face detection / recognition** (the InsightFace faces subsystem in NORTH-STAR §4.5 / Open Decision 3 is shelved).
- **No per-person naming** as a public identity surface. Identity is jersey/color sightings, human-resolved — not a `players`/`rosters` naming product.

## Consequences

- The #10 ingest writes **`photo_jersey_sightings`**, not the `players[]` JSONB or a naming graph (prescription R2, P5) — this directly serves the pilot.
- A future session reading the 80KB NORTH-STAR-REDESIGN must treat its sell + faces + naming sections as **superseded**; this ADR is the guardrail against re-introducing them.
- The IA re-architecture that already shipped (Albums event-discovery, lean Explore/Search, quality-score Collections, Favorites ZIP + photo download) is the realized form of this model (DEPRECATED §"IA re-architecture").

## References

- `.agent-os/specs/vision-extraction-identity-vnext/HANDOFF.md` (TL;DR + DEPRECATED companion)
- memory `find-my-photos-demand-signal`, `project_album_pipeline`
- `blueprint.yml` `pilot_profile` (the athlete-self-finding pilot)
- `.agent-os/specs/vision-extraction-identity-vnext/NORTH-STAR-REDESIGN.md` §1, §4.5, §10.3 (superseded on monetization + faces)
