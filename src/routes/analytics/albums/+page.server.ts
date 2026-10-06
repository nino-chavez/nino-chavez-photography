import { error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { loadAlbumIndex } from '$lib/analytics/album-index.server';
import { parseCompare } from '$lib/analytics/album-index';
import type { PageServerLoad } from './$types';

/**
 * The album index. Aggregate evidence about public albums is open by direct link, like the album
 * report; an unlisted album is never read here, for anyone, so there is no sign-in branch.
 */
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	let index: Awaited<ReturnType<typeof loadAlbumIndex>>;
	try {
		index = await loadAlbumIndex(createSupabaseAdminClient());
	} catch (cause) {
		console.error('[album index] unavailable:', cause instanceof Error ? cause.message : cause);
		throw error(503, 'The album index could not be built. No number is shown rather than a wrong one.');
	}
	return { index, compare: parseCompare(url.searchParams.get('compare'), index.launches.map((row) => row.albumKey)) };
};
