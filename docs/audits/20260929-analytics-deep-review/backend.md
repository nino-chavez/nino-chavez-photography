# Verdict

Do not call the full analytics feature release-ready yet. The first-party ledger and privacy model are thoughtfully separated, but five P1 issues remain: the new report host breaks the normal operator magic-link session, public collectors are abuseable, report ranges are unbounded, public pages amplify provider queries, and the delivery scheduler is committed disabled.

No P0 confidentiality breach was found. I found no source path that exposes visitor identifiers or unlisted albums in anonymous report responses.

## Canonical host and operator access

### AUTH-01 — P1 — The report-host move breaks the normal magic-link operator session

- **Evidence:** source-confirmed; live not verified.
- **Paths:**  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/report-paths.ts:2-14`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/supabase/server-ssr.ts:19-27`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/login/+page.server.ts:28-30,68-80`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/auth/callback/+server.ts:6-22`
- **Mechanism:** reports now live on `analytics.ninochavez.co`, but Supabase’s default session cookie has no `Domain`, so it is host-only. Magic links are hard-coded to callback on `ninochavez.co`; that callback sets an apex-host cookie and redirects through the old report route, which then redirects to the analytics subdomain without the cookie.
- **User job / blast radius:** the operator can view public aggregates but cannot reach saved reports, private notes, corrections, or delivery health through the normal magic-link flow. Manual password login directly on the analytics hostname may work, but the UI does not establish that route.
- **Scope:** pending integration bug: the report-host move is pending while auth behavior is committed.
- **Reproduction/falsifier:** request a magic link from the analytics-host login and inspect the callback hostname and resulting cookie domain. This finding is falsified if an external layer deliberately rewrites the session cookie to a parent domain or the live callback already targets the analytics hostname.
- **Remedy:** add a configured, allowlisted analytics-host callback and a safe post-login destination such as `/gallery`. Avoid broad parent-domain auth cookies unless every subdomain is intentionally inside the credential boundary.
- **Confidence:** high. Overlaps frontend integration review.

## Collection and classification

### COL-01 — P1 — Public collectors have no enforceable abuse budget

