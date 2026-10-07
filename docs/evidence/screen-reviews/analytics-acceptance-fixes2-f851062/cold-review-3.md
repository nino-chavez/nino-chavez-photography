---
kind: cold
reviewer: Sonnet 5.5, fresh session; had not read the product's code, docs, design record or any earlier review
build: fix/analytics-acceptance-2 at a891661 (local development build reading production data, captured 2026-10-07)
inputs: cold-packet-3.md, after2-captures/index.md, the captures
---

# Cold review 3

How I looked. I read Home, Albums, both album reports (album-Re7kho = JCA at ACC, album-DWdCET = Millikin at North Central), the day 3 and day 7 recaps (album-Re7kho-recap3/-recap7, album-DWdCET-recap3/-recap7, plus the album-Re7kho-recap5 error page), Site, Data, Settings and Photos. I read them as visitor and owner at phone 390 and desktop 1440 in Chromium, whole, part 1 to N. I then read phone text-200 (Chromium), text-312 (WebKit, the largest setting the index lists), contrast-more, forced-colors, WebKit phone default for every surface, and the one iOS Simulator frame. Several desktop captures show a block of content twice because the last part overlaps the one before; I treated those as capture overlap, not as page defects. Owner captures differ from visitor captures only by owner extras (forms, buttons, the Data problem banner) and by the "not configured" wording that the packet explains.

## 1. Verdict

The first screen of Home and of each album report answers the main question well: the headline names the latest launch, gives its first-week opens, and compares it with a median ("266 photo opens against a median of 381 for earlier launches"), and the "Next" card says plainly that nothing is due. That is the best thing in the set and it works on a phone, including a real iPhone frame. The product then loses the reader in three ways. The album reports repeat the same comparison three or four times and bury the most urgent item ("Something failed") several screens down on a phone. Wording keeps leaking internals ("collector", "linked journeys", "denominator", "arrivals", "tag", "backfill") onto pages a photographer reads on a phone. And at large text the navigation collapses to a clipped "Home" and one key table is cut off. The Data page tells a visitor "No problem was found in the rest" while the same capture as owner shows "Rejected events are about 50 times their usual rate", and nothing on Home or the album pages tells the owner about that. Nothing looks broken in the sense of blank or crashed; the risk is a reader who stops trusting the numbers or never reaches the one that matters.

## 2. Verdicts by surface

Job questions: Q1 what is happening now, Q2 what is next, Q3 who is involved, Q4 when and where read, Q5 what can I do.

| Surface | Verdict | Q1 | Q2 | Q3 | Q4 | Q5 |
| --- | --- | --- | --- | --- | --- | --- |
| Home (home__*) | works with fixes | Yes, headline, first screen on phone and desktop | Yes, "Next: No recap is due. Publishing an album schedules its day 3 and day 7 recaps." | No. Home never says who or how they arrived | Yes on phone, two screens | Partly. Links to albums and the site report; failure note is easy to miss; nothing about collection health |
| Albums (albums__*) | works with fixes | Partly, table gives rank, no verdict | n/a | No | Desktop yes; phone is a very long card list | Yes: search, Export CSV, Photos across all albums, Compare |
| Album report (album-Re7kho, album-DWdCET) | works with fixes | Yes, top of page | Partly, the recap list shows both recaps as past | Partly. Counts of "arrivals" by "tag", never people; the packet's "which photos they took" shows as "Photos people asked to download" | Desktop good; phone is 6 to 7 screens and the alert is far down | Yes, owner has Shortlist, Record what you did, Export CSV, Filter; two ways to record a change |
| Recaps (-recap3, -recap7) | works with fixes | Yes, in one dense paragraph | Yes, button to the other recap | Same as album | Phone readable; pinned to the left third of a desktop screen | Weak: "See the full live report" only |
| Recap error (-recap5) | works | n/a | n/a | n/a | n/a | Yes: "No such recap" with three buttons |
| Site (sites__*) | works with fixes | Not the job; answers its own title partly | n/a | n/a | n/a | Contact and outbound counts; most of it "not available right now" in this build |
| Data (data__*) | does not work for a non-engineer; works for the owner's headline | Visitor: contradicts the owner's capture | n/a | n/a | Very long (51 screens at text-312) | Owner: headline alerts. Visitor: "Sign in to see the counts" |
| Settings (settings__*) | works with fixes | n/a | n/a | n/a | n/a | Yes, but visitors read owner-addressed copy |
| Photos (photos__*) | works | n/a | n/a | n/a | Desktop yes | Yes: filters, Images/Table, Export CSV |

