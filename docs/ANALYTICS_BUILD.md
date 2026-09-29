# Analytics build record

Status: the full build is implemented and deployment is authorized. Local numerical, failure, interaction, and independent visual acceptance passed. The production database migrations are applied. Gallery publication and hosted checks are in progress; the release record below distinguishes completed steps.

The public activity summary remains available. The private operator workspace lives at `/photography/analytics/operator`. It uses the existing verified Supabase identity and operator allowlist. This is the complete release scope from `ANALYTICS_PLAN.md`.

## What the operator can do

- Choose one album, several albums, or the whole gallery. Find albums by name, including albums with no recorded activity.
- Select a measure and activity dates. Filter by sport, photo category, source, event date, season, event type, and traffic.
- Compare a previous equal period, a custom period, or the same number of days after a recorded publication date.
- Inspect popular, rising, and recently active photos in image or table views. See current and previous counts, change, and latest activity. Shortlist photos and export the complete filtered result.
- Save, reopen, update, and delete private report views. Add, edit, and delete sharing notes; see those notes beside daily activity in the table.
- Separate arrival tags from locations inside the gallery. Inspect how traffic exclusions change album counts and rankings.
- Review retained events by album and date. Correct their classification and reverse the latest correction while raw evidence survives.
- See missing history, data freshness, today's partial activity, collection diagnostics, and the unresolved external comparison.

Activity dates use America/Chicago. The existing event deduplication uses UTC days. These are separate rules, and the export names both. Estimated browsers count distinct accepted fingerprints across the whole scope and interval, for any recorded action. They are not summed across days or albums and are not verified people.

## What makes the counts defensible

One read-only database statement returns daily rows and coverage from the same committed snapshot. It also calculates today's partial activity from retained events. A concurrent reconciliation cannot make the reader skip or repeat an offset page. The scalar response is not limited to PostgREST's ordinary 1,000-row page.

Daily summaries preserve photo-level and album-only actions separately. Full download exports retain both photo download actions and album ZIP actions. An empty shortlist returns no photo rows. It does not fall back to every album.

New events capture authoritative catalogue facts. Legacy events receive their first backfill snapshot once. Explicit nulls stay null. Coverage identifies event snapshots, first-backfill facts, or a mixture. A metadata edit does not silently regroup recorded history. Zero-activity catalogue rows use current facts, which the interface states.

The final preservation pass aggregates every physically present event before deletion. It keeps the known raw-evidence boundary separate from the rows that happen to remain. It freezes the durable result, then keeps the existing 90-day deletion policy. A failure never extends raw retention or turns missing evidence into zero.

The latest classification correction feeds private reports, exact retained visitor counts, public summaries, popularity, top-photo selection, and search ranking. The existing high-volume heuristic remains labeled suspected automation. A correction cannot reconstruct evidence already deleted.

The collector validates photo and album identity before insertion. The database enforces the same relationship. Accepted writes, accepted duplicates, invalid targets, and failed writes have different responses. Operator identity and signed, short-lived test markers establish controlled traffic. A bad or expired marker is rejected; it does not silently become audience traffic.

## Local evidence and its limits

The rehearsal uses only the dedicated synthetic Supabase project at API port 55491 and database port 55492. It verifies both loopback hosts, fixed ports, and a project sentinel before resetting anything. The parent owns the runtime. No worker may stop other Docker stacks.

The migration rehearsal runs a guarded reset and apply twice. It checks immutable snapshots, partial and frozen coverage, expiry, interrupted reconciliation, corrections and reversals across consumers, service-only access, more than 1,000 report rows, and concurrent reads during reconciliation. It also checks live partial counts and durable diagnostic start metadata.

Authenticated HTTP checks cover anonymous, ordinary signed-in, and operator access to both page and CSV. They verify private no-store responses and reject raw hash fields. Numerical cases cover audience versus inclusive traffic, category, historical event date, unknown season, a supported zero, tagged arrivals, full photo export, and album-only export.

A bounded local collection burst sent 100 requests at concurrency 20. It produced 20 accepted actions and 80 duplicates, with no write failures. The dated latency values are in `audits/analytics-20260928/verification.json`. Five operator actions stayed classified as operator, and one ordinary control counted as audience. This is loopback evidence, not a production capacity guarantee. A queue is not added without evidence that synchronous collection cannot meet the actual load.

