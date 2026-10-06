import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { env } from '$env/dynamic/private';
import { chicagoDate } from '$lib/analytics/launch-recap';
import { currentOperator } from '$lib/analytics/operator-session.server';
import { intelligenceScopeKey } from '$lib/analytics/intelligence-contract';
import { loadSiteActions } from '$lib/analytics/site-actions.server';
import { loadSiteTraffic, siteTrafficCache } from '$lib/analytics/site-traffic.server';
import { SITE_SECTIONS, type SitePeriod, type SiteSection } from '$lib/analytics/site-traffic';
import type { PageServerLoad } from './$types';

/**
 * The site report. Open by direct link like Home: the figures are public-site aggregates, and the
 * only thing that depends on who is looking is the owner's record form. Each read fails alone, and a
 * read that failed reaches the page as its own words, never as a zero.
 */
export const load: PageServerLoad = async ({ url, cookies, setHeaders, fetch }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const requestedPeriod = Number(url.searchParams.get('period'));
	// Seven days against the seven before is the default; it is the same window Home reads.
	const period: SitePeriod = requestedPeriod === 30 || requestedPeriod === 90 ? requestedPeriod : 7;
	const requestedSection = url.searchParams.get('section');
	const section: SiteSection | 'all' = SITE_SECTIONS.some((item) => item.key === requestedSection) ? requestedSection as SiteSection : 'all';
	const requestedPage = Number(url.searchParams.get('page'));
	const page = Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 1000 ? requestedPage : 0;
	const requestedActionsPage = Number(url.searchParams.get('actionsPage'));
	const actionsPage = Number.isInteger(requestedActionsPage) && requestedActionsPage >= 0 && requestedActionsPage <= 1000 ? requestedActionsPage : 0;

	const admin = createSupabaseAdminClient();
	const owner = (await currentOperator(cookies)) !== null;
	const [traffic, actions, snapshot] = await Promise.allSettled([
		loadSiteTraffic(period, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_ANALYTICS_TOKEN, fetch, { cache: siteTrafficCache }),
		loadSiteActions(admin, period, section, actionsPage),
		admin.from('analytics_intelligence_snapshot_current').select('scope_key').eq('scope_key', intelligenceScopeKey({ kind: 'sites', period, section })).maybeSingle()
	]);
	// The findings panel reads a saved calculation for exactly this scope. Until one exists it could only say "unavailable", so
	// visitors see nothing; the owner still gets the private record form. Decided here from the stored data, as on the album report.
	const hasSnapshot = snapshot.status === 'fulfilled' && !snapshot.value.error && !!snapshot.value.data;
	if (snapshot.status === 'rejected') console.error('[site report] snapshot lookup failed:', snapshot.reason instanceof Error ? snapshot.reason.message : snapshot.reason);
	const intelligence: 'report' | 'record' | 'none' = hasSnapshot ? 'report' : owner ? 'record' : 'none';
	if (actions.status === 'rejected') console.error('[site report] actions unavailable:', actions.reason instanceof Error ? actions.reason.message : actions.reason);
	if (traffic.status === 'rejected') console.error('[site report] traffic unavailable:', traffic.reason instanceof Error ? traffic.reason.message : traffic.reason);
	return {
		seo: { title: 'Site analytics — Nino Chavez', description: 'Traffic reports for Nino Chavez’s profile, writing, demos, and photography.' },
		today: chicagoDate(new Date().toISOString()),
		section, period, page, actionsPage,
		intelligence, intelligenceOwner: owner,
		traffic: traffic.status === 'fulfilled' ? traffic.value : null,
		actions: actions.status === 'fulfilled' ? actions.value : null
	};
};
