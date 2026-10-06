# Album publication times: what can be recovered

Observed 2026-10-05 on `analytics.ninochavez.co/gallery` with `compare=publication_age`: "252 selected albums lack a recorded publication time and are excluded."

## Status (2026-10-05)

Nino approved the backfill, the label column and the trigger, and chose the logged times for DWdCET and Re7kho. The ingest default (always unlisted) was not approved and is unchanged.

- `supabase/migrations/20261005230000_album_settings_publication_provenance.sql`: label columns, constraints, and the stamping trigger. Portable; applies to the synthetic rehearsal database too.
- `supabase/migrations/20261005230100_album_settings_logged_publication_backfill.sql`: the seven logged times. Production only; it aborts unless it writes exactly seven rows.
- Code: the trigger is now the only thing that stamps `published_at`. `publish-album.ts` no longer stamps or announces an album with no row, and the operator page marks inferred dates.

Both migrations were tested on a throwaway Postgres 17 seeded with production's rows. The test covered 11 behavior assertions and three negative controls. **Apply both before deploying the code, and do not publish an album in between.** The deployed code sends `published_at` in its payload, and Postgres rejects that row under the new constraint before resolving the conflict.

## Answer

There is no database record of when any album went public before 2026-09-26. Nothing ever wrote one. Agent session logs on this Mac do record the actual publish command, with before/after output, for **7 albums**:

- 5 albums that are null today: jq1Rp7, 1BlKk4, dKe567, eqYF0h, fJKdsB.
- The 2 albums that already have a value: DWdCET and Re7kho. Nino gave both times and a migration entered them by hand. Both differ from the logged writes. Re7kho's logged publish is 14h49m earlier than the stored time and falls on the previous Chicago day.

The other **247** cannot be recovered from any source here. For 244 of them a date would not help anyway: they almost certainly went public before 2026-06-30, the first day of the report's daily history. An album published before that date has no "first days" to compare, so it would show as *unavailable* instead of *excluded*. The remaining 3 (TRoiyO, rdrsVB, z6uqiQ) went public around that date at an unrecorded time.

**Recommendation.** Backfill the 5 null albums, all labelled `inferred`. Ask Nino whether the 2 stored times meant "went public" or "announced"; if "went public", replace them with the logged times, also labelled `inferred`. Leave the 247 null and change the message so it stops implying a data defect. Separately, publishing does **not** always set `published_at` today. A database trigger plus an ingest default would close that.

Nothing here has been written to the database. The SQL below is a proposal and needs Nino's approval.

## Where the 252 albums stand

| Group | Albums | Status |
|---|---|---|
| Published through a logged agent session after daily history began | 5 | Recoverable to the second. See `recovered-publish-times.json` |
| Legacy albums with no `album_settings` row (public by convention) | 242 | Public before daily history began; exact time unknowable |
| Rows created 2026-02-28 by the `gallery_scope` migration (5M7kNx, j5MfJD) | 2 | Public long before daily history; exact time unknowable |
| Ingested unlisted in June, flipped later without a recorded time (TRoiyO, rdrsVB, z6uqiQ) | 3 | Activity from 06-30, 07-01 and 07-03 suggests they were public by then; not provable |
| **Total excluded** | **252** | |

Today 254 albums are visible and 2 of them (DWdCET, Re7kho) have a value, which leaves the 252.

## What each source can prove

