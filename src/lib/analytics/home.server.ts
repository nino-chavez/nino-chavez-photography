import type { SupabaseClient } from '@supabase/supabase-js';
import { buildHome, COMPLETED_DAYS_CHECKED, HOME_LAUNCH_CARDS, type Freshness, type HomeInput, type HomeView, type SiteReading, type WeekInput } from './home';
import { collectionDiagnostics } from './intelligence-source.server';
import type { VisibleFindings } from './intelligence-panel.server';
import { fetchLaunches, type LaunchList } from './launch-read-model.server';
import { buildOperatorReport, type OperatorReport } from './operator-report.server';
import { chicagoDate } from './launch-recap';
import { parseReportQuery } from './report-contract';
import { loadSiteActions } from './site-actions.server';
import { clickReading, reachReading } from './site-readings';
import { loadSiteTraffic, siteTrafficCache } from './site-traffic.server';

/**
 * The reads behind Home. One parallel round, and each part fails alone: a provider or a check that
 * cannot be read becomes its own words on the page, never a blank, a zero, or a 503 for the rest.
 *
 *   launches        analytics_read_launches (one call, not one per album)
 *   week line       the scheduled gallery report: last 7 complete days against the 7 before
 *   site line       Cloudflare page loads and the site action summary, 7 days each
 *   problems        open incidents, delivery health, and the gallery report's own coverage
 *
 * No query per album. Everything is read with the service role, so the visibility rule is applied
 * here: launches and the week line are `publicOnly`, covers are read only for public launches, and an
 * incident is described by its kind, never by a name taken from its finding.
 */

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export interface HomeDeps {
	admin: SupabaseClient;
	env: { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_ANALYTICS_TOKEN?: string };
	fetch: typeof fetch;
	now?: Date;
	/** The gallery-wide launch scope's current findings (intelligence-panel.server's loadVisibleFindings). Absent: none are shown. */
	findings?: () => Promise<VisibleFindings>;
}

const ok = <T>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);
function logFailure(what: string, result: PromiseSettledResult<unknown>) {
	if (result.status === 'rejected') console.error(`[home] ${what} unavailable:`, result.reason instanceof Error ? result.reason.message : result.reason);
}

/** The cover of each launch shown: the top-engaged photo, else the album's own cover. A failure leaves a card without a picture. */
async function readCovers(admin: SupabaseClient, albumKeys: string[]): Promise<Map<string, string>> {
	const covers = new Map<string, string>();
	if (!albumKeys.length) return covers;
	const [top, own] = await Promise.allSettled([
		// Loaded on use: the cover reader needs the gallery's privileged client, and a cover is never worth a failed page.
		import('./covers').then((module) => module.topPhotoCoverMap(albumKeys)),
		admin.from('albums_summary').select('album_key, cover_cf_image_id').in('album_key', albumKeys)
	]);
	if (own.status === 'fulfilled' && !own.value.error) {
		for (const row of own.value.data ?? []) if (typeof row.cover_cf_image_id === 'string' && row.cover_cf_image_id) covers.set(String(row.album_key), row.cover_cf_image_id);
	}
	if (top.status === 'fulfilled') for (const [key, id] of top.value) covers.set(key, id);
	return covers;
}

function weekFrom(report: OperatorReport): WeekInput | null {
	if (!report.available || !report.comparison) return null;
	return {
		window: { start: report.query.start, end: report.query.end }, previous: { start: report.comparison.start, end: report.comparison.end },
		current: report.total, previousTotal: report.previousTotal, coverage: report.coverage, previousCoverage: report.previousCoverage
	};
}

/**
 * The most recent successful refresh, on any day. Every reconcile of a day, including the 30-minute
 * run of the current day, sets `analytics_daily_coverage.reconciled_at = now()`, and a failed run
 * changes nothing, so the newest `reconciled_at` is the last refresh that worked. It does not depend
 * on the current day having a row yet (just after midnight it does not). A read that fails, or a table
 * with no row, leaves the time unknown.
 */
