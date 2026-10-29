---
kind: cold
reviewer: Claude Sonnet 5.5, fresh session; had not read the product's code, docs, design record or any earlier review
build: fix/analytics-acceptance at 15f5f71 (local development build reading production data, captured 2026-10-07)
inputs: cold-packet-2.md, after-captures/index.md, the captures
---

# Cold review 2: photographer's reporting site

How I looked: contact sheets built with PIL in my own scratch folder (s9/cs2/). I read every surface at phone 390 and desktop 1440 as visitor and owner in Chromium (home, albums, two album reports, five recap addresses, photos, site, data, settings), the largest-text frames (Chromium text-200, WebKit text-312, iOS simulator large and accessibility-xxl), contrast-more and forced-colors on home and the album report, and WebKit phone default on home, album and data. I did not open every one of the 2,364 files. I judged the owner extras on albums, site, data and settings, and the two page types that repeat (album, recap). The index says the Cloudflare and PostHog panels read "not configured" because this is a development build, so I judge how those states read, not the missing numbers.

## 1. Verdict

The gallery half of this site works. A tired photographer on a phone on day 3 gets the answer in the first screen: the newest album, its week-1 opens, its rank, and the line "No recap is due." The album report's first desktop screen (headline, one chart, download requests, tagged arrivals, buttons) is the best thing here and should not be touched. The site is let down by four things. First, the Data page opens with a verdict, "Nothing is wrong, but 2 parts of this page could not be read.", that its own numbers argue with (113,990 rejected events against 3,585 accepted, "Most recent confirmed event: none recorded"), so "is collection working?" cannot be answered from it. Second, the album page runs eight phone screens, and the comparison with earlier launches, which is the whole point of the product, sits below a 60-thumbnail grid. Third, the same hedges repeat so often that the page spends a third of its words on "(date recovered afterwards from a log)", "Counts are browser actions, not people" and three separate "What this cannot tell you" lists. Fourth, several numbers for the same launch sit on one screen under different windows (931 / 1,035 / 1,258 / 1,259), and a few counts contradict each other (247 albums "do not" have a launch date, then "Show the 130 albums without a launch date"). At the largest iOS text size, the first screen of every page is the brand and navigation, with no content in it.

## 2. Per-surface verdict

The five job questions are: (1) what is happening now, (2) what is next, (3) who is involved, (4) when and where is this read, (5) what can I do from here.

| Surface | Verdict | Answers on sight | Does not answer |
| --- | --- | --- | --- |
| Home | Works with fixes | Q1 (headline, rank, week-1 opens per launch), Q2 ("Next: No recap is due. Publishing an album schedules its day 3 and day 7 recaps."), quiet state ("No new album since Sep 26 ..., 11 days ago") | Q1's "compared with what": it gives rank only, not the median or the gap. Q3: nothing about people. Q5: nothing says the launch cards open the album (titles are black text, not link-coloured, in default view) |
| Albums index | Works with fixes | Q1 across launches (7 launches, 3 days, week 1, rank), Q5 (Compare, Export CSV, Find an album) | Contradicts itself on how many albums have no launch date (247 vs 130). The phone version is seven 490 px cards and the compare chooser sits at the very end |
| Album report (week 1 recap) | Works with fixes | Q1 fully (desktop first screen), Q3 partly (65 download requests, 20 arrivals, six most-requested thumbnails), Q5 (See all, Export CSV, Filter; owner adds Shortlist, Record what you did) | Runs too long; the comparison with earlier launches is last. "Who" is a single tag ("profile") with no gloss. The owner view ends in an empty white card |
| Recap day 3 / day 7 | Works with fixes | Q4 (a dated, bounded read: "As of Sep 29, 8:00 AM ... Covers Sep 26 to Sep 28"), Q2 (links to the other recap), Q5 (See the full live report) | The first thing it says is that it is late; the finding comes after. No chart, no thumbnails, one dense paragraph |
| Recap that does not exist (recap5) | Works | Says what it is and offers the three right exits | none |
| Photos | Works with fixes | Q5 (find the photos people opened or asked for) | Phone: the first screen is an intro paragraph and a filter form; photos start on screen 2 |
| Site | Works with fixes | Q5 (period and section filters, per-page action table) | Visitors read owner instructions they cannot act on ("Add the Cloudflare analytics settings to the site's server settings."). The headline is a question the page cannot currently answer |
| Data | Does not work for Q5 (collection check) | Counting rules, freshness, "what these words mean" (owner) | A trustworthy verdict. Owner delivery numbers look alarming and unexplained. Heavy jargon. Eight phone screens |
| Settings | Works with fixes | Q5 (preferences, saved views, retention) | A visitor and the owner see the same "Your ..." framing. "Private reports" holds a note saying recaps are public |

