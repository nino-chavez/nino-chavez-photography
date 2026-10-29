# Page heights, before and after

Document height in CSS pixels at default text size, Chromium, one load per row. Heights are numbers, not a verdict.

Three columns are compared and they were not taken in the same conditions:

- **Before: the captured set.** From `analytics-acceptance-a8bfd28/captures/index.md`. The visitor rows were taken from production (`analytics.ninochavez.co`, which has Cloudflare and PostHog credentials). The owner rows were taken from a local development server without those credentials.
- **Before: parent on the local server.** The tree before this branch (`f25bbcb`), built and served by `wrangler pages dev`, visitor role, no Cloudflare or PostHog credentials. This is the like-for-like "before" for the last column. It exists for visitors only; the harness could not serve the owner role from a built bundle.
- **After.** This branch, development server, same data and no credentials. Visitor and owner.

The last column is the change against the local before (visitor) or against the captured owner set (owner). Owner rows compare two local servers.

Targets from the experience brief: Home fits one 1440 x 900 desktop screen (900) and two 390 x 844 phone screens (1,688).

Pages that got longer: the album report on a phone (+349 visitor; the rank, download and arrival sentences now name their days), Data on a phone (+542; the tables became cards and the delivery words are defined beside the numbers), Site on a phone (+390; the page table became cards), Photos (+151 on a phone; each tile says which number it is in the ranking). Owner Home on a phone is 1,702, 14 px over the target, probably because the owner's findings carry Dismiss and Snooze buttons (not isolated).

| page | width | role | before: the captured set (visitor from production, owner from a local server) | before: this branch's parent on the local server (visitor only) | after: this branch on the local server | change against the local before |
| --- | --- | --- | --- | --- | --- | --- |
| home | phone-390 | visitor | 2,424 | 2,351 | 1,652 | -699 |
| home | phone-390 | owner | 2,544 | - | 1,702 | -842 |
| home | desktop-1440 | visitor | 1,315 | 1,294 | 900 | -394 |
| home | desktop-1440 | owner | 1,466 | - | 900 | -566 |
| albums | phone-390 | visitor | 8,452 | 8,452 | 3,267 | -5,185 |
| albums | phone-390 | owner | 8,452 | - | 3,267 | -5,185 |
| albums | desktop-1440 | visitor | 2,827 | 2,827 | 1,283 | -1,544 |
| albums | desktop-1440 | owner | 2,827 | - | 1,283 | -1,544 |
| album-Re7kho | phone-390 | visitor | 6,311 | 6,145 | 6,494 | +349 |
| album-Re7kho | phone-390 | owner | 6,999 | - | 7,182 | +183 |
| album-Re7kho | desktop-1440 | visitor | 3,714 | 3,695 | 3,179 | -516 |
| album-Re7kho | desktop-1440 | owner | 4,235 | - | 3,699 | -536 |
| album-DWdCET | phone-390 | visitor | 6,121 | 6,121 | 6,459 | +338 |
| album-DWdCET | phone-390 | owner | 6,859 | - | 7,198 | +339 |
| album-DWdCET | desktop-1440 | visitor | 3,231 | 3,231 | 2,939 | -292 |
| album-DWdCET | desktop-1440 | owner | 3,751 | - | 3,511 | -240 |
| album-Re7kho-recap7 | phone-390 | visitor | 7,198 | 7,198 | 1,396 | -5,802 |
| album-Re7kho-recap7 | phone-390 | owner | 7,886 | - | 1,396 | -6,490 |
| album-Re7kho-recap7 | desktop-1440 | visitor | 4,328 | 4,328 | 946 | -3,382 |
| album-Re7kho-recap7 | desktop-1440 | owner | 4,849 | - | 946 | -3,903 |
| photos | phone-390 | visitor | 2,600 | 2,600 | 2,751 | +151 |
| photos | phone-390 | owner | 3,132 | - | 3,284 | +152 |
| photos | desktop-1440 | visitor | 1,301 | 1,301 | 1,307 | +6 |
| photos | desktop-1440 | owner | 1,604 | - | 1,611 | +7 |
| sites | phone-390 | visitor | 3,427 | 2,193 | 2,583 | +390 |
| sites | phone-390 | owner | 2,421 | - | 2,812 | +391 |
| sites | desktop-1440 | visitor | 2,175 | 1,363 | 1,343 | -20 |
| sites | desktop-1440 | owner | 1,551 | - | 1,531 | -20 |
| data | phone-390 | visitor | 5,283 | 5,447 | 5,989 | +542 |
| data | phone-390 | owner | 6,840 | - | 7,972 | +1,132 |
| data | desktop-1440 | visitor | 2,847 | 2,806 | 2,827 | +21 |
| data | desktop-1440 | owner | 3,297 | - | 3,848 | +551 |
| settings | phone-390 | visitor | 950 | 985 | 964 | -21 |
| settings | phone-390 | owner | 2,644 | - | 2,675 | +31 |
| settings | desktop-1440 | visitor | 900 | 900 | 900 | +0 |
| settings | desktop-1440 | owner | 1,531 | - | 1,555 | +24 |
| album-Re7kho-recap3 | phone-390 | visitor | - | 7,243 | 1,468 | -5,775 |
| album-Re7kho-recap3 | phone-390 | owner | - | - | 1,468 | - |
| album-Re7kho-recap3 | desktop-1440 | visitor | - | 4,328 | 946 | -3,382 |
| album-Re7kho-recap3 | desktop-1440 | owner | - | - | 946 | - |
| album-DWdCET-recap3 | phone-390 | visitor | - | - | 1,496 | - |
| album-DWdCET-recap3 | phone-390 | owner | - | - | 1,496 | - |
| album-DWdCET-recap3 | desktop-1440 | visitor | - | - | 979 | - |
| album-DWdCET-recap3 | desktop-1440 | owner | - | - | 979 | - |
| album-DWdCET-recap7 | phone-390 | visitor | - | - | 1,520 | - |
| album-DWdCET-recap7 | phone-390 | owner | - | - | 1,520 | - |
| album-DWdCET-recap7 | desktop-1440 | visitor | - | - | 1,030 | - |
| album-DWdCET-recap7 | desktop-1440 | owner | - | - | 1,030 | - |
| album-Re7kho-recap5 | phone-390 | visitor | - | - | 844 | - |
| album-Re7kho-recap5 | phone-390 | owner | - | - | 844 | - |
| album-Re7kho-recap5 | desktop-1440 | visitor | - | - | 900 | - |
| album-Re7kho-recap5 | desktop-1440 | owner | - | - | 900 | - |
