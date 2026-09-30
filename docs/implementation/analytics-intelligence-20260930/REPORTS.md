# Analytics intelligence reports

The dashboard is the primary delivery surface. Daily and weekly briefs use the
same immutable report snapshots. External delivery remains off until the owner
both verifies a destination and enables that channel.

## What runs

The intelligence Worker wakes the protected jobs endpoint every minute.
It starts disabled; activation follows the migrations and a successful protected endpoint check. Standard snapshot refresh remains every fifteen minutes. The endpoint accepts
only the existing scheduler token, never a browser session.

The scheduler uses America/Chicago. At 08:00 it creates that local day's daily brief. Weekly briefs keep a Monday period key and use seven-day scopes. Gallery windows end the day before the intended morning; site sources retain their actual complete UTC windows. Late site catch-up uses the available rolling source at calculation time, not an invented historical reconstruction. Each brief preserves its actual source dates and cutoff.

Interactive requests expire after ten minutes and claim first. Each claim leases at most four jobs. Current due briefs claim next, routine refresh follows, and older catch-up follows that. A wake adds at most four missing periods per schedule from the fixed standard scopes, never custom snapshot scopes. One-off refresh does not create scheduled briefs. Dashboard briefs persist even when quiet. Outbound briefs are suppressed if no finding is newly actionable or their intended period is obsolete.

The engine contract owns the standard refresh scopes:

- Gallery: 30 and 90 completed Chicago days.
- Site: every `all`, `profile`, `writing`, `demos`, `photography`, and `other`
  section for 7, 30, and 90 completed UTC days.

Gallery provider reads first resolve the current public catalogue through
`analytics_read_scheduled_gallery_report(... p_public_only = true)`. The
result is capped at 500 album keys. If the scope is larger, it fails explicitly;
it never drops albums. Unlisted albums never reach the provider. Site reads use
their own UTC windows. The provider cache lasts 12 minutes, each gallery scope
runs at most three fixed queries at once, the endpoint processes at most two
jobs at once, claims at most four jobs, and provider reads have a seven-second
deadline. A pending provider result writes the truthful partial/unavailable
snapshot and schedules a retry; it is not changed to zero.

## Required storage contract

The forward migrations provide the RPCs below. Local functional SQL and API
rehearsals are recorded in `evidence/sql-local-proof.json` and
`evidence/api-local-proof.json`. Production application requires a separate
deployment receipt.

| RPC | Exact input | Required behavior |
| --- | --- | --- |
| `analytics_prepare_intelligence_periods` | `p_daily_period date`, `p_weekly_period date`, `p_standard_scopes jsonb`, `p_refresh_cadence_seconds integer`, `p_provider_pending_retry_seconds integer`, `p_max_catchup_periods integer`, `p_now timestamptz` | Insert only due, non-future daily/weekly candidates from the fixed standard scopes. Gallery jobs use the intended completed Chicago window; site source windows stay explicitly UTC. Catch up at most four missing periods per schedule per wake; never copy custom snapshot windows. |
| `analytics_claim_intelligence_jobs` | `p_limit integer`, `p_lease_seconds integer`, `p_now timestamptz` | Atomically lease at most four jobs. Return strict camel-case rows: `id`, `kind`, `scope`, `ownerId`, `intendedPeriod`, `late`, `requestId`, `operation`. A request row includes only `album_comparison` or `site_retention`, its owner, and its request id. |
| `analytics_finish_intelligence_job` | `p_job_id uuid`, `p_status text`, `p_report_id uuid null`, `p_error_code text null` | Store the immutable snapshot reference, never `generated_at`. `provider_query_pending` gets the configured backoff. A final brief waits for every scoped job, or records terminal unavailable scopes and their limits rather than hanging. |
| `analytics_record_intelligence_lifecycle` | `p_report_id uuid`, `p_now timestamptz` | Read exactly that snapshot. Keep one incident per cause and a recovery on that same incident; it does not send. |
| `analytics_claim_intelligence_deliveries` | `p_limit integer`, `p_lease_seconds integer` | Return delivery rows with `destination` (`channel`, `address`, `verifiedAt`) as well as verification/preference/sender/idempotency metadata. A daily or weekly owner brief aggregates eligible same-snapshot references, source windows/timezones, and suppressions. |
| `analytics_finish_intelligence_delivery` | `p_delivery_id uuid`, `p_status text`, `p_error_code text null`, `p_provider_message_id text null` | `accepted` means provider acceptance, not inbox delivery. |
| `analytics_list_ambiguous_intelligence_deliveries` | `p_limit integer` | Return only rows requiring reconciliation; ambiguous rows never return to normal claim. |
| `analytics_reconcile_intelligence_delivery` | `p_delivery_id uuid`, `p_state text`, `p_provider_message_id text null` | `missing` alone may reopen the original idempotency key. `unavailable` leaves the row unresolved. |

Request completion uses the existing engine table, after a fresh report refresh:
update the still-pending row matching request id, owner id, scope key, and
operation to `status = 'complete'` with the calculated answer. The answer does
not retain free-text question content. If the engine migration gives the table a
different update contract, it must add an equivalent owned RPC before release;
the jobs layer must not mark a pending request complete without a stored result.

## Delivery activation contract

The dashboard works with no external provider. When the owner activates the
owned sender, the endpoint requires all three configuration values:
`ANALYTICS_INTELLIGENCE_DELIVERY_ENABLED=true`,
`ANALYTICS_INTELLIGENCE_EMAIL_FROM`, and
`ANALYTICS_INTELLIGENCE_DELIVERY_TOKEN`. This code creates no credential,
recipient, billing setting, or actual send.

Owner email controls use the freshly confirmed account address. The browser cannot choose a recipient. Turning email off suppresses queued emails at claim time; a message already submitted cannot be recalled.

The endpoint receives the durable verified destination and stable idempotency
key from storage. It does not guess an email address. A provider throw or
uncertain response becomes `ambiguous`; it is never blindly resent. A failed
reconciliation remains unresolved. Native PostHog delivery remains a distinct
single sender and is suppressed here to prevent a duplicate notification.

Operational failures group by stable cause and eligible flow filters rather than moving date windows. Acknowledge pauses an incident for 30 days; snooze pauses it for 7 days. Undo reopens the incident. Neither acknowledgement nor missing provider evidence claims a repair. Recovery requires complete compatible evidence and a window at least as recent as the last failure. Exhausted crashed jobs finalize their period as unavailable instead of leaving a brief waiting forever.
