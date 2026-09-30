import { loadSiteJourneys } from '$lib/analytics/site-journeys.server';
import { createPostHogQueryTransport } from '$lib/analytics/posthog-queries.server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { loadSiteActions } from '$lib/analytics/site-actions.server';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { loadSiteTraffic, siteTrafficCache } from '$lib/analytics/site-traffic.server';
import { SITE_SECTIONS, type SitePeriod, type SiteSection } from '$lib/analytics/site-traffic';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies, setHeaders, fetch }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const { data: { user } } = await createSupabaseServerClient(cookies).auth.getUser();
	const owner = !!user && isAllowedAdmin(user.email);
	const requestedPeriod = Number(url.searchParams.get('period'));
	const period: SitePeriod = requestedPeriod === 7 || requestedPeriod === 90 ? requestedPeriod : 30;
	const requestedSection = url.searchParams.get('section');
	const section: SiteSection | 'all' = SITE_SECTIONS.some((item) => item.key === requestedSection)
		? requestedSection as SiteSection : 'all';
	const requestedPage = Number(url.searchParams.get('page'));
	const page = Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 1000 ? requestedPage : 0;
	const requestedActionsPage = Number(url.searchParams.get('actionsPage'));
	const actionsPage = Number.isInteger(requestedActionsPage) && requestedActionsPage >= 0 && requestedActionsPage <= 1000 ? requestedActionsPage : 0;
	const view = url.searchParams.get('view') === 'actions' ? 'actions' : 'reach';
	const reachPromise = view === 'reach' ? loadSiteTraffic(period, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_ANALYTICS_TOKEN, fetch, { cache: siteTrafficCache }) : Promise.resolve({available:false as const,reason:'Choose Reach to load Cloudflare page traffic.'});
	const actions = view === 'actions' ? await loadSiteActions(createSupabaseAdminClient(),period,section,actionsPage) : null;
	// Optional provider reports stream after first-party counts; they do not gate the page.
	const journeys = actions?.available ? loadSiteJourneys(createPostHogQueryTransport(env),actions.start,actions.end,section)
		.catch(() => ({ available: false as const, reason: 'Linked journey report unavailable.' })) : null;
	return {
		intelligenceOwner: owner,
		journeys,
		view, actionsPage, localReview: dev,
		actions,
		seo: { title: 'Site analytics — Nino Chavez', description: 'Traffic reports for Nino Chavez’s profile, writing, demos, and photography.' },
		section,
		period,
		page,
		report: await reachPromise
	};
};
