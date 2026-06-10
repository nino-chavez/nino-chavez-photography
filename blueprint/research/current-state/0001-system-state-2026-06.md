# Current-state synthesis — June 2026

This is the Stage-0/1 substrate for the midstream pipeline: where the system actually is after the north-star rebuild and the 2026-06 ingest/search/cleanup work. Grounded in shipped code + verified prod state, not aspiration. Companion: `vision-extraction-intent-audit.md` (migrated from `.agent-os/audits/`), and the `decisions/` ADRs.

## Product model (locked)

Discover event → **find-my-photos** → download/share. **No sales, no faces, no per-person naming.** The pilot is the athlete asking "did you get that?" (see `pilot_profile` + `research/observations/find-my-photos-demand-signal.md`).

## What's live (prod, verified 2026-06-10)

- **Album-authoritative sport** — corruption fixed; sport is an album property, trigger-mirrored, never per-photo guessed. (ADR-0001)
- **Unified structured ingest** (`scripts/ingest-album.ts`) — one pass/image, direct to DB, no EXIF round-trip, captures camera/lens/exposure EXIF + real GPS. (ADR-0002)
- **LLM query planner + hybrid search** — NL → typed plan (facets + resolved date range + semantic_text) → `match_photos_hybrid`. (ADR-0003)
- **Jersey-sightings identity** — 46,702 sightings / 26,358 with a jersey number; find-by-jersey/colour, human-resolved. (ADR-0004)
- **Library**: ~20,800 photos captioned + embedded; quality-score Collections; IA = Albums (event discovery) / lean Explore / Timeline / Favorites (ZIP).
- **Deploy**: Cloudflare Pages (git-integration from `main`) + Worker (album-zip) + R2 + Cloudflare Images. Supabase Postgres.

## Known gaps / open threads (the work-list)

1. **Location search** — `place` is parsed by the planner but unfilterable: no usable location data (legacy lat/long were `(0,0)` junk; new ingest captures real GPS only when a Sony Location-Info-Link fix exists). Album-level city must be operator-captured before "in chicago" works. Shelved until demand.
2. **Reprocess-in-place gap** — the ingest keys albums by folder name, so re-running on existing files creates a *duplicate* album (bpo-2026 vs TRoiyO, since cleaned up). Needs a `--reprocess <album-key>` mode.
3. **image_key is not unique** — camera DSC numbers reset per card; `/photo/[id]` was hardened to prefer a listed album, but the deeper fix (resolve by `photo_id` or album+key) is unaddressed (5 pre-existing collisions remain, handled).
4. **SmugMug URL columns** — load-bearing in `albums_summary` + `find_similar_photos`; drop shelved (matview-recreation risk > payoff).
5. **Portal conformance** — the Blueprint portal still carries scaffold example content (Stage-2 customization).

## Methodology

Ported from `.agent-os/` to Blueprint (this session) — midstream, pattern A, tier 2. The `.agent-os/specs/vision-extraction-identity-vnext/` docs (NORTH-STAR-REDESIGN, DEPRECATED ledger, INGEST-REBUILD-10) are the source the `decisions/` ADRs distil; full retirement of SPEC.md/TASKS.md follows once mapped.