## 3. Ranked findings

### Blocks the job

**B1. The visitor Data page says "No problem was found in the rest" while the owner's Data page shows a large problem.**
- Files: data__visitor__chromium__desktop-1440__default__p01of4.jpg ("2 parts of this page could not be read. No problem was found in the rest.") against data__owner__chromium__desktop-1440__default__p01of5.jpg ("DATA PROBLEM · SEP 7 – OCT 6 / Rejected events are about 50 times their usual rate since Oct 2. The cause is not recorded yet. They have averaged 21,887 a day against about 420 before").
- The delivery numbers (3,881 accepted, 115,393 rejected) are hidden from the visitor, yet the visitor headline asserts all-clear.
- Remedy: when delivery counts are not shown to the viewer, change the headline to "Collection health is shown to the owner only" instead of "No problem was found".

**B2. The only urgent collection warning is on Data alone; Home gives the owner no hint.**
- Files: home__owner__chromium__desktop-1440__default__p01of1.jpg and the owner album captures show nothing about rejected events, while Data shows a 50x spike.
- Q5 includes "check whether collection is working", and the owner can only find the answer by opening Data.
- Remedy: put a one-line collection-health row (green or amber, linking to Data) in the Home "Site" column, shown whenever Data's headline is a problem.

### Slows the job

**S1. The album report states the same comparison three or four times.**
- File: album-Re7kho__visitor__chromium__desktop-1440__default__p01of4.jpg. "125" appears in "At the same age, the 5 earlier launches had a median of 125 photo opens", again in "Launch reach / 1 of the 5 launches before it had more photo opens by day 7. Their median was 125", again in the chart legend, and the rank "2nd of the 7" appears in the paragraph and in the comparison table. DWdCET does the same with 381.
- Remedy: keep the headline paragraph and the chart, and delete the "Launch reach" card or fold its Next step into one line.

**S2. "Worth your attention" tells the reader to open what they are already reading.**
- File: album-Re7kho__owner__chromium__desktop-1440__default__p01of4.jpg: "Next step: Open the album report to see which photos people asked to download." The page is the album report, and the list is two blocks above.
- Remedy: change it to "The photos people asked for are listed above" or remove the card when it adds nothing.

**S3. On a phone, the failure alert is about four screens down.**
- File: album-DWdCET__owner__chromium__phone-390__default__p03of7.jpg and p04of7.jpg. The order is headline, chart, a seven-row table, the download paragraph, a seven-bullet "What this cannot tell you" list, the "Where you shared this album" form, and only then "SOMETHING FAILED: 2 of 64 photo loads failed during the launch".
- Remedy: on phone, move "Worth your attention" directly under the headline paragraph, and collapse "What this cannot tell you" behind a disclosure.

**S4. At large text the navigation is clipped and the rest is hidden.**
- Files: home__visitor__chromium__phone-390__text-200__p01of7.jpg shows "Home" and half of "Albums" with an edge fade; home__visitor__webkit__phone-390__text-312__p01of14.jpg shows only "Home". Site, Data and Settings are not visible; whether the strip scrolls cannot be judged from a still.
- Remedy: let the five nav items wrap onto two lines at large text instead of scrolling a single strip.

