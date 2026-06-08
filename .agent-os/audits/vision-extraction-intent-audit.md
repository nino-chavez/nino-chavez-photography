# Vision Extraction Intent Audit

**Date:** 2026-06-08
**Question:** Are we extracting / storing / embedding the right things for what a photographer and a viewer actually need?
**Method:** Grounded read of the live system (storage schema, embedding builder, every consumer surface). Not theory — every claim is file:line-cited below.

## Verdict in one line

The system was built as an **editorial/aesthetic catalog**; sports photography's job-to-be-done is **people-finding and selling**. The highest-value axis (who is in the frame, find-me) is the worst-served part of the pipeline.

## Finding 1 — Embedding is tag-overlap, not semantic search

`createSemanticDescription()` (`scripts/generate-embeddings-metadata.ts:72`) embeds a comma-joined string of ~9 enum fields (sport_type, play_type, photo_category, action_intensity, emotion, composition, lighting, color_temperature, time_of_day). Model: Gemini `gemini-embedding-001` @ 768d at write time, `embedding-001` at query time (`src/lib/supabase/server.ts:1270`) — a **model-name mismatch**. Match via `match_photos()` RPC, cosine, no ivfflat index, full scan over ~20K.

Because the concept never enters the source text, these real queries **cannot** match: "diving save", "kid in the red jersey", "celebration after winning the point", any player name, any object/scene noun. The project's own guide concedes it: "this uses metadata, not image analysis" (`embeddings-similarity-search.md:51`).

## Finding 2 — Identity is under-modeled (the core miss)

- `photo_metadata.jersey_number` is **singular** (`add-jersey-number.sql:5`); the prompt collapses multiple players to one (`enrichment-prompts.ts:154`).
- A richer `players[]` JSONB (multi-player jersey/team/action) + `team_colors` **is extracted** (`add-enhanced-metadata-fields.sql:22`) **but dropped on read** — `PHOTO_COLUMNS` (`src/lib/supabase/columns.ts:9`) doesn't select it. We pay to extract identity and throw it away.
- **No face detection / recognition** of any kind. No canonical `players`/`teams`/`rosters` entities. Named-player browsing is served only by the manual, admin-approved `user_tags` table (`2025-10-28-simple-player-tagging.sql`), free-text `athlete_name`, no FK to a player record.
- An abandoned `OBSOLETE-...schema-v3` migration already defined `detected_jersey_numbers[]`, `main_subject_bbox`, `human_verified` — the team saw where this needed to go and stopped.

## Finding 3 — Dead / invisible metadata

- `ai_confidence` — **fully dead**: fetched + mapped onto every Photo object, zero consumers filter/sort/display it.
- `time_in_game` — near-dead: one legacy collection query (`collections/+page.server.ts:110`), never shown, and the agentic path hard-codes `'unknown'` (`enrichment-prompts.ts:816`).
- `composition`, `time_of_day`, `color_temperature` — filter-only; values never shown to a viewer.
- `exposure_accuracy` — display + one score input; never independently filtered/sorted.

## Finding 4 — Curation signal built but not used

The default "Best Photos First" sort orders on `emotional_impact` **alone** (`server.ts:177`). The weighted quality blend in `photo-scoring.ts` (sharpness .35 / composition .30 / exposure / emotional .25) exists but doesn't drive the headline sort.

## Finding 5 — Schema drift

`src/types/database.ts` is materially stale: lists `use_cases` (dropped by schema-v2), omits live columns (`players`, `team_colors`, `player_count`, `ball_position`, `venue_type`, `crowd_density`, `key_moment`).

## Cost reframe

Reprocessing the **entire 20K library** is $11–$108 depending on model (benchmark, 2026-06-08). Cost is not a constraint — optimize for quality/findability, not token price. And model choice is flat: `gemini-2.5-flash-lite` tied for best on classification and was cheapest; the leverage is in *what* we extract/embed, not *which* model.

→ Drives spec: `.agent-os/specs/vision-extraction-identity-vnext/`.
