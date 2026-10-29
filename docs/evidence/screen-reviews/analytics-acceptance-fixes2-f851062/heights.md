# Page heights, before and after

Document height in CSS pixels at default text size, Chromium, visitor role, one load per row. Heights are numbers, not a verdict.

- **Before:** `origin/main` at 479d9fa (the merge of the first fix pass), served by this worktree's development server before any edit, reading production data.
- **After:** this branch at f851062, the same server and the same data, read within the hour.
- The visitor and owner role are the same page for most of these; the owner adds forms on the album report, Data and Settings (full set in `captures/index.md`).

| surface | width | before | after | change |
| --- | --- | --- | --- | --- |
| home | phone-390 | 1,652 | 1,565 | -87 |
| home | desktop-1440 | 900 | 900 | +0 |
| albums | phone-390 | 3,267 | 3,136 | -131 |
| albums | desktop-1440 | 1,283 | 1,313 | +30 |
| album-Re7kho | phone-390 | 6,494 | 4,358 | -2136 |
| album-Re7kho | desktop-1440 | 3,179 | 3,157 | -22 |
| album-DWdCET | phone-390 | 6,459 | 5,021 | -1438 |
| album-DWdCET | desktop-1440 | 2,930 | 2,899 | -31 |
| album-Re7kho-recap3 | phone-390 | 1,468 | 1,468 | +0 |
| album-Re7kho-recap3 | desktop-1440 | 946 | 946 | +0 |
| album-Re7kho-recap7 | phone-390 | 1,396 | 1,396 | +0 |
| album-Re7kho-recap7 | desktop-1440 | 946 | 946 | +0 |
| photos | phone-390 | 2,751 | 2,751 | +0 |
| photos | desktop-1440 | 1,307 | 1,307 | +0 |
| sites | phone-390 | 2,583 | 2,446 | -137 |
| sites | desktop-1440 | 1,343 | 1,322 | -21 |
| data | phone-390 | 5,989 | 6,024 | +35 |
| data | desktop-1440 | 2,827 | 2,869 | +42 |
| settings | phone-390 | 964 | 964 | +0 |
| settings | desktop-1440 | 900 | 900 | +0 |

Two numbers the brief asks for:

- **Home:** 1,652 to 1,565 px on a 390 px phone (two 844 px screens are 1,688); 900 px on a 1,440 px desktop, one 900 px screen, unchanged. Home still fits its density target, with a longer headline, a footnote and a scale line added, because the photo-load alarm card is now one muted line.
- **Album report, first album on a phone:** 6,494 to 4,358 px. The second album is 6,459 to 5,021 px: it still carries a full "Something failed" finding card and a longer list of limits (the findings' own limits now join the one list).
- The Data page on a phone grew by 35 px (5,989 to 6,024): the new "what it means" lines outweigh the shorter jargon.

The 12-thumbnail grid is the cause of most of the album change: on a phone only the first 12 of 120 photo tiles are shown until "Show all 120 photos"; on a desktop all 60 of the first page still show.
