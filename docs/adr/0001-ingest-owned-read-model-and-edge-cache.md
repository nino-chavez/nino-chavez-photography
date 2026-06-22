# ADR 0001 — Ingest-owned read model + edge cache tier

**Status:** Accepted — all code landed (Phases 1–4); migration `database/migrations/2026-06-22-album-read-model-hardening.sql` pending apply in Supabase. Album-HTML-page edge caching deferred (see Implementation notes).
**Date:** 2026-06-22
**Author:** Abelino Chavez (with architecture audit)
**Supersedes:** the implicit "read-on-request against OLTP" pattern currently in place

---

## Context

A Cloudflare traffic audit surfaced **~643 `504 Gateway Timeout`s in 7 days on `/photography/api/album-photos`**, plus 504s spread across `/`, `/blog`, `/about`, `/now`, `/photography/api/download`. The cross-endpoint spread is the tell: this is **origin saturation**, not one slow query.

### The request lifecycle, as wired today

```
bot/human → CF edge (no cache) → Pages Function (SSR, global)
          → supabase-js (anon key, public REST) → PostgREST → Postgres OLTP (photo_metadata, ~20K rows)
```

Every public read — every bot crawl included — runs the full length of that chain and terminates in a live query against the transactional table. Nothing absorbs reads upstream of Postgres.

### Root cause

**The system has no read/write separation keyed to its only real write event — album ingest.** The data is change-on-ingest (effectively immutable between a handful of weekly ingests), but it is served through a read-on-every-request, OLTP-coupled path. Freshness, caching, counts, and ordering are recomputed inside untrusted request handling instead of being produced once at the write boundary.

The four "performance smells" are not independent problems — they are this one defect seen at four points in the request.

### Evidence this is the root, not opinion

| Observation | File / line | What it proves |
|---|---|---|
| A materialized read model already exists, with `photo_count` pre-aggregated per album | `database/views/albums_summary.sql` | The correct pattern is in the repo. |
| Ingest already refreshes that read model at the write event | `scripts/ingest-album.ts:542` (`rpc('refresh_albums_summary')`) | The write-keyed maintenance hook already exists. |
| Yet the **read path also refreshes** the MV, on every albums page load, if stale | `src/routes/albums/+page.server.ts:11-48`, called at `:79` | Maintenance is triggered by reads — inverted. |
| That refresh is **non-concurrent** (`ACCESS EXCLUSIVE` lock, blocks all readers) | `database/views/albums_summary.sql` `refresh_albums_summary()` — `REFRESH MATERIALIZED VIEW albums_summary;` (no `CONCURRENTLY`) | A refresh stalls every concurrent reader. |
| And it is **executable by `anon`** | `GRANT EXECUTE ON FUNCTION refresh_albums_summary() TO anon;` | Any unauthenticated request that trips the staleness check can stall the origin. |
| The hot path — photos *within* an album — bypasses the read model and hits the base table per request, recomputing `count: 'exact'` every page | `src/routes/api/album-photos/+server.ts:36-44`; `src/routes/albums/[slug]/+page.server.ts:38` | `getPhotoCount` recomputes a number already materialized in `albums_summary.photo_count`. |
| No edge cache on the data path | prod headers: `album-photos` returns no `Cache-Control` / no `cf-cache-status`; album page is `cache-control: no-cache` | Bot load amplifies 1:1 into DB load. |

### Why every symptom derives from the root

| Symptom | Derivative of the root |
|---|---|
| `no-cache` everywhere | No precise, write-keyed invalidation hook → freshness bought by globally disabling caching. |
| `count: 'exact'` per page | Recomputing at read time a value the read model already materializes. |
| In-memory sort / `OFFSET` re-scan, no covering index | Ordering recomputed per request instead of materialized once at ingest. |
| 504 storms across many endpoints | No tier between public traffic and OLTP; plus read-triggered blocking MV refreshes. The blast radius of a crawl reaches Postgres. |

One line: **a read-on-write-frequency dataset is being served on a read-on-request architecture.**

---

## Decision

Make **album ingest the single boundary that owns all read-model maintenance and cache invalidation**, and put a cache tier in front of OLTP. Reads never maintain; they only read, and they read from cacheable surfaces.

Three structural moves:

1. **Reads stop doing maintenance.** Remove all read-path MV refresh. The write event (`ingest-album.ts`) already owns the refresh.
2. **The read model covers the hot path.** Per-album photo counts (and, where cheap, ordering) come from the materialized projection, not per-request `count: 'exact'` against the base table.
3. **Edge cache is tier-0, invalidated on ingest.** Public reads are served from CF edge cache keyed by album; ingest purges the affected album's cache after refresh. Because invalidation is now precise (it fires exactly when — and only when — content changes), caching becomes both safe and aggressive, dissolving the `no-cache` compromise.

End-state topology: **bots and humans hit edge cache / projection; Postgres sees ingest writes and cold misses only.** DB load decouples from public traffic volume.

---

## Migration map (phased, against current code)

### Phase 1 — Stop read-path maintenance (code + grant; no schema risk) ⟵ start here

- **Delete** `autoRefreshViewIfStale()` and its call — `src/routes/albums/+page.server.ts:6-48` and `:79`. Safe: `ingest-album.ts:542` already refreshes after every ingest, which is the only event that changes album data. Removes the blocking refresh and 2 probe queries from every albums page load.
- **Migration (needs approval — `database/` is gated):** `REVOKE EXECUTE ON FUNCTION refresh_albums_summary() FROM anon, authenticated;` Refresh becomes service-role-only (ingest). Closes the anon-triggerable origin stall.

