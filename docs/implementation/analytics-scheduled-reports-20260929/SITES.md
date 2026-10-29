# Stored site-action summaries

The site action report reads stored UTC daily totals. It preserves the six action metrics, section and period filters, and eight-row pages. Today is separate from the headline total. Its label names the snapshot cutoff and says it is not included above.

## Collection and refresh

`analytics_private.refresh_site_action_summaries()` rebuilds affected days atomically at minutes 7 and 37. It captures a cutoff before reading, applies retained corrections and exclusions, and serializes with the raw-to-archive handoff. Archive changes since the last cutoff enter the next rebuild. A failed refresh preserves the previous totals and records failure. A refresh more than 45 minutes old is also marked stale.

`analytics_site_actions(period, section, page)` reads only the stored totals and status. Both functions require the service role. Summary rows contain a UTC date, approved section and path, action counts, and timestamps. They have no browser, visit or event identifiers. The public response decoder selects only the declared fields.

After UTC midnight, a snapshot from yesterday cannot certify yesterday as complete. The report ends at the last fully covered day. Today remains unavailable until a snapshot from today exists.

## Verified locally

The parent ran the executable SQL assertions on the marked synthetic database. They cover all six metrics, retries, archive handoff, reclassification, browser exclusion, pruning, midnight, overdue and failed refreshes, access denial, paging and identifier omission. The SQL negative control failed as expected. Six report-decoder tests and the focused analytics suites passed. Desktop and mobile checks verify UTC labels, freshness notices and eight-row pagination.

The 100,000-event synthetic benchmark preserved the same totals and pages. The original read took 190.243 ms; the stored-summary read took 1.226 ms. Refresh took 217.724 ms. These are local measurements, not production latency or capacity.

The parent generated migration `20260930005003_analytics_scheduled_site_reports.sql` through a successful Supabase CLI invocation. The worker's CLI attempt had been blocked by its sandbox. Its earlier unverified filename was replaced.

## Release order

Review and apply the migration before changing application reads. Run the private refresh once, confirm its totals and receipt, then deploy the application. Verify the scheduled refresh and actual page latency after deployment. No production changes have been made.
