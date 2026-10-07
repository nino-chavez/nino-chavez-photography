import type { SupabaseClient } from '@supabase/supabase-js';
import { readRejections, type DeliveryDay, type RejectionReading } from './collection-rejections';
import { buildDataView, eventsView, journeysView, notReadNote, type DataView, type EventsView, type JourneysView } from './data-quality';
import { refreshTimeFrom } from './home.server';
import { collectionDiagnostics } from './intelligence-source.server';
import { chicagoDate, formatDay } from './launch-recap';
import { parseMeasurementHealth, type MeasurementHealth } from './measurement-health';
import { buildOperatorReport, type OperatorReport } from './operator-report.server';
import { createPostHogQueryTransport, queryGalleryJourneys } from './posthog-queries.server';
import { POSTHOG_JOURNEY_REPORTS, type JourneyAggregate } from './posthog.types';
import { readAll } from './read-all.server';
import { parseReportQuery } from './report-contract';
import { loadSiteActions } from './site-actions.server';
import { loadSiteJourneys, type SiteJourneys } from './site-journeys.server';
import { loadSiteTraffic, siteTrafficCache } from './site-traffic.server';
import { fetchV2ReportProjection } from './v2-report-projection.server';

/**
 * The reads behind the data quality page. One parallel round, and each part fails alone: a part that
 * cannot be read becomes its own words on the page, never a blank, a zero or a 503 for the rest.
 *
 *   gallery summary   the scheduled gallery report over the last N complete days (counts, traffic classes, sources)
 *   catalogue         public albums only, so an unlisted album is never read for anyone
 *   freshness         the newest `reconciled_at`, the incidents, and delivery diagnostics: the same reads Home makes
 *   site              Cloudflare page loads and the site's own action summary
 *   delivery health   the outbox counts; only for the signed-in owner
 *   event counts      the recorded events, the slowest read here; streamed after the page like the journeys
 *   journeys          PostHog; streamed after the page, so a slow provider never holds the page back
 */

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export interface DataDeps {
	admin: SupabaseClient;
	env: Record<string, string | undefined>;
	fetch: typeof fetch;
	owner: boolean;
	days: 7 | 30 | 90;
	now?: Date;
}

export interface DataPage {
	view: DataView;
	/** Never rejects: a failure is an `EventsView` that says so. Read after the page is drawn. */
	events: Promise<EventsView>;
	/** Never rejects: a failure is a `JourneysView` that says so. */
	journeys: Promise<JourneysView>;
	siteJourneys: Promise<SiteJourneys>;
}

const ok = <T>(result: PromiseSettledResult<T>): T | null => (result.status === 'fulfilled' ? result.value : null);
function logFailure(what: string, result: PromiseSettledResult<unknown>) {
	if (result.status === 'rejected') console.error(`[data quality] ${what} unavailable:`, result.reason instanceof Error ? result.reason.message : result.reason);
}

/** How far back the collector's daily counters are read to find the usual rate of rejected events. */
const REJECTION_HISTORY_DAYS = 90;

/** The collector's counters by Chicago day, outcomes summed over event formats. Owner only. Null when they could not be read. */
async function readDeliveryDays(admin: SupabaseClient, since: string): Promise<DeliveryDay[] | null> {
	const read = await admin.from('analytics_collection_delivery_counters').select('bucket_date, outcome, count').gte('bucket_date', since).order('bucket_date');
	if (read.error || !read.data) return null;
	const byDay = new Map<string, DeliveryDay>();
	for (const row of read.data as Array<{ bucket_date: string; outcome: 'accepted' | 'rejected' | 'duplicate'; count: number | string }>) {
		const day = byDay.get(row.bucket_date) ?? { date: row.bucket_date, accepted: 0, rejected: 0, duplicate: 0 };
		day[row.outcome] += Number(row.count);
		byDay.set(row.bucket_date, day);
	}
	return [...byDay.values()];
}

