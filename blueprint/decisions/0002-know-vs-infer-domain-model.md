# ADR 0002 — KNOW-vs-INFER domain model + the locked-contracts table

**Status:** Accepted (ported from NORTH-STAR-REDESIGN, 2026-06-08)
**Deciders:** Nino Chavez (operator)
**Supersedes the corruption-class design:** per-photo `sport_type`

## Context

The pre-rebuild system was built as an **editorial/aesthetic catalog** and asked the vision model to *guess* facts that are deterministic from the shoot context. A per-photo `sport_type` prompt hard-coded "95% volleyball, default to volleyball." Unbiased re-detection over 160 of ~260 albums found **41 conflicts**: ~18 real-sport mislabels (tennis/soccer/football stored as volleyball) and ~23 non-sport albums carrying a sport (a marriage proposal stored as volleyball). Identity was unqueryable (singular `jersey_number` + a JSONB `players[]` blob).

## Decision

**Separate what you KNOW from what you INFER** — this is the column-placement algorithm, not a slogan.

| Tier | Source of truth | Written by | DB defense |
|---|---|---|---|
| **KNOWN** | shoot context / EXIF | album curation (human) + EXIF reader | NOT NULL + FK; **no AI write grant** |
| **INFERRED** | the vision model | one structured extraction call | enum + CHECK + provenance stamp; nullable until enriched |
| **DERIVED** | a formula over inferred columns | Postgres `GENERATED` / precompute | declarative; cannot drift |

Load-bearing values are pinned **once** in NORTH-STAR §0 LOCKED CONTRACTS (the single source of truth that prevents contract drift across drafts). The ones the #10 ingest depends on:

- **Sport authority** = `albums.sport` (enum, NULL = non-sport). **No per-photo sport column exists** — the corruption-class field is deleted, not deprecated; the vision JSON schema has no `sport` key.
- **Caption embedding** = `vector(768)`, `openai/text-embedding-3-large`@768 via OpenRouter; one `embedText()` for write AND query.
- **`extraction_version`** = `text`, `'<version>:<model>'`.
- **`jersey_number`** = `text` everywhere (`'00' ≠ '0'`, `'7A'` is real).
- **`cf_image_id`** = `'<album_key>-<image_key>'` (hyphen) + `UNIQUE(content_hash)`; 5409 = error.
- **Vision model** = `google/gemini-2.5-flash-lite` (locked — do not "upgrade").
- **Taxonomy single-source** = one `taxonomy.ts` generates every enum; CI asserts Postgres enum = JSON-schema enum = ajv schema.

## Consequences

- The #10 ingest (cycle 1) inherits these as **preserved patterns** (prescription P1–P7). It writes only INFERRED fields; KNOWN fields (sport) are physically unreachable by the AI writer.
- Anti-regression: a future session must not re-add per-photo sport guessing or a second prompt/embedder/entry-point. The standing rules are in NORTH-STAR §9 and `current-state/convergence-ledger.md`.

## References

- `.agent-os/specs/vision-extraction-identity-vnext/NORTH-STAR-REDESIGN.md` §0 (locked contracts), §1 (root insight), §2 (principles), §9 (anti-patterns)
- `blueprint/research/current-state/vision-extraction-intent-audit-2026-06-08.md` (the diagnose)
- `blueprint/prescription.yml` (P2, P3, P6, P7)