- **Evidence:** source-confirmed; live edge controls not verified.
- **Paths:**  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/api/engagement/+server.ts:18-28,67-78`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/api/analytics/diagnostics/+server.ts:10-31`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/api/analytics/events/+server.ts:13-27,46-59`
- **Mechanism:** legacy engagement and diagnostics accept cross-origin public writes and parse the body before any byte bound. The pending v2 guard rejects only a present wrong `Origin`; an omitted `Origin` is accepted as audience traffic. Its 8 KiB check trusts `Content-Length`, which chunked or non-browser callers can omit. UUID idempotency stops replay of one UUID, not high-volume unique events.
- **User job / blast radius:** attackers can pollute views, downloads, favorites, shares, diagnostics, popular/rising decisions, collection-health counters, and service-role database capacity.
- **Scope:** both. The exposed legacy writers are committed; the incomplete v2 guard is pending.
- **Reproduction/falsifier:** submit valid events with unique UUIDs and no `Origin`, or use a cross-origin `sendBeacon` against the legacy endpoint. Do not perform this against production. A configured Cloudflare rate-limit binding or WAF rule could reduce the blast radius, but none appears in this repository.
- **Remedy:** enforce the actual decoded-body byte length, apply one consistent browser-origin policy, and add edge/IP plus server-side rolling quotas with rejection telemetry. Treat `Origin` as a browser CSRF signal, not proof that an analytics event is genuine.
- **Confidence:** high. Overlaps the data report because poisoned rows become report inputs.

## Public report execution

### REP-01 — P1 — A public query can request an effectively unbounded date interval

- **Evidence:** source-confirmed and locally reproduced.
- **Paths:**  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/report-contract.ts:89-131,134-158`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.server.ts:77-137`
- **Mechanism:** valid custom dates are normalized but never span-limited. `datesInclusive` materializes every day, while the loader starts database aggregation, v2 projection, previews, and seven PostHog reports.
- **User job / blast radius:** one unauthenticated request can consume Pages memory/time, Supabase work, and provider query quota; repeated requests threaten public report availability.
- **Scope:** committed. Pending category-facet work does not remove it.
- **Reproduction/falsifier:** parsing `period=custom&start=2020-01-01&end=2026-09-28` locally produced a 2,463-day window. A platform-level request rule rejecting long spans would falsify the external exploit, but not the application defect.
- **Remedy:** enforce one centrally owned maximum for both primary and comparison windows before starting any data or provider work; reject excessive ranges rather than silently constructing them.
- **Confidence:** high.

### REP-02 — P1 — Anonymous refreshes fan out to provider work without application caching

- **Evidence:** source-confirmed; production credentials and quota impact live not verified.
- **Paths:**  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/routes/analytics/operator/+page.server.ts:77-82,130-137`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/posthog.types.ts:38-46`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/posthog-queries.server.ts:495-563`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/site-traffic.server.ts:119-148`
- **Mechanism:** `/gallery` is `private, no-store` and launches seven fixed PostHog queries for every request. Each query may poll twelve times. `/sites` caches successful results, but its Cloudflare GraphQL requests have no `AbortSignal`, so a cold miss can wait for the platform timeout.
- **User job / blast radius:** public report latency, Pages concurrency, PostHog query quota, and Cloudflare API availability. This becomes acute when the pending PostHog activation lands.
- **Scope:** committed execution paths plus pending provider activation.
- **Reproduction/falsifier:** count outbound calls for two identical anonymous `/gallery` loads; fourteen PostHog query starts are expected. An undocumented upstream cache could reduce provider computation but does not remove application fan-out.
- **Remedy:** separate the cacheable public aggregate from the authenticated private overlay. Cache normalized report snapshots with single-flight suppression and explicit total deadlines; apply timeouts to Cloudflare calls.
- **Confidence:** high.

### REP-03 — P2 — Pagination happens after the server loads every photo preview

- **Evidence:** source-confirmed; supplied performance evidence is candidate evidence, not independently rerun.
- **Paths:**  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/operator-report.server.ts:298-313`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/v2-report-projection.server.ts:196-219`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/docs/implementation/site-actions-20260929/PERFORMANCE.md:28-48`
- **Mechanism:** the report groups every matching photo and then runs sequential 100-ID preview queries before returning the first page. Separately, every v2 report downloads the complete classification history rather than classifications for the selected raw events.
- **User job / blast radius:** current 90-day reports are slow; the classification scan is a future-scale risk. Candidate evidence reports 3,097 photos, 31 sequential preview calls, and 14–25 second results.
- **Scope:** committed.
- **Reproduction/falsifier:** profile request count versus visible page size. The finding is falsified only if the report builder is bypassed in deployed code.
- **Remedy:** page the photo result at the database/report boundary and keep full expansion for CSV only. Restrict classification reads to selected raw event IDs or join them in one RPC.
- **Confidence:** high on mechanism, medium on live timings. Explicit overlap with data and frontend reports.

## Delivery lifecycle

### DEL-01 — P1 — Full-scope linked journeys deploy in a permanently disabled state