export async function loadDataQuality(deps: DataDeps): Promise<DataPage> {
	const { admin, days } = deps;
	const asOf = deps.now ?? new Date();
	const asOfIso = asOf.toISOString();
	const today = chicagoDate(asOfIso);
	const lastCompleteDay = addDays(today, -1);
	const start = addDays(lastCompleteDay, -(days - 1));
	const query = parseReportQuery(new URLSearchParams({ period: 'custom', start, end: lastCompleteDay, scope: 'all', measure: 'photo_opens', traffic: 'conservative', compare: 'none' }), asOf);

	// The public album names come first and alone: the event counts and the journeys need them and nothing else, so they start as soon as
	// they are read, not after the gallery summary.
	const summariesRead = readAll<{ album_key: string; album_name: string }>((from) => admin.from('albums_summary').select('album_key, album_name').order('album_key').range(from, from + 999));
	const settingsRead = readAll<{ album_key: string; visibility: string | null }>((from) => admin.from('album_settings').select('album_key, visibility').order('album_key').range(from, from + 999));
	const publicNames = Promise.allSettled([summariesRead, settingsRead]).then(([summaries, settings]) => {
		logFailure('album names', summaries);
		logFailure('album visibility', settings);
		// Public albums only. An album whose visibility could not be read is not shown, rather than guessed public.
		const found = new Map<string, string>();
		const summaryRows = ok(summaries);
		const settingRows = ok(settings);
		if (summaryRows && !summaryRows.error && settingRows && !settingRows.error) {
			const unlisted = new Set(settingRows.data.filter((row) => row.visibility === 'unlisted').map((row) => row.album_key));
			for (const row of summaryRows.data) if (!unlisted.has(row.album_key)) found.set(row.album_key, row.album_name);
		}
		return found;
	});

	const reportPromise = buildOperatorReport(admin, query, { publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: true, includeVisitorEstimate: true, includeToday: false, cacheRole: 'service_role' });
	// The event counts read thousands of rows, so they start now and stream: the page is drawn without them. They are shown only
	// when the gallery summary itself could be read, as before.
	const eventsRaw = publicNames.then((found) => (found.size ? fetchV2ReportProjection(admin, query, { publicAlbumKeys: [...found.keys()] }) : null))
		.catch((cause) => { console.error('[data quality] event counts unavailable:', cause instanceof Error ? cause.message : cause); return null; });
	const events: Promise<EventsView> = Promise.all([eventsRaw, reportPromise.then((report) => report.available, () => false)]).then(([raw, reportOk]) => eventsView(reportOk ? raw : null, deps.owner));

	const [reportRead, healthRead, countersRead, refreshRead, incidentRead, diagnosticRead, trafficRead, actionsRead] = await Promise.allSettled([
		reportPromise,
		deps.owner ? admin.rpc('analytics_posthog_delivery_health') : Promise.resolve({ data: null, error: null }),
		deps.owner ? readDeliveryDays(admin, addDays(today, -REJECTION_HISTORY_DAYS)) : Promise.resolve(null),
		admin.from('analytics_daily_coverage').select('reconciled_at').order('reconciled_at', { ascending: false }).limit(1),
		admin.from('analytics_intelligence_incidents').select('finding_id').eq('status', 'open').order('updated_at', { ascending: false }).limit(20),
		collectionDiagnostics(admin, asOf),
		loadSiteTraffic(days, deps.env.CLOUDFLARE_ACCOUNT_ID, deps.env.CLOUDFLARE_ANALYTICS_TOKEN, deps.fetch, { cache: siteTrafficCache }),
		loadSiteActions(admin, days, 'all', 0)
	]);
	for (const [what, result] of [['gallery summary', reportRead], ['delivery health', healthRead], ['delivery counters', countersRead], ['refresh time', refreshRead], ['incidents', incidentRead], ['delivery diagnostics', diagnosticRead], ['site traffic', trafficRead], ['site actions', actionsRead]] as const) logFailure(what, result);
	const names = await publicNames;
	const publicAlbumKeys = [...names.keys()];

	const report: OperatorReport | null = ok(reportRead);
	const transport = createPostHogQueryTransport(deps.env);
	// Provider journeys start now and stream: the page does not wait for them.
	const journeys: Promise<JourneysView> = names.size
		? Promise.all(POSTHOG_JOURNEY_REPORTS.map((name) => queryGalleryJourneys(transport, { report: name, start: query.start, end: query.end, source: query.source, sport: query.sport, category: query.category }, { publicOnly: true, allowedAlbumKeys: publicAlbumKeys })))
			.then((rows: JourneyAggregate[]) => journeysView(rows, deps.owner))
			.catch(() => journeysView(null, deps.owner))
		: Promise.resolve(journeysView(null, deps.owner));
	const siteJourneys = loadSiteJourneys(transport, query.start, query.end, 'all').catch(() => ({ available: false as const, reason: notReadNote('posthog', deps.owner).what }));

	const incidents = ok(incidentRead);
	const health = ok(healthRead);
	const counterDays = ok(countersRead);
	const rejections: RejectionReading | null = deps.owner && counterDays ? readRejections({ days: counterDays, lastCompleteDay, formatDay }) : null;
	const parsedHealth: MeasurementHealth | null = deps.owner && health && !health.error ? parseMeasurementHealth(health.data) : null;
	const view = buildDataView({
		asOf: asOfIso, today, lastCompleteDay, days, owner: deps.owner,
		report, names, health: parsedHealth,
		refreshedAt: refreshTimeFrom(ok(refreshRead)),
		incidents: incidents && !incidents.error ? (incidents.data ?? []).map((row) => String(row.finding_id)) : null,
		diagnostics: ok(diagnosticRead) ?? null,
		traffic: ok(trafficRead), actions: ok(actionsRead),
		posthogConfigured: transport !== null, rejections
	});
	return { view, events, journeys, siteJourneys };
}