Day 3 / day 7 recap reading on a phone (Q4) works as a format. All four recap pages I saw carry "Written later from the records" and "This recap was written on Oct 6, after its checkpoint ... It was not written on the morning it was due." The page that is meant to arrive on day 3 therefore did not.

## 3. Ranked findings

Ranking is by what the finding costs the reader. "Blocks" means the reader cannot do the job from this screen. "Slows" means the job gets done with extra effort or doubt. "Polish" means the job is unaffected.

### Blocks

**B1. The Data page's verdict contradicts its own evidence, so "is collection working?" has no answer.**
- Where: `data__owner__chromium__desktop-1440__default__p01of5.jpg` and `data__visitor__chromium__phone-390__default__p01of8.jpg`.
- Headline: "Nothing is wrong, but 2 parts of this page could not be read." You cannot say nothing is wrong about parts you could not read.
- The owner "Delivery and volume" card reads "3,585 accepted · 113,990 rejected · 70 duplicate" and "Most recent confirmed event: none recorded". That is 97% rejected and no confirmed delivery, and nowhere does the page say whether that is normal. The glossary says "Rejected" includes known crawlers, so it may be fine, but the page never says so.
- The visitor version says "Sign in to see the counts ... Whether delivery has failed or is late is already in the status above", which points at the same headline.
- Remedy: Compute the headline from the evidence, e.g. "Can't tell yet: 2 sources could not be read", and next to "113,990 rejected" state the usual share ("about the same as the last 30 days" or "much higher").

### Slows

**S1. The album page puts its best evidence last and runs eight phone screens.**
- Where: `album-Re7kho__visitor__chromium__phone-390__default__p01of8.jpg` to `p08of8`.
- Screens 1-2 are the headline and chart; screen 3 repeats the downloads; "Worth your attention" and "Recaps" take screen 4; screens 5-7 are a 60-thumbnail grid ("Photos, most requested first" with "Show the other 60 photos"); the "Against other launches" table, which answers "how do its first days compare", is screen 7-8. On the 2nd album the two "Worth your attention" cards alone fill about two phone screens.
- Remedy: Show 12 thumbnails (two rows) before "Show the other N", and move "Against other launches" directly under the first chart.

**S2. The same hedges repeat until they bury the findings.**
- "(date recovered afterwards from a log)" appears in the home headline sub-line, again on every home launch card, in all seven rows of the albums list, in all seven rows of each album's comparison table, and in every album header ("Published Sep 25 (date recovered afterwards from a log)"). On the phone it adds two wrapped lines per row.
- "What this cannot tell you" appears three times on one album page (under the downloads card, inside each attention card). "Counts are browser actions, not people" appears in the downloads block, the attention card, the page footer and the Home footer.
- Remedy: Mark recovered dates once with a "Sep 26*" marker and one footnote per page, and keep one "What this cannot tell you" list per page.

