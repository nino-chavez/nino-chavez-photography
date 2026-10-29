---
kind: cold
reviewer: Claude Sonnet 5.5, fresh session; had not read the product's code, docs, design record or any earlier review
build: fix/analytics-acceptance-3 at a648e2b (local development build reading production data, captured 2026-10-07)
inputs: cold-packet-4.md, after3-captures/index.md, the captures
---

# Cold review 4

Coverage: I read Home, Albums, both album reports (Re7kho = "HS Girls VB - JCA at ACC", DWdCET = "College Women's VB - Millikin at North Central"), both recap views for each, Photos, Site, Data and Settings. I read phone 390 and desktop 1440 at default, owner and visitor, in Chromium. I also read phone text-200 (Chromium), text-312 (WebKit; the largest setting in the index), contrast-more and forced-colors (Chromium, Home and Re7kho album, phone and desktop), and WebKit phone default for Home, Albums, Re7kho album, Photos and Settings. For Data, Site and Settings I read the desktop owner page, plus the phone view for Data and Settings. I did not open every one of the 2,128 files. The remainder are the same pages at other settings, and I sampled across them rather than reading them all.

## 1. Verdict

The site answers its main job, which is "how is the newest launch doing against earlier ones?". The first phone screen of Home says it in one sentence: "College Women's VB - Millikin at North Central finished its first week 4th of 7 launches, with 266 photo opens, below the usual 381 for earlier launches." It names the album, the rank and the comparison. A separate "Next" card says "No recap is due. Publishing an album schedules its day 3 and day 7 recaps." The comparison numbers state their basis on almost every screen, and the honest caveats ("Counts are browser actions, not people") are written where the numbers are. Nothing looks broken or empty in the data pages. The weaknesses are length, wording and two missing links. First, the album report is eight phone screens long and repeats itself. Second, a few sentences are unreadable: "Why was not recorded: they were counted before reasons were kept." Third, nothing on Home leads to the latest recap, even though reading from a day 3 or day 7 recap is one of the stated ways the site is used. I found no finding that blocks the job. Four slow it noticeably.

## 2. Verdict per surface

| Surface | Verdict | Answers on sight | Does not answer |
| --- | --- | --- | --- |
| Home | works with fixes | Q1 (headline, rank, comparison, sparkline), Q2 ("Next" card), partly Q5 (links into launches) | Q4: no link to the latest recap. The "Needs attention" card gives no next step and does not say whether real visitors were lost. |
| Albums | works with fixes | Q1 (table of seven launches with first 3 days, week 1, rank, download requests), Q5 (find, compare, export) | Two dense explanatory paragraphs sit before the list. "Export CSV" does not say what is exported. |
| Album report (owner, visitor) | works with fixes | Q1, Q3 partly ("20 arrivals ... all labeled 'profile'"), Q5 (clear buttons; visitor is told what needs sign-in) | Q3 "which photos they took" is not answered anywhere. The page is long and repeats the photo strip. The recap links are the last thing in the middle of the page. |
| Recap day 3 / day 7 | works | Q4. "As of Sep 29, 8:00 AM Chicago time" and "Covers Sep 26 to Sep 28, 3 full days" are exact. The "Written later from the records, on Oct 6" badge is honest. | The next step ("Check where the album was shared, and whether the people in it have the link") reads as generic. |
| Recap 5 (non-existent) | works | "No such recap ... Recaps are written at day 3 and day 7" with three exits | none |
| Photos | works with fixes | Q5 (open, shortlist, filter) | Filters and a long intro fill the first phone screen; the first photo appears below roughly 1,100 px. Every card leads with a long album name instead of a photo. |
| Site | works with fixes | "Is anyone looking at your profile and work, and did anyone reach out?" is a good question as a heading | In this capture the page is mostly zeros and dashes. It is about a different site, but the nav label is just "Site". |
| Data | works with fixes | Q5 "check whether collection is working", partly: the headline names a problem | It never says "collection is working / not working". Several paragraphs are not readable by a non-engineer. |
| Settings | works with fixes | Retention choices, recap email, saved views | The retention radios have no default ("Not chosen yet"). Checkboxes are small. |

Answers to the five job questions, as a whole:

1. **What is happening now?** Yes, on Home and on the album report.
2. **What is next?** Yes. The Home "Next" card says that no recap is due and says when recaps are scheduled. Each album's "Recaps" card lists Day 3 and Day 7 with "Due" dates. The quiet-gallery case is covered by the wording "No new album since Sep 26, 11 days ago."
3. **Who is involved?** Only as counts of arrivals, with no names ("so no one can be named"). The photos people requested are shown. "Which photos they took" has no answer; I could not tell whether it was meant to.
4. **When and where is this read?** The recaps are built for it. The phone default is readable, and the text-200 view stays usable.
5. **What can I do from here?** Yes, on the album report. Home does not offer a next action beyond "See why events were rejected" and the launch links.

## 3. Ranked findings

### Blocks