| Source | What it proves | Albums it covers | Usable as publication time? |
|---|---|---|---|
| `album_settings.published_at` | Stamped on a hidden-to-public change, but only since 2026-09-26 | 2 (both times given by Nino and entered by hand, not stamped) | Yes going forward; the existing 2 are operator-asserted |
| `album_settings.created_at` / `updated_at` | When the row was inserted. No trigger maintains `updated_at`, and no publish writer has ever set it | 25 rows | No. For albums ingested with `--unlisted`, `created_at` is the ingest time, not the publish time |
| `albums.created_at` | 245 of 267 albums carry 2026-06-08, the date the table was rebuilt | 267 | No. It records a rebuild, not a publication |
| `photo_metadata.upload_date` / `date_added` | Import dates: the `--upload-date` flag or the old SmugMug sync | 252 / 235 | No. `docs/ANALYTICS_PLAN.md` forbids substituting import dates |
| First `engagement_events` row | Someone reached the album. The endpoint records unlisted visits too (`src/routes/api/engagement/+server.ts` has no visibility check), and raw events are deleted after 90 days (`prune_engagement_events`), so 2026-07-07 is the retention floor, not the day logging began | 252 | No. It is not an upper bound on publication, and for 247 albums it only marks where retention starts |
| First `album_open` event | Same limits; the event type has existed only since 2026-08-29 | 29 | No |
| `engagement_events.catalogue_snapshot` | Backfilled from the current catalogue (`_basis: backfill_current_catalogue`). It holds no visibility, `publication_at` is null on all 48,996 rows, and the trigger makes it immutable | 252 | No |
| `analytics_daily_actions` (from 2026-06-30) | Daily activity per album, kept beyond the 90-day raw window | 247 | Circumstantial only: all 247 show activity by 07-13 and unlisted albums show none. Rules out a late publish but not an exact time |
| Agent session logs (`~/.claude/projects`, `~/.codex/sessions`, `~/.codex/archived_sessions`) | The publish command and its `before: unlisted` / `after: public` output, timestamped to the second | 7 | **Yes, labelled `inferred`.** A direct observation of the write, not an import or event date |
| film-room job log (`apps/film-room/data/jobs/2-album_publish.log`) | jq1Rp7 already public at 2026-07-19 21:52 CDT (a dry run) | 1 | Corroborates only |
| Git history of publish scripts | `publish-album.ts` appeared 2026-07-19 and the admin toggle 2026-02-19. Git records when code changed, not when an album was published | 0 | No |
| SmugMug API, Supabase API logs | Not queried. A perfect date from either would still fall before 2026-06-30 and show as *unavailable*; Supabase log retention is days, not months | n/a | Not worth the call |

Only this Mac's session logs were searched. Publishes run from another machine would not appear. That is the likeliest explanation for TRoiyO, rdrsVB and z6uqiQ.

## Why the 247 cannot be backfilled

- **No record exists.** Before 2026-09-26, every way of publishing changed `visibility` and nothing else. That covers the hand-typed REST PATCH, `publish-album.ts` from 2026-07-19, and the admin toggle, which until 2026-09-26 published by deleting the row. No column, log table or trigger captured the moment.
- **Every candidate stand-in is forbidden or meaningless.** Import dates, event dates and the 2026-06-08 rebuild date say nothing about when an album became reachable.
- **A true date would not change the report.** The publication-age comparison joins each album's first N days to `analytics_daily_coverage`, which starts 2026-06-30. An album published earlier gets `coverage = unavailable` and no total. The 247 would move from "excluded" to "unavailable" and nothing would become comparable.

**What it means:** for the 244 legacy albums this is mainly a labelling problem, not a data gap worth filling. Today's message, "lack a recorded publication time", reads like a defect. For those 244 the likely explanation is "published before daily history began (2026-06-30)". It rests on the missing row and on the activity pattern, not on an observed publish. The other 3 are genuinely unknown.

## Proposed backfill (not applied; needs approval)

Two problems shape it:

- A label has nowhere to live. Inferred values must be distinguishable from stamped ones in every place that shows them.
- The two existing values are treated as authoritative but were never stamped. They came from Nino after the fact, and both differ from the logged writes.

### 1. Schema (migration)

```sql
-- Proposal only. Do not apply without Nino's approval.
ALTER TABLE public.album_settings
  ADD COLUMN published_at_basis text
    CHECK (published_at_basis IN ('recorded', 'inferred')),
  ADD COLUMN published_at_evidence text;

COMMENT ON COLUMN public.album_settings.published_at_basis IS
  'recorded = stamped by the database at the hidden-to-public write. '
  'inferred = recovered after the fact from a log of that write; see published_at_evidence.';

GRANT SELECT (published_at_basis) ON public.album_settings TO anon, authenticated;
```

### 2. Values

```sql
-- Proposal only. Times are from recovered-publish-times.json.
UPDATE public.album_settings AS s
SET published_at = v.published_at,
    published_at_basis = 'inferred',
    published_at_evidence = v.evidence
FROM (VALUES
  ('jq1Rp7', '2026-07-19T21:11:43.955Z'::timestamptz, 'Agent session log: REST PATCH unlisted->public (Claude 7562b1fd)'),
  ('1BlKk4', '2026-07-26T21:38:06.440Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Claude 6dfacee4)'),
  ('dKe567', '2026-08-13T00:22:59Z'::timestamptz,     'Agent session log: publish-album.ts unlisted->public (Codex 019ff836)'),
  ('eqYF0h', '2026-08-24T03:46:25.490Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Codex 01a031cc)'),
  ('fJKdsB', '2026-08-29T02:39:40.894Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Codex 01a04b0e)'),
  -- The next two rows apply only if Nino confirms his times meant "went public" (question 1b).
  ('DWdCET', '2026-09-26T18:50:36.552Z'::timestamptz, 'Agent session log: publish:album unlisted->public (Claude 61499efe subagent); replaces operator-given 19:00Z'),
  ('Re7kho', '2026-09-26T01:10:52.556Z'::timestamptz, 'Agent session log: publish-album.ts unlisted->public (Claude 505ff78b); replaces operator-given 16:00Z')
) AS v(album_key, published_at, evidence)
WHERE s.album_key = v.album_key
  AND s.visibility = 'public';
```

