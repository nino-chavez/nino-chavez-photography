import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { loadHome } from '$lib/analytics/home.server';
import type { PageServerLoad } from './$types';

/**
 * Home. Aggregate evidence about public albums is open by direct link, like the album index and the
 * album report; an unlisted album is never read here, for anyone, so there is no sign-in branch.
 * `loadHome` never throws for a failed part: each part says what it could not read.
 */
export const load: PageServerLoad = async ({ setHeaders, fetch }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const view = await loadHome({ admin: createSupabaseAdminClient(), env: { CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ANALYTICS_TOKEN: env.CLOUDFLARE_ANALYTICS_TOKEN }, fetch });
	return { view };
};