export function refreshTimeFrom(read: { data: Array<{ reconciled_at: unknown }> | null; error: unknown } | null): string | null {
	if (!read || read.error) return null;
	const value = read.data?.[0]?.reconciled_at;
	return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function freshnessFrom(report: OperatorReport | null, lastCompleteDay: string, refreshedAt: string | null): Freshness {
	const incompleteDays = report && report.available ? report.daily.filter((day) => day.date <= lastCompleteDay && day.coverage !== 'complete').map((day) => day.date).sort() : [];
	return { incompleteDays, refreshedAt, checked: true };
}

export async function loadHome(deps: HomeDeps): Promise<HomeView> {
	const { admin } = deps;
	const asOf = deps.now ?? new Date();
	const asOfIso = asOf.toISOString();
	const today = chicagoDate(asOfIso);
	const lastCompleteDay = addDays(today, -1);
	const weekStart = addDays(lastCompleteDay, -(COMPLETED_DAYS_CHECKED - 1));

	const params = new URLSearchParams({ period: 'custom', start: weekStart, end: lastCompleteDay, scope: 'all', measure: 'photo_opens', traffic: 'conservative', compare: 'previous' });
	const [launchRead, reportRead, traffic, actions, incidentRead, diagnosticRead, refreshRead, findingsRead] = await Promise.allSettled([
		fetchLaunches(admin, { asOf: asOfIso, days: 14, traffic: 'conservative', publicOnly: true }),
		buildOperatorReport(admin, parseReportQuery(params, asOf), { publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role' }),
		// A fixed as-of (tests, a replayed date) fixes the site window too, so both halves of Home describe the same days.
		loadSiteTraffic(7, deps.env.CLOUDFLARE_ACCOUNT_ID, deps.env.CLOUDFLARE_ANALYTICS_TOKEN, deps.fetch, { cache: siteTrafficCache, ...(deps.now ? { now: () => asOf.getTime() } : {}) }),
		loadSiteActions(admin, 7, 'all', 0),
		admin.from('analytics_intelligence_incidents').select('finding_id').eq('status', 'open').order('updated_at', { ascending: false }).limit(20),
		collectionDiagnostics(admin, asOf),
		admin.from('analytics_daily_coverage').select('reconciled_at').order('reconciled_at', { ascending: false }).limit(1),
		deps.findings ? deps.findings() : Promise.resolve<VisibleFindings>({ findings: [], checkedAt: null })
	]);
	for (const [what, result] of [['launches', launchRead], ['gallery week', reportRead], ['site reach', traffic], ['site actions', actions], ['incidents', incidentRead], ['delivery health', diagnosticRead], ['refresh time', refreshRead], ['findings', findingsRead]] as const) logFailure(what, result);

	// The two reads must describe the same day, or a launch's last complete day would not match the week line.
	let list: LaunchList | null = ok(launchRead);
	if (list && (list.lastCompleteDay !== lastCompleteDay || list.today !== today)) {
		console.error(`[home] the launch read and the page disagree about the day (${list.today} against ${today}); launches are not shown.`);
		list = null;
	}
	const report = ok(reportRead);
	const incidents = ok(incidentRead);
	const incidentIds = incidents && !incidents.error ? (incidents.data ?? []).map((row) => String(row.finding_id)) : null;

	const siteReach: SiteReading = reachReading(ok(traffic));
	const actions7 = ok(actions);
	const siteContacts: SiteReading = actions7 === null ? { available: false, reason: 'Link clicks could not be read. This is not a report of zero.' } : clickReading(actions7, 'contact_clicks', COMPLETED_DAYS_CHECKED);

	// Covers only for the launches that get a card, and only after the launch read says which are public.
	const newest = list ? [...list.launches].sort((x, y) => Date.parse(y.firstPublishedAt) - Date.parse(x.firstPublishedAt)).slice(0, HOME_LAUNCH_CARDS) : [];
	const covers = await readCovers(admin, newest.map((launch) => launch.albumKey));

	const input: HomeInput = {
		asOf: asOfIso, today, lastCompleteDay, launches: list ? list.launches : null, covers,
		week: report ? weekFrom(report) : null, freshness: freshnessFrom(report, lastCompleteDay, refreshTimeFrom(ok(refreshRead))),
		siteReach, siteContacts,
		siteActionsStale: actions7 && actions7.available && actions7.freshness.status === 'stale' ? { refreshedAt: actions7.freshness.refreshedAt } : null,
		incidents: incidentIds,
		diagnostics: ok(diagnosticRead) ?? null,
		findings: ok(findingsRead)?.findings ?? [],
		findingsCheckedAt: ok(findingsRead)?.checkedAt ?? null
	};
	return buildHome(input);
}
