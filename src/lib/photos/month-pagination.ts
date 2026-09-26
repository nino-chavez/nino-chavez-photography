/**
 * Page size shared by the month detail page's SSR load (`photos/[year]/[month]/+page.server.ts`)
 * and its page-mode API (`/api/month-photos`) — the album page/API/share trio's pattern, scoped
 * to one month instead of one album. Client-importable on purpose: the API route and the page
 * component both run in the browser.
 */
export const MONTH_PHOTOS_PAGE_SIZE = 48;
