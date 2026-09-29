# Nino Chavez Gallery

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Gallery visitors browse event albums and photographs. Nino uses analytics as both a photographer and a data analyst: to understand an album's performance, find popular or rising work, compare periods, and decide what to share next.

## Product Purpose

Publish event photography and help people find photos. The analytics workspace connects recorded activity to the actual albums and images so the photographer can investigate what received attention.

## Operating Context

The existing application uses SvelteKit, Svelte 5, Supabase, and Cloudflare Pages. Analytics is available by direct link without sign-in. Private notes, saved reports, and changes to traffic classification require operator authentication.

## Capabilities and Constraints

- Filter activity by date, album, sport, category, source, season, and event type.
- Compare periods and supported publication-age windows. The current age comparison uses publication calendar days; equal elapsed-time analysis needs the corresponding timestamp evidence. Explore popular, rising, and recently active photos separately.
- Inspect photographs, maintain a temporary shortlist, and export CSV reports.
- Distinguish album opens, photo opens, download actions, favorites, and shares. Download actions do not prove completed downloads.
- Report estimated browsers without calling them verified people. Distinct counts cannot be summed across days.
- Preserve missing or incomplete history as an explicit state. Missing data is not zero.
- Use America/Chicago for reporting dates. Separate event dates from activity dates.
- Public responses omit unlisted albums, raw visitor identifiers, private notes, and privileged controls.
- The current sources do not establish agreement with Cloudflare, PostHog, or GA4.
- Add PostHog Cloud for linked journeys, search outcomes, exposure-adjusted response and site experiments, as specified in [the integration plan](docs/POSTHOG_PLAN.md). It is planned, not collecting yet. Keep its private project behind the public gallery's aggregate-report boundary.
- Version new event definitions and disclose their coverage. Historical daily counts cannot supply missing visits or visible-photo exposure.

## Brand Commitments

The product name and actual photography remain. On September 29, 2026, Nino requested a complete replacement of the analytics page's styling. This permission is scoped to analytics; the public gallery's visual system is a separate surface.

## Evidence on Hand

The existing analytics report contract, public production reports, gallery photography, and operator requirements in this conversation. The September 29 screenshot shows a broken daily chart and excessive page length. Design previews must identify invented or frozen data; they must not claim live results.

## Product Principles

- Start with the photographer's decision, then provide the detail needed to investigate it.
- Preserve metric meanings when simplifying labels.
- Keep popularity, growth, and recency distinct.
- Make filter scope and coverage visible.
- A public report never grants editing rights.
