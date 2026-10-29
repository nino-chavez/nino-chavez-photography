# Status of every item in triage-3

Written by the worker who made the changes. "Fixed" means the change is in the code, covered by a test where it is a computed sentence, and seen in the worker's own captures. It is not a verdict from a reviewer. Capture paths are in `captures/` (the committed subset) unless marked "full set" (the 312% text size and WebKit frames are in the full set at `s9/after3-captures/` in the session scratchpad).

Branch `fix/analytics-acceptance-3`, from `origin/main` at 3e6dd9f (#213). Item 1 (B2) was resolved by #212 and is not touched here, except that the word "collector" in #212's sentences is changed, in #212's own files (`home.ts` `surgeWords`, `data-quality.ts` glossary and delivery rows).

| item | status | what changed | one capture |
| --- | --- | --- | --- |
| 2 · S3 findings four screens down | Fixed | "Worth your attention" now sits directly under the headline block on a phone (headline, findings, then the chart). On a desktop it spans the width under the headline and the chart, still before the photos | `album-DWdCET__visitor__chromium__phone-390__default__p02of7.jpg` |
| 2 · S1 the comparison said three or four times | Fixed | The launch-reach finding is no longer a card on the album report. Its one-line next step stays under the headline; the place and the median are said once, in the headline sentences. The rule itself is not changed, so Home, recaps and stored rows keep it. The launch-over finding no longer repeats the median in its own sentence (it stays in the finding's evidence), which also removes "their median was about 381" next to "381" | `album-Re7kho__owner__chromium__phone-390__default__p01of6.jpg` |
| 2 · S2 "open the page you are on" | Fixed | The day 7 next step reads "Look at the photos people asked to download." and the card that carried it is the headline's next step line. Test: no next step names the report | same capture |
| 3 · S4 navigation at large text | Fixed, in Chromium and WebKit; **not confirmed on a real device** | Wraps onto rows at 200%, scrolls with an arrow cue at 312%. See "The navigation decision" below | `home__visitor__chromium__phone-390__text-200__p01of8.jpg` (200%), `home__visitor__webkit__phone-390__text-312__p01of16.jpg` (312%) |
| 4 · S5 launch table cut off at 200% | Fixed | The "Against other launches, first week" table is the shared `ResponsiveTable` in its compact form: a table down to 19 rem wide (a 390 px phone at default size), cards below that. At 200% every launch is a card with its name, publication date and three figures | `album-DWdCET__visitor__chromium__phone-390__text-200__p09of25.jpg` |
| 5 · S6 each number leads with its window | Fixed | Download requests: "In week 1 (Sep 25 to Oct 1) there were 61 download requests, against a median of 15 for the 5 earlier launches. Over all 12 full days (Sep 25 to Oct 6) there were 65 download requests." One window per number, week 1 first; when nothing came after week 1 the second window is left out. One earlier launch says "against 15 for the 1 earlier launch", never a median of one. Tests pin all four cases | `album-Re7kho__visitor__chromium__desktop-1440__default__p01of4.jpg` |
| 5 · S13 one label | Fixed | "Download requests" everywhere a figure is labeled: Albums cards (the label never breaks; the window sits with the figure: "26 in week 1"), the recap window sentence, the gap finding, Data's totals and event counts, the correction and site notes. The three downloads event names that are not requests (prepared, handed off, failed, cancelled) are left as the event names they are | `albums__visitor__chromium__phone-390__default__p02of3.jpg` |
| 6 · S7 internal words | Fixed on every rendered surface; stored text noted below | "collector" is "the gallery's counter" (finding limits, Home's rejection sentence, Data's glossary and delivery rows, the traffic sentence). "linked-journey(s)" is "what visitors did after arriving". "denominator" is "measured against its own group of browsers". "backfill" and "event snapshot" are "details filled in later from the current catalogue" and "details saved when each event happened". "Grid showings" is "The gallery only began counting how often a photo appears in a grid on Sep 29." "the part after src= in its address" is "a short label added to the end of a shared link". A rendered-words gate (below) found 0 of these in 52 loads, and fired when a term was planted | `data__owner__chromium__desktop-1440__default__p04of5.jpg` (what visitors did after arriving, the tag definition) |
| 7 · S8 "written later" said four times | Fixed | Said once, in the badge, with the day: "Written later from the records, on Oct 6". The stored sentence ("This recap was written on Oct 6, after its checkpoint...") and the page's "as it was written" line are left out at read time; the stored row is unchanged. Test: both stored positions of the sentence, old and new | `album-DWdCET-recap7__visitor__chromium__desktop-1440__default__p01of2.jpg` |
| 7 · S9 recap as one paragraph | Fixed | The recap's first paragraph is taken apart at read time: "Published ..." in small type, the headline sentence as a large line ("266 photo opens in its first week."), the other facts as a short list. A text that does not have that shape is shown as written. No figure is parsed out of prose: the headline is the sentence the recap itself wrote first | same capture |
| 7 · stale next step | Fixed | "...while attention is still arriving" is removed from a recap read on or after the day its first week ended (the day the day 7 recap is due), with its list and heading when nothing else is in them. It stays on a recap read on day 3. The test reads the same stored recap on Oct 1 (kept) and Oct 2 (gone) and checks the stored text is unchanged | `album-DWdCET-recap3__visitor__chromium__desktop-1440__default__p01of2.jpg` |
| 8 · S10 asterisk on every date | Fixed | `recoveredDates()` decides per page from the dates that page shows. All recovered: no mark, one sentence ("Every launch date here was recovered afterwards from a log."). Some: the mark picks them out and the one note says what it means. None: neither. Applied on Home (cards and the quiet line), Albums, the album report (this album and the comparison table) | `home__visitor__chromium__desktop-1440__default__p01of1.jpg` |
| 8 · S11 Home's failure note outside its card | Fixed | The note sits inside the launch's box, under the card, outside the card's single link | same capture |
| 9 · S12 who is involved | Fixed | "Over Sep 26 to Oct 6, 31 arrivals came in through shared links, all labeled "profile". An arrival is one browser landing from a labeled link, counted once a day, so no one can be named. A visit with no label cannot be traced to a source." One sentence of sources per album | `album-DWdCET__visitor__chromium__phone-390__default__p05of7.jpg` |
| 9 · S17 unsorted share | Fixed on Home and on the album report; not on Albums or Site | Album report: "Most of this album's counted photo opens, Sep 25 to Oct 6 (80%), came from browsers the gallery's counter could not sort. They are counted, and they are not called human, so read these totals as an upper limit on what visitors did." Computed from the album's own classes (no new read: it is the report the arrivals already read). Home: the short form for the newest launch's first week ("Most (78%) of the newest launch's counted opens, Sep 26 – Oct 2, came from browsers the counter could not sort: an upper limit."), from one new read of that launch's classes. The first version took the gallery's last 7 days, which holds 0% unsorted; that was the wrong window for a headline that counts the launch week, and is why the read is the launch's | `album-Re7kho__visitor__chromium__desktop-1440__default__p01of4.jpg` |
| 10 · S14 Albums cards on a phone | Fixed | A launch card is about 195 px, not 400: First 3 days, Week 1 and Rank on one line, then First published and Download requests. "Status: Finished" is dropped when every launch has the same status (table column too). Albums on a phone: 3,136 to 2,502 px | `albums__visitor__chromium__phone-390__default__p02of3.jpg` |
| 10 · S15 verdict word on Home | Fixed | "...finished its first week 4th of 7 launches, with 266 photo opens, below the usual 381 for earlier launches." Above, below or level with, from the two numbers; one earlier launch is a figure ("below the 931 of the 1 earlier launch"), not a usual | `home__visitor__chromium__phone-390__default__p01of3.jpg` |
| 10 · S16 one date format on Data | Fixed | The event counts and the search and download evidence now say "Sep 29" and "Sep 30", like "History is kept since Jun 30". A rendered check found no ISO date in either role's words and fired on a planted one. The public projection's own label (ISO) is unchanged; Data reads its bounds | `data__owner__chromium__desktop-1440__default__p02of5.jpg` |
| 10 · S18 photo caption size | Fixed | Captions are two short lines by design (requests, then opens) at .88 rem, not .8 rem on one line that broke a word on a phone; the "Shortlisted" tag is .75 rem | `album-Re7kho__visitor__chromium__desktop-1440__default__p02of4.jpg` |

## Polish items from the third review, in files this pass touched

| item | status |
| --- | --- |
| P6 "skips Oct 3", "about 381" repeats 381 | Fixed: the launch-over evidence names every quiet day after the last open one ("0 photo opens on Oct 3–6"), and the finding no longer says the median a second time |
| P9 page background stops short on a wide screen | Fixed on Home, Albums and the album report (`min-height: 100dvh`); Data already had it |
| P10 "behind X" names the 3rd for a 4th and the 1st for a 2nd | Fixed: "...and the next one up is X (636)." for every rank |
| P11 "This address asks for neither" | Fixed: "This address is not a day 3 or day 7 recap. Recaps are written at day 3 and day 7 of a launch." |
| P1, P2, P3, P4, P5, P7, P8 | Not done: they are in files this pass did not touch (Settings, Site, the chart, the owner record form, Home's mini-charts, 312% Site and Data length) |

## The navigation decision

Choice: **wrap at 200%, a scrolling row with a visible arrow at 312%**, not one of the two alone. The reason is measured. Home at 390 px, first screen 844 px, so the page heading must start above 422 px (the first-screen gate's rule). Header height and where the heading starts:

| text size | one row that scrolls (the second pass) | links wrapped onto rows |
| --- | --- | --- |
| 200% | 86 px, heading at 203 | 186 px (2 rows), heading at 302: passes |
| 225% | | 202 px, 333 (Chromium); 248 px, 379 (WebKit): passes |
| 250% | | 279 px, 425: fails |
| 312% | 135 px, heading at 373 | 348 px (3 rows) heading at 587 in Chromium; 414 px (4 rows) at 652 in WebKit: fails |

So a wrap that fits at 200% fills the first screen with navigation at 312%. Under 16 rem of header width (about 150% text on a phone) the brand shrinks to its badge and the five links wrap with every one in view. Under 9.5 rem (about 235%) the links are one row that scrolls, opened on the current page, with a fade at each edge that has more beyond it and a round arrow (28 px at any text size) so a still picture shows there is more. The brand's badge is dropped there to give the row the full width. Full measurements: `navigation-measurements.md`.

Two defects found on the way, by the new gates, and fixed:

- Container queries cannot style their own container. The second pass put `flex-wrap`, `gap` and `justify-content` for the header inside a query on the header itself, so they never applied; the row sat 50 px in from the edge at 312%. The layout is now on an inner element.
- A browser scrolls a tabbed-to link only until it is partly in view. At 312% tabbing to "Albums" left 30% of it under the fade, so "Albums" read "Albu". A `focusin` handler brings the whole link in, clear of the fade (the fade is 28 px, in pixels like the arrow, because a fade in rem left no room beside a link at 312%).

What is not shown: a person tabbing or swiping on a phone. The gate focuses each link in turn, as Tab does, and checks it ends fully in the row and clear of the fade.

## Findings text on the album report and Home is a dry run

The cards under "Worth your attention" are read from the stored snapshot for the scope. A snapshot is replaced only when the scheduled job writes a new one, and the job compares findings text too (`snapshotFingerprint` includes `findings`), so the reworded rules reach the page on the first scheduled refresh after deploy, for any launch the job still refreshes (the first 16 days). On this server the stored snapshots still carry the old words ("collector", the repeated median, "Open the album report..."). So the captures use `harness/dryrun.mjs`: the real evidence loader and the real rules, run read-only (through the same preload that blocks every write), written to a file, and served by `harness/preload.mjs` in place of the snapshot's findings. Nothing is written to the database. It is a stand-in for the next refresh, not a measurement of production today, and the reader of the captures should know that the findings text in them is that.

Stored recaps are not simulated: their text is shown as stored. Four stored recaps still say "tagged links" and "the "profile" tag"; the page does not rewrite those words, and the rendered-words gate does not list them.

## Things for the reader of this pass to judge

- **Home's unsorted sentence is terse on purpose.** It ends "...could not sort: an upper limit." That wording was chosen to keep the owner's Home at one desktop screen (900 px); a clearer ending ("so read them as an upper limit") makes the footnote one line longer and Home 10 px over for the owner. The album report and Data carry the full sentence.
- **Home on a phone is 88 px over the two-screen density target** (1,776 px against 1,688). It was 49 px over before this pass. The extra is the one new sentence.
- **The findings text and the "Last checked" time beside it come from different places in the captures.** The text is the dry run; the time is the stored snapshot's. They will agree once the scheduled job has written the new snapshot.
- **The branch history holds an intermediate receipt commit** (`c0ab488`) recorded for an earlier source tree; the last commit that touches `docs/reader-audits/gallery-interface.json` replaces it. Nothing has been pushed.

## Not verified

- A real phone: iOS Safari at an accessibility text size, tabbing or swiping the navigation, and Safari's toolbar over the row.
- Real Cloudflare and PostHog panels (the server has no credentials).
- A screen reader. The arrow is decoration with an empty alternative; the links are what a screen reader meets.
- A real sign-in, and the owner forms in use.
- The findings and recap text as production will store it after deploy: only the dry run.
- The Home unsorted sentence for another launch or another week: it was read for one.
