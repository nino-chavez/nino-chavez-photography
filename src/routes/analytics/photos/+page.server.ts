import { error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { currentOperator, requireOperator } from '$lib/analytics/operator-session.server';
import { loadPhotoView, photoViewRequest } from '$lib/analytics/photo-view.server';
import { saveViewFromPage, updateViewFromPage } from '$lib/analytics/saved-views.server';
import type { Actions, PageServerLoad } from './$types';

/**
 * The gallery-wide photo view. Aggregate evidence about public photos is open by direct link, like the album
 * report. Only the saved views are the signed-in owner's.
 */
export const load: PageServerLoad = async ({ url, cookies, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	let request: ReturnType<typeof photoViewRequest>;
	try {
		request = photoViewRequest(url.searchParams);
	} catch (cause) {
		if (cause instanceof RangeError) throw error(400, cause.message);
		throw cause;
	}
	const admin = createSupabaseAdminClient();
	const owner = await currentOperator(cookies);
	const [view, saved] = await Promise.all([
		loadPhotoView(admin, request),
		owner ? admin.from('analytics_saved_reports').select('id, name, query, updated_at').eq('owner_id', owner.id).order('updated_at', { ascending: false }) : Promise.resolve({ data: [], error: null })
	]);
	if (saved.error) console.error('[photo view] saved views unavailable:', saved.error.message);
	return {
		owner: owner !== null,
		view,
		savedViews: (saved.error ? [] : saved.data ?? []) as Array<{ id: string; name: string; query: unknown; updated_at: string }>,
		savedViewsAvailable: !saved.error
	};
};

export const actions: Actions = {
	saveView: async ({ cookies, request, url }) => saveViewFromPage(createSupabaseAdminClient(), (await requireOperator(cookies)).id, (await request.formData()).get('name'), url),
	updateView: async ({ cookies, request, url }) => updateViewFromPage(createSupabaseAdminClient(), (await requireOperator(cookies)).id, (await request.formData()).get('id'), url)
};
