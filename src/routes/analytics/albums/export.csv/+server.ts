import { error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { indexCsv, loadAlbumIndex } from '$lib/analytics/album-index.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let csv: string;
	try {
		csv = indexCsv(await loadAlbumIndex(createSupabaseAdminClient()));
	} catch (cause) {
		console.error('[album index csv] unavailable:', cause instanceof Error ? cause.message : cause);
		throw error(503, 'The album index could not be built. No file is produced rather than a wrong one.');
	}
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="album-index.csv"',
			'cache-control': 'private, no-store, max-age=0',
			pragma: 'no-cache',
			'x-robots-tag': 'noindex, nofollow, noarchive'
		}
	});
};
