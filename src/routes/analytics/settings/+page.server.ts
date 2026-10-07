import { fail } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { currentOperator, requireOperator } from '$lib/analytics/operator-session.server';
import { renamedViewFromForm, savedViewFromForm } from '$lib/analytics/saved-views';
import { deleteView, insertView, renameView } from '$lib/analytics/saved-views.server';
import type { Actions, PageServerLoad } from './$types';

/**
 * Settings. Open by direct link, but the page itself holds nothing private for anyone who is not the
 * signed-in owner: signed out, this load makes no private read at all, and the page says what signing
 * in adds. The private controls (reporting settings, email delivery, history) fetch their own state
 * from their own owner-checked endpoints once the page is open.
 */
export const load: PageServerLoad = async ({ cookies, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const user = await currentOperator(cookies);
	if (!user) return { owner: false as const, savedViews: [], savedViewsAvailable: true };
	const { data, error } = await createSupabaseAdminClient().from('analytics_saved_reports').select('id, name, query, updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false });
	if (error) console.error('[settings] saved views unavailable:', error.message);
	return { owner: true as const, savedViews: error ? [] : (data ?? []) as Array<{ id: string; name: string; query: unknown; updated_at: string }>, savedViewsAvailable: !error };
};

export const actions: Actions = {
	saveView: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const view = savedViewFromForm(await request.formData());
		if (!view.ok) return fail(400, { saveError: view.error });
		return insertView(createSupabaseAdminClient(), user.id, view.name, view.query);
	},
	renameView: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const view = renamedViewFromForm(await request.formData());
		if (!view.ok) return fail(400, { renameError: view.error, renameId: null });
		return renameView(createSupabaseAdminClient(), user.id, view.id, view.name);
	},
	deleteView: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { deleteError: 'Choose a view to delete.' });
		return deleteView(createSupabaseAdminClient(), user.id, id);
	}
};
