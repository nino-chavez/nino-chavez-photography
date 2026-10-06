# ADR 0008 — Build the analytics site around album launches, using the combined layout

**Status:** Accepted direction; not yet built.
**Date:** 2026-10-06.
**Chosen by:** Nino Chavez, in Claude Code session `ddb351f2-02c9-4391-86b5-2ad4de086841` ("go with the combination").

## Decision

Rebuild the analytics site around each album's launch, using the combination of the three [October 6 concepts](../../docs/design/concepts/2026-10-06-launch/README.md):

- **Home comes from A, the launch log.** One plain sentence about what is happening, then a card per recent launch with its day, its opens and its rank against earlier launches at the same age. A quiet week says so.
- **The album report opens with C, the recap.** Sentences with the numbers inline, a small chart, the photos people downloaded and three actions. The day 3 and day 7 recap email carries the same text.
- **Below the recap, on desktop, come B's photo grid and launch chart.** The photo-first grid with a selected-photo panel, and every launch's opens added up by day since publication.
- **B's ranked table becomes the album index.**

The page structure follows the [site rethink](../../docs/audits/20261006-analytics-site-rethink/README.md): Home, album index, album report, site report, data quality and settings. Every capability in `docs/ANALYTICS_PLAN.md` § 2 keeps a home there.

## Rejected

- **B's chart as Home.** It cannot be read on a phone, and it asks for analysis before saying what happened.
- **C's notes list as Home.** It hides the comparison that gives a number its meaning.
- **A's report as the whole album page.** Its rank-only comparison is weaker than B's chart, and it does not double as the recap.

The three concepts and their 30 captures stay in `docs/design/concepts/2026-10-06-launch/` as the comparison record.

## Related decisions, same day

- Album age counts from the first publication. Implemented in PR #194; migration `20261006120000` applied to production.
- Launch recaps on day 3 and day 7 replace the daily and weekly briefs (`docs/ANALYTICS_PLAN.md`, workstream E).

## What this does not establish

This records a direction chosen from rendered concepts on real data. It does not assert that the screens are built, that a cold reviewer accepted them, or that the launch rules produce useful findings. The selected screens still owe the judged-screen cold review on device captures, including largest text size and increased contrast.
