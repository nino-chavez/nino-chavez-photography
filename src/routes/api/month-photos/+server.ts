import { json } from '@sveltejs/kit';
import { fetchPhotosByYearMonth } from '$lib/supabase/server';
import { MONTH_PHOTOS_PAGE_SIZE } from '$lib/photos/month-pagination';
import type { RequestHandler } from './$types';

const VALID_SORTS = new Set(['newest', 'oldest', 'quality']);

// GET /api/month-photos?year=...&month=...&sort=...&page=N
//
// A single page of a month's photos, for the month detail page's lightbox to fetch past the
// page it rendered server-side (`photos/[year]/[month]/+page.server.ts`'s own load — same
// query, same MONTH_PHOTOS_PAGE_SIZE, same fetchPhotosByYearMonth, so page N here picks up
// exactly where the SSR page left off). `sort` must be passed through: the SSR page's own
// sort choice decides which page N even means, and defaulting it here independently of what
// the visitor picked would silently reorder the continuation.
export const GET: RequestHandler = async ({ url }) => {
	const year = parseInt(url.searchParams.get('year') || '', 10);
	const month = parseInt(url.searchParams.get('month') || '', 10);
	if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
		return json({ error: 'Missing or invalid year/month' }, { status: 400 });
	}

	const sortParam = url.searchParams.get('sort') || 'newest';
	const sortBy = (VALID_SORTS.has(sortParam) ? sortParam : 'newest') as 'newest' | 'oldest' | 'quality';

	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const offset = (page - 1) * MONTH_PHOTOS_PAGE_SIZE;

	try {
		const { photos } = await fetchPhotosByYearMonth(year, month, {
			sortBy,
			limit: MONTH_PHOTOS_PAGE_SIZE,
			offset
		});
		return json(
			{ photos, page },
			{ headers: { 'cache-control': 's-maxage=300, stale-while-revalidate=600' } }
		);
	} catch {
		return json({ error: 'Failed to fetch month photos' }, { status: 500 });
	}
};
