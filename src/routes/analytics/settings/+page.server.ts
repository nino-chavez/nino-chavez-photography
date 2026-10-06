import { fail } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { currentOperator, requireOperator } from '$lib/analytics/operator-session.server';
import { renamedViewFromForm, savedViewFromForm } from '$lib/analytics/saved-views';
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
		const { error } = await createSupabaseAdminClient().from('analytics_saved_reports').insert({ owner_id: user.id, name: view.name, query: view.query });
		if (error) return fail(503, { saveError: 'The view could not be saved. Nothing was created.' });
		return { saved: true };
	},
	renameView: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const view = renamedViewFromForm(await request.formData());
		if (!view.ok) return fail(400, { renameError: view.error, renameId: null });
		const { error } = await createSupabaseAdminClient().from('analytics_saved_reports').update({ name: view.name, updated_at: new Date().toISOString() }).eq('id', view.id).eq('owner_id', user.id);
		if (error) return fail(503, { renameError: 'The view could not be renamed. Its name is unchanged.', renameId: view.id });
		return { renamed: true };
	},
	deleteView: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { deleteError: 'Choose a view to delete.' });
		const { error } = await createSupabaseAdminClient().from('analytics_saved_reports').delete().eq('id', id).eq('owner_id', user.id);
		if (error) return fail(503, { deleteError: 'The view could not be deleted. It is still saved.' });
		return { deleted: true };
	}
};
