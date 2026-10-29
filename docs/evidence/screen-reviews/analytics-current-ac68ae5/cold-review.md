---
kind: cold
surface: analytics site (current)
build: ac68ae5
reviewed_by: cold subagent (no access to brief, code, or prior reviews)
captures: tab-overview.png, tab-albums.png, tab-photos.png, tab-sources.png, tab-measurement.png, page-sites.png
date: 2026-10-06
---

Limits: all six frames were viewable in full. The Measurement capture is very tall and downscaled, so its small print is hard to read. Job questions: Q1 now, Q2 next, Q3 who, Q4 when/where read, Q5 what to do. Q4 cannot be answered from any frame (nothing says which device or moment the page is for), so I do not repeat it per capture.

## Overview
- Eye lands: (1) blue "2,290" under "Recorded actions"; (2) the sparkline spike ("915 peak"); (3) the tab bar, which sits on top of the filter card and cuts off "Advanced filters".
- Q1 partly: 2,290 actions, one spike, no date on the spike and no album named. Q2: no. The one place that should say what to do reads "No actionable findings for this scope". Q3: "125 Browsers with any activity", with a disclaimer. Q5: nothing directly; "inspect album" is small grey text under each album name.
- Defects: "Previous equal period -684 actions" is a bare negative with no baseline or percent. "Inspector context: Album Re7kho" shows an opaque ID while the filter says "All albums". "Sign in with a magic link" appears twice. The left half beside "Contextual inspector" is empty. The three inspector buttons ("What does this support?", "What should I inspect?", "Compare this album") are pale and look disabled. The header says "Compare album activity and inspect the evidence", which names a method, not a purpose.

## Albums
- Eye lands: (1) the highlighted first row (1,011); (2) the "Selected album" panel; (3) the blue "Open report" column.
- Q1: partly (the top album got 1,011 opens). Q2: no. Q3: no. Q5: "Open album report" and "View album photos", but nothing says why.
- Defects: 8 numeric columns where Downloads, Favorites and Shares are mostly "0". The selected panel repeats the first row (1,011 / Not published / New album). "Open report" is repeated 12 times plus "Open album report" in the panel, so three links reach the same place. "Not published" and "New album" fill the Previous and Change columns for the two albums that matter most. "published Sep 25, 2026 (inferred)" is the only publish-date hint, and publish date is not a column or a sort. "Current · Photo Opens" next to "Album Opens" is confusing. "Page 1 of 22" and "254 matching albums" invite paging through a ranking nobody asked for. The panel text "there was nothing to compare. Its whole total is new activity, not growth" answers the owner's question 2 only by accident. This is still a ranked table, not a decision page.

## Photos
- Eye lands: (1) the photo grid; (2) the dark "13" count badges; (3) the blue "Export CSV · 2,224 rows" button.
- Q1: top photos are from the new albums, with 12-13 opens each, which is almost no spread. Q3 and Q2: no. Q5: "Shortlist" checkboxes and Export CSV, but not what a shortlist feeds.
- Defects: every title is cut off ("HS Girls VB - JCA at ACC - 0..."), so the tiles cannot be told apart by name. Every tile repeats "New album · not published in the previous period". "Page 1 of 186" for a ranking of 12-13 opens is noise. "Popular, Rising, Recently active" tabs are hard to tell apart at a glance.

## Sources
- Eye lands: (1) "profile 126"; (2) "album 1,238"; (3) the share icon on "Tagged arrivals".
- Q3 partly: 126 arrivals tagged "profile", so the personal site sends the traffic. Q1/Q2: no. Q5: no.
- Defects: the filter card for the whole report sits above two small lists, so the controls outweigh the content. The "Open locations" counts sum to 2,459, not 2,290, so they appear to mix album and photo opens while the filter says "Measure: Photo opens". "Unknown / no tag 911" is bigger than all tagged arrivals (153) and is unexplained. The bottom card "Linked source results are unavailable" is a dead block. Tag names ("share-x", "coverage") are never defined.

## Measurement
- Eye lands: (1) "Cloudflare comparison is unresolved"; (2) the long run of "Unavailable" labels; (3) the traffic table.
- This is a diagnostics page, not an owner page. Q1-Q5: none answerable.
- Defects: nine stacked cards. Six of seven "Linked journeys" read "Unavailable". "Delivery health is unavailable" and "No estimate is available" are boxed as if they were results. The "Traffic impact" table shows All traffic and Audience as identical numbers, "Excluded 0" and "Rank: 1 → 1" on every row, so it proves nothing. It also lists "136 albums" while Albums says "254". "Audience 384" against "2,290" and "Unclassified Audience 1,906" is never reconciled. The report-wide filters sit above content they do not affect.

## Sites page
- Eye lands: (1) "730" page loads; (2) the daily spike; (3) "Where attention went" cards.
- Best-composed frame. Q1: 730 loads, 120 entry visits, "-61% vs previous 30 days". Q3: "Direct / unknown 100", LinkedIn 10, Instagram 10; devices mobile 520. Q5: "Open gallery report".
- Defects: every figure is a round tens number (540, 40, 50, 100, 120), which suggests sampling, so it reads as rough. The "Worth your attention / No actionable findings" and "Inspect this report" block is the same empty block as in Overview. "Gallery report" tab, "All sites" button and "Open gallery report" are three routes to one place. It mixes "page loads" and "entry visits" and never says which matters.

## Across screens
- The same empty "Worth your attention" and "Contextual inspector" block recurs on Overview and Sites.
- The filter card (Albums / Period / Measure / Apply) appears on every tab, including Measurement and Sources where it changes little. Its tab bar position moves between captures (on top of it on Overview, inside it on Albums and Photos, above it on Sources and Measurement).
- Count mismatches (254 vs 136 albums; 2,459 vs 2,290) undermine trust in every number.
- The overlapping tab bar on Overview looks like a layout bug.

## Verdict
No. The owner can see that two new albums drew nearly all the opens in the last 30 days and that the profile site sends the traffic, but that is found by reading tables, and the screens never say it. No screen tells the owner what changed since the last visit, which album needs attention next, or what action to take. The one slot built for that says "No actionable findings", and four of six frames are tables, counts or "Unavailable" notices. "Is this a dead page?" is fair: the Albums tab is a spreadsheet of opens, and the owner's three quoted questions are still unanswered.

## The one structural change
Replace the tab set with one per-album "Latest album" view that opens on the newest published album and says in plain words how it is doing and where its viewers came from. The ranked table, the Photos grid and the filter card become secondary. Move Measurement into a collapsed "Data quality" footer, and keep "Sites" as the separate cross-site page.
