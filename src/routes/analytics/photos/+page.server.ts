import { error, fail } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { currentOperator, requireOperator } from '$lib/analytics/operator-session.server';
import { loadPhotoView, photoViewRequest } from '$lib/analytics/photo-view.server';
import { parseReportQuery } from '$lib/analytics/report-contract';
import { savedQueryState } from '$lib/analytics/saved-views';
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

/** The filters the address carries, which is what a saved view stores. */
const currentFilters = (url: URL) => savedQueryState(parseReportQuery(url.searchParams));

export const actions: Actions = {
	saveView: async ({ cookies, request, url }) => {
		const user = await requireOperator(cookies);
		const name = (await request.formData()).get('name')?.toString().trim();
		if (!name || name.length > 100) return fail(400, { saveError: 'Give this view a name of 1–100 characters.' });
		const { error: insertError } = await createSupabaseAdminClient().from('analytics_saved_reports').insert({ owner_id: user.id, name, query: currentFilters(url) });
		if (insertError) return fail(503, { saveError: 'The view could not be saved. Nothing was created.' });
		return { saved: true };
	},
	updateView: async ({ cookies, request, url }) => {
		const user = await requireOperator(cookies);
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { updateError: 'Choose a view to update.' });
		const { error: updateError } = await createSupabaseAdminClient().from('analytics_saved_reports').update({ query: currentFilters(url), updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', user.id);
		if (updateError) return fail(503, { updateError: 'The view could not be updated. Its filters are unchanged.' });
		return { updated: true, updatedId: id };
	}
};