None. Each surface can be used to do its job, even where the wording is bad.

### Slows

**S1. Home's "Needs attention" card cannot be acted on.**
Exact words: "The gallery's counter rejected 12,865 events on Oct 6, 31 times its usual 420 a day. Why was not recorded: they were counted before reasons were kept." (Home, all widths; Data headline repeats it.)
- The second sentence is not grammatical. It has no subject, and "they" has no antecedent.
- The comparison basis for "usual 420 a day" is not on Home. It appears only in the Data glossary: "a quiet day among the 14 complete days before".
- The card does not say whether real visitors were affected. Data shows "27 from known crawlers" out of 115,607 rejected, and 3,889 accepted, which a reader cannot interpret.
- Every album finding elsewhere has a "Next step". This one does not.
- Remedy: rewrite as "On Oct 6 the counter turned away 12,865 events, about 31 times a normal day (420, from the 14 days before). We cannot say why, because rejection reasons were not stored before Oct 6 (or whatever the true date is). Next step: open Data and check whether Oct 7 is back to normal." Add the sentence "Real visitor counts are/are not affected" if the rules can say it.

**S2. Home has no way into the latest recap.**
Q4 says the site is read "from a day 3 or day 7 recap". The Home "Next" card says only "No recap is due." There is no "Latest recap: Day 7, College Women's VB - Millikin, Oct 3" link. On the album report the recap links sit below the owner note form: desktop part 1, and phone part 5 of 6 or 7 of 8, in the "Recaps" card.
- Remedy: add the latest recap link to the Home "Next" card, and move the "Recaps" card to just under the headline numbers on the album report.

**S3. The album report is longer than its job and repeats itself.**
Owner phone is 8 screens (5,981 px) for a 43-photo album.
- The strip of 6 requested photos under "Photos people asked to download" is repeated as the first six cells of "Photos, most requested first" (desktop parts 1 and 3).
- "Photos people asked to download" and "Photos, most requested first" are also close in title.
- Three explanation paragraphs precede the numbers: "Week-1 figures use 7 full days ...", "Most of this album's counted photo opens ... could not sort ...", and the "What this cannot tell you" list, which is 3 to 8 bullets.
- A comparison table and a comparison chart ("Against other launches, first week") say the same thing.
- Remedy: drop the 6-photo strip and keep only the ranked grid. Fold the two small-print paragraphs into the "What this cannot tell you" list. Show the table or the chart, not both, by default.

**S4. Windows that differ are mixed in one paragraph.**
Exact words: "In week 1 (Sep 25 to Oct 1) there were 61 download requests, against a median of 15 for the 5 earlier launches. Over all 12 full days (Sep 25 to Oct 6) there were 65 download requests. 64 named a photo and 1 asked for the whole album."
Also: "As of Oct 7, over its first 7 days (Sep 25 to Oct 1) it is 2nd ..." The chart uses 12 days, the headline uses 7, and "13 photo opens so far" uses part of a day. Each number is labelled, so nothing is wrong. But the reader must hold three windows at once.
- Remedy: state week 1 in the headline block only. Put the 12-day figures in the chart caption. Drop "As of Oct 7" from the rank sentence.

**S5. Data page: unreadable explanations.**
- "Album details in these counts come from details filled in later from the current catalogue, details saved when each event happened and a mix of both. Details saved when an event happened are the ones true at that moment; details filled in later are the ones known when they were filled in."
- Terms with no plain meaning: "Event format 2 · 0 classification changes waiting to reach PostHog", "Submitted", "Confirmed", "Classification changes waiting".
- "3,889 accepted · 115,634 rejected · 70 duplicate" next to "Records are complete for all 30 days" invites the reading that collection is mostly failing.
- No sentence says whether collection is working now.
- Remedy: add a one-line verdict at the top ("Collection is working: events accepted on Oct 7, last at HH:MM") or ("not working because ..."). Move the glossary and the "Coverage" paragraph into a collapsed "How this works".

**S6. Largest text setting hides the navigation.**
WebKit phone at text-312 (home__owner__webkit__phone-390__text-312__p01of16.jpg): the header shows "Home" and "Albums". The next item is cut off, with a small circled arrow control (about 25 px) drawn over the "s". Site, Data and Settings are not visible without sideways scrolling. The brand name disappears at text-200 and text-312, which is acceptable.
- Remedy: let the nav wrap to several lines at large text, as it already does at text-200.

**S7. Photos page puts filters before photos.**
Photos phone default: the intro paragraph, the Albums/Dates/Count controls, "Apply", "More filters" and "Popular photos" all come before the first image, at roughly 1,100 px. Each card then leads with the album name in bold, such as "HS Girls VB - JCA at ACC - 09-22-2026" repeated down the page, and the photo number is secondary ("Number 5 of 2,244"). "Some of these photos are from albums published after the comparison period began. There is nothing earlier to compare them with, so they show their count and no change." is hard to parse.
- Remedy: collapse the filters into one "Filters" row and show the first row of photos on the first screen. Make the album name small, and show the open count with the photo.

