# Second cold review: triage

The coordinating session wrote this after `cold-review-2.md`. The reviewer did not see it.

## Verdict and what changed

The second reviewer judged the fixed build blind. It had not seen the first review, the triage or the code.

- **Home and the recap views** now answer "what is happening now" and "what is next" in the first phone screen.
- **The album report's first desktop screen** is called the strongest part, and should not change.
- **Remaining issues:**
  - the Data page's collection check is not answered;
  - long phone pages;
  - repeated hedges;
  - windows that mix on one screen;
  - large-text headers that fill the first screen.

## Fixed in this PR

- **S12, the selected photo's sentence was garbled.** It now reads "Shown in a gallery grid 13 times and opened 3 times, Sep 29 to Oct 6. Grid showings are recorded only from Sep 29." The second sentence shows only when grid recording began after the album's window started. Checked on `/albums/Re7kho` and `/albums/DWdCET` from a local dev server reading production.

## Confirmed, and more than a screen defect

- **B1, the Data headline against the delivery numbers.** The rejected count is real. In production, `analytics_collection_delivery_counters` (read-only, 2026-10-07) shows rejections jump from about 400 a day (Sep 29 to Oct 1) to 24,882 on Oct 2, then between 12,865 and 27,842 a day through Oct 6. Accepted events stay in their usual range. No deploy landed between Oct 1 01:04 CDT and Oct 3. The collector records no reason for a rejection, so the cause is unknown. Some of its refusal paths (503 `recording_unavailable`) would be lost data. The investigation is filed as its own task. The headline rule needs a baseline: a surge against the usual rate is a problem to report, not "Nothing is wrong".

## For the next fix pass, ranked

Each item names the reviewer's finding.

1. **B1.** Rewrite the Data headline from the evidence, including a rejection surge against the usual rate. It depends on the rejection reasons from the separate task for its wording.
2. **S3.** One window per screen on the album report: 931 for week 1, 1,035 by day 11, and 1,258 against 1,259 for the same other launch. Make the leaderboard figure match the chart.
3. **S1.** Album report length on a phone, 8 screens. The earlier-launch comparison sits below a 60-thumbnail grid.
4. **S2.** The repeated hedges: "(date recovered afterwards from a log)", "Counts are browser actions, not people", and several "What this cannot tell you" lists on one page.
5. **S4.** The Home headline gives a rank with no measure and no median.
6. **S5.** Home launch cards don't look like links.
7. **S6.** "Arrivals" and the tag "profile" are unexplained.
8. **S7.** The photo-load failure card has no normal rate.
9. **S8.** At the largest text sizes, the header fills the first phone screen, and Safari's toolbar hides a nav item.
10. **S9.** Backfilled recaps open with the lateness note before the finding.
11. **S10.** The Albums index says "247 do not" against "Show the 130 albums without a launch date".
12. **S11.** Visitors see the owner's setup instructions on Site, for example "Add the Cloudflare analytics settings…".
13. **S13.** Data jargon: "linked journeys (PostHog)", "Unclassified (counted, not called human)", "Place 18 to 20".

Polish items P1–P11 are in `cold-review-2.md`.
