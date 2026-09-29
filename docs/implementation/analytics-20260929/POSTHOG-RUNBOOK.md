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
| `POSTHOG_PROJECT_API_KEY` | project capture key | relay delivery |
| `POSTHOG_HOST` | chosen PostHog regional HTTPS origin | delivery and query |
| `POSTHOG_QUERY_API_KEY` | read-only query credential | reconciliation and journey panels |
| `POSTHOG_PROJECT_ID` | numeric project ID | reconciliation and setup script |
| `ANALYTICS_POSTHOG_SCHEDULE_TOKEN` | scoped token for the internal scheduled relay | any endpoint invocation |
| `POSTHOG_PERSONAL_API_KEY` | setup-script credential only; do not bind to Pages | dashboard setup |

Keep capture, query, schedule, and setup credentials separate. Before binding any of them, inspect existing 1Password item names and field labels. Do not create a new organization, project, billing plan, or credential by assumption.

The proposed account shape is pay-as-you-go only if the existing organization already has the required project slots: one isolated test project and one production project, with analytics-event and feature-flag billing limits set to $0. The researched September 29 provider terms described one project and one year of event history on the free plan, versus six projects and seven years on pay-as-you-go. Those are planning inputs, not evidence of the active account. Recheck the actual provider plan and usage alert controls before activation. Never silently sample journey events when a cap is reached.

## Setup sequence

1. Inspect the existing PostHog organization, project slots, region, and billing state with authorized provider access. Record the actual organization ID, production project ID, test project ID, region, SDK version, and existing dashboards in the release receipt.
2. Confirm that separate test and production projects are available. Do not put synthetic events in production. If the account tier cannot support this, stop before hosted activation.
3. Choose the retention language that matches the verified tier. PostHog's provider retention is separate from the gallery's 90-day raw-event schedule. The provider retention window is not an automatic deletion control.
4. Publish the policy change from the site-wide privacy-policy owner, including the real region, consent choice, 90-day browser-ID rotation, withdrawal behavior, provider retention, and deletion-request path. Do not say that PostHog automatically deletes data after 90 days.
5. Apply the collection migration and deploy the collection worker first. Confirm the RPCs and outbox exist. This runbook does not apply a migration.
6. Add the runtime bindings and schedule a `POST` to `/api/internal/analytics-posthog` with `x-analytics-posthog-schedule-token`. A scheduler must store the token as a secret and run at a bounded cadence. There is no anonymous cron fallback.
7. Run the setup script without `--apply` and review its exact dashboard/insight list. It makes no network call in that mode. Apply only against the explicitly named project after the gates above. The script reuses matching names; it does not provision projects, billing, or experiments.
8. In the test project, run the acceptance journeys and inspect the actual outbound payload before enabling production export. Confirm a duplicate UUID appears once after reconciliation, an outage leaves a retryable failed row, and a provider acknowledgement alone does not mark confirmation.
9. Configure a $0 analytics-event and feature-flag billing limit only after Nino explicitly approves the provider configuration. Quota exhaustion is a coverage gap: it must disable experiments safely and make journey data unavailable, not silently sample or fabricate zeros.

## Dashboard setup

The source-owned setup script is [setup-photography-posthog.mjs](../../../scripts/setup-photography-posthog.mjs). Its dry run is safe to inspect. Its apply mode requires all of the following: a numeric `--project`, an exact match to `POSTHOG_PROJECT_ID`, an HTTPS host, a setup API key, and `POSTHOG_SETUP_CONFIRM=photography-posthog-setup`.

It creates or reuses two private dashboards and seven fixed aggregate insights: discovery, album use, search usefulness, download reliability, photograph response, sources/return, and experiment exposure/guardrails. They do not activate experiments. They use only version-2 eligible-audience events from the last 30 days; an empty result means no matching provider events in that window, not that historical collection was zero. Change their definitions only alongside the reviewed named query definitions in `src/lib/analytics/posthog-queries.server.ts`.

## Reconciliation and failure handling

- `pending` and due `failed` records are leased by the scheduled relay.
- An SDK acknowledgement changes a row to `submitted`.
- The read-only query credential searches the submitted UUIDs. Only returned UUIDs become `confirmed`.
- The delivery-health RPC exposes bounded counts and oldest pending/submitted age. It must not return an event ID, browser ID, error body, or provider credential.
- The scheduler response never exposes provider/database error text. A 503 means delivery is unavailable, not zero delivery.
- Keep retries bounded in the collection RPC. Preserve the original UUID and occurrence time. Do not re-evaluate an experiment while replaying an event.
- Stop eligible replay when the local raw-event retention expires, an event becomes ineligible, or a classification/consent change suppresses export.

## Report rules

Fixed named queries are the only provider query surface. Public callers can select a supported report and validated filters through the parent integration; they cannot send HogQL/SQL. Each query applies the version-2, audience, Chicago-date, visit, album-visibility, source, and optional event-snapshot metadata filters before aggregation.

Rates always return their numerator and denominator. An album visit is not added across album reports. Search selection is a recorded selection, not proof that a visitor found a photo. Download handoff is not a completed disk save. “Returning” means a measured browser within the browser-ID coverage period, not a person.

The provider has no catalogue join in these queries. Sport and category filters use only version-2 event snapshots. Historical data without those snapshots is unavailable for that filter; it is not backfilled or guessed.

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

This code has only passed injected-transport unit tests. It has not contacted PostHog, written a provider configuration, scheduled a job, inspected billing, or proven hosted delivery.