**S5. The "Against other launches, first week" table is cut off at text-200, losing the numbers that matter.**
- File: album-DWdCET__visitor__chromium__phone-390__text-200__p05of23.jpg. The columns read "Album | 3 days | Wee", and cells read "1,2", "2", "1". The Week 1 and Rank columns are cropped with no visible scroll cue.
- Remedy: below about 480 px, render this table as stacked cards like the Albums list does, or let the columns wrap.

**S6. Windows and denominators change within one paragraph.**
- File: album-Re7kho__visitor__chromium__desktop-1440__default__p01of4.jpg: "Over Sep 25 to Oct 6, 65 download requests were made. In week 1 (Sep 25 to Oct 1) that was 61, against a median of 15." Two windows, one sentence. The tagged-arrivals sentence below uses Sep 25 to Oct 6 (20) while the recap says 14 for the first seven days.
- Related: the album says "2nd of the 7", the day 7 recap says "2nd of the 6 launches" (album-Re7kho-recap7 p01), with only a small-print footer explaining it.
- Remedy: lead each number with its window ("61 in week 1, against a median of 15") and give the full 12-day total only once, in smaller type.

**S7. Wording leaks internals.**
- Quoted from the captures:
  - "Counted as the collector labeled each visit when it arrived. Later traffic corrections are not applied to failures." (album-DWdCET desktop p01 and phone)
  - "A failed load can work on a retry."
  - "Shown in a gallery grid 13 times and opened 3 times ... Grid showings are recorded only from Sep 29."
  - "A tag is the label on a shared link, and an arrival is one browser landing from it, counted once a day."
  - Data: "linked-journey", "denominator", "backfill", "event snapshot", "Unclassified (counted, not called human)", "the part after src= in its address".
- Remedy: replace "collector" with "the gallery's counter", explain "tag" and "arrival" once in a single sentence, and move the Data page's glossary vocabulary behind "What this means".

**S8. Recaps read as late and stale at once.**
- Files: album-Re7kho-recap3__visitor__chromium__desktop-1440__default__p01of2.jpg. The page says "As of Sep 28, 8:00 AM Chicago time", then carries a badge "Written later from the records", then "This recap was written on Oct 6, after its checkpoint ... It was not written on the morning it was due", then "This is the recap as it was written." That is the same fact four times. Its advice, "See which photos people are opening and downloading while attention is still arriving", is stale by Oct 6.
- Remedy: keep the badge and one sentence; drop the other two; and omit "while attention is still arriving" when the recap was written late.

**S9. Recap pages are a single dense paragraph pinned to the left third of a desktop screen.**
- Files: album-DWdCET-recap7__visitor__chromium__desktop-1440__default__p01of2.jpg. Roughly 100 words of prose with six numbers, no chart, no big number, 600 px of 1440 used.
- Remedy: lead with the one number ("266 photo opens in the first week, 4th of 7") in large type and put the other facts in a short list; this is the screen read on a phone in the days after publishing.

**S10. The asterisk on every launch date carries no information.**
- Files: home__visitor__chromium__desktop-1440__default__p01of1.jpg, albums__visitor__chromium__desktop-1440__default__p01of2.jpg. All seven launches show "Sep 26*", "Sep 25*", "Aug 28*" ... with the footnote "Date recovered afterwards from a log". When every date is flagged, none stands out, and the footnote repeats on every page.
- Remedy: say once under the Home headline that all launch dates were recovered from a log, and drop the asterisks.

**S11. Home's failure note floats between two cards.**
- File: home__visitor__chromium__desktop-1440__default__p01of1.jpg. "2 of 64 photo loads with a recorded result failed (3%). Every other album ... had 0% (0 of 146). That is higher, but 2 failures are too few to say this launch loads worse." sits outside any card, indented, directly above the next launch card, so it looks like it belongs to the second launch. It also switches vocabulary from "photo opens" to "photo loads".
- Remedy: place it inside the first card as a labelled row ("Loading problems: 2 of 64, too few to call").

