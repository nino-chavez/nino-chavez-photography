# PostHog Cloud runbook

This integration is disabled until its runtime bindings, retention decision, privacy notice, and hosted checks are complete. The gallery accepts its own event first. PostHog receipt means **submitted**. A fixed provider query must find the same event ID before it becomes **confirmed**.

## What this code does

```text
accepted first-party event
  -> eligible audience outbox row
  -> scheduled PostHog relay
       submitted after SDK acknowledgement
       confirmed only after UUID reconciliation query
```

The relay sends version-2 events only. It uses a random browser ID as PostHog's `distinct_id`, a random visit ID as `$session_id`, and `$process_person_profile: false`. It does not call `identify`. It never sends raw IP, user agent, legacy fingerprint, full URL, search text, contact values, captions, or notes. Operator, test, crawler, suspected-automation, opted-out, and unlinked events are excluded before the provider call.

The gallery stays usable if PostHog is unavailable. Journey panels must show unavailable values, not zero.

## Required runtime bindings

Set these as server-only Cloudflare Pages bindings. Never use a `VITE_` name.

| Binding | Job | Required for |
| --- | --- | --- |
| `POSTHOG_ENABLED` | exact `true` enables the adapter | delivery and provider reads |
| `POSTHOG_TARGET_ENVIRONMENT` | exact `production` names the only export target | delivery and provider reads |
| `POSTHOG_PROJECT_API_KEY` | project capture key | relay delivery |
| `POSTHOG_HOST` | chosen PostHog regional HTTPS origin | delivery and query |
| `POSTHOG_QUERY_API_KEY` | read-only query credential | reconciliation and journey panels |
| `POSTHOG_PROJECT_ID` | numeric project ID | reconciliation and setup script |
| `ANALYTICS_POSTHOG_SCHEDULE_TOKEN` | scoped token for the internal scheduled relay | any endpoint invocation |
| `POSTHOG_PERSONAL_API_KEY` | setup-script credential only; do not bind to Pages | dashboard setup |

Keep capture, query, schedule, and setup credentials separate. Before binding any of them, inspect existing 1Password item names and field labels. Do not create a new organization, project, billing plan, or credential by assumption.

Do not set either enablement binding in local or preview environments. A key and host alone cannot enable capture or provider reads.

## Disabled-by-default album-card experiment plumbing

This repository contains no active experiment. It can evaluate one server-side album-card presentation only after all of these private production bindings are set exactly: `POSTHOG_ENABLED=true`, `POSTHOG_TARGET_ENVIRONMENT=production`, `PHOTOGRAPHY_EXPERIMENTS_ENABLED=true`, `PHOTOGRAPHY_EXPERIMENT_QUOTA_OK=true`, a bounded `PHOTOGRAPHY_EXPERIMENT_KEY`, and `PHOTOGRAPHY_EXPERIMENT_VARIANTS=control,album_card_cta`. The quota acknowledgement is a release check, not a billing change.

The browser receives only the assigned key, allowed variant, and release. The server evaluates with the signed consented browser binding only for audience traffic; operator, test, self-excluded, unconsented, unbound, invalid, unavailable, and quota-failed requests use the unchanged control card. A provider evaluation alone is not an exposure. The existing card visibility observer records one exposure only after the first assigned card has genuinely become visible, and repeated SPA navigation is deduplicated for the same key, variant, release, and surface.

Before any activation, Nino must choose the provider key, write the hypothesis, primary outcome, guardrails, sample-size plan, stopping rule, and a current quota receipt. This plumbing does not create a provider flag, activate an experiment, change billing, configure runtime bindings, or establish hosted rendering or delivery.

## Reported provider state

The integrating parent verified the following through the provider API on September 29. Safe project metadata is saved in provider-projects.json.

- Production project: `635866`
- Test project: `635867`
- Region: US
- Account billing page: free
- Autocapture: off
- Session replay: off

These are provider observations; recheck them at activation. Do not describe the account as pay-as-you-go or promise seven years of history. Record the retention shown by the active account before publishing retention language. Keep autocapture and session replay off.

## Setup sequence

1. Inspect the existing PostHog organization, projects `635866` and `635867`, US region, and free billing state with authorized provider access. Record the organization ID, project IDs, region, SDK version, retention shown by the account, quota behavior, and existing dashboards in the release receipt.
2. Confirm that project `635867` remains isolated for synthetic tests and `635866` remains production-only. Do not put synthetic events in production.
3. Choose the retention language that matches the verified tier. PostHog's provider retention is separate from the gallery's 90-day raw-event schedule. The provider retention window is not an automatic deletion control.
4. Publish the policy change from the site-wide privacy-policy owner, including the real region, consent choice, 90-day browser-ID rotation, withdrawal behavior, provider retention, and deletion-request path. Do not say that PostHog automatically deletes data after 90 days.
5. Apply the collection migration and deploy the collection worker first. Confirm the RPCs and outbox exist. This runbook does not apply a migration.
6. Add the runtime bindings and schedule a `POST` to `/api/internal/analytics-posthog` with `x-analytics-posthog-schedule-token`. Set `POSTHOG_ENABLED=true` and `POSTHOG_TARGET_ENVIRONMENT=production` only on the production deployment. A scheduler must store the token as a secret and run at a bounded cadence. There is no anonymous cron fallback.
7. Supply every currently visible album key to the setup script and run it without `--apply`. Review the exact dashboard/insight list and visible-album count. Dry-run mode makes no network call. Apply only against the explicitly named test or production project after the gates above. The script reuses dashboards and updates matching insight definitions; it does not provision projects, billing, or experiments.
8. In the test project, run the acceptance journeys and inspect the actual outbound payload before enabling production export. Confirm a duplicate UUID appears once after reconciliation, an outage leaves a retryable failed row, and a provider acknowledgement alone does not mark confirmation.
9. Keep the reported free billing state unless Nino separately authorizes a billing change. Quota exhaustion or dropped events are coverage gaps: they must disable experiments safely and remain unconfirmed in delivery health, not silently sample or fabricate zeros.

