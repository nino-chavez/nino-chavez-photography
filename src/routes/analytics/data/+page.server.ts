import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { currentOperator, requireOperator } from '$lib/analytics/operator-session.server';
import { loadDataQuality } from '$lib/analytics/data-quality.server';
import { eventPage } from '$lib/analytics/corrections';
import { loadCorrections, recordCorrection, reverseCorrection } from '$lib/analytics/corrections.server';
import { readAll } from '$lib/analytics/read-all.server';
import type { Actions, PageServerLoad } from './$types';

/**
 * Data quality. The numbers are aggregates and open by direct link, like Home. Only the delivery
 * counts and the classification corrections wait for the signed-in owner. `loadDataQuality` never
 * throws for a failed part: each part says what it could not read.
 */
export const load: PageServerLoad = async ({ url, cookies, setHeaders, fetch }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const requested = Number(url.searchParams.get('period'));
	const days = requested === 7 || requested === 90 ? requested : 30;
	const owner = (await currentOperator(cookies)) !== null;
	const admin = createSupabaseAdminClient();
	const { view, events, journeys, siteJourneys } = await loadDataQuality({ admin, env, fetch, owner, days });
	if (!owner) return { view, events, journeys, siteJourneys, corrections: null };

	// The owner's corrections cover the same days as the numbers above them.
	const names = await readAll<{ album_key: string; album_name: string }>((from) => admin.from('albums_summary').select('album_key, album_name').order('album_key').range(from, from + 999));
	const corrections = await loadCorrections(admin, view.window, eventPage(url.searchParams.get('event_page')), new Map(names.error ? [] : names.data.map((row) => [row.album_key, row.album_name])));
	return { view, events, journeys, siteJourneys, corrections };
};

export const actions: Actions = {
	correctClassification: async ({ cookies, request }) => recordCorrection(createSupabaseAdminClient(), (await requireOperator(cookies)).id, 'legacy', await request.formData()),
	undoClassification: async ({ cookies, request }) => reverseCorrection(createSupabaseAdminClient(), (await requireOperator(cookies)).id, 'legacy', await request.formData()),
	correctV2Classification: async ({ cookies, request }) => recordCorrection(createSupabaseAdminClient(), (await requireOperator(cookies)).id, 'v2', await request.formData()),
	undoV2Classification: async ({ cookies, request }) => reverseCorrection(createSupabaseAdminClient(), (await requireOperator(cookies)).id, 'v2', await request.formData())
};
