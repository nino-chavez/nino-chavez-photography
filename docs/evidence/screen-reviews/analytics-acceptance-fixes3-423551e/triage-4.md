# Fourth cold review: triage

The coordinating session wrote this after `cold-review-4.md`. The reviewer did not see it.

## Verdict

This is the first review with **no finding that blocks the job**. Home's first phone screen answers what is happening now and what is next. Almost every number names its days and what it is compared with. Recaps and the "No such recap" page work. Every other surface works with fixes, Data included. In review 1 the Data page did not work.

| Surface | Review 1 | Review 2 | Review 3 | Review 4 |
| --- | --- | --- | --- | --- |
| Home | with fixes | with fixes | with fixes | with fixes |
| Album report | works | with fixes | with fixes | with fixes |
| Recaps | with fixes | with fixes | with fixes | **works** |
| Photos | with fixes | with fixes | **works** | with fixes |
| Data | does not work | does not work | does not work for a non-engineer | **with fixes** |
| Settings | does not work for visitors | with fixes | with fixes | with fixes |

## Fixed in this PR, after the review

- **S1, wording.** "Why was not recorded: they were counted before reasons were kept." now reads "Their reasons were not recorded, because they were counted before reasons were kept." The partial case reads "The reasons for N of them were not recorded, …". Both are tested (`home.test.ts`).

## The remaining "slows" findings, for a later pass if wanted

1. **S2.** Home has no way into the latest recap. On the album page, Recaps sits below the owner's note form.
2. **S3, S4.** The album report is long (5,981 px for the owner on a phone):
   - The download strip repeats the first six photos of the grid.
   - The comparison appears as both a table and a chart.
   - Three day-windows are mixed in one block.
3. **S1, the rest.**
   - The surge card gives no basis for "usual" and no next step.
   - It doesn't say whether visitors were affected when reasons are missing. That can't be known for days counted before reasons were kept.
4. **S5.** Data has no one-line "collection is working" verdict at the top. The glossary text is long.
5. **S6.** At 312% text the navigation shows two items and scrolls. The reviewer prefers wrapping. The measured trade-off is in `navigation-measurements.md`: wrapping fills the first screen at 312%.
6. **S7.** Photos on a phone: the filters come before the first photo.
7. **S8.** Settings:
   - There is no default retention. This was deliberate, so as not to imply a choice nobody made.
   - The checkboxes look small. The gate measured their labelled hit areas at 44 px or more.

Polish items P1 to P10 are in `cold-review-4.md`.
