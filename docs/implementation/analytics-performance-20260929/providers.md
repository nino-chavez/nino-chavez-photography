Implemented the provider performance fixes and left all changes uncommitted.

The public analytics path now has bounded, credential-scoped caching and single-flight deduplication. Provider failures remain unavailable rather than becoming zeroes.

Changed files:

- [provider-cache.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/provider-cache.server.ts)
- [provider-cache.server.test.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/provider-cache.server.test.ts)
- [posthog-queries.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/posthog-queries.server.ts)
- [posthog.types.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/posthog.types.ts)
- [posthog.test.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/posthog.test.ts)
- [site-traffic.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/site-traffic.server.ts)
- [site-traffic.server.test.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/site-traffic.server.test.ts)
- [site-journeys.server.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/site-journeys.server.ts)
- [site-journeys.test.ts](/Users/nino/Workspace/dev/sites/nino/nino-chavez-photography/.worktrees/codex/analytics-performance-providers/src/lib/analytics/site-journeys.test.ts)

Caching and deadline contract:

- PostHog gallery and site-journey snapshots use a 60-second TTL.
- Cloudflare retains its 10-minute successful reach cache.
- Keys include provider origin, project/account, SHA-256 credential identity, exact fixed query arguments, and gallery visibility scope.
- Public album lists are not cached. Differing visibility lists cannot share results.
- Cache limits are explicit: gallery `128/16/2 MiB`, site journeys `32/8/512 KiB`, and Cloudflare `32/4/4 MiB` for entries/in-flight/bytes.
- Failed, invalid, oversized, and partial Cloudflare comparison results are not cached.
- PostHog now has one 10-second total budget across the initial request, polling, and sleeps. Unfinished requests are aborted and reported as `provider_query_pending`.
- Cloudflare current and comparison requests run concurrently with five-second abort signals.
- Existing fake transports bypass shared caching unless a test explicitly injects a fresh cache.

Verification:

- Focused command: `node --import tsx --test` over the four affected suites.
- Result: 37/37 tests passed.
- Two identical PostHog loads produced one provider call.
- Two identical Cloudflare loads produced two calls total—current and comparison—instead of four.
- Project, account, credential, filter, visibility, TTL, capacity, retry, and abort separation passed.
- `tsc --noEmit` passed.
- Repository-wide Svelte checking was blocked because Vite tried writing into the policy-read-only shared `node_modules/.vite-temp`.

No live providers, browser, database, server, secrets, deployment, benchmark, or build were exercised. Parent integration needs no required call-site changes; all new configuration parameters are optional.