**S12. "Who is involved" is only answered as counts.**
- Files: both album reports. "31 arrivals came through tagged links, all with the tag 'profile'" and thumbnails labelled "4 requested". The packet's "small group, how they arrived" has no names or group size, and the page itself says "Counts are browser actions, not people." Data shows tags "profile 129 / links 15 / coverage 11 / share-x 1", which the album does not mention.
- Remedy: add one line to the album ("Mostly from your profile link; 31 of 31 arrivals") and state plainly that the product cannot name people.

**S13. Phone and desktop label the same column differently.**
- Files: albums__visitor__chromium__desktop-1440__default__p01of2.jpg ("Download requests, week 1") against albums__visitor__chromium__phone-390__default__p02of4.jpg ("Downloads, week 1"). The page's own note says "download requests are requests, not saved files".
- Remedy: use "Download requests" everywhere.

**S14. The Albums phone list is very long for a quick look.**
- File: albums__visitor__chromium__phone-390__default__p02of4.jpg to p04of4. Seven cards of about 400 px each; "Status: Finished" is on all seven and carries nothing.
- Remedy: drop the Status line when every row shares it, and show First 3 days, Week 1 and Rank as one line per card.

**S15. Home does not call the result good or bad.**
- File: home__visitor__chromium__phone-390__default__p01of2.jpg. "4th of 7 launches ... 266 photo opens against a median of 381" requires arithmetic; the five-line phone headline is heavy.
- Remedy: add a verdict word ("below the usual") and trim the title to the album name once.

**S16. Dates inside Data disagree: three different "start" dates.**
- File: data__visitor__chromium__desktop-1440__default__p01of4.jpg: "History is kept since Jun 30", "Search and download evidence starts on Sep 30", "Detailed event counts begin 2026-09-29". Two formats (Sep 30 and 2026-09-29) as well.
- Remedy: a small three-row "what is recorded since when" table in one date format.

**S17. 81% of counted opens are unclassified, and Home and the albums never say so.**
- File: data__visitor__chromium__desktop-1440__default__p01of4.jpg: "81% of the counted actions came from browsers the collector could not sort ... read these totals as an upper limit". Home's headline presents 266 opens as if audience.
- Remedy: add "includes browsers that cannot be classed as human; see Data" to the footnote under the Home headline.

**S18. Photo caption text is small and the selected-photo side panel is far from the grid.**
- File: album-Re7kho__visitor__chromium__desktop-1440__default__p02of4.jpg. Captions such as "1 requested · 12 opens" run at roughly 11 to 12 px in a grid of 120 thumbnails; on phone the caption wraps to two lines ("opens" alone).
- Remedy: shorten to "4 req · 12 opens" or show two lines by design, and show 12 on phone, as it already does.

### Polish

**P1.** The visitor Settings and Site pages address the owner: "Whether this browser is counted when you look at your own site" and "Is anyone looking at your profile and work, and did anyone reach out?" (settings__visitor, sites__visitor). Say "the photographer's site" or hide owner-only copy for visitors.

**P2.** WebKit checkboxes on Settings are very faint (light grey outline, about 14 px; settings__visitor__webkit__phone-390__default__p01of2.jpg). Chromium's are darker. Darken the border and make the label the tap target.

**P3.** In forced-colors the album chart's bars all become black, so the highlighted peak day cannot be told apart (album-DWdCET__owner__chromium__desktop-1440__forced-colors__p01of4.jpg); the "106" label still identifies it. The "Instagram story" placeholder looks like a filled value in forced-colors and light grey in default. Contrast-more darkens borders but leaves grey secondary lines ("Week-1 figures use 7 full days ...", "Worked out from complete days only") visibly the same.