Rendered acceptance uses synthetic records and representative owned photographs. Every capture is marked as synthetic. It does not establish that production history is correct. The browser checks include desktop and phone overflow, the first phone answer, album drilldown, saved views, keyboard photo inspection and focus restoration, shortlist export, sharing-note editing, saved-view updates, Back navigation, and classification/reversal. The parent fixed a startup race that could overwrite an immediate note edit. Inputs now become editable after startup completes.

## External comparison did not establish parity

The read-only Cloudflare audit covered September 21–27, 2026 in Chicago time. The first-party source had 99 deduplicated album opens. The matching hostname and album-path RUM query returned no groups. A broader property query returned traffic, including photography routes, but did not establish compatible album-route coverage. Therefore the result is **unresolved**, not a successful reconciliation and not proof that either number is wrong.

The live shell exposed both an explicit beacon and automatic installation with the same token. That observation alone does not prove double counting. No Cloudflare configuration changed. Source inspection found no PostHog or GA4 instrumentation; it does not rule out an external injection.

The full build retains first-party events because they describe gallery actions and support the required album/photo dimensions. Switching to PostHog would still require definitions, controlled-traffic exclusion, identity limits, retention rules, and reconciliation. An additional provider remains a product decision if it supplies a capability this workspace cannot maintain reliably.

## Privacy and identifier decisions

The IP/browser-derived hash is a pseudonymous identifier. It is not anonymous data. It stays out of page responses, exports, URLs, logs, and durable action summaries. Raw engagement retains the published 90-day limit.

A keyed identifier would reduce offline guessing, but changing its key or construction breaks continuity of distinct counts. This build preserves the existing identifier contract rather than silently mixing identities. Any change needs a version, a 1Password-owned key, an explicit rotation boundary, and a disclosure that people cannot be deduplicated across that boundary.

Long-period unique visitors remain unavailable when the raw evidence needed for exact deduplication has expired. Daily distinct counts are never added. HLL was not selected: arbitrary content and traffic filters, reversible classification, and changing identity versions require a separate precision and privacy contract. Durable action totals remain available over successfully preserved history.

The photography privacy policy lives on the parent website. The pre-release requirement was to add wording explaining that daily action totals may remain after individual engagement records expire. Suggested factual substance: “Individual engagement records, including the derived browser/network identifier, are deleted after 90 days. We may retain daily totals by album, photo, action, and broad traffic classification to understand gallery activity. Those totals do not contain the visitor identifier.” That requirement is now completed; the release record below identifies the live privacy deployment.

## Production application remains a separate, concrete step

The initial read-only live audit observed 48,597 engagement records, with earliest retained event June 30, 2026. It did not verify the applied migration history, active prune job, or execution history. An attempted read-only management query rejected the available credential. No production SQL ran during that initial audit. The repository migration date is not proof of when deletion began.

The release preflight required:

1. Confirm the actual production schema, grants, materialized views, prune job, and recent executions against the migration's prerequisites.
2. Publish the reviewed aggregate-retention wording in the owning privacy page.
3. Review and apply the migration as one transaction. Run the initial backfill immediately; the scheduled reconciler is a retry path.
4. Verify coverage, first scheduled reconciliation, and prune receipts. Do not claim to recover missing history.
5. Deploy the application and verify hosted access, collection, reports, and cache behavior with controlled traffic.

These steps are prepared for review. The full-build instruction did not authorize production migration, a retention pause, deployment, or an external service configuration change.

## Review artifacts

- `audits/analytics-20260928/verification.json` — final checks, runtime review provenance, source and capture hashes.
- `audits/analytics-20260928/cold-review-final.md` — independent visual recheck.
- `ANALYTICS_PLAN.md` — full release contract and acceptance cases.
- `ANALYTICS_DESIGN_CONCEPTS.md` — the three alternatives, selected structure, and borrowed elements.
- `audits/analytics-20260928/concepts.html` — interactive alternatives using invented data.
- `supabase/rehearsal/analytics-assertions.sql` — numerical, security, retention, and correction assertions.
- `scripts/rehearse-analytics-local.mjs` — guarded, reproducible local database rehearsal.

