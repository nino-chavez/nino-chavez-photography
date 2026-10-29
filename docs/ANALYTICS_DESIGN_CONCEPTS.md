# Analytics design concepts

Reader: Nino, the photographer deciding what to share, investigate, or revisit. Job: compare real audience activity without confusing it with quality, caused-by claims, or missing history. Plainness: practitioner. Precision locks: reporting timezone, coverage, traffic rule, scope, activity versus event dates, and unavailable states.

Design intent: rethink. The existing public summary remains a short aggregate page. The operator workspace is a separate, allowlisted route.

Baseline evidence: `.temp/analytics-audit-desktop-0.png` was inspected locally. It establishes a useful dark, gold-accented photographic identity, a readable table density, and the existing choice to put albums before photos. It does not establish that its fixed 30-day totals or public audience are sufficient for the operator workspace.

## Representative states used for every concept

- A newly shared album has a clear daily lift, one source tag, and incomplete historical coverage.
- An older photo rises against a zero baseline.
- A traffic burst changes under the conservative rule.
- A report source fails or returns no covered activity.

## A — trend-led investigation

```text
Dates + measure + traffic rule
Daily activity → contributing albums → photo evidence
                    source / sharing context
```

The first screen answers “what changed?” It moves directly from daily trend to album and photo evidence. It is strongest for a share review or a sudden burst. It risks hiding catalogue navigation when the question starts with a known event.

## B — analyst table with inspection rail

```text
Filters | album/photo table | pinned image and activity detail
        | sortable columns  | source / coverage / annotation
```

This puts comparison density first. It is strongest for a known album, multi-album comparison, exports, and a long shortlist. It makes a new photographer’s first question feel like spreadsheet work and gives the photo story too little room.

## C — album-led gallery workspace

```text
Album catalogue → selected album timeline → cross-gallery photo discovery
```

This begins from the thing Nino knows he shot. It makes event context and zero-activity albums easy to find. It weakens source investigations and makes a cross-gallery spike take too many steps.

## Recommendation: A with B's inspection tools and C's album path

The operator page leads with the answer and explicit coverage. It then puts album and photo evidence beside the decisions they support. Album scope is a searchable first-class input, so a known event can start the same report without a detached catalogue. The implemented screen takes B's selectable columns, full export, shortlist, and focused photo inspection. It takes C's searchable album names, album detail, and equal-age comparison based on recorded publication time.

Not adopted: a permanent inspection rail, because it leaves too little room on phones; a chart for every metric, because most do not answer a distinct question; or an album-only home, because a cross-gallery change would take too many steps. Photo previews now come through the protected server report. The browser never fetches raw events.

Selection record: this is the implementation recommendation under the full-build authorization. It is not a human approval. Parent acceptance remains independent and may reject the visual choice without changing the access, query, migration, or collection contract.

## Live concept comparison and final render evidence

`audits/analytics-20260928/concepts.html` contains three divergent, interactive whole-screen layouts. Each supports the same five states: newly shared album, older photo rising from zero, a traffic burst, no activity, and unavailable data. The local browser rehearsal exercised all 15 concept/state combinations. The matching `concept-{trend,analyst,album}-{new,rising,burst,empty,failed}.png` files preserve their rendered frames.

All numbers in the concepts are invented. The page and the figure both identify the mock data. The representative photograph is owned gallery imagery; repeated images are not evidence of distinct production photos.

The parent personally inspected trend/new, analyst/burst, and album/rising frames. A exposes the first answer and its evidence limit. B contributes selectable columns, focused inspection, and complete exports. C contributes searchable album scope, detail, and equal-age comparison. The permanent side rail was rejected because it consumes phone space. The album-only opening was rejected because cross-gallery investigations take extra steps. These elements were folded into A as one coherent workspace; no human selection is claimed.

The implemented operator page was captured at 1440 × 1000 and 390 × 844. The `operator-*` captures in the same audit directory show its real local layout with synthetic records. The parent found and fixed phone horizontal overflow and delayed first-answer placement. Browser checks now assert both actual horizontal scrolling and document width, and require the first phone count above 760 px. The earlier 242 px overflow is a resolved finding, not a current limitation.

The independent cold review rejected the first final capture set. After the mobile navigation, table affordances, photo actions, and ranking captures were corrected, its recheck found no remaining visible blockers. Both reviews are saved in the audit directory. The build record distinguishes screenshot judgment from interaction, numerical, and production-data evidence.