**S3. Several numbers for one launch sit on the same screen with different windows, and read as errors.**
- On the JCA at ACC album: "931 photo opens in its first week", "Over Sep 25 to Oct 6, 65 download requests ... In week 1 ... that was 61", the line chart "This album: 1,035 by day 11" with a "Week 1: 931" label, and "Other launches (highest: HS Girls VB - JCA vs PNHS, 1,259 by day 13)" while the prose says "behind HS Girls VB - JCA vs PNHS - 08-25-2026 (1,258)". The same launch is 1,258 in one place and 1,259 in another.
- A small grey line explains "7 full days ... 12 full days", but the reader still has to hold three windows.
- Remedy: Use one window per screen. Put the day-11 totals only in the chart legend with the window in the axis title, and give the leaderboard number the same figure as the chart (or label why it differs).

**S4. Home gives a rank without saying what it is a rank of or how far from the middle.**
- "College Women's VB - Millikin at North Central finished its first week 4th of 7 launches." never says "by photo opens". The card says "266 photo opens in week 1 / 4th of 7 launches at day 7", and the album page says the median is 381, so this launch is below the median. The home page hides that; "4th of 7" sounds mid-pack.
- The iOS simulator frame (`ios/home__visitor__ios-safari-simulator__phone-390__text-large-default.jpg`) shows a better headline ("finished its first week in 4th place of 7 launches with 266 photo opens (Sep 26 to Oct 2)") than the Chromium and WebKit captures. The two builds' wording differs.
- Remedy: Put the measure and the comparison in the headline: "... 266 photo opens in week 1, 4th of 7 and below the median of 381."

**S5. The launch cards on Home do not look tappable.**
- In default view the album title on each home card is black, not link-coloured, and there is no chevron or "Open" label (`home__visitor__chromium__desktop-1440__default__p01of1.jpg`). Only forced-colors shows them as blue links.
- Q5's first action ("open the album's photos") is the most important and the least visible one on the first screen.
- Remedy: Render the title as a link (blue, underline on hover) and add a visible "Open album" affordance on the card.

