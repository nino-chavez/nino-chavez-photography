# Add PostHog without losing the photography workspace

Status: integration implemented; production relay activation remains a separate verified step. The scheduled reporting release was deployed as PR #170 with the clean-URL correction in #171. Nino selected **PostHog Cloud with updated privacy wording**. This document owns event delivery, provider/privacy controls and linked-query definitions. The [actionable-insights extension](ANALYTICS_PLAN.md#8-turn-the-data-into-decisions-and-follow-up) owns recommendations, the contextual assistant and bounded on-demand analysis, action history and daily/weekly reporting. Assistant requests use the same fixed-query, consent and visibility contracts; private questions are not provider analytics events. Earlier build-status notes are dated evidence, not proof of current production activation.

**Use PostHog to explain browsing and test site changes. Keep the gallery workspace for album comparison and photographic inspection.** Both should consume the same definitions of a recorded action. PostHog cannot repair a download falsely recorded as successful, identify every bot, or turn popularity into photographic quality.

Nino should usually stay on the gallery page: overview and album comparison together, selected album in a side panel, then a photo detail view. PostHog is the private place for deeper journey analysis and experiments. The public gallery report continues to require no sign-in.

## 1. Give each service a clear job

| Service | Responsibility | What it does not establish |
|---|---|---|
| Gallery collection and Supabase | Validate album/photo facts, exclude known internal traffic, accept events, preserve action totals, supply the photographic report | That every recorded action came from a human, or every real action was captured |
| PostHog Cloud | Linked visits, discovery and download funnels, exposure-adjusted response, source cohorts, controlled site experiments | A person's identity, completed browser saves, successful social posts, or artistic quality |
| Cloudflare Web Analytics | Independent traffic and page-performance context | An equivalent count of our daily-deduplicated album opens |
| Gallery analytics UI | Put measures beside real albums/images; compare, filter, inspect, shortlist, save and export | Permission to expose private event streams or credentials |

No GA4 installation is needed to deliver these jobs. Its presence or absence should be verified during provider reconciliation, not inferred from this plan. Start a dedicated photography production project in the existing PostHog organization if suitable access exists; use a separate test project. Do not mix other sites or test events into its default reports. Check available project slots first: the free plan currently allows one project, while pay-as-you-go allows six. The proposed configuration below accounts for this instead of assuming two free projects.

### Architecture choice

| Option | Benefit | Cost / decision |
|---|---|---|
| Browser SDK sends directly; gallery counters collect separately | Closest to PostHog's standard Svelte example; native browser identity/session handling | Two independently accepted streams can disagree about the same action. Do not choose this for gallery actions. |
| **One first-party collection contract, then a server-side PostHog export** | One accepted event, one traffic decision, authoritative catalogue fields, retryable delivery to both reports | Own a small anonymous-visit context and delivery queue. Recommended because these controls are required by this gallery. |
| Replace gallery storage and reports with PostHog | Less custom journey-query work | Does not supply the requested album inspector, photo workflow, public visibility rules or independent aggregate history. Do not choose this. |

The canonical baseline is PostHog's [Svelte integration](https://posthog.com/docs/libraries/svelte) and [Cloudflare Workers integration](https://posthog.com/docs/libraries/cloudflare-workers). We retain the official server SDK. We depart from direct browser capture because operator/test exclusion and catalogue validation must happen before events reach either reporting destination. The browser will not load a second automatic tracker alongside our explicit events.

The existing internal reference is `apps/rally-hq/src/lib/server/posthog.ts`, inspected September 29. Reuse the idea of a server-only SDK wrapper. Do not copy its identified-user properties or assume its singleton helper proves delivery at Worker shutdown. Follow the current Cloudflare lifecycle guidance and test the hosted runtime.

```text
Gallery interaction or observable download result
  → typed event + event ID + optional anonymous visit context
  → existing first-party collector
      validate target, privacy choice, traffic class and event version
      atomically accept event and enqueue eligible PostHog delivery
        ├─ local reporting totals → gallery UI and CSV
        └─ official PostHog SDK → private insights and experiments

Gallery journey panels
  → fixed server-side PostHog queries → bounded aggregate responses
```

