# Analytics intelligence engine

The dashboard reads saved, aggregate evidence. It never waits for PostHog or
another provider. A scheduled job reads only fixed queries, validates their
bounded result shape, and writes a new immutable evidence version.

```text
fixed gallery/site reports + fixed journeys
  -> immutable snapshot
  -> current pointer
  -> visibility-checked public projection
  -> owner-only actions, requests, briefs
```

`refreshIntelligence(client, scope, { now, journeys })` accepts a normalized
gallery or site scope. Gallery reports use complete Chicago calendar days. Site
reports use complete UTC days. The engine keeps the two windows separate and
does not add page views, clicks, progress events, and demo events into one
number. Every finding names its unit, current and previous coverage, cutoff,
and eligible cohort.

## What each rule can use

The rule set covers momentum, photo response, discovery, download reliability,
search, profile response, writing/demo progression, distribution, collection
health, and action follow-up. A fixed journey is used only for its matching
rule. Missing, partial, or too-small evidence produces a suppression. It does
not become zero, an outage, an audience claim, a quality rating, or causality.

Photo response uses its eligible exposure denominator. The fixed query returns linked exposure and response counts for each public photo. Album discovery has its own eligible exposure count. These are observed responses, not proof of artistic quality or causality. Public projection rechecks each photo before returning its visual link.

## Storage and privacy

`analytics_intelligence_snapshots` is append-only. The current result is a
pointer in `analytics_intelligence_snapshot_current`; no scope-key upsert can
destroy prior evidence. Public reads recheck selected albums, photo targets,
suppression targets, scope filters, titles' target context, and evidence links
against current public visibility. A hidden or missing selected target makes
the projection unavailable rather than returning stale metadata.

The migration provides these service-only RPCs:

- `analytics_claim_intelligence_jobs`
- `analytics_finish_intelligence_job`
- `analytics_prepare_intelligence_periods`
- `analytics_record_intelligence_lifecycle`
- `analytics_claim_intelligence_deliveries`
- `analytics_finish_intelligence_delivery`
- `analytics_list_ambiguous_intelligence_deliveries`
- `analytics_reconcile_intelligence_delivery`

Each claim is an atomic lease. Retry backoff is bounded. A job completes only
against the immutable `snapshot_id` for the matching normalized scope. Late
daily and weekly periods keep their intended Chicago date. Dashboard briefs do
not need an external sender. External rows require a verified destination,
enabled preference, one sender, and idempotency; an ambiguous submission is
reconciled before any resend.

Private actions and requests are owner-bound by RLS and server checks. A
request stores only scope, operation, status, expiry, and report reference —
never question text. Dismiss, snooze, and undo change the private lifecycle.
A recorded action computes its follow-up date from its actual time. A follow-up
finding requires the declared measure, matching complete before/after windows,
and no overlapping recorded change.

## Boundary checks

The assistant accepts only deterministic, supported operations. The contextual
preset questions and ordinary equivalent wording map to a fixed operation;
arbitrary SQL, raw data, new provider queries, and free text from public callers
are rejected. The analytics host is the production same-origin authority;
local development uses the request origin. Bodies, unknown fields, dates,
filters, ranges, finding references, timestamps, and action ownership are all
validated at the route boundary.

The final forward migrations have passed isolated SQL and actual local API rehearsals. See the evidence receipts for the tested boundaries. Hosted migration and deployment require their own release receipt. External delivery remains disabled.