**P4.** Owner Settings nests three cards with a repeated heading ("Private reports" / "PRIVATE REPORTING SETTINGS" / "Private records and launch recaps"), and the radio group has no default ("Not chosen yet. Pick one to save these settings.") above a Save button (settings__owner__chromium__desktop-1440__default__p01of2.jpg).

**P5.** Album owner page has two routes to record a change: the "Record what you did" button and the "Add a note" form (album-Re7kho__owner__chromium__desktop-1440__default__p01of4.jpg). The Day field shows "10/07/2026", unlike the "Sep 26" style everywhere else.

**P6.** "The launch is over: No one has opened a photo since Oct 2 ... 0 photo opens on Oct 4–6" skips Oct 3 (album-DWdCET desktop p01). Also, "their median was about 381" repeats a number already given as 381.

**P7.** The Home "Opens by day" mini-charts have no day labels and no shared scale, so cards cannot be compared with each other (home__visitor__chromium__desktop-1440__default__p01of1.jpg).

**P8.** At text-312, "/photography" touches the card edge on Site (sites__visitor__webkit__phone-390__text-312__p05of18 onwards), and Data runs 51 screens (data__visitor__webkit__phone-390__text-312).

**P9.** On short desktop pages the page background stops about 740 px down and a lighter strip fills the rest (home__visitor__chromium__desktop-1440__default__p01of1.jpg).

**P10.** "Behind Chicago Big Dig 2026 - North Avenue Beach (636)" for a 4th place names the 3rd, while the JCA album's "2nd, behind ... (1,258)" names the 1st. Use one rule.

**P11.** The recap-5 error page says "This address asks for neither." The page works, but "asks for" is odd; try "This address is not a day 3 or day 7 recap."

## 4. What should not change

- The Home headline sentence, the "No new album since Sep 26*, 11 days ago" line and the "Next" card. They answer Q1 and Q2 on the first phone screen (confirmed also in the iOS Safari frame, ios/home__visitor__ios-safari-simulator...png).
- The honest uncertainty wording on Home: "That is higher, but 2 failures are too few to say this launch loads worse." Keep it, just move it into the card (S11).
- "What this cannot tell you" as an idea, and "Counts are browser actions, not people."
- "Something failed" / "Launch over" cards with Next step and Evidence lines, especially "Open the album on a phone and a computer and check that its photos load. If they all do, nothing needs fixing." Concrete and actionable.
- Showing the album's own bar chart against a dashed median line, with "Show these numbers as a table".
- "Photos people asked to download" with thumbnails and the buttons "See all 120 photos", "Shortlist these 6", "Export CSV".
- The recap pair with "See the full live report" and the cross-link between day 3 and day 7.
- The owner Data headline pattern ("Rejected events are about 50 times their usual rate since Oct 2. The cause is not recorded yet.") and its "What these words mean" glossary. The fault is where it is shown, not how it reads.
- The "No such recap" page, and the layout parity between Chromium and WebKit.

## 5. What I could not judge from captures

- Real production Cloudflare and PostHog behaviour. This build shows "not available right now" and "not configured", so Site, Home's right column and Data's two "could not be read" rows are shown as dev artifacts; I cannot say how the real pages look.
- Whether the nav strip scrolls at large text, whether the cropped launch table scrolls sideways, the Compare chart (no launches ticked in any capture), "Show the other 60 photos", the Filter and Table views, every tap target's real size, focus order, focus rings and screen-reader behaviour.
- The 8:00 AM recap timing: all recaps here were written late ("Written later from the records"), so the on-time recap experience, and what Home's Next card shows when a recap really is due, were not captured.
- The owner is a harness owner, not a real sign-in: the magic-link flow, saving a note, snoozing or dismissing a note, recording a correction.
- Whether the 50x rejected-events figure is real or a harness artifact; I only judged how it is presented.
- WebKit forced-colors (only the query-only variant exists), iOS accessibility text sizes (Safari did not apply them), and Chromium text-312.
