# Analytics intelligence experience

## Decision

Use the existing light slate, ink, and blue report workspace. The report stays an
overview first. Intelligence adds a short, evidence-led section beside the trend,
then opens a contextual inspector when someone needs to decide what to do.

This is a refit. The existing report filters, album table, selected-album side
panel, photo inspector, pagination, exports, and clean `/gallery` and `/sites`
addresses remain the spine of the experience.

## Composition check

The same populated, sparse, and unavailable report states were compared before
implementation.

| Composition | What works | What does not | Decision |
| --- | --- | --- | --- |
| Overview first | Makes the current report, its cutoff, and the few most useful findings visible before work begins. | Risks hiding follow-up work below the trend. | Chosen. |
| Task list first | Makes actions fast to scan. | Replaces the evidence that explains whether a task deserves attention. | Rejected as the entry view. Keep its explicit action state and follow-up form. |
| Inspector first | Gives a strong place to explain one album or photo. | Is too narrow for the site-wide and gallery-wide check. | Rejected as the entry view. Keep its scoped answer panel. |

Grafts into the chosen layout: retain the task list's action state and explicit
follow-up fields. Retain the inspector-first layout's fixed answer scope,
evidence links, and rerun control. Leave out an always-open chat panel because it
would hide the report evidence and turn an empty prompt into the starting point.

## Surfaces

- **Gallery overview:** a compact “Worth your attention” list appears after the
  report summary. It shows the report period, coverage, cutoff, evidence units,
  a proposed next step, and a report link. “All findings” stays paginated and
  does not replace the album table or photo explorer.
- **Site overview:** the same list uses the selected period and section. It
  keeps site traffic separate from gallery action measures and preserves each
  report's timezone in its evidence label.
- **Contextual inspector:** opening a finding or a supported question shows the
  captured scope, answer, limits, cutoff, and evidence links. It is not a blank
  chat dashboard and it never covers the report.
- **Action review:** an authorized owner can record an actual action, its
  hypothesis, primary measure, and follow-up date. Dismissal and snooze are
  separate reversible states. Public readers see the aggregate report and a
  clear sign-in explanation instead of private controls.
- **Briefs:** daily and weekly briefs appear as stored report summaries. A brief
  without supported evidence says so; it never renders an invented zero.

## States and flows

1. The report renders normally. Intelligence starts in the background so a chart,
   filters, paging, album selection, and photo inspection remain usable.
2. A finding presents its actual window, coverage, cutoff, numerator or
   denominator when supplied, and units. Empty, partial, stale, unavailable, and
   recovered results are named instead of made to look quiet.
3. A visitor can open a predefined explanation using public aggregate evidence.
   Free text and every mutation state why verified owner access is required.
4. An owner selects a preset or writes a question. The submitted scope remains
   frozen beside the answer. If filters change, the answer stays attached to its
   original scope until the owner explicitly reruns it.
5. An owner records an actual change separately from the finding's generation
   time. The UI sends no promotion, edit, message, or publication instruction.

## Guardrails

- Known album facts set the context. The UI never names an athlete, guesses an
  identity, or turns response data into an artistic-quality judgment.
- Search terms, raw events, provider payloads, private notes, and identifiers do
  not render here.
- Download handoff is not a confirmed save. A click is not an inquiry or booking.
- Synthetic fixtures must say “Synthetic” and may not imply hosted evidence.
- A result may be unavailable or insufficient. Neither state is a zero.
