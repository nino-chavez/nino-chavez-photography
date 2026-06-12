# Observation — the find-my-photos demand signal

**Type:** Operator observation notes (the pilot's `walkthrough_citation`).
**Source:** Nino Chavez (operator / photographer), stated 2026-06-09. Recorded in agent memory `find-my-photos-demand-signal`.
**Status:** Real, first-party observation — not synthesized, not a hypothetical persona.

## The signal

> The players Nino shoots want to see themselves, and will sometimes ask him **mid-match: "did you get that?"**

That question is the product, compressed. An athlete makes a play they're proud of — a dig, a kill, a celebration — and their immediate instinct is to know whether it was captured and whether they can have it. The demand is not "buy a print" and not "browse a gallery"; it is **"find the moment that was already mine."**

## What it reframes

The HANDOFF's drafted pilot was a **parent/fan** ("I know Nino shot my kid's game — find that album"). The 2026-06-09 observation relocates the demand to the **athlete themselves** — the person *in* the frame, not the spectator. The parent/fan is a secondary, downstream beneficiary; the athlete is the primary, first-party demand.

| | HANDOFF draft | Grounded observation (this artifact) |
|---|---|---|
| Who | Parent / fan (spectator) | The athlete (subject) |
| Trigger | "Did Nino shoot this event?" | "Did you get *that* — my play?" |
| Find-by | Event / album browse | Their own jersey number / color → their moments |

## Why it drives the technical work

"Did you get that?" → "yes, here you are" requires the system to answer **"every photo of the player wearing N (in color C)"** as a clean query. That is exactly what `photo_jersey_sightings` + `find_photos_by_jersey` provide — and what the #10 ingest writes on every new album (prescription P5/R2). Findable-by-jersey is the mechanism that lets the athlete answer their own question.

## Boundaries the signal sets (carried into the product model — decisions/0003)

- **No sales.** The athlete wants *their* moment, not a storefront. Monetization side = operator/none.
- **No faces, no per-person naming.** Jersey-number / jersey-color sightings, **human-resolved** — not face recognition, not an authoritative naming graph. (A false "that's you" is worse than a miss.)
- **Discover → find-my-photos → download/share** is the whole loop.

## Open enrichment

A specific anchor event/album (the one where this was observed, or a representative recent shoot) would sharpen the diagnose and the competitive set. Operator to name one — tracked as `pilot_profile.concrete_reference` in `blueprint.yml`.
