import { env } from '$env/dynamic/private';
import { loadSiteTraffic } from '$lib/analytics/site-traffic.server';
import { SITE_SECTIONS, type SitePeriod, type SiteSection } from '$lib/analytics/site-traffic';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, setHeaders, fetch }) => {
	setHeaders({
		'cache-control': 'public, max-age=60, s-maxage=600',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const requestedPeriod = Number(url.searchParams.get('period'));
	const period: SitePeriod = requestedPeriod === 7 || requestedPeriod === 90 ? requestedPeriod : 30;
	const requestedSection = url.searchParams.get('section');
	const section: SiteSection | 'all' = SITE_SECTIONS.some((item) => item.key === requestedSection)
		? requestedSection as SiteSection : 'all';
	const requestedPage = Number(url.searchParams.get('page'));
	const page = Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 1000 ? requestedPage : 0;
	return {
		seo: { title: 'Site analytics — Nino Chavez', description: 'Traffic reports for Nino Chavez’s profile, writing, demos, and photography.' },
		section,
		period,
		page,
		report: await loadSiteTraffic(period, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_ANALYTICS_TOKEN || env.CF_IMAGES_API_TOKEN, fetch)
	};
};
