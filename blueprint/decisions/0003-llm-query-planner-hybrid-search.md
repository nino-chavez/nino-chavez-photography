# 0003 — Search is an LLM query planner + hybrid retrieval, not a keyword matcher

**Status:** Accepted · **Date:** 2026-06-10

## Context

Search was "smart-parse + vector fallback": a hand-maintained keyword map extracted known facets (sport, play, category, jersey); any leftover term tipped the *whole* query to pure vector search, losing the structured filters. It could not handle relative dates ("last summer"), compositional queries ("volleyball blocks from last summer"), or arbitrary phrasing — each new shape needed another rule. Extending it with date rules was rejected as a symptom patch on a brittle matcher.

## Decision

A natural-language query goes to a cheap model (OpenRouter `gemini-2.5-flash-lite`, structured output) that emits a typed plan — `{sport, category, play_type, jersey, date_from, date_to, semantic_text, place}` — resolving relative dates against today. The plan drives **hybrid retrieval** via a new `match_photos_hybrid` RPC that ANDs the structured filters into the same query that ranks by caption-embedding similarity. The planner returns null on any failure, falling back to the existing rule parser (graceful degradation). A single planning pass (~300 ms, ~$0.0001) is used, **not** an agentic retrieve→reformulate loop — that is reserved for a future deep-search mode; paying its latency for the common interactive case is the over-engineering version.

## Consequences

- "players celebrating last summer" resolves to the 2025 summer date window + the celebration facet + semantic ranking, combined.
- The planner decides *what* to filter but cannot *create data*: `place` ("in chicago") is parsed and surfaced but not filterable, because there is no usable location data (the legacy lat/long were all `(0,0)` junk). Location search is shelved until album-level city is captured.
- Time works immediately because `photo_date` is real capture time (read from EXIF, not upload time).