- **Evidence:** source-confirmed; candidate provider inventory says the Worker and schedule return 404, but live state was not verified here.
- **Paths:**  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/cloudflare-worker/analytics-relay/wrangler.toml:7-11`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/cloudflare-worker/analytics-relay/src/index.ts:5-18`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/.github/workflows/deploy-analytics-relay.yml:18-45`
- **Mechanism:** the deploy workflow publishes `ANALYTICS_RELAY_ENABLED=false`. There is no activation or secret-provisioning step, nor a post-deploy scheduled-delivery check.
- **User job / blast radius:** first-party actions continue recording, but eligible outbox rows never reach PostHog; linked journeys remain unavailable. This is a release blocker because full feature scope was requested.
- **Scope:** pending only.
- **Reproduction/falsifier:** deploy the checked-in configuration and invoke `runRelay`; it returns `disabled` without contacting the endpoint. External configuration overriding the variable would falsify the runtime part.
- **Remedy:** make activation a receipted transaction: deploy, provision the same scoped token on Worker and Pages, enable, run a synthetic eligible event through pending → submitted → confirmed, then inspect health and schedule logs.
- **Confidence:** high.

### DEL-02 — P2 — Batch, lease, and network deadlines are internally inconsistent

- **Evidence:** source-confirmed; future-scale/provider-latency risk.
- **Paths:**  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/posthog-delivery.server.ts:15-54`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/src/lib/analytics/posthog.server.ts:27-47`  
  `/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/site-action-analytics/cloudflare-worker/analytics-relay/src/index.ts:9-18`
- **Mechanism:** a default claim leases 50 events for 60 seconds, then delivers serially with a 5-second timeout per event. The theoretical batch bound is 250 seconds, while the relay request aborts at 90 seconds. Expired leases can be reclaimed while the first request is still sending.
- **User job / blast radius:** backlog recovery, delivery receipts, retries, and scheduler reliability. Provider UUIDs reduce downstream duplicate counts but do not prevent local state races.
- **Scope:** committed delivery code plus pending relay activation.
- **Reproduction/falsifier:** a delayed fake capture with two concurrent workers should demonstrate lease reuse; existing tests do not exercise elapsed lease time.
- **Remedy:** derive batch size, concurrency, lease duration, and claim cutoff from one total request budget, then test provider delay and concurrent reclaim.
- **Confidence:** high.

## Architecture recommendation

Keep first-party storage authoritative for counts. Treat PostHog as a consented journey projection, not a synchronous report dependency.

```text
browser -> bounded collector -> first-party ledger -> cached public snapshots -> /sites, /gallery
                                  |
                                  +-> eligible outbox -> deadline-sized relay -> PostHog
                                                             |
                                                             +-> cached journey snapshots

analytics-host session -> private notes, corrections, saved reports
```

This also removes the temptation to mix legacy and v2 counts. I found both collection generations emitting side by side, but the report currently presents them as separate evidence contracts; the mixed-download unit test also passed without summing them together.

## Relevant strengths

- Public aggregate builders fail closed on album-visibility errors and exclude unlisted albums.
- Private actions require an authenticated allowlisted operator, with owner predicates on saved reports and annotations.
- V2 events use strict property allowlists, authoritative album lookup, stable UUID idempotency, and separate submitted versus confirmed delivery states.
- Linked analytics is opt-in. Identity cookies are signed, host-only, secure, and HTTP-only; preference loading fails privacy-safe.
- Schedule authorization is separate from browser authentication and compared in constant time.
- Host matching is exact rather than suffix-based.
- Consent withdrawal deletes queued exports and rechecks eligibility after leasing. A narrow post-recheck/in-flight race remains, but the UI explicitly discloses that already-sending records may not be deleted.

## Verification performed

- Ran all local analytics, hook, and relay unit tests: **112 passed, 0 failed**.
- Locally reproduced the 2,463-day valid custom range.
- Inspected committed versus pending diffs with `git diff`, `git show`, and `git status`.
- Traced seven lifecycles: canonical routing, operator authentication, legacy collection, v2 collection/consent, report aggregation, PostHog query, and scheduled delivery/reconciliation.
- Did not run builds that write generated artifacts, provider calls, production requests, database rehearsals, browsers, Docker, or deployment commands.

## Unverified questions

- Whether external Cloudflare rate limits protect the collection endpoints.
- Whether the analytics hostname has an undocumented auth callback or cookie-domain override.
- Whether the relay, schedule token, and PostHog bindings are now active beyond the supplied candidate inventory.
- Whether all reviewed migration grants and RPC versions are applied in production.
- Current production latency and concurrent-load capacity; supplied measurements were not rerun.
- Parent should confirm the in-flight consent-withdrawal semantics against the published privacy policy.

## Files examined

Primary review covered `src/hooks.ts`, `src/hooks.server.ts`, report paths and loaders, analytics collection/preferences/internal APIs, report and v2 projection builders, PostHog query/outbox/delivery modules, site traffic/actions/journeys, admin authorization, relevant Supabase migrations and rehearsals, relay Worker/config/workflow, `wrangler.toml`, `DEPLOY.md`, performance/provider evidence, the shared browser tracker, and the profile app’s `SiteActivity.tsx` boundary.

The earlier memory note about unresolved pagination and subdomain behavior was treated only as a hypothesis; both were re-derived from current source.

## Cleanup

No files were changed. No persistent process, port, browser, database, or Docker resource was started, so no cleanup was required.

