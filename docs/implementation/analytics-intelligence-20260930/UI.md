# Analytics intelligence UI handoff

## Owned files

- `src/lib/components/analytics/IntelligenceWorkspace.svelte`
- `tests/analytics/intelligence-workspace.spec.ts`
- `docs/implementation/analytics-intelligence-20260930/UI.md`
- `docs/design/experience-brief.md`

## Client contract

Both report pages mount `IntelligenceWorkspace` with a serialized report scope,
a server-verified `owner` boolean, and optional selected album/photo context. The
component reads the saved report from `GET /api/analytics/intelligence?scope=<JSON>&page=<n>`.
It guards every stored response before rendering. Invalid JSON, unknown targets,
and unsafe evidence links leave the intelligence area unavailable; they never
become a zero-activity result or a navigation target.

The first three saved findings remain in the first viewport. The rest of the
page and the remaining pages stay available through accessible controls. Findings
keep their own evidence windows, coverage, unit, strength, values, limitations,
and exact report links. The workspace preserves the existing report filters,
album inspector, photo explorer, pagination, and export paths; contextual album
questions freeze an album scope only for that answer.

Owner questions post only the frozen `{ scope, question }` contract. The browser
does not send an inferred context field. A pending request polls for at most two
minutes, then remains visibly queued with a manual status check. Cancelling stops
only the browser check; it does not delete the server request. Public readers can
only use a deterministic explanation of visible aggregate evidence and never see
free-text input, private answers, records, settings, briefs, or action history.

## Private settings and records

`GET /api/analytics/intelligence/preferences` returns:

```text
{ retention, daily, weekly, externalEnabled, destination, destinationVerified }
```

`POST` accepts only `{ retention, daily, weekly }`. The UI makes no default
retention choice. A private action cannot save until the owner explicitly selects
`until_deleted`, `90_days`, or `one_year`. Settings remain available even if a
finding report is empty or unavailable. Visitor privacy remains separate.

The UI explains external delivery accurately: it needs a verified destination
and explicit activation. It never reads an address, assumes Chrome or email
access means activation, or sends a message.

A record can start from a finding or from the selected album/photo/report context.
The record form requires a real target, actual time, change type, hypothesis,
one declared primary measure, and a 7/14/30/90-day observation window. It sends
the final action fields expected by the completion contract:

```text
findingId? publicTarget? changeType channel campaign release variant
outcome actualAt hypothesis primaryMeasure observationDays note
```

Dismiss and snooze require a private reason. History renders only for the owner,
keeps the row-specific undo action ID, and distinguishes pending, ready-to-check,
and returned follow-up results. Inquiry and booking outcomes remain coarse; the
form has no customer identity, contact message, or public history field.

## Briefs and integration boundary

Owner briefs render their stored title, body, finding references, safe snapshot,
and source-window links when those fields are in the response. The UI does not substitute a
generic blank-brief message or expose a brief to an anonymous report. It supports
the older minimal brief response without inventing absent content.

The backend-completion worktree currently accepts the coarse `outcome` field but
still requires a finding. It must add the declared optional `publicTarget`
standalone path before that portion of the form can persist. Until then, the
expanded record form correctly reports a safe save failure rather than silently
dropping fields.

## Verification boundary

This worker used no server, browser, database, provider, or production resource.
The focused Playwright spec covers guarded stored evidence, anonymous privacy,
pending polling, explicit retention before standalone records, target/window
payloads, stored brief content, and frozen album question scope. The parent owns
the actual browser run, rendered desktop/mobile review, endpoint integration,
and final contract rehearsal.
