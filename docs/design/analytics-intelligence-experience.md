# Analytics intelligence experience

## Decision

Use the existing light slate, ink, and blue report workspace. The report stays an
overview first. Intelligence adds a short, evidence-led section beside the trend,
then opens a contextual inspector when someone needs to decide what to do.

This is a refit. The existing report filters, album table, selected-album side
panel, photo inspector, pagination, exports, and clean `/gallery` and `/sites`
addresses remain the spine of the experience. (Written before the October 6 rethink: `/gallery` has since
been split into Home, the album index and report, the photo explorer, Data and Settings.)

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

## Implemented integration

The owner can record a standalone change or attach it to a finding. Each record
keeps its actual action time, public target, hypothesis, declared measure,
observation window, and optional channel, campaign, release, and variant.
Coarse inquiry or booking counts can be appended later. Zero remains a known
count; a missing count remains unknown. Public readers receive none of this
private history.

Daily and weekly briefs keep their body, findings, and immutable source snapshot
references. A new scope can be queued explicitly; a pending assistant calculation
polls with backoff for up to two minutes. Its answer stays tied to the captured
scope until the owner asks to rerun it. External delivery stays off until a
verified destination and explicit activation exist.

## Owner report questions, October 16

Report questions remain available when saved findings are absent, loading, or
unavailable. A link beside the report controls targets the question panel itself, after any
record controls or reporting settings.
The link and question buttons wait until their handlers are ready, so an early
click cannot leave an incomplete browser-history entry.

An album offers first-week comparison, download definitions, and coverage. Sites
offers coverage for every section and counter comparison for All sections only.
A section-specific report links to All sections without silently changing the
question's scope. Finding explanations stay with an actual selected finding.
An answer keeps its question, dates, filters, source links, and limitations when
filters change; rerunning is explicit. Visitors retain public finding explanations
and never receive the owner question controls.

Independent review flagged the original section-level jump target. The parent
confirmed that Sites landed on “Record what you did”; expanded settings can also
precede questions when an action form is open. The ordinary no-findings state
does not itself expand settings. A failing browser regression confirmed the Sites
landing before the links were changed to target the question panels directly.

### Typed questions and recovery, October 16

Ordinary wording maps to the same bounded report operations as the shortcuts.
“First week” means seven complete days after publication, including when the
album is too young to answer. It never falls back to three days. Revenue and
prediction questions remain unsupported even when they mention a supported measure.

“What changed?” asks whether the owner means findings for the selected dates or
follow-up on a recorded change. Vague download, album-performance, and counter
questions also offer a choice. The original question and scope stay visible.
Choosing an option submits that explicit question; changing filters disables the
old options until the question is rerun.

Unsupported questions return a normal response with context-specific alternatives.
Clarification uses `status: clarification`; both states can include optional
`suggestions` with a label and question. Malformed requests still fail validation,
and owner and origin checks still apply. A missing saved calculation returns an
unavailable answer with questions that can read the report directly. Neither
guidance state writes question text or queues work.

This extends the existing phrase matcher and answer contract. A growing list of
silent keyword guesses would preserve the ambiguity; an unrestricted language
model would add a new interpretation and execution boundary. Explicit choices
keep the decision with the owner while retaining the existing report readers.

The real local browser checks cover desktop and mobile touch input, choosing an
option, unsupported recovery, and preserving filters across a rerun. Existing
saved-finding and pending-job tests cover older answers without `suggestions`.
The data is synthetic. Physical-phone and signed-in production acceptance remain
separate from these checks.

Reviewed captures: [desktop clarification](../implementation/analytics-intelligence-20260930/evidence/question-guidance-clarification-album-1280-screen.png),
[mobile clarification](../implementation/analytics-intelligence-20260930/evidence/question-guidance-clarification-album-390-screen.png),
[desktop alternatives](../implementation/analytics-intelligence-20260930/evidence/question-guidance-unsupported-sites-1280-screen.png),
and [mobile alternatives](../implementation/analytics-intelligence-20260930/evidence/question-guidance-unsupported-sites-390-screen.png).
Every number in these captures is synthetic; do not quote it as live activity.
