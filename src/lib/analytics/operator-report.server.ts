import type { SupabaseClient } from '@supabase/supabase-js';
import {
	assertReportDateBounds, comparisonWindow, dateOnly, publishedAfterComparison, rising, risingComparison,
	type MeasureTotals, type PhotoWindow, type ReportQuery
} from './report-contract';
import type { V2ReportProjection } from './v2-report-projection.server';
import { fetchScheduledGalleryReport } from './scheduled-gallery-report.server';

type Coverage = 'complete' | 'partial' | 'unavailable';
type DailyCount = { date: string; count: number | null; observed: number | null; coverage: Coverage };

export interface OperatorReport {
	available: boolean; error?: string; query: ReportQuery;
	previous: { start: string; end: string };
	comparison: { start: string; end: string; total: number | null; coverage: Coverage; label: string } | null;
	coverage: Coverage; previousCoverage: Coverage; total: number | null; observedTotal: number;
	today: { date: string; count: number | null; asOf: string | null };
	dataAsOf: string | null; preservedSince: string | null; catalogueBasis: string;
	previousTotal: number | null; change: { difference: number; label: string } | null;
	daily: DailyCount[]; rising: ReturnType<typeof risingComparison>;
	albums: Array<{ albumKey: string; count: number | null; previousCount: number | null; difference: number | null; risingValue: number | null; measures: MeasureTotals; lastActivity: string | null; publicationAt: string | null }>;
	photos: Array<{ photoId: string; albumKey: string; count: number | null; previousCount: number | null; difference: number | null; risingValue: number | null; measures: MeasureTotals; lastActivity: string | null; imageUrl: string | null; photoSegment?: string | null }>;
	photoPagination?: { page: number; pageSize: number; total: number; pageCount: number; rank: PhotoWindow['rank'] };
	albumOnlyActions: Array<{ albumKey: string; count: number | null; previousCount: number | null; difference: number | null; lastActivity: string | null }>;
	sources: { arrivals: Array<{ source: string; count: number }>; openLocations: Array<{ source: string; count: number }>; unknown: number };
	traffic: Array<{ classification: string; count: number }>;
	trafficImpact: Array<{ albumKey: string; inclusive: number; conservative: number; excluded: number; inclusiveRank: number; conservativeRank: number }>;
	diagnostics: Array<{ type: string; status: string; count: number; resultCount: number | null; errorCodes: string[]; latestAt: string | null }>;
	diagnosticsCoverage: { availableFrom: string | null; label: string; error: string | null };
	visitorEstimate: { value: number | null; limit: string };
	publicationAge: { available: boolean; label: string; days: number; albums: Array<{ albumKey: string; publishedAt: string; total: number | null; coverage: Coverage; series: Array<number | null> }>; missingAlbumKeys: string[] };
	generatedAt: string;
}

export interface BuildOperatorReportOptions {
	publicOnly?: boolean; photoWindow?: PhotoWindow; includeDiagnostics?: boolean;
	includeVisitorEstimate?: boolean; includeToday?: boolean; rangeMode?: 'interactive' | 'export'; cacheRole?: 'service_role' | 'anon';
}

interface DiagnosticRow { id: number; diagnostic_type: string; status: string; occurred_at: string; traffic_context: 'audience' | 'operator' | 'test'; album_key: string | null; photo_id: string | null; source: string | null; result_count?: number | null; error_code?: string | null }

