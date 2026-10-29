# Analytics workspace implementation

The analytics route is a light slate, white, ink, and blue workspace. This is
local to analytics; it does not replace the gallery's photography theme.

## Interaction contract

- The compact trend uses only complete daily report values. Its table is the
  accessible alternative.
- The album table includes every public catalogue album, including albums with
  no selected-measure activity. Search only narrows what is already loaded.
- Selecting a row changes the inspector only. **Open album report** changes the
  URL scope. The selected row and photo view persist locally; dates, scope and
  filters persist in the URL and saved-report query.
- Rising is unavailable without complete compatible comparison evidence. With
  unequal custom windows it compares actions per Chicago calendar day, never
  the raw difference.
- Album and photo inspection keeps opens, downloads, favorites, and shares
  together. Download actions are requests or handoffs, not confirmed saves.

## Provider integration seam

The local report remains usable before version-2 provider projections exist.
Parent integration may add a `journeys` aggregate to `OperatorReport` only from
a fixed, server-side provider query. Each field needs `value`, `availableFrom`,
`asOf`, `population`, `definitionVersion`, and an `unavailableReason` when it
cannot be read. The UI must not turn unavailable journey evidence into zero or
present it as a completed measurement feature.

New `analytics_events_v2` fields are not inferred from legacy summary rows.
Event type remains `unknown` where the authoritative album catalogue lacks it.
