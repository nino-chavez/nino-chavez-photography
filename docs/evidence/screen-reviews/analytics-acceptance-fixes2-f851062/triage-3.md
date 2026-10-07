# Third cold review: triage

The coordinating session wrote this after `cold-review-3.md`. The reviewer did not see it.

## Where the three reviews stand

| Surface | Review 1 (a8bfd28) | Review 2 (15f5f71) | Review 3 (this branch) |
| --- | --- | --- | --- |
| Home | works with fixes | works with fixes | works with fixes: answers what is happening now and what is next on sight |
| Album report | works | works with fixes | works with fixes: the main question is answered at the top |
| Recaps | works with fixes (fix first) | works with fixes | works with fixes |
| Photos | works with fixes | works with fixes | **works** |
| Data | does not work as written | does not work | does not work for a non-engineer; the owner headline now works |
| Settings | does not work for the visitor | works with fixes | works with fixes |

## Fixed in this PR, after the review

- **B1, the visitor Data page gave an all-clear it could not vouch for.**
  - A page with an unreadable part used to end its headline "No problem was found in the rest" for every reader.
  - A visitor is not shown delivery and collection health, so the visitor's headline now ends "Collection health is shown to the owner only." The owner keeps the original wording.
  - The rule is in `partialHeadline` in `src/lib/analytics/data-quality.ts`, and `StatusView` now carries `owner`, so a part that fails later keeps the right wording.
  - Tests cover both readers, for both the page build and a late failure. Forced failure: with the owner branch removed, 2 of 24 tests fail.

## For the next pass, ranked

1. **B2.** Home gives the owner no hint of a collection problem, while Data shows the rejection surge. Add an owner-only line on Home linking to Data whenever Data's headline is a problem. Visitors see nothing new.
2. **S3, S1, S2.** The album report on a phone:
   - The "Worth your attention" findings sit about four screens down.
   - The same comparison is stated three or four times.
   - One finding tells the reader to open the page they are already on.
   - Fix: move the findings under the headline, merge the repeats, and reword the self-link.
3. **S4.** At 200% and 312% text, the sideways-scrolling nav shows one or two items. The edge fade is the only cue, and a static capture can't show that it scrolls. Decide between a wrapping nav and a stronger cue. Check on a real phone.
4. **S5.** The phone table "Against other launches, first week" is cut off at 200% text with no visible cue. Use the card pattern the other tables use.
5. **S6, S13.** Each number should lead with its window. "Download requests" should be one label everywhere.
6. **S7.** Remaining internal wording: "collector", "linked-journey", "denominator", "backfill", "Grid showings", "src= in its address".
7. **S8, S9.** Recaps:
   - The "written later" fact is said four times; say it once.
   - Lay out the recap on desktop as a lead number and a short list.
   - A stale next step ("while attention is still arriving") should not appear on a recap read after the launch ended.
8. **S10, S11.** Asterisks:
   - When every launch date carries the asterisk, it flags nothing. Say it once.
   - Home's failure note belongs inside its launch card.
9. **S12, S17.** Plain sentences:
   - "Who is involved": one sentence of sources per album.
   - Say once, near the totals, that most counted opens come from browsers the collector could not sort.
10. **S14, S15, S16, S18.**
    - Albums phone cards are too long.
    - Home's headline gives no verdict word.
    - Data start dates appear in three formats.
    - Photo caption size.

The polish items are in `cold-review-3.md`.

## Not judged by any review yet

- A real phone (iOS Safari at an accessibility text size never applied in the Simulator).
- Real Cloudflare and PostHog panels: every capture came from a server without those credentials.
- Screen readers.
- A real sign-in.