async function distinctVisitors(client: SupabaseClient, query: ReportQuery, publicOnly: boolean): Promise<OperatorReport['visitorEstimate']> {
	const { data, error } = await client.rpc('analytics_count_scheduled_gallery_browsers', { p_start: query.start, p_end: query.end, p_album_keys: query.scope === 'all' ? [] : query.albumKeys, p_sport: query.sport ?? null, p_category: query.category ?? null, p_source: query.source ?? null, p_event_date: query.eventDate ?? null, p_season: query.season ?? null, p_album_event_type: query.albumEventType ?? null, p_measure: null, p_traffic: query.traffic, p_public_only: publicOnly });
	if (error) return { value: null, limit: 'Estimated visitors are unavailable because the protected retained-data query could not run.' };
	if (data === null) return { value: null, limit: 'Estimated visitors are unavailable because the selected interval no longer has complete retained evidence.' };
	if (!Number.isSafeInteger(data) || data < 0) return {value:null,limit:'Estimated browsers are unavailable because the protected query returned invalid data.'};
	return { value: Number(data), limit: 'Estimated browsers with recorded activity, counted once across the report. This is not a verified people count.' };
}
async function readDiagnostics(client: SupabaseClient, query: ReportQuery, publicOnly: boolean): Promise<{ rows: DiagnosticRow[]; first: string | null; error: string | null }> {
	const rows: DiagnosticRow[] = []; let lastId = 0;
	const from = new Date(`${query.start}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 1);
	const to = new Date(`${query.end}T00:00:00Z`); to.setUTCDate(to.getUTCDate() + 2);
	try {
		const cap=await client.from('analytics_collection_diagnostics').select('id').order('id',{ascending:false}).limit(1);if(cap.error)throw cap.error;const highWater=Number(cap.data?.[0]?.id??0);
		for (;;) {
			const { data, error } = await client.from('analytics_collection_diagnostics').select('id, diagnostic_type, status, occurred_at, traffic_context, album_key, photo_id, source, result_count, error_code').gte('occurred_at', from.toISOString()).lt('occurred_at', to.toISOString()).gt('id', lastId).lte('id',highWater).order('id', { ascending: true }).limit(1000);
			if (error) throw error; rows.push(...((data ?? []) as DiagnosticRow[])); if ((data ?? []).length < 1000) break; lastId = Number(data!.at(-1)!.id);
		}
		const photoIds=[...new Set(rows.flatMap((row)=>row.photo_id?[row.photo_id]:[]))];
		const photoFacts=new Map<string,{album_key:string|null;photo_category:string|null}>();
		for(let i=0;i<photoIds.length;i+=100){const read=await client.from('photo_metadata').select('photo_id, album_key, photo_category').in('photo_id',photoIds.slice(i,i+100));if(read.error)throw read.error;for(const row of read.data??[])photoFacts.set(row.photo_id,row);}
		const albumKeys=[...new Set(rows.flatMap((row)=>{const key=row.album_key??(row.photo_id?photoFacts.get(row.photo_id)?.album_key:null);return key?[key]:[];}))];
		const albumFacts=new Map<string,{sport:string|null;event_date:string|null}>();const hidden=new Set<string>();
		for(let i=0;i<albumKeys.length;i+=100){const batch=albumKeys.slice(i,i+100);const [albums,settings]=await Promise.all([client.from('albums').select('album_key, sport, event_date').in('album_key',batch),client.from('album_settings').select('album_key, visibility').in('album_key',batch)]);if(albums.error||settings.error)throw albums.error??settings.error;for(const row of albums.data??[])albumFacts.set(row.album_key,row);for(const row of settings.data??[])if(row.visibility==='unlisted')hidden.add(row.album_key);}
		const coverage = await client.from('analytics_diagnostic_coverage').select('first_recorded_at').order('first_recorded_at').limit(1);
		if (coverage.error) throw coverage.error;
		return { rows: rows.filter((row) => {const albumKey=row.album_key??(row.photo_id?photoFacts.get(row.photo_id)?.album_key:null);const album=albumKey?albumFacts.get(albumKey):undefined;return dateOnly(new Date(row.occurred_at))>=query.start&&dateOnly(new Date(row.occurred_at))<=query.end&&(query.traffic==='inclusive'||row.traffic_context==='audience')&&(!query.source||(row.source??'direct')===query.source)&&(!publicOnly||(!row.photo_id||photoFacts.get(row.photo_id)?.album_key===albumKey)&&(!albumKey||albumFacts.has(albumKey)&&!hidden.has(albumKey)))&&(query.scope==='all'||!!albumKey&&query.albumKeys.includes(albumKey))&&(!query.category||!!row.photo_id&&(photoFacts.get(row.photo_id)?.photo_category??'unknown')===query.category)&&(!query.sport||(album?.sport??'unknown')===query.sport)&&(!query.eventDate||album?.event_date===query.eventDate)&&(!query.season||(album?.event_date?.slice(0,4)??'unknown')===query.season)&&(!query.albumEventType||query.albumEventType==='unknown');}), first: coverage.data?.[0]?.first_recorded_at ?? null, error: null };
	} catch { return { rows: [], first: null, error: 'Diagnostic records could not be read. Counts are unavailable.' }; }
}

export function aggregateDiagnostics(rows: DiagnosticRow[]): OperatorReport['diagnostics'] {
	const values = new Map<string, OperatorReport['diagnostics'][number]>();
	for (const row of rows) {
		const key = `${row.diagnostic_type}\u0000${row.status}`;
		const entry = values.get(key) ?? { type: row.diagnostic_type, status: row.status, count: 0, resultCount: null, errorCodes: [], latestAt: null };
		entry.count += 1;
		if (row.result_count !== null && row.result_count !== undefined) entry.resultCount = (entry.resultCount ?? 0) + Number(row.result_count);
		if (row.error_code && !entry.errorCodes.includes(row.error_code)) entry.errorCodes.push(row.error_code);
		if (!entry.latestAt || row.occurred_at > entry.latestAt) entry.latestAt = row.occurred_at;
		values.set(key, entry);
	}
	return [...values.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function emptyReport(query: ReportQuery, error: string): OperatorReport {
	const previous = comparisonWindow(query) ?? { start: query.start, end: query.end };
	return { available: false, error, query, previous, comparison: null, coverage: 'unavailable', previousCoverage: 'unavailable', total: null, observedTotal: 0, previousTotal: null, change: null, today: { date: dateOnly(new Date()), count: null, asOf: null }, dataAsOf: null, preservedSince: null, catalogueBasis: 'unavailable', daily: [], rising: risingComparison(query, 'unavailable', 'unavailable'), albums: [], photos: [], albumOnlyActions: [], sources: { arrivals: [], openLocations: [], unknown: 0 }, traffic: [], trafficImpact: [], diagnostics: [], diagnosticsCoverage: { availableFrom: null, label: 'Diagnostic evidence was not loaded for this section.', error: 'Report source unavailable' }, visitorEstimate: { value: null, limit: 'Distinct-browser evidence was not loaded for this section.' }, publicationAge: { available: false, label: 'Report source unavailable.', days: 0, albums: [], missingAlbumKeys: [] }, generatedAt: new Date().toISOString() };
}

/** Dashboard path: a single protected aggregate RPC. It never reads raw evidence rows. */
export async function buildOperatorReport(client: SupabaseClient, query: ReportQuery, options: BuildOperatorReportOptions = {}): Promise<OperatorReport> {
	assertReportDateBounds(query, options.rangeMode ?? 'interactive');
	const previous = comparisonWindow(query) ?? { start: query.start, end: query.end };
	try {
		const report = await fetchScheduledGalleryReport(client, query, options);
		const [diagnosticRead, visitorEstimate] = await Promise.all([
			options.includeDiagnostics === false ? Promise.resolve({ rows: [] as DiagnosticRow[], first: null, error: null }) : readDiagnostics(client, query, options.publicOnly ?? false),
			options.includeVisitorEstimate === false ? Promise.resolve({ value: null, limit: 'Distinct-browser evidence was not loaded for this section.' }) : distinctVisitors(client, query, options.publicOnly ?? false)
		]);
		const comparison = comparisonWindow(query) ? { start: previous.start, end: previous.end, total: report.previousTotal, coverage: report.previousCoverage, label: query.compare === 'custom' ? 'Selected comparison period' : 'Previous equal period' } : null;
		const risingState = risingComparison(query, report.coverage, report.previousCoverage);
		return { available: true, query, previous, comparison, ...report,
			change: report.total !== null && report.previousTotal !== null && risingState.basis === 'absolute' ? rising(report.total, report.previousTotal) : null,
			rising: risingState, diagnostics: aggregateDiagnostics(diagnosticRead.rows), diagnosticsCoverage: { availableFrom: diagnosticRead.first, label: options.includeDiagnostics === false ? 'Diagnostic evidence was not loaded for this section.' : diagnosticRead.error ?? (diagnosticRead.first ? `First recorded diagnostic evidence: ${dateOnly(new Date(diagnosticRead.first))}. Earlier coverage is unknown.` : 'No diagnostic evidence has been recorded. This is not a measured zero.'), error: diagnosticRead.error },
			visitorEstimate, generatedAt: new Date().toISOString() };
	} catch (cause) {
		console.error('[analytics operator report] unavailable:', cause);
		return emptyReport(query, 'The scheduled daily analytics summary is unavailable. This is not a zero-result report.');
	}
}

function formulaSafe(value: string | number | null): string { const text = String(value ?? ''); return typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; }

export function reportCsv(report: OperatorReport, shortlist?: Set<string>, v2?: V2ReportProjection): string {
	const escape = (value: string | number | null) => `"${formulaSafe(value).replaceAll('"', '""')}"`;
	const filters = JSON.stringify({ scope: report.query.scope, albums: report.query.albumKeys, sport: report.query.sport ?? null, category: report.query.category ?? null, source: report.query.source ?? null, eventDate: report.query.eventDate ?? null, season: report.query.season ?? null, albumEventType: report.query.albumEventType ?? null });
	const definition = report.query.measure === 'photo_opens' ? 'Recorded photo view events deduplicated by visitor fingerprint, photo, event type, and UTC day. Chart dates use America/Chicago.' : report.query.measure === 'album_opens' ? 'Recorded album-open events deduplicated by visitor fingerprint, album, event type, and UTC day. Chart dates use America/Chicago.' : `${report.query.measure.replaceAll('_', ' ')} are recorded actions, not verified downstream outcomes.`;
	const header = ['row_type', 'photo_id', 'album_key', 'count', 'comparison_count', 'difference', 'last_activity', 'measure', 'photo_opens', 'album_opens', 'downloads', 'favorites', 'shares', 'v2_label', 'v2_coverage', 'definition', 'period_start', 'period_end', 'comparison_start', 'comparison_end', 'timezone', 'coverage', 'traffic_rule', 'filters', 'visitor_estimate', 'catalogue_basis', 'generated_at', 'comparison_note'];
	const common = [report.query.measure, definition, report.query.start, report.query.end, report.comparison?.start ?? null, report.comparison?.end ?? null, 'America/Chicago', report.coverage, report.query.traffic, filters, report.visitorEstimate.value, report.catalogueBasis, report.generatedAt];
	const measureColumns = (values: MeasureTotals | undefined) => values ? [values.photo_opens, values.album_opens, values.downloads, values.favorites, values.shares] : [null, null, null, null, null];
	const publicationAt = new Map(report.albums.map((row) => [row.albumKey, row.publicationAt]));
	const comparisonNote = (albumKey: string) => publishedAfterComparison(publicationAt.get(albumKey), report.query) ? 'published_after_comparison_window' : null;
	const photoRows = report.photos.filter((row) => !shortlist || shortlist.has(row.photoId)).map((row) => ['photo', row.photoId, row.albumKey, row.count, row.previousCount, row.difference, row.lastActivity, report.query.measure, ...measureColumns(row.measures), null, null, ...common.slice(1), comparisonNote(row.albumKey)]);
	const albumRows = (report.query.measure === 'album_opens' ? report.albums : report.albumOnlyActions).map((row) => ['measures' in row && report.query.measure === 'album_opens' ? 'album' : 'album_action', null, row.albumKey, row.count, row.previousCount, row.difference, row.lastActivity, report.query.measure, ...measureColumns(('measures' in row ? row.measures : undefined) as MeasureTotals | undefined), null, null, ...common.slice(1), comparisonNote(row.albumKey)]);
	const v2Rows = shortlist || !v2 ? [] : v2.counts.map((row) => ['v2_event', null, null, row.count, null, null, null, 'v2_observation', null, null, null, null, null, row.label, v2.coverage.label, 'Recorded version-2 event observations; no legacy daily deduplication or conversion inference.', report.query.start, report.query.end, null, null, 'America/Chicago', v2.available ? 'available' : 'unavailable', report.query.traffic, filters, null, 'public_album_visibility', report.generatedAt, null]);
	return [header, ...(shortlist ? photoRows : [...photoRows, ...albumRows, ...v2Rows])].map((row) => row.map((value) => escape(value as string | number | null)).join(',')).join('\n');
}
