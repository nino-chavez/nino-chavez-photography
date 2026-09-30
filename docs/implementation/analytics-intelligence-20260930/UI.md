# Analytics intelligence UI handoff

## Owned files

- `src/lib/components/analytics/IntelligenceWorkspace.svelte`
- `src/routes/analytics/operator/+page.svelte`
- `src/routes/analytics/sites/+page.svelte`

## Page contract expected by this UI

Both report pages mount `IntelligenceWorkspace` with an exact serialized scope
and an `owner` boolean. The component loads
`/api/analytics/intelligence?scope=<JSON>&page=<n>` from the current origin,
under the SvelteKit base path. It expects the shared `IntelligenceReport` shape
on success and a plain message on failure.

The gallery passes `{ kind: 'gallery', query: report.query }`. The site report
passes `{ kind: 'sites', period, section }`. The gallery loader currently exposes
`user`; parent integration can use that to set `owner`. The site loader must add
only a verified authorization result before exposing owner actions there.

The component calls the same endpoint with `{ scope, question }` for owner-only
questions and `/api/analytics/intelligence/actions` for owner-only records. It
never treats a browser login, an exclusion preference, or a client field as
owner proof. The server owns validation and the exact action response.

## Verification boundary

This worker used no server, browser, port, Docker, database, provider, or
production resource. The parent owns live endpoint wiring, browser rendering,
and the full suite. The component is intentionally asynchronous: a missing or
slow intelligence endpoint cannot block the existing report render.
