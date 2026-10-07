---
kind: cold
reviewer: Claude Sonnet 5.5, fresh session; had not read the product's code, docs or design record
build: a8bfd28 (production, captured 2026-10-07)
inputs: cold-packet.md, full-captures/index.md, the captures
---

# Cold review: photographer's private reporting site

Method note. I built contact sheets (3 phone parts side by side, 2 desktop parts stacked) for every surface, visitor and owner, Chromium phone-390 and desktop-1440 default, then looked at text-200, contrast-more, forced-colors, WebKit phone default and WebKit text-312. I opened single full-size parts when text was too small, notably `album-Re7kho__visitor__chromium__desktop-1440__default__p02of5.jpg` and `p03of5.jpg`, and `home__visitor__webkit__phone-390__text-312__p01of27.jpg`. I did not read anything outside the captures. Everything below is judged from pixels. All surfaces shown are finished launches; I never saw a launch in its first days, a quiet-gallery state with nothing yet published, or a day-3 recap page.

## Verdict

The album page is the strongest screen and is close to right: the first screen of `album-Re7kho` says "931 photo opens in its first week", then in plain sentences gives the comparison ("the 5 earlier launches had a median of 125", "2nd of the 7"), and the "Photos people asked to download" block with six thumbnails answers the question a photographer actually acts on. The rest of the site does the same job less well. Home leads with a headline about the absence of a new album and a total that it immediately disclaims ("so this is not a fair comparison"), then repeats the same "The launch is over" card under every launch, and on a phone it puts "Next" about three-quarters down the page. The Data page opens "Everything is current." while its own tables show unrecorded results, unavailable counts and a 740 versus 92 mismatch, and it is written in the vocabulary of the pipeline ("Recorded version-2 collection", "Unclassified (counted, not called human)"). The day-7 recap page is the album page with the recap pasted into the middle of it, so someone arriving from a recap link on a phone lands on the wrong heading and scrolls two screens to find the recap. At 200% text the layouts mostly hold but crush the launch card, the photo grid and some tables; at 312% they break down into one-word and one-letter columns. In forced-colors the selected state of every toggle disappears. Nothing here looks broken at a glance on a normal phone or desktop, and the numbers are consistently hedged ("browser actions, not people"), which is the right instinct. The job is mostly answered; it takes too much reading to get there.

## Per-surface verdicts

**Home** (home, visitor and owner): works with fixes.
1. What is happening now: answered on sight, but second-best. The headline "No new album since Sep 26 (inferred), 11 days ago." is true and useful. The paragraph under it ("349 ... The 7 days before had 1,544 ... not a fair comparison") is a comparison its author says not to trust. The real answer, "266 photo opens in week 1 / 4th of 7 launches at day 7", is one card down (phone part 1, bottom).
2. What is next: answered, in the right words ("No recap is due. Publishing an album schedules its day 3 and day 7 recaps."), but on phone it is in part 3 of 4 under every launch; on desktop it sits in the right rail at the top, which is good.
3. Who is involved: not answered here. No arrivals, no tags, no people-shaped information appears on Home.
4. When and where read: the phone layout is fine at default text size; the page is 2,424 px tall on phone, about three screens.
5. What can I do: the owner sees Dismiss and Snooze 7 days under each alert; visitors see nothing to do except "Evidence and limits" and "The other 4 launches". The cards are tappable but nothing says so.

**Albums** (index): works with fixes.
Launch table on desktop answers "compare launches at the same age" well (First 3 days, Week 1, Rank at day 7, Download requests). On phone each launch becomes a card with a six-field grid, correct but heavy. The undated list below it runs to 130 rows (25 shown, "Show 25 more (105 left)") and is the bulk of the page: 8,452 px on phone, 2,827 on desktop. Its job is not any of the five questions.

**Album (week 1 recap)** (`album-Re7kho`, `album-DWdCET`): works.
1 answered on sight (first screen, both sizes). 2 not on this page (the alert says "The launch is over" and offers no next checkpoint). 3 partly: "20 arrivals came through tagged links, all from the 'profile' tag", and the downloaded-photos strip. 4 fine on phone. 5 clearly answered: See all 120 photos, Export CSV, Filter these photos, and for the owner Shortlist these 6, Record what you did.

