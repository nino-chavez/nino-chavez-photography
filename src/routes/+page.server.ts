import { getRankedPublicAlbums } from '$lib/supabase/server';
import { LATEST_GALLERY_CACHE_CONTROL, toLatestApiAlbum } from '$lib/albums/latest';
import { SITE_URL } from '$lib/site-url';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	// Same public/unlisted gate, publication ranking, covers and failure contract as /links.
	const result = await getRankedPublicAlbums().catch(() => {
		console.error('[photography home] Recent gallery lookup failed');
		return { ok: false } as const;
	});
	const seo = {
		title: 'Nino Chavez Photography',
		description: 'Selected photographs by Nino Chavez. Find volleyball and event galleries, view photos, and download your favorites.'
	};
	if (!result.ok) return { seo, lead: null, recent: [], unavailable: true };

	setHeaders({ 'cache-control': LATEST_GALLERY_CACHE_CONTROL });
	const [lead, ...recent] = result.albums;
	return {
		seo,
		lead: lead ? toLatestApiAlbum(lead, { siteUrl: SITE_URL }) : null,
		recent: recent.slice(0, 4).map(album => toLatestApiAlbum(album, { siteUrl: SITE_URL })),
		unavailable: false
	};
};
