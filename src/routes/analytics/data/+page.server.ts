import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { currentOperator } from '$lib/analytics/operator-session.server';
import { loadDataQuality } from '$lib/analytics/data-quality.server';
import type { PageServerLoad } from './$types';

/**
 * Data quality. The numbers are aggregates and open by direct link, like Home. Only the delivery
 * counts follow the old Measurement tab and wait for the signed-in owner. `loadDataQuality` never
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
	const { view, journeys, siteJourneys } = await loadDataQuality({ admin: createSupabaseAdminClient(), env, fetch, owner, days });
	return { view, journeys, siteJourneys };
};