**Day 7 recap** (`album-Re7kho-recap7`): works with fixes, and this is the one I would fix first.
The page title is still "WEEK 1 RECAP / HS Girls VB - JCA at ACC", the first three screens are identical to the album page, and the actual recap ("HS Girls VB - JCA at ACC - 09-22-2026: day 7 recap") is a tinted box inside the Recaps card, about 1,300 px down on desktop and part 2 of 8 on phone. It also contradicts the page it sits on (see findings).

**Photos explorer** (`photos`): works with fixes.
Strong idea and a clear page title ("Photos across the gallery"). The unlabelled number badge on every thumbnail ("13", "12") is only explained by the Count dropdown above. Tile captions are only the album name, so ten tiles in a row read the same ("HS Girls VB - JCA at ACC - 09-22-2026"). The "Images / Table" toggle is the only way to get actual photo names.

**Site (ninochavez.co)** (`sites`): works with fixes, but is a different product.
This is a report on the photographer's portfolio site, not the gallery. It has a good H1 question ("Is anyone looking at your profile and work, and did anyone reach out?") and answers it: 346 page loads, 0 contact links clicked. It does not serve any of the five gallery job questions. On phone the page table hides its right-hand columns behind sideways scroll with no cue (see findings).

**Data** (`data`): does not work as written for its job ("check whether collection is working").
The headline answer is wrong or at least unearned: visitor says "Everything is current."; owner says "Nothing is wrong, but 2 parts of this page could not be read." The body is dense, jargon-heavy, and has three different counts for what looks like the same thing.

**Settings** (`settings`): works with fixes (owner), does not work (visitor).
Visitor view shows an "Analytics preferences" card with a "YOUR CHOICE" label and no control in it. Owner view shows the checkboxes and a radio group with none selected.

## Findings, ranked

### Blocks the job

**B1. The day-7 recap page is the album page with the recap buried in it.** `album-Re7kho-recap7__visitor__chromium__phone-390__default__p01` shows the same "WEEK 1 RECAP" label and the same first-screen numbers as the album page; the recap itself starts in part 2 of 8 under "Recaps". Someone who taps a "day 7 recap" link on a phone (job question 4) does not see a recap. Remedy: make the recap URL render only the recap, with its own title ("Day 7 recap: HS Girls VB - JCA at ACC"), and link to the full week-1 report from it.

**B2. The recap contradicts the page that links it.** The day-7 recap text says "That is 2nd of the 6 launches", "No single photo was requested more than 3 times, so there are too few requests to tell which photos people want most", and "14 arrivals came through tagged links". The album page directly above it says "2nd of the 7 launches", shows a photo requested 4 times under "Photos people asked to download", and says "20 arrivals". The day-3 and day-7 badges say "Written later from the records", and the recap says "It was not written on the morning it was due." A reader cannot tell which set of numbers is current. Remedy: label the recap as a snapshot at a date ("As of Oct 6, 12:03 AM") and, where it differs from the live page, say so in one line ("Since then: ... "); or drop the recap's duplicate numbers and show only what changed.

### Slows it

**S1. The Data headline contradicts its own body.** "Everything is current." (visitor) sits above "Sign in to see the counts.", a download row with Results "not recorded", "No eligible linked views match these dates", and "Cloudflare counted 740 page loads. The site's own counter recorded 92 page views ... not expected to match and neither one checks the other." Owner: "Nothing is wrong, but 2 parts of this page could not be read." plus "110,712 rejected" next to "3,462 accepted" in Delivery and volume (owner captures come from a local server, so I do not read the figure as live, but nothing on the page says what "rejected" means or whether 97% is normal). Remedy: write the headline from the worst state on the page ("Counting works; downloads and search results are not being recorded yet") and define "rejected" in one clause where it appears.

