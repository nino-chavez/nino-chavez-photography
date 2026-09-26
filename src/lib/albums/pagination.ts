/**
 * Page size shared by the album lightbox's cross-page continuation.
 *
 * Three server files and one client component each had their own literal `48`:
 * `albums/[slug]/+page.server.ts` (first page, SSR), `api/album-photos/+server.ts` (page N,
 * client fetch), `share/[token]/+page.server.ts` (page N, SSR), and `albums/[slug]/+page.svelte`
 * (`LoadMoreButton`'s `batchSize`). The album page's "Load more" and the lightbox's own
 * boundary-crossing fetch both assume page N+1 picks up exactly where page N left off — if any
 * one of these drifts from the others, the accumulated list gets a gap or a duplicate.
 *
 * Client-importable on purpose: `api/album-photos/+server.ts` and `+page.svelte` files run in
 * the browser, so this cannot live under `$lib/server`.
 */
export const ALBUM_PHOTO_PAGE_SIZE = 48;