**S8. Settings: nothing is chosen, and checkboxes are small.**
"Keep private records for: Until I delete them / 90 days / One year. Not chosen yet. Pick one to save these settings." The page opens with no default, and there is a "Save private settings" button above "Enable email delivery", which is greyed out ("Email delivery is unavailable because the server sender is not configured"). The "Allow linked analytics" and "Exclude this browser" checkboxes are about 14 px.
- Remedy: pre-select the safest retention default and say so. Increase checkbox hit areas to 44 px, or make the whole label row the target.

### Polish

**P1. "Site" in the nav means ninochavez.co.** On a gallery reporting site it reads as "this site". Also, Home carries a "Site, ninochavez.co" card in the same weight as the launches. Rename the tab "ninochavez.co" or "Portfolio site".

**P2. The "The other 4 launches" link** next to "Launches, newest first" looks like a heading, and the count is arithmetic (7 minus 3 shown). Use "All 7 launches".

**P3. "Export CSV" says nothing about what it exports.** It appears on Albums (and for visitors) and on each album report. Name the content: "Export album list (CSV)" and "Export this album's photos (CSV)".

**P4. "Shortlist these 6"**: six of what? Say "Shortlist the 6 most requested".

**P5. Chart reading.** The dashed median line is thin and near the baseline, so it is almost invisible, and in forced-colors all bars render black so the highlighted peak differs only by its "575" label. The y-axis shows only "0" and one top value. The sparklines on Home have no day labels beyond "Opens by day, week 1" and are placed at different horizontal positions on each row. Make the median line thicker, add a mid tick, and align sparklines.

**P6. Jargon on first read.** "counter", "events", "arrivals", "labeled 'profile'" (profile of what?), "tagged links", "Chicago days", "UTC days". Define "profile" in one line ("the link you put in your profile") or use the real name.

**P7. Contradictions between pages.**
- The album page says "2nd of the 7 launches", while the same album's day 3 and day 7 recaps say "2nd of the 6 launches". The recap footer explains it ("The live report counts later days and later launches"), but a reader switching between them will not.
- The Millikin album shows "The launch is over" under "Worth your attention", while Home calls the same launch the newest and "finished its first week".

**P8. Contrast-more** looks the same as default: the grey secondary text ("Opens by day, week 1...", "Published Sep 26") stays light grey. Forced-colors is fine except for the chart (P5) and the loss of the amber tint on "Needs attention", which keeps its text label.

**P9. Compare checkboxes on Albums phone** are about 20 px, with the word "Compare" beside them. The word probably extends the target, but I cannot tell from a capture.

**P10. Date field** shows "10/07/2026" (US order) beside Chicago-time copy elsewhere ("Oct 7"). Minor inconsistency.

## 4. What should not change

- The Home headline sentence and the "Next" card. They are the best thing on the site: one sentence with name, rank and the comparison basis.
- The statement of windows and the honest limits ("Counts are browser actions, not people", "Today, Oct 7, is partial and left out"). These make every number answerable.
- The recap pages: "As of Sep 29, 8:00 AM Chicago time", "Covers Sep 26 to Sep 28, 3 full days", and the "Written later from the records" badge. The dead-end "No such recap" page with exits is also good.
- "Next step: ..." and "Evidence: ..." on the album findings ("Open the album on a phone and a computer and check that its photos load. If they all do, nothing needs fixing.").
- The failure sentence on Home: "2 failures are too few to say this launch loads worse." It puts small numbers in context.
- The visitor note: "Shortlisting, recording what you did and private sharing notes need sign-in." It tells the visitor why a button is missing.
- The reflow of tables into cards at text-200, and the nav wrapping at text-200.
- The tabular ranked list on Albums at desktop.

## 5. What I could not judge from captures

- Whether the selected-photo panel exists on phone. On desktop, "Selected photo" shows Download requests, Opens, Favorites, "Open photo to share or download" and "Add to shortlist". On phone, the first photo has a selection outline but I found no equivalent panel in any of the 8 owner parts. It may open on tap.
- What "Compare", "Filter these photos" and "Shortlist these 6" do when used, and whether the chart below the Albums list works. Captures show only the empty "0 of 4 chosen" state.
- Real touch-target sizes, tap behaviour, scrolling inside the nav, focus order, keyboard use, and screen reader output.
- Whether the "forced-colors-query-only" WebKit captures differ from default, since WebKit cannot force colours. I only compared those to default.
- Numbers against truth: I judged only whether numbers say what they compare to.
- Cloudflare and PostHog content, which this capture build lacked ("not configured" / "could not be read"). The Site page and Home's site card therefore look emptier than production will.
- The sign-in flow. Visitor Settings offers "Sign in with a magic link" and I did not see it used.
- Pages and settings I sampled rather than read in full: most WebKit text-200 and text-312 pages other than Home, the Data page at phone text sizes, and the 90-day and 7-day period views.