All 7 rows exist and are public today. In Chicago time each publish falls at least 74 minutes from midnight, and the recorded times are accurate to a few seconds, so none can land in the wrong day bucket. None of the windows touches the two partial coverage days (06-30 and 10-05) except where a window runs into today, which the report already marks partial.

### 3. Readers that must carry the label

| Reader | Reads | Change needed |
|---|---|---|
| Scheduled gallery report RPC (`20260930004554_…`) | `album_settings.published_at` | Return `publishedAtBasis` beside `publishedAt` and `publicationAt` |
| Operator page (`src/routes/analytics/operator/+page.server.ts`, `+page.svelte`) | `album_settings.published_at`; the "New album" flag reads the report's `publicationAt` (merged in 5203af3) | Show "inferred" next to inferred dates and in the publication-age rows |
| Latest-gallery ranking (`src/lib/albums/latest.ts`, `/api/latest`, `/api/galleries/recent`) | `album_settings.published_at` | None required. Note that the backfill changes which album ranks as "latest" only if a backfilled time beats DWdCET; none does |
| Daily actions, compact evidence export, `gallery-performance.server.ts` | `engagement_events.catalogue_snapshot.publication_at` (immutable, null) | None possible. **Divergence:** these keep null for past events while the report shows the backfilled value. That is accurate about what was known at event time, but it should be stated in the export's notes |

### 4. Message for the albums left null

Replace "N selected albums lack a recorded publication time and are excluded" with a sentence that says why the gap exists and what it costs:

> "N albums have no recorded publication time. Most were published before daily history began on 30 June 2026, so they could not be compared by publication age even with a date."

No query can safely split the 244 legacy albums from the 3 June albums. All of their rows, where rows exist, predate 2026-06-30, and activity does not prove visibility. A split would need someone to record it by hand, so keep one count unless Nino wants that.

## Forward check: publishing does not always set `published_at`

The shared writer (`src/lib/albums/publish-target.ts`) is correct for the two callers that use it: `scripts/publish-album.ts` and the admin toggle. The following paths bypass it:

1. **Ingest without `--unlisted`.** The flag is opt-in (`scripts/ingest-album.ts:128`). Without it, ingest writes no row, so the album is public as soon as photos land. It gets no `published_at` and skips the `verify-album` publish gate.
2. **Direct writes.** A REST PATCH or SQL update that skips the shared function leaves no time. jq1Rp7 went public exactly that way on 2026-07-19.
3. **Albums with no row.** `resolvePublishTarget` treats a missing row as "going public" and stamps now. Readers treat a missing row as already public. Running `publish-album.ts --scope lpo` on a legacy album would therefore give it a false publication time of today and make it the "latest" gallery. It would also queue a public Instagram post: `willAnnounce` is true whenever `before?.visibility !== 'public'` (`scripts/publish-album.ts:160`), and `before` is null for a legacy album. The script would post a "new gallery" carousel for an album that has been public for years.
4. **Republishing.** Unpublish then publish overwrites `published_at` with the second time. The latest-gallery ranking wants that; "first days after publication" may not.
5. **The existing two values were never stamped.** No production row holds a value written by `applyPublishTransition`, so the forward path is proven only by unit tests (`publish-target.test.ts`). The next real publish is its first live proof. Read the row back after it.

### Proposed fix (two layers)

**Database (migration, needs approval):** stamp at the only moment that matters, whoever writes it.

```sql
-- Proposal only.
CREATE OR REPLACE FUNCTION public.album_settings_stamp_published_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- A missing row already reads as public, so only unlisted -> public is a publication.
  IF OLD.visibility = 'unlisted' AND NEW.visibility = 'public' THEN
    NEW.published_at := now();
    NEW.published_at_basis := 'recorded';
    NEW.published_at_evidence := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER album_settings_stamp_published_at
  BEFORE UPDATE OF visibility ON public.album_settings
  FOR EACH ROW EXECUTE FUNCTION public.album_settings_stamp_published_at();
```