**S2. Home puts a number the page disowns above the number the reader needs.** "Gallery photo opens, Sep 30 – Oct 6: 349. The 7 days before (Sep 23 – 29) had 1,544. Both include the first week of College Women's VB ... so this is not a fair comparison." Remedy: delete the comparison, or replace it with the like-for-like line already used on the cards ("266 photo opens in week 1, 4th of 7 launches at day 7") as the lead sentence.

**S3. The same alert template repeats under every launch on Home.** "LAUNCH OVER / The launch is over / Photo opens fell to 0 over Oct 3–5. In its first 7 days it had ... Next step: Look at the photos people asked to download before choosing what to feature or share again. Evidence and limits" appears three times in the first 1,300 px (desktop), with the same next step each time. On phone this is why Home is three screens and "Next" is last. Remedy: show the alert once, for the newest launch; for older launches show the one-line card only.

**S4. "Photo opens fell to 0 over Oct 3–5" reads as a fault.** It is the stated reason for "The launch is over", so a quiet album is reported in the vocabulary of an outage, and it appears under a "Worth your attention" heading. Remedy: say "No one has opened a photo since Oct 2" and move it out of "Worth your attention", which should be kept for things that need action ("Something failed").

**S5. "Something failed" is alarming and under-explained.** Orange card: "2 photo loads failed during the launch. 2 of the 64 photo loads with a recorded result failed, on Sep 29 – Oct 2." The first sentence promises a failure; the second says 3%. The "Next step" ("Open the album on a phone and a computer and check that its photos load.") is a manual test with no stated pass condition. Remedy: add the threshold for concern, or demote to a footnote when under a stated rate.

**S6. "Next" is hard to find on phone.** `home__visitor__chromium__phone-390__default` part 3 of 4. Job question 2. Remedy: on phone, put the Next card directly under the headline, before the launch list.

**S7. Tables are clipped on phone with no visible cue.** Data page "Search and download evidence": columns "Recorded", "Results", "Errors" and "Latest" are cut mid-word ("not record", "1,4"). Site page "What visitors did on each page": the columns "90% of article reached", "30 seconds with article", "Last demo section reached" are not visible at all; only a sliver of the table's right border shows. Remedy: collapse each row into a card on phone as the Albums page already does, or add a visible scroll cue and a shadow edge.

**S8. Photo explorer thumbnails are anonymous.** Every tile reads "HS Girls VB - JCA at ACC - 09-22-2026" with an unlabelled badge ("13"). A reader cannot tell tiles apart, or what the badge counts, without checking the dropdown. Remedy: caption badge as "13 opens" (and "4 downloads" when sorting by downloads), and give each tile a photo number or frame filename.

**S9. Selected-photo panel visibly overlaps the next card on desktop.** `album-Re7kho__visitor__chromium__desktop-1440__default__p03of5.jpg`: the "Selected photo" card's lower edge sits on top of the launch-comparison card beneath it, cutting off its heading and first lines (only the tail "has the same numbers." shows). Remedy: make the right column's two cards stack in normal flow, or limit the sticky height to what fits in a 900 px viewport.

**S10. Selected-photo numbers contradict each other on one card.** "Opens 12" next to "Since Sep 29, this photo's tile appeared on screen in a gallery grid 13 times, and the photo was opened 3 times on those days." The second sentence is a different window and a different measure, and it reads as 12 versus 3. Remedy: drop the second sentence or label both counts with their date range.

**S11. Launch comparison chart is unreadable without effort.** `album-Re7kho` desktop part 3: eight thin lines, one thick, a single legend entry for "Other launches (highest: HS Girls VB - JCA vs PNHS, 1,259 by day 13)", no direct labels. "This album: 1,035 by day 11" sits two screens from "931 photo opens in its first week", which is a different horizon and looks like a mismatch. Remedy: label each line at its right end, and add "(day 7: 931)" to the legend entry.

**S12. Several dates per launch compete.** Titles carry an event date ("College Women's VB - Millikin at North Central - 09-23-2026"), the card says "First published Sep 26 (inferred)", the recap says "Due Sep 29 / Covers Sep 26 to Sep 28", and the alert says "Oct 3–5". There is no one-line timeline. Remedy: show "Event Sep 23 / Published Sep 26 (worked out from logs)" once, at the top of the album page.

