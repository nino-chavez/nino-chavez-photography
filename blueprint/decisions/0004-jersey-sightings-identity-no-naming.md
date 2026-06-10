# 0004 — Identity is jersey/color sightings, human-resolved — no naming, no faces

**Status:** Accepted · **Date:** 2026-06-09

## Context

The pilot is an athlete asking "did you get that?" — they want to find *themselves*. The naive answer is face recognition or per-person naming, both of which carry consent and privacy weight for a portfolio of minors at public events, and neither of which the operator wants to own. The product model is **discover event → find-my-photos → download/share, with no sales and no per-person identity created by the system.**

## Decision

Identity is modeled as **pre-resolution sightings**, not resolved people. `photo_jersey_sightings` stores what the vision pass observed — jersey number (TEXT, preserving leading zeros: "00" ≠ "0"), team color, action — keyed by a stable `dedup_key` so re-ingest is idempotent. The AI never creates a player; naming, if it ever happens, is a human action (admin tag approval → `resolve_jersey_to_player`). Find-my-photos works by jersey number and team color via the relational sightings + the `find_photos_by_jersey` RPC. No face recognition.

## Consequences

- An athlete finds themselves by the two things they actually know about their own appearance in a frame — jersey number and team color — without the system asserting who they are.
- The relational sightings replaced a deprecated `players` JSONB column. The migration was completed library-wide: **46,702 sightings, 26,358 with a jersey number** (backfilled 2026-06-10), which unblocked dropping `players`.
- Grass volleyball is color-dominant (many frames have no readable number), so colour is a first-class signal, not a fallback.
- Scope boundary: this is the *athlete's* find-myself surface. The event organizer's surface (standings, brackets, rankings) is Rally HQ's pilot on the same events — explicitly out of scope here (see `pilot_profile.out_of_scope_pilots`).
