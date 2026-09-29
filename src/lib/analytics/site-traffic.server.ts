/** Cloudflare Web Analytics traffic for the public ninochavez.co property. */
import { SITE_SECTIONS, sectionForPath, type SitePeriod, type SiteSection } from './site-traffic';

type CloudflareRow = {
	count: number;
	dimensions: { date: string; requestPath: string; refererHost: string | null; deviceType: string | null };
	sum: { visits: number };
};

type TrafficPoint = { date: string; pageviews: number; entryVisits: number };
type TrafficPage = { path: string; pageviews: number; entryVisits: number; section: SiteSection };
type TrafficReferrer = { host: string; pageviews: number; entryVisits: number };
type TrafficDevice = { name: string; pageviews: number };
type TrafficSection = { key: SiteSection; label: string; pageviews: number; entryVisits: number; topPages: TrafficPage[]; daily: TrafficPoint[]; referrers: TrafficReferrer[]; devices: TrafficDevice[] };
export type SiteTrafficReport = {
	available: true;
	start: string;
	end: string;
	period: SitePeriod;
	pageviews: number;
	entryVisits: number;
	previousPageviews: number | null;
	previousEntryVisits: number | null;
	daily: TrafficPoint[];
	sections: TrafficSection[];
	topPages: TrafficPage[];
	referrers: TrafficReferrer[];
	devices: TrafficDevice[];
	measuredAt: string;
};
export type SiteTrafficResult = SiteTrafficReport | { available: false; reason: string; period: SitePeriod };

const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GRAPHQL = `query SiteTraffic($account:string,$start:Date,$end:Date){viewer{accounts(filter:{accountTag:$account}){rumPageloadEventsAdaptiveGroups(limit:10000,filter:{date_geq:$start,date_leq:$end,requestHost:"ninochavez.co",bot:0}){dimensions{date requestPath refererHost deviceType} count sum{visits}}}}}`;
// This report is public. Show only known public route families so a future
// capability URL cannot leak through an unfamiliar path.
const PUBLIC_PATH = /^\/(?:$|(?:work|about|now|links|learn|search|blog|demos|privacy|contact)(?:\/|$)|photography(?:\/(?:albums|collections|explore|faq|favorites|photo|photos|timeline|events|coverage)(?:\/|$)|\/?$))/i;
function includedPath(path: string): boolean {
	return PUBLIC_PATH.test(path) && !/%(?:20|2f|5c)/i.test(path);
}
const cached = new Map<SitePeriod, { until: number; result: SiteTrafficReport }>();

function validRow(value: unknown): value is CloudflareRow {
	if (!value || typeof value !== 'object') return false;
	const row = value as Partial<CloudflareRow>;
	return Number.isFinite(row.count) && Number(row.count) >= 0
		&& !!row.dimensions && DATE.test(row.dimensions.date ?? '')
		&& typeof row.dimensions.requestPath === 'string' && row.dimensions.requestPath.startsWith('/')
		&& !!row.sum && Number.isFinite(row.sum.visits) && Number(row.sum.visits) >= 0;
}

function utcDay(date: Date): string { return date.toISOString().slice(0, 10); }

export function periodBounds(period: SitePeriod, now = new Date()): { start: string; end: string; previousStart: string; previousEnd: string } {
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
	const start = new Date(end); start.setUTCDate(start.getUTCDate() - period + 1);
	const previousEnd = new Date(start); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
	const previousStart = new Date(previousEnd); previousStart.setUTCDate(previousStart.getUTCDate() - period + 1);
	return { start: utcDay(start), end: utcDay(end), previousStart: utcDay(previousStart), previousEnd: utcDay(previousEnd) };
}

function add(map: Map<string, number>, key: string, value: number) { map.set(key, (map.get(key) ?? 0) + value); }