**S13. Albums page spends its length on albums with no launch.** 130 near-identical rows or cards (8,452 px on phone), each repeating "Already public before records began" or "Its first publication was never observed". Remedy: collapse the undated list by default behind one line ("247 older albums with no launch date: show") and keep it sorted by recent opens.

**S14. "Who is involved?" is not answered anywhere in a human way.** The only person-shaped lines are "20 arrivals came through tagged links, all from the 'profile' tag" and "Browsers with any activity 127". "profile" is a link tag, not a person or a place. Remedy: say "20 visits came from the link in your profile" and, where the tag is the only source, say so once instead of "Arrivals that did not use a tagged link cannot be traced to a source."

**S15. Settings card with no control (visitor).** `settings__visitor__chromium__desktop-1440__default`: "Analytics preferences ... Turning it off stops new linked collection" in a bordered "YOUR CHOICE" card with nothing to turn off. Looks unfinished. Remedy: render the two checkboxes for visitors too, or hide the card and keep the link to the public preferences page.

**S16. Owner Settings looks unfinished in places.** The "Keep private records for" radios (Until I delete them / 90 days / One year) show none selected. The email block is plain lines of text with a disabled "Enable email delivery" button, and the sentence "Enabling records your explicit choice and sends nothing now." is garbled. Remedy: preselect the stored value, fix the sentence ("Turning this on records your choice; nothing is sent yet."), and group the email block under a heading.

**S17. Forced-colors drops the selected state of toggles.** `sites__visitor__chromium__desktop-1440__forced-colors__p01`: "7 days / 30 days / 90 days" and "All sections / Profile & work ..." all look the same; likewise "Images / Table" and "Popular / Rising / Recently active" on Photos (phone and desktop). In default mode selection is shown by a blue fill (colour alone). Remedy: add a non-colour marker such as a checkmark or heavy border, and set `aria-pressed` styling for forced-colors.

**S18. At 200% text the Home launch card is crushed.** `home__visitor__chromium__phone-390__text-200`: thumbnail kept at a fixed width, title squeezed into a ~150 px column ("HS / Girls / VB - / JCA at / ACC - / 09- / 22- / 2026"), sparkline shrunk to a sliver with "Daily opens, week 1" wrapped to four lines. Home grows from 2,424 px to 10,278 px. Remedy: below roughly 480 px or at large text, stack thumbnail above the title and let the sparkline take its own row.

**S19. At 200% the Photo explorer tiles lose the photos.** `photos__visitor__chromium__phone-390__text-200`: two columns, the image shrinks to a sliver, and titles break mid-word ("Colle / ge / Wom / en's"). Remedy: one column at large text, image first, and never hyphenate or break titles by letter.

**S20. Album thumbnails break mid-word at 200%.** `album-Re7kho` phone text-200, "Photos people asked to download": captions read "4 reques / ted". Remedy: allow the captions to wrap by word, or reduce to two per row.

### Polish

**P1. 312% text (WebKit)** is a stress setting, not a normal one, but note: content column narrows to roughly 120 to 160 px of 390 because of nested card padding, photo tiles break one letter per line ("C o l l"), the "Images / Table" toggle is cut at the card edge, the NC logo squashes to a pill and "Nino Chavez /" is clipped, and the nav stacks vertically so content starts on screen two (`home__visitor__webkit__phone-390__text-312__p01of27.jpg`). Remedy: reduce horizontal padding on nested cards below 480 px and let the nav become a collapsible menu.

**P2. Sparkline in each Home launch card has no scale.** Seven bars, no day labels, tiny values drawn as dashes (`▁ ▁`) that read as "no data" rather than "almost zero". Remedy: label first and last day and draw zero as zero.

**P3. "Page loads by day" chart on Site has no axis values.** A line with a peak and then flat; only a "Daily values" link. Remedy: label the peak and the baseline.

**P4. Referrer "127.0.0.1" appears in "Where visits came from".** It looks like test traffic leaking into the report. Remedy: exclude it, or label "your own machine".