Use the existing database transaction boundary for the accepted event and its delivery record. A PostHog outage must not fail a photo download. A database failure must not be reported as accepted collection. An in-memory promise or `waitUntil` alone is not a durable delivery queue.

## 2. Define visits without identifying people

Introduce a random `anonymous_browser_id` for permitted linked analytics and a random `visit_id`; send the latter as PostHog's `$session_id`. Do not send the existing IP/browser hash as `distinct_id`. Do not call `identify` with an email, Chrome profile, account ID, athlete identity, or contact information. Send `$process_person_profile: false`; this does not make the remaining identifiers non-personal or anonymous in the legal sense.

Proposed visit rule: a new visit after 30 minutes without a recorded interaction, or after 24 hours. This follows the documented [PostHog session convention](https://posthog.com/docs/data/sessions); our explicit interaction stream has less activity evidence than an autocapturing SDK. Implement one shared browser context, including tab coordination, reload, expiry and storage-disabled behavior. Background retries must not extend a visit. Preserve original visit IDs on queued events. If identity storage is unavailable, report unlinked activity rather than fingerprinting the visitor to reconstruct it.

Proposed browser-ID lifetime: 90 days from creation, then rotate. Returning-browser analysis is bounded by that identity lifetime, storage clearing and device changes. One browser is not one person; multiple browsers may belong to the same person. Never add unique-browser or unique-visit counts across albums or dates.

**Proposed privacy control:** obtain optional analytics consent before creating persistent identifiers for the new linked journeys or exporting those journeys to PostHog. Visitors can continue without it and can withdraw it. Preserve any separately documented minimal first-party counting as a separate population; never use it to reconstruct an opted-out journey. Mark events as eligible or ineligible for provider export at acceptance. Provider comparisons use the eligible population, not every historical gallery count. Report that selection bias beside journey results.

An exclusion preference must work without signing in. Issue a server-recognized cookie for **Exclude this browser from analytics**, show its state and expiry, and offer reversal. This grants no administrative access. Proven operator identity, self-exclusion and signed test context remain separate reasons; none means “verified human” for the remaining traffic.

All controlled browser agents must establish test context before gallery navigation or actions. Invalid test markers fail visibly. Local/preview environments default to no production export. Test scenarios go to the separate project. Known operator, excluded-browser, test and known-crawler events never enter the production PostHog audience stream. Keep minimal local exclusion/health totals for diagnosis. A normal Chrome user agent is not proof of a human, and a browser signed into Nino's Google account is not proof of site operator identity.

## 3. Collect observations with an explicit owner

Every new event carries `schema_version: 2`, a UUID `event_id`, occurrence and receipt times, environment, release version, and a named surface. The collector supplies traffic classification and catalogue facts. Optional correlation fields include `visit_id`, `view_id`, `search_id`, `result_set_id`, `download_request_id`, and `experiment_key`/`variant`. Validate allowed names, property types/lengths, timestamp bounds, target membership, origin and request limits. A client-provided identifier links observations; it does not authenticate a visitor or prove an action happened.

Names below are the proposed version-2 contract. Implement their names, properties, allowed values and ownership in one typed source; derive query definitions from it. The browser reports UI observations; the server reports only outcomes it can observe. Do not have both emitters independently claim the same event.

| Event | Trigger and owner | Required context / limit |
|---|---|---|
| `gallery_page_viewed` | Browser commits a visible gallery route, including SPA navigation | Route kind, canonical path, view ID, device/layout class. No SSR, prefetch or analytics-page view. Custom PostHog insights use this name explicitly. |
| `album_exposed` | A loaded album card meets the visibility rule | Album ID, placement, list/result set. Distinguishes opportunity from an album visit. |
| `album_opened` | Browser opens an album view | Album ID, entry surface, view ID. Repeat real visits may count; transport retries do not. |
| `photo_exposed` | A loaded photo thumbnail meets the visibility rule | Photo ID, album ID, position and list/result set. Fetching an offscreen thumbnail is insufficient. |
| `photo_opened` | Browser opens a lightbox or photo route | Photo ID, entry surface and view ID. Does not claim the image rendered. |
| `photo_rendered` / `photo_load_failed` | Browser observes image load and visibility, or a load failure | Photo/view ID, load duration or bounded failure code. A render is not proof of attention. |
| `favorite_added` / `favorite_removed` | Local favorite state actually changes | Photo ID and surface. Local browser favorites are not a global collection owned by a known person. |
| `share_action` | Clipboard success, native-share handoff, or composer/email-link opening | Subject ID, channel and exact outcome. Cancellation/failure stays separate; no “post published” event. |
| `download_requested` | A new user download request begins | Request ID, mode: single photo / saved-photo ZIP / album ZIP; requested item count. Retries retain request ID. |
| `download_item_requested` / `download_item_prepared` | The accepted request manifest names a photo / a validated image becomes available | Request ID + photo ID, once per item per state. This connects multi-album saved-photo ZIPs to each target. Never accept an HTTP error body as an image. |
| `download_prepared` | The file or ZIP is prepared successfully | Request ID, prepared item count, byte count and duration. Partial ZIPs must disclose requested versus prepared counts. |
| `download_handed_off` | Browser invokes the save/navigation handoff | Request ID. Does not establish a completed disk save. |
| `download_failed` / `download_cancelled` | The owning operation observes failure or explicit cancellation | Request ID, stage, bounded reason and retry attempt. A missing terminal event is unknown, not a failure or success. |
| `search_submitted` | A visitor submits a search | Search ID and allowed filter values. Do not include the words typed or a reversible query hash. |
| `search_results_shown` / `search_failed` | Browser displays a result set or an error | Search/result-set IDs, result count, duration or bounded error code. Cached and fresh results use the same contract. |
| `search_result_selected` | A result is selected | Search/result-set IDs, photo/album ID and position. Allows search-to-photo follow-through. |
| `filters_applied` | A new filter state becomes visible | Bounded facet values, result-set ID and resulting count. Do not record every keystroke. |
| `experiment_exposed` | The visitor actually sees the assigned variant | Experiment and variant, release and affected surface. Flag evaluation alone is not exposure. |

Visibility rule to implement and validate: at least half of a loaded card visible for one continuous second while the page is visible. This is a chosen opportunity-to-see measure, not a human-attention detector. Record once per target and stable view/result-set instance; virtual-list remounts do not create new exposure. Preserve position so early placement can be distinguished from photographic preference. Changing the rule requires a definition version.

Use opaque album/photo IDs and catalogue lookups for titles and previews. Snapshot known sport, event date/type and category with provenance/version where available. Album facts remain authoritative. Unknown event type stays unknown; the current catalogue query does not supply it. Keep arrival source/campaign separate from the on-site surface where a photo opened. Accept bounded tags from links and label them as tagged arrivals, not authenticated referrals. Strip query strings and fragments; use a normalized referring domain rather than the full referring URL.

Never export search text, email, names of visitors or athletes, contact form values, private notes, photo captions/AI prose, full URLs, raw IP/user-agent strings, or the legacy fingerprint. Evaluate IP and user agent transiently at our edge when needed for abuse handling. Do not forward visitor network headers or enable GeoIP enrichment for the PostHog relay. Inspect the actual outbound payload; a downstream property-removal rule is too late for data that must not leave the site.

Session replay, DOM autocapture, console/network recording and automatic error payload capture remain disabled. Use the explicit failures above. These switches add no evidence needed for the agreed jobs and could capture gallery/search content outside this contract. If a later investigation needs recordings, make a separate, concrete collection decision then.

## 4. Build reports that answer a specific question

| Report | Measures and matching population | Action it supports |
|---|---|---|
| Discovery | Eligible visits with album exposure → album open; direct landings shown separately | Test covers, album ordering and navigation |
| Album use | Visits opening an album → rendering one of its photos → an action on that album's photos | Find albums discovered but difficult to use; compare similar album ages and audiences |
| Search usefulness | Searches shown; zero-result fraction; same-search result selection; time to selection; subsequent photo action | Improve facets, result ranking and empty states |
| Download reliability | Requests → prepared → handed off, by mode/device; requested and prepared items; failure and unknown-outcome rates | Repair download paths and clarify ZIP behavior |
| Photograph response | Photo-exposed visits with later open, favorite add or download request for the same photo | Shortlist photographs and compare categories with similar exposure and placement |
| Distribution and return | Tagged arrival visits, subsequent actions, returning measured browsers within identity coverage | Decide where to share; distinguish new attention from revisits |
| Site experiments | Exposed variant, prespecified outcome, error/latency guardrails, sample size and uncertainty | Evaluate a cover, navigation or download-control change |

These become saved private PostHog dashboards and selected aggregate panels in the gallery. Preserve views, requests/items, favorite additions/removals and share outcomes together in the album inspector. The selected ranking metric must not hide all the other measures. Popular, Rising and Last recorded activity remain distinct choices.

Every funnel must match the **same visit and relevant album/photo/search/request**, with ordered steps and a stated window. PostHog's default unique-user funnel is not automatically the required visit-level calculation. Configure the necessary matching rules, or use a tested fixed query. A visit can appear in more than one album's report, so album visit counts cannot be added into a gallery total. A card favorite or direct photo landing is a valid alternate path, not automatically a funnel failure.

For photo response, use exposed visits with a later matching photo action divided by eligible exposed visits. Do not divide ZIP item counts by album opens. Show the numerator, denominator, covered dates and excluded/unlinked population with every rate. For search, no selection means “no recorded selection,” not “the visitor could not find their photo.” Time to selection excludes missing outcomes and must disclose that.

The first photography comparisons should control for album, publication age, traffic source, placement and shot category where evidence supports them. The catalogue can supply further verified camera/quality metadata later in the same analysis workflow without sending free-form descriptions to PostHog. Observational comparisons remain hypotheses: subjects, promotion and audience preferences can explain the result. Never turn these charts into automatic advice that one style is objectively better.

Experiments use PostHog's flag/experiment services through the official server SDK, with stable assignment for the measured browser. Log actual exposure and the evaluated variant on outcomes; do not re-evaluate flags while replaying an old queued event. Define the primary outcome, eligible audience, minimum useful effect, sample-size plan and stopping rule before launch. Use the browser as the assignment unit; repeated visits are not independent experimental subjects. Check assignment balance before interpreting a result. Low traffic may produce an inconclusive result. Before/after charts alone do not establish causation. Building experiment support does not authorize launching a live content experiment.

## 5. Keep public reports useful and provider access private

The gallery route remains public. Only aggregated, catalogue-filtered results reach that page or CSV. Continue to require operator authentication for private notes, saved private reports, traffic corrections and individual event investigation. PostHog's project and its direct insight links remain private; do not solve access by making a PostHog dashboard public.

Implement named server-side queries for the report definitions above. A public request selects a report and validated filters; it cannot submit arbitrary HogQL/SQL. Filter permitted album IDs **before aggregation**, including gallery totals. Apply current unlisted visibility even to historical data. Recheck cache keys and invalidation when visibility or catalogue grouping changes. Do not return event rows, visit/browser IDs or rare raw error payloads.

Carry the same dates, America/Chicago timezone, album scope, comparison and content filters into the queries and exports. State each measure's coverage start and version. Cache bounded aggregate responses and display their as-of time. A PostHog timeout leaves the local action report usable and labels the affected journey panel unavailable; it never turns a failed query into zero.

Keep capture credentials, a scoped read-only query credential, and any feature-flag/configuration credential separate. Resolve existing items through 1Password before creating references. Store secrets in server runtime bindings, never public environment variables, source, exports or browser responses. Verify account/project access with an authorized API call, not merely an HTTP handshake. Record the actual organization, project IDs, region, SDK versions and installed dashboards in the build receipt.

## 6. Make delivery, counts and costs inspectable

The collector owns an idempotency key for every event. A retry returns the prior acceptance rather than incrementing a counter again. Persist the same event UUID and occurrence time through PostHog retries; the current [Node SDK type](https://github.com/PostHog/posthog-js/blob/main/packages/node/src/types.ts) exposes both fields. Verify provider deduplication by querying a repeated test event after ingestion. Do not infer exactly-once storage from the SDK option or HTTP 200.

Use a durable database outbox, a scheduled retry worker, bounded backoff and a visible terminal-failure state. A provider acknowledgment marks an event submitted; reconciliation establishes that it was stored. Prune confirmed delivery records; an unsent event cannot outlive the site's raw-event retention. Suppress queued exports after an applicable opt-out or classification correction. `waitUntil(captureImmediate(...))` can attempt prompt delivery, but failed delivery remains in the outbox for recovery. Test Worker termination between acceptance, delivery and acknowledgment. Reconcile event IDs within the retained window and replay eligible missing records with their original IDs; do not replay indefinitely against an exhausted quota.

Track accepted/rejected events, pending/failed export count, oldest pending age, provider query freshness, duplicate counts, schema version, and reconciliation watermark. Separate “summary reconciled” from “collection healthy.” Query a known test event in the test project before declaring end-to-end delivery verified.

PostHog receives individual version-2 observations. The old counters deduplicate a fingerprint/target/action per UTC day. Keep those historical definitions labeled and separate. Do not import the old rows as if they contained visit sequences or exposures. At cutover, record the exact date and implement versioned report projections; a repeated genuine open and a repeated network delivery are different things. Reproduce the local legacy projection in PostHog only where the retained evidence supports it, and compare like-for-like version-2 totals over an identical export-eligible cohort.

Known excluded traffic is filtered before export; suspected automation can be discovered later. Keep a private, versioned exclusion list for retained evidence and apply it to all owned PostHog queries and dashboards. Reconcile after changes. Historical data beyond the retained classification evidence cannot be confidently reclassified. Ad-hoc PostHog views without that filter must not be presented as the official audience report.

Cost planning must use **new events per measured visit**, especially thumbnail exposure, not the old daily-deduplicated photo-open count. Measure an album browse, search journey and ZIP download in the test project; multiply event volume by observed visit-volume scenarios. Batching saves requests, not event volume. Never silently sample action or funnel events to stay under a cap. Any exposure sampling must carry inclusion probability and compatible estimators; prefer bounded emission first.

Current [published pricing](https://posthog.com/pricing), checked September 29, includes one million analytics events and one million feature-flag requests per month; experiments are billed with flags. The free plan permits one project. Pay-as-you-go permits six projects and retains event history for seven years, even when usage remains within its free allowance. **Proposed setup: use available pay-as-you-go project slots, with analytics and feature-flag billing limits of $0 until measured volume justifies an approved budget.** This supports separate production/test projects. Check whether the existing organization already supplies those slots; do not create another organization or activate billing silently. The plan makes no claim that the current account has this tier and authorizes no purchase.

The September 29 provider API accepted separate photography production and test projects in the existing organization without a billing change. Its billing response says free, while organization entitlements include six projects. Keep that observed configuration; a paid upgrade is not a prerequisite for this build. Never mix synthetic events into production to evade that constraint. PostHog documents that events beyond a free or billing limit are dropped and flags fall back to a quota-limited response. Forecast usage, alert before the cap, show a coverage gap if reached, and give experiments a safe default. A $0 billing limit is a spending control, not a delivery guarantee.

## 7. Update the privacy statement before enabling export

Nino chose PostHog Cloud and proposed retention wording on September 29. The [live policy](https://ninochavez.co/privacy), fetched today, was updated September 28. It already discloses longer-lived daily totals, 90-day engagement-record deletion, and search records with no automatic expiry. It does not describe these new linked PostHog journeys.

PostHog currently documents **one year of event history on its free plan and seven years on paid plans**. It says the retention window is not a deletion tool and cannot be shortened. Do not promise that PostHog data is deleted after 90 days, or automatically deleted exactly when a reporting window ends. See [events retention](https://posthog.com/docs/data/events-retention) and [storage/deletion controls](https://posthog.com/docs/privacy/data-storage).

Proposed policy copy for the photography analytics section, contingent on the configured behavior:

> With your optional analytics permission, the photography gallery uses PostHog Cloud to understand how browsing, search and downloads work. We send records such as album and photo opens, visible thumbnails, favorite changes, download requests and observable outcomes, and search result counts. Random browser and visit identifiers connect these actions. They do not tell us your name and are not linked to your Google or Chrome account.
>
> We do not send PostHog the words you type into search, contact form contents, email addresses, raw IP addresses, or recordings of your screen. We send limited device/layout information and cleaned arrival-source tags. You can turn this linked analytics off and keep using the gallery. Turning it off stops future linked collection and export; it does not automatically erase earlier records.
>
> Our own detailed engagement records are removed after 90 days. Action totals without browser or visit identifiers may remain for historical comparisons. PostHog Cloud has a separate retention policy. The account currently reports a free plan. PostHog publishes one year of event history for free plans and seven years for paid plans. This reporting window is not a guarantee that older data is automatically erased. We will update this notice if the configured retention changes.

Before publication, replace “planned” with the verified configuration, add the actual hosting region, explain the chosen browser storage and 90-day ID rotation, and link the working analytics preference. If the final tier is free-only, change the stated PostHog window to one year. Test each “we do not send” statement against outgoing requests. Keep any necessary disclosures for Supabase, Cloudflare and existing search storage. The copy must not imply that older search records were deleted when they were not.

Stop storing new raw search text as part of the search refit. Inventory existing search records and prepare an explicit retention/deletion change for review; do not silently delete historical rows or transfer them to PostHog. Implement preference withdrawal and a documented deletion-request process. Inspect PostHog's actual tools for events without person profiles before promising per-browser deletion; provide a verified support path if the self-service tool does not cover it.

The gallery privacy route redirects to the site-wide policy. Update that policy at its owning source, not the gallery's redirect stub. Publishing the notice and enabling collection are coordinated release steps; this document changes neither.

## 8. Deliver and verify this with the full release

| Dependency order | Deliverable | Completion evidence |
|---|---|---|
| Contract and project setup | Typed event/property catalogue; identity, consent and exclusion behavior; selected Cloud project/region/tier; draft policy | Real configuration recorded; disallowed fields rejected; test project isolated |
| Collection repair and export | Fix diagnosed download bugs; complete event emitters; stable IDs; durable outbox; official SDK lifecycle | Browser observations match accepted records and queried PostHog events, including failure and retry cases |
| Queries and report connections | Saved PostHog dashboards; fixed aggregate queries; shared gallery filters and inspector/photo views | Totals and rates match independent calculations on the same cohort; public output respects visibility |
| Whole-release acceptance | Numerical, privacy, operational, desktop/phone and cold visual checks | All cases below pass; unknown history and limits remain visible |
| Authorized activation | Hosted code and data changes, policy publication, environment bindings, collection enablement | Deployment/configuration receipts plus verified hosted collection and report queries |

This is dependency order for one complete release. It does not defer photo exposure, search journeys, source analysis, comparison, export, saved views or the requested redesign into optional later releases.

### Acceptance cases that can disprove the implementation

1. Run the same journey as an ordinary permitted visitor, an excluded owner, and a signed test agent. Only the eligible visitor appears in production PostHog and the default audience totals. A forged body field cannot impersonate trusted test context; self-exclusion still works without a login.
2. Browse an album, open a photo, favorite/unfavorite it, share through each outcome, and exercise single, saved-photo and album downloads. Expected request/item totals reconcile. An injected image 503 is never a successful ZIP item. Unknown final outcomes remain unknown.
3. Inject duplicate event delivery, a lost acknowledgment, provider outage and Worker termination. The local acceptance count stays one, queued delivery recovers, and the provider query confirms the intended count. If provider dedup fails, fix delivery/query counting before release.
4. Prefetch a route and load thumbnails below the fold: no page/exposure increment. Test visible, obscured/background, recycled and reordered cards. Photo rendering failure never becomes successful exposure or a successful viewer render.
5. Search with results, no results, a cached response, cancellation and a failed response. Follow a selected result. Search IDs connect the intended path; no typed query appears in exported events, URLs or logs.
6. Exercise two albums, direct photo arrivals, multiple tabs, refresh, idle expiry and disabled storage. One album's action cannot complete another's funnel. Unlinked events do not manufacture a connected visit.
7. Inspect outgoing event payloads using deliberately sensitive-looking test values. Confirm allowlists remove them before provider transmission. Decline and withdraw permission, including with queued events; neither path exports a prohibited journey.
8. Request anonymous page/API/CSV results containing a newly unlisted album and a cached earlier result. Its records and contribution to totals disappear. No private note, raw identity, arbitrary query or provider key is exposed.
9. Verify equal and unequal comparison windows, Chicago midnight/DST, partial days, new collection boundaries and zero baselines. Rising cannot fall back to Popular or describe a falling daily rate as rising.
10. Run a synthetic experiment with known assignments and outcomes. Only observed exposures enter its denominator; retries preserve the variant. The site works if flags are unavailable. Do not claim a real lift from test data.
11. Reconcile accepted, export-eligible events with queried provider results by event ID/version/window, then reconcile report totals. Separately compare a week of Cloudflare pageviews and explain differences in units, coverage and exclusions.
12. Force a query error and an export backlog. The gallery preserves available counts, displays affected coverage/freshness, and never substitutes zero. Check the final desktop and phone experience with real eligible data before calling it ready.

### Implementation ownership

Extend `src/lib/analytics/client.ts`, `collection-contract.ts`, `context.server.ts`, `tracker.ts` and the existing analytics endpoints. Add narrowly scoped modules under `src/lib/analytics/` for anonymous visit context, the server-only PostHog adapter and named report queries. Keep event names/properties in one contract, not repeated across components and dashboard scripts. Update the gallery/lightbox, favorites, share, search and download owners named in the red-team report. Add reviewed Supabase migrations for versioned accepted events/outbox and report projections. No build-config change is assumed.

The UI work stays in the analytics routes and components. Policy work belongs to the site-wide privacy source. Configuration and production application remain explicit delivery steps, separate from editing these files.

## Evidence and reasons to revise the choice

The collection defects and missing denominators come from the September 29 source audit and saved reproductions. Today's plan research fetched the official Svelte, Cloudflare, session, capture, funnel, experiments, privacy, retention and query documentation, plus the Node SDK event type. These establish supported building blocks, not a working integration in this gallery. Sources: [capture API](https://posthog.com/docs/api/capture), [funnels](https://posthog.com/docs/product-analytics/funnels), [experiments](https://posthog.com/docs/experiments), [query API](https://posthog.com/docs/api/query), [collection controls](https://posthog.com/docs/privacy/data-collection).

Build verification inspected the existing organization and both new US projects. Test project 635867 received synthetic events; the provider returned the expected fixed report totals and one copy per UUID after a deliberate duplicate delivery. Production export remains disabled. Cloudflare parity, production bot prevalence, collection loss, and the amount of consented traffic remain unverified. See the build receipt for actual account observations and remaining release gates.

Revise the transport if a controlled failure rehearsal cannot establish reliable deduplication and recovery. Prefer the standard browser SDK if it can meet the same exclusion and single-event acceptance requirements with less custom work, and document the demonstrated tradeoff. Revise provider choice if its privacy/storage controls cannot meet the published promises. If event volume or sample size makes an analysis unaffordable or inconclusive, disclose that evidence before changing the product or buying a plan. None of these conditions justifies inventing historical journeys or reducing the agreed workspace scope silently.
