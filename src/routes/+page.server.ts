import { getRankedPublicAlbums, type RankedAlbumsResult } from '$lib/supabase/server';
import { toLatestApiAlbum } from '$lib/albums/latest';
import { SITE_URL } from '$lib/site-url';
import type { PageServerLoad } from './$types';

// Cache only the shared public gallery data, never a visitor's opening photograph.
// Match the previous homepage's 60-second freshness window within a warm worker.
let albumsCache: { expiresAt: number; result: Promise<RankedAlbumsResult> } | undefined;

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const photoStart = Math.random();
	// Same public/unlisted gate, publication ranking, covers and failure contract as /links.
	if (!albumsCache || albumsCache.expiresAt <= Date.now()) {
		albumsCache = {
			expiresAt: Date.now() + 60_000,
			result: getRankedPublicAlbums().catch(() => {
				console.error('[photography home] Recent gallery lookup failed');
				return { ok: false } as const;
			})
		};
	}
	const pendingAlbums = albumsCache;
	const result = await pendingAlbums.result;
	if (!result.ok && albumsCache === pendingAlbums) albumsCache = undefined;
	const seo = {
		title: 'Nino Chavez Photography',
		description: 'Selected photographs by Nino Chavez. Find volleyball and event galleries, view photos, and download your favorites.'
	};
	if (!result.ok) return { seo, photoStart, lead: null, recent: [], unavailable: true };

	const [lead, ...recent] = result.albums;
	return {
		seo,
		photoStart,
		lead: lead ? toLatestApiAlbum(lead, { siteUrl: SITE_URL }) : null,
		recent: recent.slice(0, 4).map(album => toLatestApiAlbum(album, { siteUrl: SITE_URL })),
		unavailable: false
	};
};