## Dashboard setup

The source-owned setup script is [setup-photography-posthog.mjs](../../../scripts/setup-photography-posthog.mjs). Run it through `node --import tsx`. Its dry run is safe to inspect. Its apply mode requires all of the following: a numeric `--project`, an exact match to `POSTHOG_PROJECT_ID`, at least one `--album-key` for the current public catalogue, an HTTPS host, a setup API key, and `POSTHOG_SETUP_CONFIRM=photography-posthog-setup`.

It creates or reuses two private dashboards and creates or updates seven fixed aggregate insights: discovery, album use, search usefulness, download reliability, photograph response, measured return, and experiment exposure/guardrails. The setup script imports the same query builder as the server. Each rolling query applies current visible-album keys before aggregation. Re-run setup after an album becomes listed or unlisted. The queries do not activate experiments. They use only version-2 eligible-audience events; an empty result means no matching provider events in that window, not that historical collection was zero.

## Reconciliation and failure handling

- `pending` and due `failed` records are leased by the scheduled relay.
- Before capture, `analytics_recheck_posthog_event_eligibility` must atomically reload current consent/classification and suppress a withdrawn or reclassified row. A stored payload is not current eligibility proof.
- An SDK acknowledgement changes a row to `submitted`.
- `analytics_list_submitted_posthog_event_ids` must return bounded submitted rows from earlier runs as well as the current batch. The read-only query credential searches those UUIDs. Only returned UUIDs become `confirmed`; missing IDs stay submitted and visible as a quota, drop, or ingestion gap.
- The delivery-health RPC exposes bounded counts and oldest pending/submitted age. It must not return an event ID, browser ID, error body, or provider credential.
- The scheduler response never exposes provider/database error text. A 503 means delivery is unavailable, not zero delivery.
- Keep retries bounded in the collection RPC. Preserve the original UUID and occurrence time. Do not re-evaluate an experiment while replaying an event.
- Stop eligible replay when the local raw-event retention expires, an event becomes ineligible, or a classification/consent change suppresses export.

## Report rules

Fixed named queries are the only provider query surface. Public callers can select a supported report and validated filters through the parent integration; they cannot send HogQL/SQL. Each query applies version, audience, Chicago date, linked visit, and current album visibility before aggregation.

Search result-display events have no album target. Album/content filters therefore select visits that touched matching visible content, then describe their measured journeys. They do not turn a gallery-wide search into an album-specific search. Search selections count one exact visit/search ID after its matching result set; repeat clicks do not increase the numerator, and selections from non-visible albums do not enter it. Zero-result counts use the same exact search IDs as their denominator.

Download requests are keyed by visit and request ID. Mixed-album requests without an album key enter the visible cohort only through visible item events. Requested and prepared item totals come from their item events and inherit mode from the matching request. Cancellation is terminal; only requests with no handoff, failure, or cancellation are unknown.

The return report separates browsers observed before the selected window from browsers with repeated visits inside it. Its prior scan is capped at 90 days. Both measures are bounded by browser-ID retention, storage clearing, and device changes; neither describes a person or proves history before that coverage.

The collector snapshots album sport, event date, photo category and tagged source. Source/content filters select matching visits within the visible catalogue. Journey totals include visible steps within those visits; the first-party album/photo reports retain their action-level filters. The UI explains this distinction.

The provider has no catalogue join in these queries. Historical catalogue facts are not backfilled or guessed.

## External activation gates

Do not call this integration live until all are evidenced:

- project, region, access, tier, quota, and billing decision verified;
- separate production/test projects verified;
- privacy policy and analytics preference published by the owning system;
- collection migration, outbox RPCs, consent/exclusion, and retention policy applied and reviewed;
- outbound payload inspected with deliberately sensitive test values;
- eligible, operator, test, crawler, opted-out, unlinked, duplicate, provider-failure, and worker-interruption cases tested;
- PostHog UUID reconciliation and first-party totals compared over one matching eligible test cohort;
- dashboard setup receipt retained; no live experiment activated;
- hosted desktop and phone review completed with real eligible data.

The parent has run all seven fixed queries against synthetic events in the dedicated test project, including a duplicate UUID and filtered cohorts. See evidence/posthog-test.json. The scheduler is implemented but disabled and undeployed. Production runtime delivery and account-scoped read credentials remain unverified.

## Remaining release validation

The integrating parent must retain receipts for these checks before delivery is called complete:

- Run all seven generated HogQL queries in test project `635867` and confirm PostHog accepts their functions, tuple keys, joins, and rolling date expressions.
- Replay the mixed-album download, repeated search click, zero-result search, cancellation, ordinary experiment outcome, and before-window return fixtures as real test-project events. Compare every returned column with the semantic fixture totals.
- Confirm a selection from a non-visible album changes no public aggregate, then list and unlist a test album and verify refreshed insight definitions remove or restore its contribution.
- Submit one event, leave another previously submitted, and confirm the next scheduler run queries both IDs. Force a missing provider ID and verify it remains submitted rather than confirmed or silently dropped.
- Withdraw analytics permission and reclassify one leased event before delivery. Confirm neither reaches PostHog and both leave an auditable suppressed state.
- Inspect production project `635866` read-only after authorized activation. Confirm US region, free billing, retention shown by the account, quotas, autocapture off, replay off, private dashboards, and no synthetic test events.
