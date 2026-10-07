# Page heights, before and after

Document height in CSS pixels at default text size, Chromium, one load per row. Heights are numbers, not a verdict.

- **Before:** `origin/main` at 3e6dd9f (the merge of the second fix pass), served by this worktree's development server before any edit, reading production data.
- **After:** this branch at 423551e, the same server and the same data, read within the same hour as the captures.
- One caveat on the album report. The stored findings on this server still carry the wording of the last scheduled refresh. "After" is measured with the findings the real rules compute now (a read-only dry run of the next refresh, described in `mechanical.md`), so it includes the launch-reach merge for the album that has that finding.

## Visitor

| surface | width | before | after | change |
| --- | --- | --- | --- | --- |
| home | phone-390 | 1,737 | 1,776 | +39 |
| home | desktop-1440 | 900 | 900 | +0 |
| albums | phone-390 | 3,136 | 2,502 | -634 |
| albums | desktop-1440 | 1,313 | 1,313 | +0 |
| album-Re7kho | phone-390 | 4,358 | 4,228 | -130 |
| album-Re7kho | desktop-1440 | 3,157 | 3,135 | -22 |
| album-DWdCET | phone-390 | 5,021 | 5,217 | +196 |
| album-DWdCET | desktop-1440 | 2,899 | 3,086 | +187 |
| album-Re7kho-recap3 | phone-390 | 1,468 | 1,360 | -108 |
| album-Re7kho-recap3 | desktop-1440 | 946 | 920 | -26 |
| album-Re7kho-recap7 | phone-390 | 1,396 | 1,425 | +29 |
| album-Re7kho-recap7 | desktop-1440 | 946 | 985 | +39 |
| album-DWdCET-recap3 | phone-390 | 1,496 | 1,500 | +4 |
| album-DWdCET-recap3 | desktop-1440 | 979 | 1,018 | +39 |
| album-DWdCET-recap7 | phone-390 | 1,520 | 1,526 | +6 |
| album-DWdCET-recap7 | desktop-1440 | 1,030 | 1,045 | +15 |
| photos | phone-390 | 2,751 | 2,751 | +0 |
| photos | desktop-1440 | 1,307 | 1,307 | +0 |
| sites | phone-390 | 2,446 | 2,446 | +0 |
| sites | desktop-1440 | 1,322 | 1,322 | +0 |
| data | phone-390 | 6,148 | 6,306 | +158 |
| data | desktop-1440 | 2,950 | 2,950 | +0 |
| settings | phone-390 | 964 | 964 | +0 |
| settings | desktop-1440 | 900 | 900 | +0 |

## Owner

The owner adds forms on the album report, Data and Settings.

| surface | width | before | after | change |
| --- | --- | --- | --- | --- |
| home | phone-390 | 1,737 | 1,776 | +39 |
| home | desktop-1440 | 900 | 900 | +0 |
| albums | phone-390 | 3,136 | 2,502 | -634 |
| albums | desktop-1440 | 1,313 | 1,313 | +0 |
| album-Re7kho | phone-390 | 5,019 | 4,787 | -232 |
| album-Re7kho | desktop-1440 | 3,599 | 3,527 | -72 |
| album-DWdCET | phone-390 | 5,784 | 5,981 | +197 |
| album-DWdCET | desktop-1440 | 3,380 | 3,546 | +166 |
| album-Re7kho-recap3 | phone-390 | 1,468 | 1,360 | -108 |
| album-Re7kho-recap3 | desktop-1440 | 946 | 920 | -26 |
| album-Re7kho-recap7 | phone-390 | 1,396 | 1,425 | +29 |
| album-Re7kho-recap7 | desktop-1440 | 946 | 985 | +39 |
| album-DWdCET-recap3 | phone-390 | 1,496 | 1,500 | +4 |
| album-DWdCET-recap3 | desktop-1440 | 979 | 1,018 | +39 |
| album-DWdCET-recap7 | phone-390 | 1,520 | 1,526 | +6 |
| album-DWdCET-recap7 | desktop-1440 | 1,030 | 1,045 | +15 |
| photos | phone-390 | 3,284 | 3,284 | +0 |
| photos | desktop-1440 | 1,611 | 1,611 | +0 |
| sites | phone-390 | 2,812 | 2,812 | +0 |
| sites | desktop-1440 | 1,531 | 1,531 | +0 |
| data | phone-390 | 8,577 | 8,755 | +178 |
| data | desktop-1440 | 4,206 | 4,206 | +0 |
| settings | phone-390 | 2,715 | 2,715 | +0 |
| settings | desktop-1440 | 1,555 | 1,555 | +0 |

## What the numbers say

The brief asks for before and after. These are heights, not a judgment of the screens.

- **Where "Worth your attention" starts on a phone (second album, visitor):** page y 848 px, the top of the second screen. The third review found it about four screens down (part 4 of 7 in its captures). The report is longer overall, not shorter: 5,021 to 5,217 px on a phone and 2,899 to 3,086 px on a desktop, because this pass adds sentences the page did not have (the share of unsorted opens, the recovered-dates sentence, a longer arrivals sentence), gives the photo captions two short lines (12 tiles on a phone), and shows the launch-over finding's evidence in full. The first album, which has no finding other than the launch-reach step that is now one line, is shorter: 4,358 to 4,228 px on a phone.
- **Home:** 1,737 to 1,776 px on a 390 px phone (the experience brief's density target is two 844 px screens, 1,688; Home was already 49 px over it before this pass and is 88 px over now), and 900 to 900 px on a 1,440 px desktop for both the visitor and the owner. The desktop is held at one screen by trimming Home's own footnote to fit the new sentence; the phone grew by about that sentence.
- **Albums on a phone:** 3,136 to 2,502 px. A launch card is about 195 px instead of 400 (the S14 change).
- **Recaps:** within about 40 px of before on a desktop; the large headline line adds a little, and dropping the stored timing sentence and the "as it was written" line takes a little away.
- **Data on a phone:** 6,148 to 6,306 px (visitor), 8,577 to 8,755 px (owner). The plainer words are longer than the words they replace ("What visitors did in the gallery after arriving" for "Linked journeys in the gallery"). This is the cost of the vocabulary change, measured once.
- Photos, Site and Settings are unchanged.
