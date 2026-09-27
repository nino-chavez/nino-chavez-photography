/**
 * /links (ninochavez.co/photography/links) — the page the nino.chavez.photo Instagram bio
 * points at. ninochavez.co/links itself stays Nino's separate profile-directory page and is
 * unaffected by this route.
 *
 * Server-rendered, no client JS required: every tap target below is a plain `<a href>`. Same
 * ranking as `/latest`, `/api/latest`, and `/api/galleries/recent` — read directly here (no
 * self-fetch, per CLAUDE.md) rather than calling those routes over HTTP.
 */
import { getRankedPublicAlbums } from '$lib/supabase/server';
import { SITE_URL } from '$lib/site-url';
import { LATEST_GALLERY_CACHE_CONTROL, toLatestApiAlbum } from '$lib/albums/latest';
import type { PageServerLoad } from './$types';

/** Cards shown below the lead — matches the /api/galleries/recent contract's own limit. */
const RECENT_LIMIT = 6;

export const load: PageServerLoad = async ({ setHeaders }) => {
	const result = await getRankedPublicAlbums();

	if (!result.ok) {
		// Don't cache a transient failure — no cache-control means the next request retries
		// immediately instead of every visitor seeing "unavailable" for the same ~60s window a
		// successful read would otherwise earn. The page itself still renders: the outbound
		// links (Flickday Media, Let's Pepper, ninochavez.co) don't depend on this read at all,
		// and a visitor from the Instagram bio should still be able to reach them.
		return {
			seo: {
				title: 'Links | Nino Chavez Photography',
				description: 'Where to find Nino Chavez Photography.'
			},
			lead: null,
			recent: [],
			unavailable: true
		};
	}

	// Same window as the JSON/redirect routes: a fresh publish should show up here within
	// about a minute too, since this is the page the Instagram bio link actually opens.
	setHeaders({ 'cache-control': LATEST_GALLERY_CACHE_CONTROL });

	const [leadRow, ...rest] = result.albums;
	const lead = leadRow ? toLatestApiAlbum(leadRow, { siteUrl: SITE_URL }) : null;
	// The lead card already shows the newest album — the "recent" list beneath it is the NEXT
	// ones, not a repeat of the lead. /api/galleries/recent (a separate public contract) still
	// returns the full top 6 including whatever is newest; this page just doesn't show it twice.
	const recent = rest.slice(0, RECENT_LIMIT).map((row) => toLatestApiAlbum(row, { siteUrl: SITE_URL }));

	return {
		seo: {
			title: 'Links | Nino Chavez Photography',
			description:
				'The newest volleyball gallery, recent event galleries, and where else to find Nino Chavez Photography.'
		},
		lead,
		recent,
		unavailable: false
	};
};
