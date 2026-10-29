# Gallery loading needs work; all-sites is fast

Measured September 29, 2026 against the live analytics subdomain. The gallery waits on data before showing its report. Switching views after loading is quick.

## Live results

Three fresh browser contexts per page and device. The mobile lab uses 150 ms network latency, 1.6 Mbps download bandwidth and four-times CPU slowdown. Largest Contentful Paint is when the largest visible content appears.

| Report | Desktop paint, median | Mobile paint, median |
|---|---:|---:|
| All-sites | 0.22 s | 1.08 s |
| Gallery, default 30 days | 3.26 s | 4.64 s |

All twelve loads returned HTTP 200, with no JavaScript errors or measured layout shifts. Album and photo view changes took 15–89 ms from the browser click handler to two animation frames. That is a lab response measurement, not real-user INP.

Separate HTTP measurements of filter results:

- Seven-day download report: 1.88–2.49 s for complete HTML.
- Ninety-day photo report: 14.48–18.35 s for complete HTML.
- Writing, seven days: 0.16–0.26 s on repeat requests; the first request took 3.97 s.

The first bytes arrived quickly. That did not mean the report was ready: the server streamed its headers before finishing its data work.

An additional rendered ninety-day check took **25.54 s on desktop and 19.33 s on simulated mobile** to paint the main content. Both reports were available and their view changes worked. This is the worst loading result in this audit.

Google's good loading target is [LCP within 2.5 seconds](https://web.dev/articles/vitals). These lab samples do not establish a field Core Web Vitals pass.

## The data reads explain the delay

A read-only run of the current report builder against production data found:

- Ninety-day activity evidence took 6.58 s to return.
- The same report fetched 3,097 photo records through 31 sequential preview queries. Those queries took 5.48 s together.
- The thirty-day report fetched 2,192 photo records through 22 preview queries.

The photo pagination limits visible cards. It still loads the full selected photo result before displaying the first page. Rendering fewer cards alone will not solve this delay.

Priorities: fetch only the previews needed for the visible page and overview; keep the full CSV export separate; narrow and optimize the activity evidence query. Any shared cache must preserve traffic exclusions, album visibility and the report's update time.

## Local changes are not deployed

The local gallery loader now requests distinct album/category pairs instead of downloading the photo catalogue for category choices. The report routes also skip unused gallery navigation queries. Action reports skip Cloudflare reach queries.

The build passed. A local SQL comparison found exactly the same category pairs, with access denied to anonymous and authenticated database roles. This proves correctness on the local fixture; it does not measure a production speed improvement. The ninety-day query and preview work above still require attention.

## Evidence and limits

Raw measurements: [browser repeats](evidence/performance-repeat-live.json), [ninety-day rendering](evidence/performance-90day-live.json), [filter responses](evidence/performance-filter-live.json), [query timings](evidence/performance-query-profile.json). The query profile ran on this Mac, so it is not a Cloudflare CPU profile. No production rows were changed. No real-user INP, physical-device speed or concurrent-load capacity was measured.

The browser harness was also run against a nonexistent report route. It returned a failed exit status for HTTP 404, confirming that an error page cannot pass as a fast report.
