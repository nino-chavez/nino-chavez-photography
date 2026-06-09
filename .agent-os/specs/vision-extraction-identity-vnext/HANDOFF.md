# HANDOFF — north-star rebuild (photography gallery)

Read this first to resume. Canonical companions: `DEPRECATED.md` (anti-regression ledger),
`INGEST-REBUILD-10.md` (the one remaining build), `NORTH-STAR-REDESIGN.md` (has a SUPERSEDED banner),
and memory `[[album-management-pipeline]]` + `[[photography-live-credentials]]`.

## TL;DR — state right now
The north-star rebuild is **MERGED to `main` and LIVE on prod** (`photography.ninochavez.co` →
`ninochavez.co/photography`). The product model is **event-album discovery → find-my-photos →
download/share** (NO sales, NO faces, NO per-person naming). Everything below is done unless flagged.

- **DONE + live:** album-authoritative sport (corruption fixed), library-wide caption search
  (20,829/20,829 captioned + embedded), jersey identity (sightings, no naming), the IA re-architecture
  (Albums event-discovery, lean Explore, quality-score Collections, Favorites ZIP + photo download/copy-link),
  the `exec_sql` security lockdown + caller replacement, the timeline regression fix.
- **DONE + verified drops:** `ai_confidence` + the 6 vanity columns (composition/lighting/color_temperature/
  time_of_day/emotion/action_intensity) + `normalize_composition` + `sql-injection-fix.ts` + 2 dead components.
- **REMAINING:** the **#10 ingest rebuild** (scoped, slice 1 done — see below). Plus small open decisions.

## Deploy / branch reality (IMPORTANT)
- Prod deploys from **`main`** via **Cloudflare Pages git-integration** (NO GitHub Actions, NOT Vercel).
  Merge a PR to `main` → Pages builds (~2–5 min) → atomic switch. **Cloudflare Pages has instant rollback**
  if a deploy breaks prod.
- This session's work shipped via **PR #6 (the rebuild), #7 (timeline fix), #8 (exec_sql cluster)**, all merged.
- **`vnext-phase1` is a few commits AHEAD of `main`** (the post-deploy DB-migration records + the #10 spec +
  ledger updates — no code/deploy impact, the drops are DB-only). If not already merged when you start: open a
  PR `vnext-phase1 → main` and merge it to keep the repo + migration history in sync. Then work on `main` (or a
  fresh branch off `main`) going forward — the multi-PR-from-one-branch topology this session got messy.
- There is **ONE database and it is PROD.** Re-read `DEPRECATED.md` "MIGRATION SAFETY RULE": additive migrations
  are safe anytime; **drops/renames must not outrun the deployed code** (an early drop of `ai_confidence` from a
  branch 500'd prod once — fixed). DDL is applied via `supabase db push` (CLI authed via keychain;
  `supabase link --project-ref skywzpcekhntecegyjoj` needs no DB password). `exec_sql` is SELECT-only, so it
  CANNOT run DDL — use `db push`.

## Critical gotchas (will bite a fresh session)
- **The server client uses the ANON key by design** (`server.ts` ~line 29, "read-only is safe"). RLS applies to
  all server reads. This is WHY the `exec_sql` lockdown broke a cluster of features — anything calling `exec_sql`
  under anon now fails. All such callers were replaced with anon-safe typed queries; **do not reintroduce
  `exec_sql` callers in app code** (it's grep-clean now).
- **No 1000-row default traps:** a plain `.select()` caps at Supabase's 1000-row default. For full-table reads
  (distributions, period lists) page with `.range()` or use an aggregate view. This was the timeline bug.
- **`cf_image_id` must be `${albumKey}-${imageKey}`** (album-scoped), never the bare camera filename, and a 5409
  CF "already exists" is an ERROR, never an alias (root-caused collision bug — see `[[album-management-pipeline]]`).
- **Credentials** ([[photography-live-credentials]]): OpenRouter is the ONLY live AI gateway (vision =
  `google/gemini-2.5-flash-lite`, embed = `openai/text-embedding-3-large`@768 — direct Google/OpenAI keys are
  revoked). `op read` only works in FOREGROUND bash. CF Images token lives in 1Password, not `.env.local`.
- **Sport is album-authoritative:** `albums.sport` + the `enforce_album_sport` trigger force `photo_metadata.sport_type`.
  Never guess sport per-photo. A new album needs an `albums` row before ingest or its photos get `sport_type=NULL`.

## Remaining work + open decisions
1. **#10 ingest rebuild** — THE remaining piece. Scoped in `INGEST-REBUILD-10.md`. Slice 1 (`extraction_version`
   provenance column) is done. Slices 2–4 (the sport-aware extraction module + `scripts/ingest-album.ts` that
   uploads + extracts + embeds + writes DIRECTLY to the DB + writes sightings, killing the EXIF round-trip) are a
   **fresh, operator-in-the-loop build** — slice 5 (verify) needs a real local album directory, which only the
   operator has. Build it WITH a test album, don't hand over an unverified ingest pipeline.
2. **`players` column drop** — gated on #10 (the legacy sync still WRITES `players`; #10 writes sightings instead,
   then `players` can drop). Ledger #5.
3. **`sport_type` — recommended KEEP** (decision pending). It's a correct trigger-mirror, not cruft; dropping it
   cascades into 6 live objects (`albums_summary`, `timeline_month_sports`, `find_photos_by_jersey`,
   `find_similar_photos`, `match_photos`, the trigger) + a `photos_read` seam-flip redeploy. The seam
   (`PHOTOS_READ`/`PHOTOS_WRITE` in `columns.ts`) exists if you ever want it. Operator hasn't overruled the keep.
4. **`exec_sql` function drop** — optional. Zero app callers now; it's SELECT-only + service-role-only (secured) and
   handy for diagnostics. Drop it only if you want the surface gone entirely.
5. **`jersey_number`** — still in the deployed `PHOTO_COLUMNS` (used by the photo display). Keep.
6. **Minor:** an orphaned secondary Cloudflare Pages project `probe-nino-chavez-photography-28974` fails its build
   (separate from the live project) — delete it so the red check stops. `filter-compatibility.ts` has 2 unused-var
   lint hints (non-blocking).

## How to resume #10 (the build)
1. Confirm `vnext-phase1` is merged to `main`; branch fresh off `main` (use a worktree).
2. Implement per `INGEST-REBUILD-10.md` slices 2–4, reusing: `backfill-vnext.ts` (concurrency/backoff/checkpoint/
   the lenient-caption-parse), `backfill-jersey-sightings.ts` (shred→sightings + dedup_key), `embeddings.ts`
   (`embedText`), `taxonomy.ts` (`PLAY_TYPES_BY_SPORT`), `upload-local-to-cloudflare.ts` (CF upload + the id rule).
3. Have the operator run `scripts/ingest-album.ts` on a SMALL real album; verify DB rows (caption+embedding+
   play_type+scores+cf_image_id), sightings populated, `sport_type` album-correct, no EXIF written, idempotent.
4. Cutover: delete `enrich-local-photos.ts` + `sync-local-to-supabase.ts` + the EXIF code; drop `players`.

## Verification commands (sanity on resume)
- Caption coverage: should be 20,829/20,829. Live site: `curl -sL "https://ninochavez.co/photography/albums?v=$(date +%s)"`
  should contain "Search team or event"; `/timeline` should show years 2022–2026.
- `grep -rn "exec_sql" src --include="*.ts"` → no code references (comments OK).
- Ledger `DEPRECATED.md` is the source of truth for what's gone vs kept.