**S6. The "who" question is answered by a tag with no meaning to the reader.**
- "20 arrivals came through tagged links, all from the tag "profile". Arrivals that did not use a tagged link cannot be traced to a source." The tag name is quoted but never explained (an Instagram profile link? the site's profile page?), and "arrivals" is a different unit from "photo opens", and neither is a count of people. Recaps say the same ("14 arrivals ... all from the "profile" tag").
- On the Data page, tags are `profile 129, links 15, coverage 11, share-x 1`, which reads as internal labels.
- Remedy: Describe the tag in words where it is used ("20 browsers arrived from your profile link") and use the same unit ("browsers") in every sentence about arrivals.

**S7. The "something failed" alarm is the second-loudest thing on Home with no scale.**
- "2 photo loads failed during the launch. 2 of the 64 photo loads with a recorded result failed, on Sep 29 – Oct 2." It sits in an amber-edged card under the newest launch, the owner gets Dismiss and Snooze buttons, and the next step is manual: "Open the album on a phone and a computer and check that its photos load."
- Two of 64 is 3%. The page gives no "normal" rate, and "64 loads with a recorded result" against 266 opens leaves the denominator unexplained.
- Remedy: Say what share of loads this is against earlier launches, and demote it to a one-line note when the share is within the usual range.

**S8. At large text sizes the first screen is chrome, not content.**
- iOS accessibility-xxl (`ios/home__visitor__ios-safari-simulator__phone-390__text-accessibility-xxl.jpg`, `ios/photos__visitor__ios-safari-simulator__phone-390__text-accessibility-xxl.jpg`): the whole first screen is a large "NC" badge, the three-line brand name, and four nav items; "Settings" is hidden behind Safari's toolbar. No heading or number is visible without scrolling.
- WebKit text-312 (`home__visitor__webkit__phone-390__text-312__p01of15.jpg`): the headline starts in screen 2.
- Chromium text-200 holds up well: the layout reflows, and the headline appears in screen 1.
- Remedy: At large text collapse the brand to the badge only and put the nav in a single horizontally scrollable row, so the page heading is in the first screen.

**S9. The recap pages open with an excuse, not the finding.**
- First lines of `album-DWdCET-recap3__visitor__chromium__phone-390__default__p01of2.jpg`: the title, "As of Sep 29, 8:00 AM Chicago time.", the badge "Written later from the records", then "This recap was written on Oct 6, after its checkpoint, from the records for those days. It was not written on the morning it was due." The finding ("207 photo opens ... 4th of the 7 launches") starts in the second paragraph, and it is a single dense paragraph of about 90 words.
- Remedy: Lead with a one-line finding ("Day 3: 207 opens, 4th of 7, median 337"), then the badge as a one-line footnote.

**S10. Album counts contradict each other on the Albums page.**
- Top: "254 public albums. 7 have a launch date ... The other 247 do not." Bottom: "Show the 130 albums without a launch date" under "ordered by photo opens in the last 30 complete days". The Data page says "137 of 254 public albums had at least one recorded photo open". 130 is probably "no launch date and some opens", but the button does not say so.
- Remedy: Rename the button "Show the 130 albums without a launch date that had opens (of 247)".

**S11. Owner instructions are shown to visitors, and settings frame both roles the same way.**
- Site page (visitor capture): "Is anyone looking at your profile and work, and did anyone reach out?" and "Add the Cloudflare analytics settings to the site's server settings." The Settings page says "Your analytics choices, private reports and saved views." with a visitor's "Exclude this browser from audience analytics".
- A visitor can do nothing about a Cloudflare setting.
- Remedy: Show visitors the neutral state ("Page loads are not available right now") and keep the setup instruction in the owner view.

**S12. The photo "Selected photo" sentence is garbled.**
- `album-Re7kho__visitor__chromium__desktop-1440__default__p03of4.jpg`: "Over Sep 29 to Oct 6, the days tiles on screen were recorded, this photo's tile appeared on screen in a gallery grid 13 times, and the photo was opened 3 times on those same days."
- Remedy: "From Sep 29 to Oct 6 this photo was shown in a gallery grid 13 times and opened 3 times." Drop "tiles on screen were recorded".

**S13. Data page jargon puts the page beyond a tired reader.**
- Examples: "linked journeys (PostHog)", "Unclassified (counted, not called human) 1,893" next to "Audience 454" (81% of counted opens are unclassified, with no comment), "Place 18 to 20. 16 with all traffic, 15 counted.", "Format 2 · 0 traffic corrections waiting". These are fine for an engineer reading on a desktop, and cost a phone reader the page.
- Remedy: Put a two-sentence "what this means for your numbers" under each block ("81% of opens are from browsers we could not classify, so treat the totals as an upper bound").

### Polish

- **P1. Empty white card at the bottom of every owner album page** (`album-DWdCET__owner__chromium__desktop-1440__default__p04of4.jpg`; also the last phone part of `album-Re7kho__owner__chromium__phone-390__default`): a bordered box with one divider and nothing in it. It reads as unfinished, probably an owner-only panel that rendered with no content.
- **P2. Dismiss / Snooze 7 days on Home** do not say what they dismiss or snooze. "Dismiss this alert" and "Snooze this alert for 7 days" cost nothing.
- **P3. The home sparkline ("Opens by day, week 1")** has no scale and the zero days are drawn as dashes, so a quiet day looks like a missing one. A caption "dashes = 0 opens" would settle it.
- **P4. "Written later from the records"** badge is repeated on every recap row and in every recap header. Once it is true of all recaps, it is the default and the badge is noise; show it only on the exceptions.
- **P5. Settings contradicts itself:** under "Private reports" a line says "Recaps ... are public and are not deleted with your private records."
- **P6. At text-312 the nested "launch" card pushes past its parent card's right border** on the Albums index (`albums__visitor__webkit__phone-390__text-312__p06of23.jpg`). Remove the extra inner padding at large text.
- **P7. The Albums phone cards wrap "Download requests, week / 1"** with the "1" on its own line. Use "Downloads, week 1".
- **P8. The "Compare launches" chooser is at the end of the phone list**, 7 cards away from the checkboxes it controls. Move the instruction line above the cards.
- **P9. Phone Photos page:** the intro paragraph and filter form take the first screen; photos start in screen 2-3. Collapse "Albums / Dates / Count" into one summary row ("All albums · Last 30 days · Photo opens — Change").
- **P10. The "Against other launches" chart text says "This album is the blue line."** The chart has direct labels ("This album: 1,035") so it works without colour, but the sentence points at a colour. In forced-colors the blue and dark-red lines differ only slightly.
- **P11. Dense desktop recap page:** the recap uses the left 55% of the screen and leaves the right side blank; there is room for the two charts the album page has.

## 4. What should not change

- **The album report's first desktop screen** (`album-Re7kho__visitor__chromium__desktop-1440__default__p01of4.jpg`): headline number, one comparison sentence, "Most of it came at once: 575 opens on Sep 26 ... (62% of the week)", the day-by-day bars with a dashed median line, then downloads and arrivals. Each number says what it is compared with and for which days.
- **The home "Next" card**: "No recap is due. Publishing an album schedules its day 3 and day 7 recaps." A quiet gallery says so in one plain line, and "No new album since Sep 26 ..., 11 days ago" does the same for Q1.
- **"Show these numbers as a table"** under the chart and **"Show the ranked launch table"**: a text route to every chart.
- **The "No such recap" page** (`r_Re7kho-recap5_dt.jpg`): it says what is missing and offers the three right exits.
- **The recap footer** "This is the recap as it was written. The live report counts later days and later launches, so its numbers can be different." It explains a number mismatch before the reader notices it.
- **Stated windows on counts** ("Counted over complete days in Chicago time", "Sep 30 – Oct 6. The 7 days before could not be read, so there is nothing to compare it with."): honest handling of missing comparisons. Keep the habit; fix the repetition (S2) and the clashing windows (S3).
- **Text-200 reflow in Chromium**: no clipping, one column, headlines first.
- **Contrast-more and forced-colors**: contrast-more darkens secondary text and keeps the hierarchy; forced-colors turns bars and the amber/blue accents to system colours, and "SOMETHING FAILED" is still a word, not only a colour.
- **Phone nav**: five short items in one row at default size, active item clearly marked.
- **The download-requests wording**: "Download requests are requests, not confirmed saved files." Keep the distinction.

## 5. What I could not judge from captures

- Whether the launch cards, thumbnails and "Open photo to share or download" actually open the right place. Every capture is a still frame and I did not click anything.
- Whether the empty card at the bottom of the owner album page (P1) is a real owner panel with no content, or an artifact of the harness owner. The index says the owner role is a harness owner, not a real sign-in.
- Real Cloudflare page loads and PostHog journeys: the build had no credentials, so Home, Site and Data show "not configured". I cannot say how those panels read when they have numbers, or whether "Nothing is wrong" fires correctly when both sources work.
- Whether 113,990 rejected events is normal. The page does not say, and I have no baseline.
- Touch-target sizes beyond what I could see: the 3-column thumbnail grid on a 390 px phone gives roughly 85 px tiles, which looks fine, but I could not measure target size or hit-testing.
- Screen-reader behaviour, keyboard order and the chart table alternative. Captures show the table link exists, not that it works.
- Motion, loading and error states of the "Show the other 60 photos" button, the compare chooser and the Dismiss / Snooze buttons.
- The owner forms (Save note, Record correction, Save view, Save private settings): I saw them filled with defaults and not submitted, so I cannot judge validation or confirmation messages.
- The iOS simulator set is three frames (home at default large text, home and photos at accessibility-xxl). I did not see the other surfaces in the simulator, and the home headline there differs from the Chromium and WebKit captures (S4), so I do not know which build the simulator ran.
