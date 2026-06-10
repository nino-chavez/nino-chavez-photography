# 0001 — Sport is album-authoritative, never guessed per photo

**Status:** Accepted · **Date:** 2026-06-08 (recorded in the port, 2026-06-10)

## Context

The original vision pipeline asked the model to classify the sport of every photo, with a hard-coded "95% volleyball / when in doubt, volleyball" bias in the prompt. That bias systematically mislabeled whole non-volleyball albums (tennis, soccer, football read as volleyball) — the corruption that triggered the north-star rebuild. The library is ~73% volleyball, not 95%, so the bias was both wrong and load-bearing.

## Decision

Sport is an **album/event property**, set by the operator, not a per-photo visual guess. `albums.sport` is the single authority; an `enforce_album_sport` trigger mirrors it onto `photo_metadata.sport_type` on write. The vision prompt is told the sport is already known and must not emit or bias it. A new album must declare its sport before ingest (or its photos get `sport_type = NULL`).

## Consequences

- The per-photo sport-classification error class is eliminated by construction — there is nothing to misclassify.
- Intra-sport attributes (surface: grass/beach/indoor; level; age) follow the same rule: they are conditional event properties, never per-photo guesses, and are **not** added as columns until a real filter need exists (then as a sport-scoped facet, like `play_type`).
- `play_type` is constrained to `PLAY_TYPES_BY_SPORT[albumSport]` in the ingest prompt — the model can only pick plays that exist for the known sport.
- A trade-off: `sport_type` is a denormalized mirror of `albums.sport`. Kept deliberately (correct, trigger-enforced) rather than dropped, because the drop cascades into 6 live objects for no visible gain (see DEPRECATED ledger).
