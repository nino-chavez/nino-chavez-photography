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
passes `{ kind: 'sites', period, section }`. Both loaders must expose
`intelligenceOwner`, a verified authorization result. The UI uses that boolean
directly; it never infers owner status from `user`, a browser account, a profile,
or a preference. The gallery still exposes `user` for its existing controls, but
that is not an intelligence authorization signal.

The component calls the same endpoint with `{ scope, question }` for owner-only
questions and `/api/analytics/intelligence/actions` for owner-only records. A
pending answer is polled from `GET …?scope=<JSON>&requestId=<id>`, which returns
`{ status, answer }`; it is not itself an answer. The UI uses the shared scope
parser and guards every response before rendering it. It never treats a browser
login, an exclusion preference, or a client field as owner proof. The server
owns validation and the exact action response.

Current contract gaps: actions require a visible finding and accept no separate
target type, observation window, channel/tag, release, or standalone outcome.
Briefs provide only `id`, `periodKey`, `kind`, and `createdAt`, so the UI cannot
claim a stored brief body, title, or finding list. Extend the server contract
before enabling those controls.

## Verification boundary

This worker used no server, browser, port, Docker, database, provider, or
production resource. The parent owns live endpoint wiring, browser rendering,
and the full suite. The component is intentionally asynchronous: a missing or
slow intelligence endpoint cannot block the existing report render.
