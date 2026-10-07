import { env } from '$env/dynamic/private';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { loadHome } from '$lib/analytics/home.server';
import { loadVisibleFindings } from '$lib/analytics/intelligence-panel.server';
import { GALLERY_LAUNCH_SCOPE } from '$lib/analytics/intelligence-contract';
import type { PageServerLoad } from './$types';

/**
 * Home. Aggregate evidence about public albums is open by direct link, like the album index and the
 * album report; an unlisted album is never read here, for anyone. Signing in adds only the owner's dismiss and
 * snooze controls on findings; what a finding says is the same for everyone.
 * `loadHome` never throws for a failed part: each part says what it could not read.
 */
export const load: PageServerLoad = async ({ setHeaders, fetch, cookies }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const { data: { user } } = await createSupabaseServerClient(cookies).auth.getUser();
	const admin = createSupabaseAdminClient();
	const view = await loadHome({
		admin, env: { CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ANALYTICS_TOKEN: env.CLOUDFLARE_ANALYTICS_TOKEN }, fetch,
		// The gallery-wide launch scope. Its findings pass the same public check as every report; none means nothing shows.
		findings: () => loadVisibleFindings(admin, GALLERY_LAUNCH_SCOPE, 'home')
	});
	return { view, owner: !!user && isAllowedAdmin(user.email) };
};
