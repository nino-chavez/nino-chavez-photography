# Approved Photography colors — 2026-11-02

The approved visitor-facing Photography treatment is Graphite & Silver.

- Background: `#181A1C`
- Ink: `#F0EFEB`
- Accent: `#CBD8DF`
- Surface: `#292C2F`
- Muted: `#B4BBC0`
- Rule: `#4A5055`

The variables are scoped to the public gallery wrapper. Analytics, authentication, and admin surfaces keep their existing palette. Status and emotion colors remain semantic and unchanged.

The approved geometry preserves the existing full-bleed home slideshow and its behavior. On `/explore`, the opening, tool strip, and result spacing follow the approved mobile and desktop reference; named tool groups keep that layout stable when active-filter chips are present.

Nino approved both the proposed color and design on November 2, 2026. Profile is outside this change.

Native build captures are saved in [the review evidence](../evidence/approved-colors-20261102/). The home and photo explorer were rendered at 1440, 390, and 320 pixels with no horizontal overflow, missing visible images, or uncaught page errors. Existing home journeys passed, including slideshow controls, reduced motion, event search, timeline, and gallery return. Quick Filters, an active division selection, and the phone filter drawer were also exercised. Rendered account and Analytics preferences pages retain the shared palette; the root tokens remain unchanged outside the public wrapper.

The phone Filters button previously changed an unused state value. It now opens the existing filter drawer, with keyboard focus contained and restored on close. A browser regression test covers opening, selecting a sport, closing, reopening with the selection retained, and Escape. The existing Visual Guide overlay remains in place.

This review used headless Chromium, not a physical phone. It did not inspect authenticated Analytics reports or private galleries.
