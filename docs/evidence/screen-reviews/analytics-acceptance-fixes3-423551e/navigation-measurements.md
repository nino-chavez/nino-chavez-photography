# Navigation at large text: what was measured before the choice

Home at 390 px wide, 844 px tall, Playwright, text size set on the root element. "Header" is the height of the page header in CSS pixels. "Heading" is where the page's `h1` starts; the first-screen gate requires it above 422 px (half the screen). "Fully visible" is how many of the five links sit entirely inside the row at load. Produced by `harness/nav-exp.mjs` (candidates injected as CSS onto the second pass's header) and, for the last block, by the same measurement on the finished header.

## The second pass's header: one row that scrolls

| engine | text | header | heading | links fully visible | row width | scroll width |
| --- | --- | --- | --- | --- | --- | --- |
| Chromium | 200% | 86 | 203 | 1 of 5 | 263 | 639 |
| Chromium | 312% | 135 | 373 | 0 of 5 | 209 | 992 |
| WebKit | 200% | 86 | 203 | 1 of 5 | 251 | 639 |
| WebKit | 312% | 135 | 373 | 0 of 5 | 197 | 992 |

At 312% no link is fully visible at load, and only the fade at the edge says there is more.

## Candidates: the links wrapped onto rows (CSS injected onto that header)

| candidate | engine | 200%: header, heading, rows | 312%: header, heading, rows |
| --- | --- | --- | --- |
| wrap as is | Chromium | 286, 403, 3 | 547, 785, 4 |
| wrap as is | WebKit | 286, 403, 3 | 547, 784, 4 |
| wrap, tighter links (44 px, .5 rem padding) | Chromium | 186, 302, 2 | 348, 587, 3 |
| wrap, tighter links | WebKit | 186, 302, 2 | 414, 652, 4 |
| two-column grid | Chromium | 250, 367, 3 | 376, 614, 3 |
| two-column grid | WebKit | 250, 367, 3 | 374, 612, 3 |

Tighter wrapping by size (Chromium, then WebKit): 150%: 161 / 222 and 161 / 222. 225%: 202 / 333 and 248 / 379. 250%: 279 / 425 and 279 / 425. 275%: 307 / 517 and 307 / 515. Every size up to 225% keeps the heading above 422 px in both engines; 250% does not.

No wrapped candidate keeps the heading above 422 px at 312%. At that size the rows would fill the first screen before any content, which is what the second pass moved away from.

## The finished header: wrap under 16 rem, scroll with an arrow under 9.5 rem

| engine | text | header | heading | rows | links fully visible | mode |
| --- | --- | --- | --- | --- | --- | --- |
| Chromium | 100% | 95 | 136 | 1 | 5 of 5 | row |
| Chromium | 150% | 161 | 222 | 2 | 5 of 5 | wrap |
| Chromium | 200% | 186 | 302 | 2 | 5 of 5 | wrap |
| Chromium | 225% | 202 | 333 | 2 | 5 of 5 | wrap |
| Chromium | 250% | 79 | 225 | 1 | 2 of 5 | scroll, arrow |
| Chromium | 312% | 99 | 337 | 1 | 1 of 5 | scroll, arrow |
| WebKit | 200% | 186 | 302 | 2 | 5 of 5 | wrap |
| WebKit | 225% | 248 | 379 | 3 | 5 of 5 | wrap |
| WebKit | 250% | 79 | 225 | 1 | 2 of 5 | scroll, arrow |
| WebKit | 312% | 98 | 336 | 1 | 1 of 5 | scroll, arrow |

Under the scroll mode, "fully visible" is not the test of reach: the first-screen gate focuses each link in turn and checks it ends fully inside the row and clear of the 28 px fade (`firstscreen-final.txt`, 32 of 32 pass, and 6 of 6 planted failures fire).
