# Independent rendered review

Verdict: desktop is clear and restrained. Its count language is unusually careful: it does not call browsers people, arrivals conversions, or downloads/shares completed outcomes. The main usability blockers are on phone.

- Blocker — album comparison is not usable without discovering a hidden horizontal swipe. In [operator-390-albums.png](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/.temp/parent-ui-review/operator-390-albums.png), the table at mid-screen cuts off after “Photo opens”; the next column is truncated. [operator-390-albums-scrolled.png](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/.temp/parent-ui-review/operator-390-albums-scrolled.png) confirms more data exists, but the initial frame gives no visible scroll instruction or affordance. This blocks the “compare albums” task on a phone.

- Blocker — the mobile photo table preserves the shortlist checkbox, not a useful identity column. In [operator-390-photo-table.png](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/.temp/parent-ui-review/operator-390-photo-table.png), the sticky first column is “Shortlist”; photo and album identity are partly offscreen and wrap awkwardly. That makes table mode poor for choosing work to promote.

- Appearance issue — the initial mobile photo capture obscures the section heading under the persistent section navigation. In [operator-390-photos.png](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/.temp/parent-ui-review/operator-390-photos.png), the view begins mid-explanation, without “Popular, rising, and recently active.” The later ranking captures are legible, so this is an observed scroll-position issue, not proof that section-link navigation fails.

What works: desktop hierarchy, typography, contrast, selected-album inspector, modal inspection, and the Popular/Rising/Recently active controls are readable. The measurement/source screens visibly caveat attribution, traffic classes, repeated actions, provider comparison, and retained observations; I found no frame that implies conversions, completion, or verified human identity.

Behavior limits: [review.spec.ts](/Users/nino/.codex/worktrees/analytics-clarity/nino-chavez-photography/tests/analytics/review.spec.ts) verifies ranking-tab state, modal open/return, mobile horizontal scrolling, section-nav bounds, and no page overflow. It does not test filters, shortlist/export, album-report navigation, saved views/notes, correction actions, or analytics accuracy. It also substitutes a single representative image for delivery URLs. Therefore these captures cannot validate real photo selection, production data, identity, user counts, journeys, conversions, or completed downloads.

## Parent resolution

Added a visible sideways-scroll instruction above album comparisons. Combined the photo thumbnail, reference and shortlist control into the sticky photo-table column. Re-ran phone captures and personally opened the corrected album and photo-table frames. The photo section link now has a browser assertion that its heading enters the viewport. This does not claim production data accuracy.
