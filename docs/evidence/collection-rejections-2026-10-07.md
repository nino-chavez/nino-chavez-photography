# Why the collector rejected about 25,000 events a day from Oct 2, 2026

**Answer:** Meta's crawler, `meta-externalagent`, began running the gallery's JavaScript on Oct 2. Each page it rendered sent analytics events from its headless browser. The collector refused every one through its known-crawler check, which answers HTTP 202. No visitor events were lost. In nine days of collector requests, none answered 503, the only status that means an event was not stored.

## What was read

- **Zone:** Cloudflare HTTP analytics for `ninochavez.co` (zone `b3c2fc69c28848932dbb24c49144f219`), through the GraphQL `httpRequestsAdaptiveGroups` dataset. The token was 1Password "Cloudflare account-ops claude-code". Every call was a read. Nothing in Cloudflare was changed.
- **Path:** the gallery lives at `ninochavez.co/photography`, so the collector is `POST /photography/api/analytics/events`. The `photography.ninochavez.co` host only redirects.
- **Counter:** `public.analytics_collection_delivery_counters`, read-only on 2026-10-07 (the figures in the task brief).
- **Sampling:** Cloudflare's adaptive datasets are sampled. Treat the Cloudflare counts as approximate. They agree with the counter to within about 0.3% a day.

## The collector's answers, by Chicago day

Each Chicago day spans two UTC dates, so Cloudflare returns two rows per status; they are summed here.

| Day | 202 (known crawler) | 200 (accepted or duplicate) | 503 | Counter: rejected |
|---|---:|---:|---:|---:|
| Sep 29 | 392 | 17 | 0 | about 400–430 |
| Sep 30 | 432 | 604 | 0 | about 400–430 |
| Oct 1 | 421 | 650 | 0 | about 400–430 |
| Oct 2 | 24,829 | 696 | 0 | 24,882 |
| Oct 3 | 27,861 | 122 | 0 | 27,842 |
| Oct 4 | 23,328 | 414 | 0 | 23,316 |
| Oct 5 | 20,478 | 138 | 0 | 20,528 |
| Oct 6 | 12,874 | 794 | 0 | 12,865 |
| Oct 7, to 18:00 CDT | 4,690 | 407 | 0 | 3,487 (read earlier in the day) |

Other statuses across the nine days: 403 cross-origin 1–2 a day, which the counter never sees; 400 once (Oct 7); 499 (client closed) three times.

## Who sent the 202s

| Window | Sender | Count |
|---|---|---:|
| Sep 30 | Baiduspider-render (AS4837, China Unicom) | 408 |
| Sep 30 | Googlebot, Bytespider, meta-externalagent, other | 24 |
| Oct 3 | meta-externalagent (AS32934, Facebook), all browser variants | about 27,400 |
| Oct 3 | Baiduspider-render | 403 |
| Oct 7, partial | meta-externalagent and meta-webindexer | about 4,000 |
| Oct 7, partial | Baiduspider-render | 718 |

The steady ~400 a day before Oct 2 was also crawlers, mostly Baidu's renderer.

## What Meta changed

Requests from `meta-externalagent` to `ninochavez.co`:

| Day | GET | POST |
|---|---:|---:|
| Sep 30 | 6,189 | 0 |
| Oct 1 | 8,634 | 9 |
| Oct 2 | 26,140 | 32,143 |
| Oct 3 | 25,886 | 36,046 |
| Oct 6 | 23,147 | 16,042 |

It crawled about three times as many pages and started running their JavaScript, both on Oct 2. On Oct 3 its POSTs went to the collector (27,446) and to `/photography/api/engagement` (8,600). Both answered 202. The engagement endpoint ran two database lookups for each of those before it checked the crawler. That order is fixed in this change.

## What this change does

1. The browser does not send analytics when its user agent is a known crawler (`isbot`, the same check the server uses). This removes the requests at their source, at no server cost.
2. Both endpoints check the crawler first, before reading the body or the database.
3. Every rejection is counted with its reason (migration `20261007180000`, not yet applied). Rejections counted before it read `not_recorded`.
4. Home and Data report a rejection surge against the usual rate, and any events that could not be stored.

## Queries

```graphql
# Collector POSTs by day and status. Run once per Chicago day: since = 05:00Z, until = 05:00Z the next day.
query($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){
  httpRequestsAdaptiveGroups(limit:200,filter:{datetime_geq:$since,datetime_lt:$until,
    clientRequestPath:"/photography/api/analytics/events",clientRequestHTTPMethodName:"POST"},orderBy:[date_ASC]){
    count dimensions{date edgeResponseStatus}}}}}

# Who sent the 202s.
query($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){
  httpRequestsAdaptiveGroups(limit:25,filter:{datetime_geq:$since,datetime_lt:$until,
    clientRequestPath:"/photography/api/analytics/events",edgeResponseStatus:202},orderBy:[count_DESC]){
    count dimensions{userAgent clientAsn clientASNDescription clientCountryName clientRefererHost}}}}}

# Meta's requests by method, and where its POSTs went.
query($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){
  httpRequestsAdaptiveGroups(limit:15,filter:{datetime_geq:$since,datetime_lt:$until,
    userAgent_like:"%meta-externalagent%",clientRequestHTTPMethodName:"POST"},orderBy:[count_DESC]){
    count dimensions{clientRequestPath edgeResponseStatus}}}}}
```

## Production matches what the migration expects

Read-only, 2026-10-07, through `supabase db query --linked`: the live `analytics_record_collection_delivery(smallint, text)` and `analytics_posthog_delivery_health()` are identical to the repository's definitions (from `20260929190000`), with the same grants, and the counter table's constraints carry the default names the migration drops and replaces. Applying it overwrites nothing that exists only in production.

## Not checked

- Which pages Meta rendered, and whether it reads `robots.txt` for them. `ninochavez.co/robots.txt` is served by the apex router, not this repository.
- Whether the client-side check stops every crawler. A crawler with an ordinary browser user agent still posts, and is still classified by the server's traffic rules.
- Supabase logs. Cloudflare's status split answered the question first.

## The screen walk

Home and Data were walked on a local `vite dev` server reading production Supabase read-only. The preload [`collection-rejections-walk-preload.mjs`](collection-rejections-walk-preload.mjs) aborts the server on any write. It is the acceptance-fix harness's preload plus one option: a scenario file with `rejectedDays` adds that list to the health reading, as the migration would. That is how the surge state was shown before the migration exists in production. Start it with `NODE_OPTIONS="--import <preload>"`, `WALK_SCENARIO_FILE`, `OUTBOUND_LOG` and a test `ADMIN_EMAILS`, as in `screen-reviews/analytics-acceptance-fixes-0e9680a/harness/start-dev.sh`.