**P5. Albums list "Photos 100".** About a dozen undated albums show exactly 100 photos (Bell Pepper Open - Official Gallery, Downers Grove North vs Plainfield, GCU vs UCLA, DU Women's Bowling ...). That looks like a cap rather than a count. I cannot verify it from captures; if it is a cap, it is wrong data shown as fact. Remedy: check, and label "100+" if capped.

**P6. "Worth your attention" and "Next step" appear on cards where there is nothing to attend to.** E.g. "Next step: Look at the photos people asked to download before choosing what to feature or share again" is generic advice, not tied to a deadline. Remedy: keep "Next step" for alerts that have an action and a reason.

**P7. Terminology that a first-time reader will trip on.** "(inferred)" next to dates (explained only in a footer sentence on Home), "Unclassified (counted, not called human)", "Written later from the records", "Recorded version-2 collection", "Linked journeys", "Tagged arrivals", "Audience / Operator" classes, "Experiments", "Rank at day 7". Remedy: put a one-clause definition at first use, and avoid "version-2" and "journey" in user-facing text.

**P8. Repeated "What this cannot tell you" blocks.** The same three bullets ("Counts are photo opens, not people. One person opening ten photos counts ten times.") appear in the page header side box and again inside each alert, plus a sentence in the page footer. Remedy: one definition per page, linked from the first number.

**P9. Small touch targets on phone.** "Compare" checkboxes on Albums cards, "Evidence and limits" disclosure links and the 3-up download thumbnails (about 60 px) look under 44 px. Remedy: enlarge the hit area of the checkbox and disclosure rows.

**P10. Owner and visitor look the same.** Nothing in the header marks a signed-in session (no name, no sign-out); the only difference is extra buttons. Remedy: show "Signed in" in the header with a sign-out link.

**P11. Owner date field defaults to "10/07/2026" (US order) beside a site that writes "Oct 7".** Remedy: use the same date format everywhere.

## What should not change

- The album page's top block: the sentence "931 photo opens in its first week", then the median comparison, then the single biggest day ("575 opens on Sep 26 ... 62% of the week"). It is plain, specific and comparable.
- "Photos people asked to download" with real thumbnails and request counts. It is the strongest action cue on the site.
- The caveats as short as "Counts are browser actions, not people." at the foot of pages, and every number carrying its window ("Sep 30 – Oct 6", "complete Chicago days").
- The Site page's H1 as a question, and its three KPI cards that each state what they compare with ("up 215% from 110 in the 7 days before").
- The Albums launch table on desktop (clear columns and ranking).
- The photo explorer concept: filters, tabs and a CSV that says "2,244 rows".
- Alert labels ("SOMETHING FAILED", "LAUNCH OVER") carry meaning in words, not colour alone.
- Contrast-more is an improvement of borders on an already-reasonable page; forced-colors is mostly sound (links, borders, charts survive) apart from toggle state.
- WebKit phone default matches Chromium; no engine-specific problem seen.

## What I could not judge from captures

- Real-use behaviour: whether tapping a launch card, thumbnail, tab or "Read the day 7 recap" goes where it looks like it should; sticky behaviour of the "Selected photo" column while scrolling (I only saw it overlapping in a still).
- Any launch in its first days, or a day-3 recap page: no capture shows a young launch, so "how its first days compare" is unjudged in its live state (only finished launches were shown).
- The quiet-gallery state ("nothing until the next publish") appears only as the Next card text; I did not see a page with no launches at all.
- Whether owner numbers are right: owner captures came from a local server (110,712 rejected events, "not configured" notices) and I treated them as layout evidence only.
- Whether "Photos 100" is a cap, whether "2,244 photos" is complete, and whether the 740 versus 92 gap is a measurement problem.
- Colour contrast ratios (I looked, I did not measure); I saw no failures by eye except small grey caption text at 11 px on desktop ("4 requested · 12 opens").
- Screen-reader behaviour, keyboard focus order, reduced motion, and the sort and filter controls' real function.
- Forced-colors in WebKit (query only, no rendering change) and contrast-more on owner pages beyond a spot check.