### Phase 2 — Make refresh non-blocking (migration)

- `CREATE UNIQUE INDEX CONCURRENTLY idx_albums_summary_album_key_uniq ON albums_summary(album_key);` (prerequisite the SQL file already notes).
- Redefine `refresh_albums_summary()` → `REFRESH MATERIALIZED VIEW CONCURRENTLY albums_summary;`. Ingest's refresh no longer locks readers.

### Phase 3 — Read model covers the hot path (code + index)

- Add `getAlbumPhotoCount(albumKey)` to `src/lib/supabase/server.ts` that reads `albums_summary.photo_count` (single indexed lookup) instead of `count: 'exact'` over the base table.
- Swap call sites: `src/routes/api/album-photos/+server.ts:43` and `src/routes/albums/[slug]/+page.server.ts:38`. Also only fetch the count on `page === 1` (the client accumulates it).
- **Migration:** covering index for the photo-page query so cold misses are index-only:
  `CREATE INDEX CONCURRENTLY idx_photo_metadata_album_feed ON photo_metadata (album_key, upload_date DESC, image_key) WHERE sharpness IS NOT NULL;`

### Phase 4 — Edge cache + ingest-owned invalidation (the tier-0)

- `src/routes/api/album-photos/+server.ts` response: `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` + `Cache-Tag: album:<albumKey>`.
- `src/routes/albums/[slug]/+page.server.ts`: replace `no-cache` with `s-maxage` + `Cache-Tag: album:<albumKey>` (drop the freshness workaround; purge now guarantees freshness).
- `scripts/ingest-album.ts` (after the `refresh_albums_summary` call at `:542`): purge Cloudflare cache by tag `album:<ALBUM_KEY>` plus the album-list/home tags. Ingest now owns **both** data refresh and cache invalidation — one write event, one freshness boundary. (CF token: `op://Developer Secrets/Cloudflare account-ops claude-code/credential`, with Cache Purge permission added.)

### Phase 5 — (Optional, deeper) per-album materialized photo projection

If cold-miss reads must be O(1) regardless of album size, write a per-album ordered photo JSON to R2/KV at ingest and serve it directly. Likely unnecessary once Phase 3's covering index + Phase 4's edge cache land; recorded as a future lever, not a commitment.

---

## Consequences

**Positive**
- Postgres load decouples from public/bot traffic; storms hit cache, not the DB.
- 504 surface collapses: no read-path refresh lock, cached reads, index-only cold misses.
- Security: `anon` can no longer trigger a full MV refresh.
- The `no-cache` compromise is removed without losing freshness — freshness is now guaranteed by purge-on-ingest.

**Negative / risk**
- Cache invalidation must be reliable. If a purge fails, an album is stale up to `s-maxage` (5 min) — bounded, and the SWR window keeps serving while revalidating. Mitigation: retry the purge in ingest; keep `s-maxage` modest.
- One more dependency in the ingest script (CF cache-purge API).

**Neutral**
- User-scoped dynamic surfaces (favorites, tags) are a separate, legitimately-dynamic concern and are out of scope here — they do not belong in the cached album read model.

---

## Implementation notes (what shipped, and honest scope)

- **Security: `REVOKE` must include `PUBLIC`.** `EXECUTE` is granted to `PUBLIC` by default at function creation, and `anon` is a member of `PUBLIC` — so `REVOKE ... FROM anon, authenticated` alone is a no-op. The migration revokes `FROM PUBLIC, anon, authenticated` and grants only `service_role`, matching the repo pattern in `fix-security-lint-2025-03.sql`. The unauthenticated `/api/admin/refresh-albums` endpoint (anon-key `rpc`, no auth) was **deleted** — it was a second public refresh-DoS vector and is superseded by ingest-owned refresh.
- **Existence is decided by the base table, not the MV.** `albums/[slug]/+page.server.ts` now 404s only when page-1 `photos` (base table), `totalCount`, and `videos` are all empty. So a missing/stale `albums_summary` row can't make a real album disappear — the MV is an optimization for the displayed total, not a correctness dependency. The ingest refresh failure is logged **loudly** (`console.error`), not buried.
- **Where the 504 relief actually comes from.** The album **HTML page** is still `no-cache` — and bots crawl HTML, not the client-fetched JSON API. So most of the album-*page* SSR relief comes from the **covering index** (page-1 query becomes index-only) plus the **dropped `count(exact)`**, *not* from the edge cache. The Cache API on `album-photos` absorbs repeat hits on the *JSON API* path (the 643-timeout hotspot). If album-page-path 504s persist after deploy, the next lever is caching the HTML SSR (a `hooks.server.ts` Cache-API layer or a CF Cache Rule) — deferred deliberately to keep this change scoped and low-risk.
- **Invalidation on a non-Enterprise plan.** Cache-tag/prefix purge is Enterprise-only. Ingest purges the whole zone (one API call, env-gated on `CF_ZONE_ID` + `CF_CACHE_PURGE_TOKEN`, best-effort/non-fatal). If unset, the API's `s-maxage=300` bounds staleness to ~5 min — acceptable for an operator-run, infrequent ingest.

## Validation (how we confirm the root was fixed, not the symptom)

- **Re-pull CF GraphQL** for `ninochavez.co`, same 7-day window: `504` count on `/photography/api/album-photos` and `/` → target near-zero.
- **`cf-cache-status: HIT`** on repeat `album-photos` requests for the same album.
- **Supabase**: query volume against `photo_metadata` drops to ingest + cold-miss only; no `REFRESH` events outside ingest.
- A bot-storm spike (we saw 2,795 req/hr) should no longer correlate with a 504 cluster.
