## Verdict

The report is not yet trustworthy for unrestricted album comparisons or “rising” and equal-publication-age decisions. Its underlying rollup, coverage, visibility, and reclassification contracts are comparatively strong. Several ranking semantics can still produce a confident but wrong ordering.

### Material findings

1. **[Source-confirmed] Download rankings combine two different units.**

   The `downloads` measure matches every download event without distinguishing photo actions from album ZIP actions ([report-contract.ts:163](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/report-contract.ts:163)). Totals and album rankings aggregate both, although the report later separates photo and album-only rows for export ([operator-report.server.ts:242](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/operator-report.server.ts:242)). Bulk ZIP downloads are deliberately album-level ([BulkDownloadButton.svelte:28](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/components/album/BulkDownloadButton.svelte:28)).

   Example: ten individual-photo downloads rank above one ZIP download containing 100 photos. Those numbers do not measure the same action.

   Wrong conclusion: “Album A generated more download interest than Album B.”

   Smallest fix: split `photo_downloads` and `album_downloads`, or show both without a combined rank.

   Verification: a fixture containing one photo download and one album ZIP action must produce two named measures, not a combined total of two.

2. **[Source-confirmed] “Rising” can mean falling, or silently become “popular.”**

   Custom comparison windows may be any length ([report-contract.ts:133](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/report-contract.ts:133)). The report calculates raw count difference ([operator-report.server.ts:252](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/operator-report.server.ts:252)), and the UI sorts “Rising” on that difference, falling back to current count ([+page.svelte:50](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/routes/analytics/operator/+page.svelte:50)).

   Reproduction: 30 actions over 30 days versus 14 over seven days displays `+16`, although activity fell from two actions/day to one. With `compare=none` or `publication_age`, every difference is null and “Rising” sorts by current count—identical to popular.

   Wrong conclusion: “This photo is gaining momentum.”

   Smallest fix: permit rising only with complete equal-duration periods, or rank unequal periods by an explicitly named normalized rate. Disable rising when no compatible comparator exists.

   Verification: the 30-versus-14 example must not rank as rising; `compare=none` and `publication_age` must not offer a working Rising control.

3. **[Source-confirmed] “Same age” is calendar-day alignment, not equal exposure time.**

   Publication timestamps are truncated to their Chicago calendar date, then whole dates are counted ([operator-report.server.ts:329](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/operator-report.server.ts:329)). The interface calls these the first days “after publication” ([+page.svelte:240](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/routes/analytics/operator/+page.svelte:240)).

   Reproduction: an album published at 12:01 a.m. gets almost 24 hours in “Day 1”; one published at 11:59 p.m. gets about one minute.

   Wrong conclusion: “Album A performed better in its first day.”

   Smallest fix: use exact elapsed windows from `published_at`, or rename this explicitly to “publication calendar days” and reject it as equal-exposure evidence.

   Verification: two albums published at different times must receive equal elapsed-hour eligibility.

4. **[Source-confirmed presentation limit] Partial periods still produce popularity and recency rankings.**

   The report correctly withholds the total unless every day is complete ([operator-report.server.ts:239](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/operator-report.server.ts:239)), but groups with observed rows retain their counts and feed photo ordering ([operator-report.server.ts:252](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/operator-report.server.ts:252)). The UI continues to present Popular, Rising, and Recently active rankings.

   Example: if missing hours contain most of Album B’s activity, Album A can appear first even though the report refuses to state a complete total.

   Wrong conclusion: “These are the leading photos for the period.”

   Smallest fix: withhold comparative ranks on incomplete coverage, or label and isolate them as “observed records only; ordering may change.”

   Verification: a partial-coverage fixture must not render an unqualified Popular or Rising order.

5. **[Designed measurement limit] Deduplication uses UTC days while reporting uses Chicago days.**

   The unique indexes deduplicate by `event_day`, explicitly defined as the historical UTC-day contract, while report buckets use Chicago dates ([migration:22](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/supabase/migrations/20260928120000_analytics_north_star_draft.sql:22)). Two events at 6:30 p.m. and 7:30 p.m. Chicago can fall on different UTC days and both count on one Chicago report day. Conversely, activity on two Chicago days can collide within one UTC day.

   Wrong conclusion: small daily or rising differences around the UTC boundary represent actual additional actions.

   Smallest fix: align deduplication with the reporting day for new data, or surface the UTC-dedup rule beside on-screen counts.

   Verification: test both boundary directions, including DST dates.

6. **[Source-confirmed] Traffic-impact ranks invent movement inside ties.**

   Ranks are array positions after count-plus-alphabetical sorting ([operator-report.server.ts:352](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/operator-report.server.ts:352)). Two albums tied at ten receive ranks 1 and 2. If conservative counts become nine and ten, the report claims a 2→1 rise even though the inclusive state was tied for first.

   Wrong conclusion: excluded traffic changed an album’s competitive position when alphabetical tie-breaking created the original difference.

   Smallest fix: use competition or dense ranks and display ties.

   Verification: equal counts must receive equal displayed ranks.

7. **[Confirmed contract gap; production impact unproven] Null fingerprints bypass deduplication.**

   `session_hash` is nullable, and PostgreSQL unique indexes treat nulls as distinct ([popularity migration:22](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/supabase/migrations/20260623190000_popularity_engine.sql:22)). The existing migration explicitly accepts non-deduplicated null-hash rows ([album_visit_dedup.sql:36](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/supabase/migrations/20260709121000_album_visit_dedup.sql:36)). Tagged-arrival collection also accepts an omitted hash ([tracker.ts:80](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/src/lib/analytics/tracker.ts:80)).

   Smallest fix: classify null-hash events separately and avoid describing them as deduplicated, or require a stable deduplication key.

   Verification: two otherwise identical null-hash inserts must not silently become two “deduplicated actions.”

## Trustworthy capabilities

The source does support these narrower claims:

- Complete totals and period changes are withheld when any report day lacks complete rollup coverage.
- Zero-action days have an independent coverage ledger.
- Rows and coverage are read from one PostgreSQL snapshot.
- Raw events expire after 90 days only after durable daily preservation is attempted; failed preservation freezes the day as unavailable.
- Metadata snapshots preserve event-time facts and label backfilled history separately.
- Retained-event classification corrections rebuild the affected daily summary.
- Conservative traffic includes audience plus unclassified traffic, while excluding known controlled and suspected automated classes.
- Public reporting excludes unlisted albums and fails closed when visibility cannot be read.
- Distinct-browser estimates become unavailable when exact retained-data deduplication cannot be supported.

## Production evidence still required

- Confirm the September 29 suspected-session fix was followed by the required reconciliation; the migration itself requests this but does not perform it ([20260929024500 migration:19](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/supabase/migrations/20260929024500_analytics_unique_suspected_sessions.sql:19)).
- Measure null-fingerprint volume by action type.
- Confirm actual coverage rows, reconciliation freshness, and collection delivery. A complete rollup only proves completeness relative to events that reached storage.
- Measure how many albums have reliable `published_at` values.
- Validate rankings against controlled events spanning UTC and Chicago day boundaries.

Commands run: line-numbered source reads with `nl`; focused searches with `rg`; four `node -e` reproductions for rising, publication exposure, UTC/Chicago boundaries, and tied ranks; and `node --import tsx --test src/lib/analytics/report-contract.test.ts src/lib/analytics/operator-report.test.ts`. All 15 focused tests passed, but none exercises the ranking and equal-age defects above.

No files, servers, ports, browser sessions, database connections, network requests, secrets, or persistent runtime resources were created.