With the trigger in place, `resolvePublishTarget` should stop stamping (one owner, not two). Its missing-row case should stop counting as "going public", which also fixes gap 3.

**Ingest (code change; it changes Nino's workflow, so proposed rather than made):** always write an `unlisted` row, and remove the opt-in flag. Every publication then becomes an `unlisted → public` update. The trigger stamps it, and `verify-album` gates it.

## Decisions (2026-10-05)

1. Backfill and label column: **approved**, all seven albums labelled `inferred`.
2. DWdCET and Re7kho: **use the logged times**.
3. Trigger: **approved**. Ingest always unlisted: **not approved**, unchanged.
4. Republishing: decided 2026-10-06. Album age counts from the first publication; `published_at` stays the latest publication for the latest-gallery ranking. See [the analytics site rethink](../20261006-analytics-site-rethink/README.md#decisions-nino-2026-10-06).
5. TRoiyO, rdrsVB and z6uqiQ: unanswered. They stay null unless the other Mac's session logs hold their publish.

## Where the label shows

- **Operator page**, publication-age table and album inspector: shows "(inferred)" next to inferred dates. Dates use the reporting timezone (America/Chicago).
- **CSV export and intelligence brief**: receive only a derived "published after the comparison window" flag, never the date, so there is nothing to label.
- **Daily actions and the compact evidence rows**: each new event snapshots `published_at` without its basis, and the snapshot is immutable. From the backfill onward, events for the seven albums carry the inferred time unlabelled. DWdCET and Re7kho rows carry the typed time before the backfill and the logged time after.

## Behavior changes to know

- `publish-album.ts` no longer announces an album that has no `album_settings` row. That includes an album ingested without `--unlisted`, which is already public; the script prints "announce: skipped — the album was already public". Use `--unlisted` at ingest, or pass `--announce`.
- The local analytics stack returns 503 on the operator page until its database has `20261005230000` applied. Fixture inserts that set `published_at` then also need a `published_at_basis` value.

## Rollout

1. Apply `20261005230000`, then `20261005230100`, each as one run. **Do not publish an album until step 4.** Until then, every unlisted → public publish fails with `album_settings_published_at_basis_present`. That covers the admin toggle (until the deploy is live) and `publish-album.ts` run from any checkout older than this change, including the main checkout.
2. Read back: seven `inferred` rows with the logged times, no non-null `published_at` without a basis, and the trigger present.
3. Walk the changed operator screens on production data, record the gallery reader receipt, and run the full `npm run build`. Re-record the receipt if main changes anything under `src/routes` or `src/lib/components` before merge.
4. Merge, confirm the Cloudflare Pages deploy, and pull the main checkout.
5. The next real publish's `after:` line is the first live proof of the trigger.

## What would change this

- Session logs on the other Mac holding the TRoiyO, rdrsVB or z6uqiQ publish would move those 3 into the recoverable group.
- Daily history before 2026-06-30 would make the 244 legacy albums worth dating. It does not exist: raw events are pruned at 90 days, and `analytics_daily_coverage` begins 2026-06-30.
- An admin-toggle publish between 2026-06-30 and 2026-07-13 would hide among the 242 no-row albums. It cannot be ruled out. Album counts reconcile exactly from 2026-07-29 on (249 public then, plus the 5 published since, equals 254), and every one of the 247 shows activity by 07-13.

## Provenance

Checked this session, read-only:

- **Production data** (service role through PostgREST, no writes): `albums`, `albums_summary`, `album_settings`, `photo_metadata`, `engagement_events` (all 48,996 rows), `analytics_daily_coverage`, `analytics_daily_actions`.
- **Code:** `src/lib/albums/publish-target.ts`, `scripts/publish-album.ts` (current and its first version, 691f09d), `scripts/ingest-album.ts`, `src/routes/admin/albums/+page.server.ts`, `src/routes/api/engagement/+server.ts`.
- **Migrations:** `20260219222201` (table and defaults; no `updated_at` trigger), `20260926140000` (the two operator-given values), `20260623191000` (90-day prune), `20260928120000` (snapshot immutability), `20260930004554` (publication-age RPC).
- **Logs:** every Claude and Codex session log on this Mac, the film-room job logs, and the film-room database tables.
- **Not checked:** the other Mac's session logs, SmugMug, Supabase or Cloudflare request logs.