export function summarizeSiteTraffic(rows: CloudflareRow[], period: SitePeriod, start: string, end: string, previousRows: CloudflareRow[] | null, measuredAt: string): SiteTrafficReport {
	const days = new Map<string, TrafficPoint>();
	for (let cursor = new Date(`${start}T00:00:00Z`); utcDay(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
		const date = utcDay(cursor); days.set(date, { date, pageviews: 0, entryVisits: 0 });
	}
	const pages = new Map<string, TrafficPage>();
	const referrers = new Map<string, { pageviews: number; entryVisits: number }>();
	const devices = new Map<string, number>();
	let pageviews = 0; let entryVisits = 0;
	for (const row of rows) {
		const { date, requestPath: path, refererHost, deviceType } = row.dimensions;
		if (!days.has(date) || !includedPath(path)) continue;
		const views = row.count; const visits = row.sum.visits;
		pageviews += views; entryVisits += visits;
		const day = days.get(date)!; day.pageviews += views; day.entryVisits += visits;
		const page = pages.get(path) ?? { path, pageviews: 0, entryVisits: 0, section: sectionForPath(path) };
		page.pageviews += views; page.entryVisits += visits; pages.set(path, page);
		const source = refererHost?.trim().toLowerCase() || 'Direct / unknown';
		const referrer = referrers.get(source) ?? { pageviews: 0, entryVisits: 0 };
		referrer.pageviews += views; referrer.entryVisits += visits; referrers.set(source, referrer);
		add(devices, deviceType?.trim().toLowerCase() || 'unknown', views);
	}
	const sortedPages = [...pages.values()].sort((a, b) => b.pageviews - a.pageviews || a.path.localeCompare(b.path));
	const sections = SITE_SECTIONS.map(({ key, label }) => {
		const sectionPages = sortedPages.filter((page) => page.section === key);
		const sectionDays = [...days.values()].map((day) => ({ date: day.date, pageviews: 0, entryVisits: 0 }));
		const sectionRefs = new Map<string, { pageviews: number; entryVisits: number }>();
		const sectionDevices = new Map<string, number>();
		for (const row of rows) {
			const { date, requestPath, refererHost, deviceType } = row.dimensions;
			if (!includedPath(requestPath) || sectionForPath(requestPath) !== key) continue;
			const day = sectionDays.find((item) => item.date === date);
			if (!day) continue;
			day.pageviews += row.count; day.entryVisits += row.sum.visits;
			const host = refererHost?.trim().toLowerCase() || 'Direct / unknown';
			const ref = sectionRefs.get(host) ?? { pageviews: 0, entryVisits: 0 };
			ref.pageviews += row.count; ref.entryVisits += row.sum.visits; sectionRefs.set(host, ref);
			add(sectionDevices, deviceType?.trim().toLowerCase() || 'unknown', row.count);
		}
		return { key, label, pageviews: sectionPages.reduce((sum, page) => sum + page.pageviews, 0), entryVisits: sectionPages.reduce((sum, page) => sum + page.entryVisits, 0), topPages: sectionPages, daily: sectionDays,
			referrers: [...sectionRefs].map(([host, value]) => ({ host, ...value })).sort((a, b) => b.entryVisits - a.entryVisits || b.pageviews - a.pageviews),
			devices: [...sectionDevices].map(([name, views]) => ({ name, pageviews: views })).sort((a, b) => b.pageviews - a.pageviews) };
	});
	const previous = previousRows && previousRows.every(validRow) ? previousRows.filter((row) => includedPath(row.dimensions.requestPath)) : null;
	return {
		available: true, start, end, period, pageviews, entryVisits,
		previousPageviews: previous?.reduce((sum, row) => sum + row.count, 0) ?? null,
		previousEntryVisits: previous?.reduce((sum, row) => sum + row.sum.visits, 0) ?? null,
		daily: [...days.values()], sections, topPages: sortedPages,
		referrers: [...referrers].map(([host, value]) => ({ host, ...value })).sort((a, b) => b.entryVisits - a.entryVisits || b.pageviews - a.pageviews).slice(0, 10),
		devices: [...devices].map(([name, views]) => ({ name, pageviews: views })).sort((a, b) => b.pageviews - a.pageviews), measuredAt
	};
}

async function queryRows(accountId: string, token: string, start: string, end: string, fetcher: typeof fetch): Promise<CloudflareRow[]> {
	const response = await fetcher('https://api.cloudflare.com/client/v4/graphql', {
		method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ query: GRAPHQL, variables: { account: accountId, start, end } })
	});
	if (!response.ok) throw new Error(`Cloudflare GraphQL HTTP ${response.status}`);
	const payload = await response.json() as { errors?: { message: string }[]; data?: { viewer?: { accounts?: { rumPageloadEventsAdaptiveGroups?: unknown[] }[] } } };
	if (payload.errors?.length) throw new Error(`Cloudflare GraphQL: ${payload.errors.map((item) => item.message).join('; ')}`);
	const rows = payload.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
	if (!Array.isArray(rows) || rows.length >= 10_000 || !rows.every(validRow)) throw new Error('Cloudflare returned incomplete or invalid page-load groups');
	return rows;
}

export async function loadSiteTraffic(period: SitePeriod, accountId: string | undefined, token: string | undefined, fetcher: typeof fetch = fetch): Promise<SiteTrafficResult> {
	if (!accountId || !ACCOUNT_ID.test(accountId) || !token?.trim()) return { available: false, period, reason: 'Cloudflare Web Analytics access is not configured for this report.' };
	const hit = cached.get(period);
	if (hit && hit.until > Date.now()) return hit.result;
	const { start, end, previousStart, previousEnd } = periodBounds(period);
	try {
		const current = await queryRows(accountId, token, start, end, fetcher);
		let previous: CloudflareRow[] | null = null;
		try { previous = await queryRows(accountId, token, previousStart, previousEnd, fetcher); }
		catch (cause) { console.warn('[site-traffic] Comparison unavailable', cause); }
		const result = summarizeSiteTraffic(current, period, start, end, previous, new Date().toISOString());
		cached.set(period, { until: Date.now() + 10 * 60_000, result });
		return result;
	} catch (cause) {
		console.error('[site-traffic] Report unavailable', cause);
		return { available: false, period, reason: 'Cloudflare Web Analytics could not be read. No traffic total is shown.' };
	}
}