The independent cold review initially rejected clipped phone navigation, unmarked table overflow, ambiguous photo export, and missing ranking-state evidence. Those findings were fixed and rechecked in `audits/analytics-20260928/cold-review-final.md`. The parent also caught an offscreen native dialog and verified its viewport position after correction. The reviewer accepted the revised visible experience; screenshots do not prove production data or runtime behavior.

The export includes every matching row, not just the displayed page. The HTTP rehearsal exports 1,105 synthetic photo rows. The independent review's phrase “visible result set” describes its screenshot limit, not the export contract.

## Reproduce the local acceptance

Prerequisites: Docker, the installed Supabase CLI (verified 2.102.0), PostgreSQL 17 `psql` at `/opt/homebrew/opt/postgresql@17/bin/psql`, and this repository's installed dependencies. No production token is needed.

1. Run `npm run analytics:setup:local`. It starts only the named synthetic project, saves generated local keys in an ignored file with owner-only permissions, then runs the guarded reset/reapply rehearsal. The template is `supabase/rehearsal/config.toml`.
2. Keep `npm run analytics:dev:local` running in a second terminal. It serves port 5187 against that local project and permits only `analytics-operator@example.test` as operator. The synthetic password is `synthetic-only-password`.
3. Run `npm run analytics:verify:local` for permissions, numerical/CSV, collection burst, and forced-failure checks. It creates the ignored test cookie file used by the browser suite.
4. Run `npm run analytics:ui:local` for the desktop/phone and keyboard journeys. The suite's photograph is a representative owned image substituted only during testing.
5. Run `npm run check`, `npm run analytics:contract:test`, and `npm run build`. Rendered review evidence must match the changed sources for the build to pass.

`analytics:rehearse` resets only the dedicated local fixture schema. The ordinary application and other Docker projects are outside its scope. Re-running it resets synthetic notes and corrections, so run it before HTTP/browser acceptance. Generated keys, session cookies, raw audit snapshots, and runtime settings stay outside version control. The owned preview and dedicated local stack were stopped after final verification; local database volumes were preserved. Other running projects were untouched.

## Remaining release evidence

The complete implementation is ready for production review. Hosted migration, access/cache checks, and a cold review using real production report data remain required after authorized application. Synthetic acceptance is not a substitute for that live evidence. No business effect or improvement in photography decisions has been measured yet.

## September 28 production release

The production preflight confirmed the applied schema, active cron jobs and recent successful runs. The existing prune runs daily at 03:17 UTC. The linked CLI can query and migrate this project; the earlier management-token rejection does not establish a deployment block.

Production compatibility found `albums.event_type` was deliberately removed by the June 9 migration. Reporting now keeps that dimension unknown and queries only existing catalogue columns. The synthetic base matches production and asserts that the removed column stays absent. No event type is inferred from titles or photos.

The reviewer also proposed a cutoff-tail loss. Source inspection and the two-pass boundary assertion reject that finding: preservation receives the current run time and summarizes the whole expiring Chicago day, including raw rows that have not reached the rolling cutoff. Later pruning preserves the frozen total. The corrected rehearsal, contract tests, application check, and production build passed.

The parent site's privacy disclosure was committed as `d264e7d30cede17689faab5127c3bf4b8d20c8d2`, deployed through its documented Worker fallback, and verified at `https://ninochavez.co/privacy`. It now names pseudonymous identifiers and durable daily totals without visitor identifiers.

The live post-migration count comparison found a multiplicity defect in the suspected-automation join: the same fingerprint appeared once for each flagged day. A new regression failed with 1,002 raw events versus 2,004 joined events. Follow-up migration `20260929024500` makes that relation distinct by fingerprint. Both migrations and the expanded rehearsal passed, and retained summaries were rebuilt after the correction. The applied migration remains intact; the correction is a separate migration.

The signed-test marker also uses the configured public origin behind the apex router. Its regression accepts the canonical origin and rejects a different origin. The collection and report suite now has 23 passing tests. The seven browser journeys passed after the catalogue fix. The dedicated 1Password secret write is pending operator authorization after a timeout; operator-account exclusion works independently.
