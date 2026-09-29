# Analytics build coordination

Full release, 2026-09-29. Parent owns integration, provider setup, policy coordination, production verification and final acceptance. Workers may commit only their assigned branch. No push, deployment, live database mutation, live analytics injection or billing activation. Preserve all other work.

## Shared interfaces

Collection worker owns version-2 schema, emitters, consent/exclusion, local recording and database migration. PostHog worker owns provider adapter, delivery runner, fixed aggregate queries and dashboard setup script. UI worker owns analytics reports, report contracts and complete UI.

Canonical accepted envelope for provider adapter: event_id UUID; schema_version 2; event_name string from allowlist; occurred_at ISO timestamp; received_at ISO timestamp; anonymous_browser_id string|null; visit_id string|null; traffic_context; export_eligible boolean; properties JSON object. Properties contain validated album_key/photo_id when applicable. Raw search text, IP, UA and legacy hashes are never export properties. Export only eligible audience events.

Collection migration provides analytics_events_v2 and analytics_posthog_outbox. Outbox columns: event_id UUID primary key, payload JSONB canonical envelope, status pending|submitted|confirmed|failed, attempts integer, next_attempt_at timestamptz, locked_until timestamptz, last_error_code text, submitted_at timestamptz, confirmed_at timestamptz. Unique event ID makes collector retries idempotent.

Service-role-only RPCs:
- analytics_accept_event_v2(p_event jsonb): {accepted:boolean,duplicate:boolean,event_id:string,export_eligible:boolean}. Atomic insert of accepted record and eligible outbox record.
- analytics_claim_posthog_events(p_limit integer,p_lease_seconds integer): outbox rows {event_id,payload,attempts}; claims only pending/failed due rows under a lease.
- analytics_finish_posthog_delivery(p_event_id uuid,p_status text,p_error_code text): status submitted or failed; release lease, increment attempt/backoff for failure. No raw provider error strings.
- analytics_confirm_posthog_events(p_event_ids uuid[]): mark queried IDs confirmed.
- analytics_posthog_delivery_health(): bounded aggregate counts + oldest pending/submitted times. No identifiers in public response.

Provider module: src/lib/analytics/posthog.server.ts exports deliverPostHogBatch(client,options?) and queryGalleryJourneys(client,query,{publicOnly:boolean,allowedAlbumKeys:string[]}). Types may be structurally defined without importing unfinished collection code. It must remain disabled/unavailable without actual configuration. Provider SDK project key/server host from runtime private environment. Keep browser IDs and query credentials server-side.

UI uses existing OperatorReport plus additive measureTotals per report/album/photo (record of actual measure totals, null where unavailable). It may consume queryGalleryJourneys after integration; parent connects loader if unfinished imports would block independent compilation. Keep existing local report working with provider unavailable. Report endpoints stay public with current visibility filtering; operator mutations stay protected. Prefer one report data query for multi-measure summaries, not five independent full-history reads.

Collection provides src/lib/components/analytics/AnalyticsPreferences.svelte for visible opt-in/exclusion state (no auth required for preference). UI imports it when available; parent connects afterward if necessary. It grants no privileged access.

## Runtime isolation

Writers use separate managed worktrees. Unit tests only in first wave; no browser, database, Docker, listener, or live service access. Node dependencies are read-only shared from the integration checkout. Parent alone owns local Supabase 55491/55492 and browser inspection. Future UI rehearsal hostname analytics-review.localhost port 57210. Existing decision preview 127.0.0.1:57164 remains untouched.
