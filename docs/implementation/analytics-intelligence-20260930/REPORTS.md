# Analytics intelligence reports

The dashboard is the primary delivery surface. Daily and weekly briefs use the
same stored findings. External delivery stays off until an owner verifies a
destination and enables that channel.

## What runs

The intelligence Worker calls the protected jobs endpoint every five minutes.
The Worker is disabled by default. The endpoint works with the existing scoped
analytics relay secret; it does not accept a browser session or public request.

At or after 08:00 America/Chicago, the job records one intended daily period
for that local date. On Monday it also records one weekly period. The database
deduplicates by report kind, owner, and intended local period, so retries,
overlapping invocations, late execution, and DST changes cannot create another
brief. A late run keeps its intended period and is marked late; it does not
silently become a report for a different day.

Gallery evidence uses Chicago complete days. Site evidence uses UTC complete
days. A brief must show those source windows separately. A current operational
window is partial and is never compared with a complete period as though they
were alike. Missing or partial coverage remains a gap, not a zero.

## Storage RPC contract for the engine migration

This worker deliberately contains no migration. The engine migration must add
these RPCs. Each claim is atomic, has a lease, and returns only non-identifying
aggregate scope or delivery metadata.

| RPC | Input | Result / rule |
| --- | --- | --- |
| `analytics_claim_intelligence_jobs` | `p_limit`, `p_lease_seconds`, `p_now` | Lease pending scheduled, refresh, and on-demand work. A scheduled run is unique on `(owner_id, kind, intended_period)`. |
| `analytics_finish_intelligence_job` | `p_job_id`, `p_status`, `p_error_code`, `p_report_generated_at` | Finish or retry a job. Error codes are stable categories, never provider text. |
| `analytics_prepare_intelligence_periods` | `p_daily_period`, `p_weekly_period`, `p_standard_scopes`, `p_now` | Insert due daily/weekly work once, queue all fixed gallery/site refresh scopes, calculate late state, and queue in-dashboard briefs. |
| `analytics_record_intelligence_lifecycle` | `p_report_generated_at`, `p_now` | Upsert finding lifecycle from stored evidence: one incident per cause, acknowledgement cooldown, recovery, and due follow-up reminders. It must not send. |
| `analytics_claim_intelligence_deliveries` | `p_limit`, `p_lease_seconds` | Lease dashboard or external delivery records. An external row includes `destination_verified`, `preference_enabled`, `sender`, and a stable idempotency key. |
| `analytics_finish_intelligence_delivery` | `p_delivery_id`, `p_status`, `p_error_code`, `p_provider_message_id` | Persist accepted, suppressed, failed, or ambiguous state. Accepted is not inbox delivery. |
| `analytics_list_ambiguous_intelligence_deliveries` | `p_limit` | Return only external rows requiring provider reconciliation. They are never eligible for resend until reconciliation says missing. |
| `analytics_reconcile_intelligence_delivery` | `p_delivery_id`, `p_state`, `p_provider_message_id` | Resolve an ambiguous submission as accepted, missing, or unavailable. Only `missing` may requeue the original idempotency key. |

`refreshIntelligence(client, scope, { ownerId, now, journeys })` writes immutable
evidence/versioned findings. `loadIntelligence` reads those results. The jobs
layer passes only fixed PostHog report names and aggregate results as
`journeys`; it never gives the engine raw events or an arbitrary query string.

## Delivery rules

```text
stored finding -> in-dashboard brief -> optional delivery record
                         |                 |
                         |                 +-- verified destination + preference + one sender
                         |
                         +-- dashboard works even when external delivery is muted
```

If PostHog owns a compatible notification, its delivery row has
`sender = posthog_native`; this code records the state and does not send a
second message. An owned sender may submit only after both destination and
preference checks pass. A timeout after submission is `ambiguous`, then a
provider reconciliation task; it is not retried as a new send.

No production activation, recipient, token, billing setting, or external send
is part of this code. Synthetic tests use plainly synthetic records only.
