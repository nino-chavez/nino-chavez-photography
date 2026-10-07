# Acceptance triage (step 9)

The coordinating session wrote this after the cold review. The cold reviewer did not see it. Each finding below was checked against the captures or production, not taken from the review's wording. The fix pass works from this list.

## Confirmed: fix in the acceptance pass

| # | Finding | Checked against | Fix |
| --- | --- | --- | --- |
| 1 | `?recap=7` renders the whole album report, still headed "WEEK 1 RECAP". The stored recap starts below the Recaps list, about 1,300 px down on desktop. | `album-Re7kho-recap7__visitor__chromium__desktop-1440__default__p01–p02` | The recap opens as its own view, with its own title, the stored text and a link to the full report. |
| 2 | The stored day 7 recap and the live report disagree: "2nd of the 6" against "2nd of the 7", "no photo requested more than 3 times" against a photo requested 4 times, and 14 against 20 arrivals. Both are correct for their windows. The recap is as of its due morning; the live report ranks against later launches and counts 12 days. The page gives no sign of that. | The recap text, plus the album report's "use all 12 full days" note | The recap view states its as-of date and window first. The live report's rank and download sentences name their window. |
| 3 | The Data headline "Everything is current." sits above "not recorded" download results and a Cloudflare 740 against site-counter 92 mismatch. The owner view shows "110,712 rejected" with no definition. | `data__visitor__chromium__desktop-1440__default__p01` shows the headline and the "not recorded" rows. The 740 against 92 figure and the "rejected" count come from the cold review and were not re-checked. | The headline comes from the worst state on the page. "Rejected" is defined where it appears. |
| 4 | Home leads with a comparison it calls unfair (349 against 1,544, "this is not a fair comparison"), above the like-for-like launch line. | The Home phone and desktop captures, and my own look | Lead with the newest launch's like-for-like line. Move or drop the calendar-week total. |
| 5 | The same "The launch is over" card repeats under every launch on Home. "Photo opens fell to 0" reads like an outage. | The Home phone captures | One finished-launch note for the newest launch, worded as "No one has opened a photo since Oct 2". |
| 6 | "Next" sits in part 3 of 4 on phone Home. Home runs about 3 phone screens against a 2-screen target. | The Home phone capture height (2,424–2,544 px) | Put "Next" directly under the headline on phones, and bring Home back to the target. |
| 7 | Phone tables clip with no scroll cue: Data's search and download evidence, and three columns of the Site table. | The cold review's cited files (not re-opened by the coordinator) | Use the card layout the Albums page already uses on phone. |
| 8 | On desktop the sticky "Selected photo" card covers the launch-comparison heading. The card shows "Opens 12" beside "opened 3 times", and the comparison chart's lines have no labels. | `album-Re7kho__visitor__chromium__desktop-1440__default__p03` | The cards follow normal flow. Each count names its window. The chart lines are labelled. |
| 9 | At 200% text, the Home launch card and the Photo explorer tiles crush to one word per line, and captions break mid-word. At 312% every page overflows (mechanical.md). | The cold review files, and mechanical.md's 312% table | Stack the thumbnail above the text and use one column at large text. Size type in rem so iOS Dynamic Type reaches the page (no source uses `-apple-system-body`). |
| 10 | Forced colours drops the selected state of every toggle. | The cold review's cited files (not re-opened by the coordinator) | Add a selected marker that does not rely on colour (border or `aria-pressed` styling with `Highlight`). |
| 11 | Visitor Settings shows an "Analytics preferences" card with no control. Owner Settings has the sentence "Enabling records your explicit choice and sends nothing now." | The cold review's cited files (not re-opened by the coordinator) | Hide the card from visitors, or give it its control. Rewrite the sentence. |
| 12 | Mechanical findings: `link-in-text-block` on Photos, Site, Data and Settings; `landmark-unique` on Albums at desktop; chart SVG text fixed at 12 px. | mechanical.md | Underline links inside text, give the landmark a unique name, and size chart text relative to the page text. |
| 13 | Home still says "(inferred)". The album report and the recaps say "date recovered afterwards from a log". | The Home captures | Use the same words on every page. |
| 14 | `/data` takes 2.4 s on desktop and 3.3 s on phone by median, with phone loads from 2.0 to 14.0 s. It is the slowest page. It matches the old Measurement tab measured locally (about 2.0 s), so it is not a regression. | performance-production.json | Find the slow read (step 8 added the browser estimate to every load) and make the page not wait on it. |

## Checked and not a defect

- **"Photos 100" on many albums.** 67 albums hold exactly 100 processed photos in `photo_metadata` (production, read-only count). The number is real, not a display cap.
- **The "127.0.0.1" entry under the site report's visit sources.** It is one real entry visit referred from a local preview, and production records it. It is the gallery owner's own local traffic. Whether to exclude local-preview referrers is a collection rule, not a screen defect, so it is noted and not fixed here.

## Not judged

- A real phone, Safari on iOS, and a real sign-in.
- A launch in its first days, a day 3 recap page, and an empty gallery: production has none of these right now.
- Screen-reader output.

The cold review lists the rest.
