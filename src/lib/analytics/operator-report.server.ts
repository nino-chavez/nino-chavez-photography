import type { SupabaseClient } from '@supabase/supabase-js';
import {
	comparisonWindow,
	coverageFromStates,
	dateOnly,
	datesInclusive,
	rising,
	risingComparison,
	risingValue,
	rowMatches,
	rowMatchesMeasure,
	type DailyActionRow,
	type MeasureTotals,
	type ReportQuery
} from './report-contract';
import { cfImageUrl } from '$lib/utils/cloudflare-images';
import type { V2ReportProjection } from './v2-report-projection.server';

type Coverage = 'complete' | 'partial' | 'unavailable';
type DailyCount = { date: string; count: number | null; observed: number | null; coverage: Coverage };
type CoverageRow = { bucket_date: string; coverage_state: Coverage; cutoff_at: string; reconciled_at?: string; catalogue_basis?: string };
type CatalogueRow = { album_key: string; sport: string | null; event_date: string | null; event_type: string | null };
type Group = { key: string; count: number; lastActivity: string | null; publicationAt: string | null };

export interface OperatorReport {
	available: boolean;
	error?: string;
	query: ReportQuery;
	previous: { start: string; end: string };
	comparison: { start: string; end: string; total: number | null; coverage: Coverage; label: string } | null;
	coverage: Coverage;
	previousCoverage: Coverage;
	total: number | null;
	observedTotal: number;
	today: { date: string; count: number | null; asOf: string | null };
	dataAsOf: string | null;
	preservedSince: string | null;
 catalogueBasis: string;
	previousTotal: number | null;
	change: { difference: number; label: string } | null;
	daily: DailyCount[];
	rising: ReturnType<typeof risingComparison>;
	albums: Array<{ albumKey: string; count: number | null; previousCount: number | null; difference: number | null; risingValue: number | null; measures: MeasureTotals; lastActivity: string | null; publicationAt: string | null }>;
	photos: Array<{ photoId: string; albumKey: string; count: number | null; previousCount: number | null; difference: number | null; risingValue: number | null; measures: MeasureTotals; lastActivity: string | null; imageUrl: string | null; photoSegment?: string | null }>;
	albumOnlyActions: Array<{ albumKey: string; count: number | null; previousCount: number | null; difference: number | null; lastActivity: string | null }>;
	sources: {
		arrivals: Array<{ source: string; count: number }>;
		openLocations: Array<{ source: string; count: number }>;
		unknown: number;
	};
	traffic: Array<{ classification: string; count: number }>;
 trafficImpact: Array<{albumKey:string;inclusive:number;conservative:number;excluded:number;inclusiveRank:number;conservativeRank:number}>;
	diagnostics: Array<{ type: string; status: string; count: number; resultCount: number | null; errorCodes: string[]; latestAt: string | null }>;
	diagnosticsCoverage: { availableFrom: string | null; label: string; error: string | null };
	visitorEstimate: { value: number | null; limit: string };
	publicationAge: {
		available: boolean;
		label: string;
		days: number;
		albums: Array<{ albumKey: string; publishedAt: string; total: number | null; coverage: Coverage; series: Array<number | null> }>;
		missingAlbumKeys: string[];
	};
	generatedAt: string;
}

interface DiagnosticRow {
	id: number;
	diagnostic_type: string;
	status: string;
	occurred_at: string;
	traffic_context: 'audience' | 'operator' | 'test';
	album_key: string | null;
	photo_id: string | null;
	source: string | null;
	result_count?: number | null;
	error_code?: string | null;
}

/** Aggregate only safe diagnostic fields; search text and visitor identifiers never enter reports. */
export function aggregateDiagnostics(rows: DiagnosticRow[]): OperatorReport['diagnostics'] {
	const diagnosticsByKey = new Map<string, { type: string; status: string; count: number; resultCount: number | null; errorCodes: string[]; latestAt: string | null }>();
	for (const row of rows) {
		const key = `${row.diagnostic_type}\u0000${row.status}`;
		const entry = diagnosticsByKey.get(key) ?? { type: row.diagnostic_type, status: row.status, count: 0, resultCount: null, errorCodes: [], latestAt: null };
		entry.count += 1;
		if (row.result_count !== null && row.result_count !== undefined) entry.resultCount = (entry.resultCount ?? 0) + Number(row.result_count);
		if (row.error_code && !entry.errorCodes.includes(row.error_code)) entry.errorCodes.push(row.error_code);
		entry.latestAt = !entry.latestAt || row.occurred_at > entry.latestAt ? row.occurred_at : entry.latestAt;
		diagnosticsByKey.set(key, entry);
	}
	return [...diagnosticsByKey.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

async function fetchCatalogue(client: SupabaseClient): Promise<CatalogueRow[]> {
 const rows: CatalogueRow[] = [];
 for (let from = 0; ; from += 1000) {
  const {data, error} = await client.from('albums').select('album_key, sport, event_date').order('album_key').range(from, from + 999);
  if(error) throw error;
  // Event type was removed from the authoritative album catalogue.
  rows.push(...(data ?? []).map((album) => ({ ...album, event_type: null })) as CatalogueRow[]);
  if((data ?? []).length < 1000) return rows;
 }
}
function catalogueMatches(album: CatalogueRow, query: ReportQuery): boolean {
 return (query.scope === 'all' || query.albumKeys.includes(album.album_key))
  && (!query.sport || (album.sport ?? 'unknown') === query.sport)
  && (!query.eventDate || album.event_date === query.eventDate)
  && (!query.season || (album.event_date?.slice(0,4) ?? 'unknown') === query.season)
  && (!query.albumEventType || (album.event_type ?? 'unknown') === query.albumEventType);
}

async function fetchAllPublicationSettings(client: SupabaseClient): Promise<Array<{ album_key: string; published_at: string | null; visibility?: string | null }>> {
	const rows: Array<{ album_key: string; published_at: string | null; visibility?: string | null }> = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await client.from('album_settings').select('album_key, published_at, visibility').order('album_key').range(from, from + 999);
		if (error) throw error;
		rows.push(...((data ?? []) as Array<{ album_key: string; published_at: string | null; visibility?: string | null }>));
		if ((data ?? []).length < 1000) return rows;
	}
}

/** One SQL statement reads one committed summary generation, even during reconciliation. */
async function fetchEvidence(client: SupabaseClient, start: string, end: string): Promise<{ rows: DailyActionRow[]; coverage: CoverageRow[] }> {
 const {data, error} = await client.rpc('analytics_read_report_evidence', {p_start: start, p_end: end});
 if(error) throw error;
 if(!data || !Array.isArray(data.rows) || !Array.isArray(data.coverage)) throw new Error('Invalid analytics evidence response');
 return data;
}

async function fetchAllDiagnostics(client: SupabaseClient, start: string, end: string): Promise<DiagnosticRow[]> {
	const rows: DiagnosticRow[] = [];
	// Query a deliberately wider UTC envelope, then apply the Chicago calendar date below.
	const fromUtc = new Date(`${start}T00:00:00Z`); fromUtc.setUTCDate(fromUtc.getUTCDate() - 1);
	const toUtc = new Date(`${end}T00:00:00Z`); toUtc.setUTCDate(toUtc.getUTCDate() + 2);
	let lastId = 0;
	const { data: cap, error: capError } = await client.from('analytics_collection_diagnostics').select('id').order('id', {ascending:false}).limit(1);
	if (capError) throw capError;
	const highWater = Number(cap?.[0]?.id ?? 0);
	while (lastId < highWater) {
		const { data, error } = await client.from('analytics_collection_diagnostics')
			.select('id, diagnostic_type, status, occurred_at, traffic_context, album_key, photo_id, source, result_count, error_code')
			.gte('occurred_at', fromUtc.toISOString()).lt('occurred_at', toUtc.toISOString())
			.gt('id', lastId).lte('id', highWater).order('id', { ascending: true }).limit(1000);
		if (error) throw error;
		rows.push(...((data ?? []) as DiagnosticRow[]));
		if ((data ?? []).length < 1000) return rows;
		lastId = Number(data![data!.length - 1].id);
	}
	return rows;
}

function groupRows(rows: DailyActionRow[], key: (row: DailyActionRow) => string): Group[] {
	const groups = new Map<string, Omit<Group, 'key'>>();
	for (const row of rows) {
		const group = groups.get(key(row)) ?? { count: 0, lastActivity: null, publicationAt: null };
		group.count += Number(row.action_count);
		const activity = row.latest_event_at ?? row.bucket_date;
		group.lastActivity = !group.lastActivity || activity > group.lastActivity ? activity : group.lastActivity;
		group.publicationAt ||= row.publication_at ?? null;
		groups.set(key(row), group);
	}
	return [...groups.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function bucketCoverage(dates: string[], coverage: Map<string, Coverage>): Coverage {
	return coverageFromStates(dates.map((date) => coverage.get(date) ?? 'unavailable'));
}

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T12:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

function queryForDates(query: ReportQuery, start: string, end: string): ReportQuery {
	return { ...query, start, end };
}

async function distinctVisitors(client: SupabaseClient, query: ReportQuery, allowedAlbumKeys?: string[]): Promise<OperatorReport['visitorEstimate']> {
	const { data, error } = await client.rpc('analytics_count_distinct_visitors', {
		p_start: query.start,
		p_end: query.end,
		p_album_keys: allowedAlbumKeys ? (allowedAlbumKeys.length ? allowedAlbumKeys : ['__no_public_albums__']) : query.scope === 'all' ? [] : query.albumKeys,
		p_sport: query.sport ?? null,
		p_category: query.category ?? null,
		p_source: query.source ?? null,
		p_event_date: query.eventDate ?? null,
		p_season: query.season ?? null,
		p_album_event_type: query.albumEventType ?? null,
		p_measure: null,
		p_traffic: query.traffic
	});
	if (error) {
		console.error('[analytics distinct visitors] unavailable:', error.message);
		return { value: null, limit: 'Estimated visitors are unavailable because the protected retained-data query could not run.' };
	}
	if (data === null) return { value: null, limit: 'Estimated visitors are unavailable because the full selected interval no longer has retained raw evidence for exact deduplication.' };
	return { value: Number(data), limit: 'Estimated browsers with any recorded activity in these albums and dates, including direct photo visits and tagged arrivals. They are counted once across the report, not added across days. This is not a verified people count.' };
}

function formulaSafe(value: string | number | null): string {
	const text = String(value ?? '');
	return typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function emptyReport(query: ReportQuery, error: string): OperatorReport {
	const fallback = comparisonWindow(query) ?? { start: query.start, end: query.end };
	return {
		available: false, error, query, previous: fallback, comparison: null,
		coverage: 'unavailable', previousCoverage: 'unavailable', total: null, previousTotal: null,
		observedTotal: 0, catalogueBasis:'unavailable', today: {date: dateOnly(new Date()), count: null, asOf: null}, dataAsOf: null, preservedSince: null,
		change: null, rising: risingComparison(query, 'unavailable', 'unavailable'), daily: [], albums: [], photos: [], albumOnlyActions: [],
		sources: { arrivals: [], openLocations: [], unknown: 0 }, traffic: [], trafficImpact: [], diagnostics: [],
		diagnosticsCoverage: { availableFrom: null, label: 'Unavailable while the report source cannot be read.', error: 'Report source unavailable' },
		visitorEstimate: { value: null, limit: 'Unavailable while the report source cannot be read.' },
		publicationAge: { available: false, label: 'Unavailable while the report source cannot be read.', days: 0, albums: [], missingAlbumKeys: [] },
		generatedAt: new Date().toISOString()
	};
}

/** One server-only contract for screen and CSV. No raw identifier, search text, or private note leaves this module. */
export async function buildOperatorReport(client: SupabaseClient, query: ReportQuery, options: { publicOnly?: boolean } = {}): Promise<OperatorReport> {
	const comparisonDates = comparisonWindow(query);
	const previous = comparisonDates ?? { start: query.start, end: query.end };
	try {
		const [allCatalogue, allPublicationData] = await Promise.all([
			fetchCatalogue(client),
			fetchAllPublicationSettings(client)
		]);
		const excluded = new Set(options.publicOnly ? allPublicationData.filter(album => album.visibility === 'unlisted').map(album => album.album_key) : []);
		const catalogue = allCatalogue.filter(album => !excluded.has(album.album_key));
		const publicationData = allPublicationData.filter(album => !excluded.has(album.album_key));
		const scopedPublication = publicationData.filter((album): album is { album_key: string; published_at: string } =>
			!!album.published_at && (query.scope === 'all' || query.albumKeys.includes(album.album_key))
		);
		const ageDays = datesInclusive(query.start, query.end).length;
		const publicationStarts = (query.compare === 'publication_age' ? scopedPublication : []).map((album) => dateOnly(new Date(album.published_at)));
		const allStarts = [query.start, ...(comparisonDates ? [comparisonDates.start] : []), ...publicationStarts];
		const todayDate = dateOnly(new Date());
		const allEnds = [query.end, todayDate, ...(comparisonDates ? [comparisonDates.end] : []), ...publicationStarts.map((date) => addDays(date, ageDays - 1))];
		const fetchStart = allStarts.sort()[0];
		const fetchEnd = allEnds.sort().at(-1) ?? query.end;

  const [evidence, diagnosticResult, firstDiagnostic, firstCoverage] = await Promise.all([
   fetchEvidence(client, fetchStart, fetchEnd),
   fetchAllDiagnostics(client, query.start, query.end).then(rows => ({rows, error:null as string|null})).catch(() => ({rows:[] as DiagnosticRow[], error:'Diagnostic records could not be read. Counts are unavailable.'})),
   client.from('analytics_diagnostic_coverage').select('first_recorded_at').order('first_recorded_at').limit(1),
   client.from('analytics_daily_coverage').select('bucket_date').order('bucket_date').limit(1)
  ]);
  const rows = evidence.rows.filter(row => !excluded.has(row.album_key));
  const diagnosticsRows = diagnosticResult.rows;
  let diagnosticError = diagnosticResult.error || (firstDiagnostic.error ? 'Diagnostic coverage could not be read.' : null);
  const coverageByDate = new Map(evidence.coverage.map(entry => [entry.bucket_date, entry.coverage_state]));
  // Today's observations are always partial, regardless of an erroneous/future cutoff in a source.
  if (coverageByDate.has(todayDate)) coverageByDate.set(todayDate, 'partial');
  const dataAsOf = evidence.coverage.filter(entry=>entry.bucket_date>=query.start&&entry.bucket_date<=query.end).map(entry => entry.reconciled_at ?? entry.cutoff_at).filter(Boolean).sort().at(-1) ?? null;
  const preservedSince = firstCoverage.error ? null : firstCoverage.data?.[0]?.bucket_date ?? null;
  const todayQuery = queryForDates(query, todayDate, todayDate);
  const todayRows = rows.filter(row => rowMatches(row, todayQuery) && rowMatchesMeasure(row, query.measure));
  const today = {date:todayDate, count:coverageByDate.has(todayDate) ? todayRows.reduce((n,row)=>n+Number(row.action_count),0) : null, asOf:evidence.coverage.find(row=>row.bucket_date===todayDate)?.cutoff_at ?? null};
		const currentDates = datesInclusive(query.start, query.end);
		const coverage = bucketCoverage(currentDates, coverageByDate);
		const comparisonCoverage = comparisonDates ? bucketCoverage(datesInclusive(comparisonDates.start, comparisonDates.end), coverageByDate) : 'unavailable';
		const currentRows = rows.filter((row) => rowMatches(row, query) && rowMatchesMeasure(row, query.measure));
		const comparisonQuery = comparisonDates ? queryForDates(query, comparisonDates.start, comparisonDates.end) : null;
		const comparisonRows = comparisonQuery ? rows.filter((row) => rowMatches(row, comparisonQuery) && rowMatchesMeasure(row, query.measure)) : [];
		const currentEvidenceRows = rows.filter((row) => rowMatches(row, query));
		const comparisonEvidenceRows = comparisonQuery ? rows.filter((row) => rowMatches(row, comparisonQuery)) : [];
		const risingState = risingComparison(query, coverage, comparisonCoverage);
		const zeroMeasures = (): MeasureTotals => ({ photo_opens: null, album_opens: null, downloads: null, favorites: null, shares: null });
		const measuresFor = (predicate: (row: DailyActionRow) => boolean): MeasureTotals => {
			const totals = zeroMeasures();
			if (coverage !== 'complete') return totals;
			for (const measure of ['photo_opens', 'album_opens', 'downloads', 'favorites', 'shares'] as const) {
				totals[measure] = currentEvidenceRows
					.filter((row) => predicate(row) && rowMatchesMeasure(row, measure))
					.reduce((sum, row) => sum + Number(row.action_count), 0);
			}
			return totals;
		};
		const currentCount = currentRows.reduce((sum, row) => sum + Number(row.action_count), 0);
		const comparisonCount = comparisonRows.reduce((sum, row) => sum + Number(row.action_count), 0);
		const total = coverage === 'complete' ? currentCount : null;
		const previousTotal = comparisonDates && comparisonCoverage === 'complete' ? comparisonCount : null;
		const dailyGroups = new Map(groupRows(currentRows, (row) => row.bucket_date).map((group) => [group.key, group.count]));
		const daily = currentDates.map((date) => ({ date, coverage: coverageByDate.get(date) ?? 'unavailable', count: coverageByDate.get(date) === 'complete' ? dailyGroups.get(date) ?? 0 : null, observed: coverageByDate.has(date) ? dailyGroups.get(date) ?? 0 : null }));

  const pairs = (current: DailyActionRow[], priorRows: DailyActionRow[], key: (row:DailyActionRow)=>string, extraKeys: string[] = []) => {
   const currentMap = new Map(groupRows(current,key).map(row=>[row.key,row]));
   const priorMap = new Map(groupRows(priorRows,key).map(row=>[row.key,row]));
   return [...new Set([...currentMap.keys(), ...priorMap.keys(), ...extraKeys])].filter(Boolean).map(key=>{
    const group=currentMap.get(key);
    const count=group?.count ?? (coverage==='complete' ? 0 : null);
    const previousCount=comparisonDates && comparisonCoverage==='complete' ? priorMap.get(key)?.count ?? 0 : null;
    return {key,count,previousCount,difference:coverage==='complete' && count!==null && previousCount!==null ? count-previousCount : null,lastActivity:group?.lastActivity ?? null,publicationAt:group?.publicationAt ?? null};
   }).sort((a,b)=>(b.count ?? -1)-(a.count ?? -1)||a.key.localeCompare(b.key));
  };
  const eligibleCatalogue=catalogue.filter(album=>catalogueMatches(album,query));
  const albums=pairs(currentRows,comparisonRows,row=>row.album_key,[...new Set([...eligibleCatalogue.map(album=>album.album_key),...rows.filter(row=>rowMatches(row,query)).map(row=>row.album_key)])]).map(({key,...rest})=>({albumKey:key,...rest,risingValue:rest.count !== null && rest.previousCount !== null ? risingValue(rest.count, rest.previousCount, risingState) : null,measures:measuresFor(row=>row.album_key===key)}));
  const albumOnlyActions=pairs(currentRows.filter(row=>!row.photo_id),comparisonRows.filter(row=>!row.photo_id),row=>row.album_key).map(({key,...rest})=>({albumKey:key,...rest}));
  const photoGroups=pairs(currentRows.filter(row=>!!row.photo_id),comparisonRows.filter(row=>!!row.photo_id),row=>`${row.photo_id}\u0000${row.album_key}`);
		const previews = new Map<string, string>();
  const photoSegments = new Map<string, string>();
		const previewIds = photoGroups.map((group) => group.key.split('\u0000')[0]);
		// PostgREST encodes .in() values in the URL. Keep each request below proxy URI limits.
		for (let start = 0; start < previewIds.length; start += 100) {
			const { data, error } = await client.from('photo_metadata').select('photo_id, cf_image_id').in('photo_id', previewIds.slice(start, start + 100));
			if (error) throw error;
			for (const photo of data ?? []) if (photo.cf_image_id) {previews.set(photo.photo_id, cfImageUrl(photo.cf_image_id, 'thumbnail'));photoSegments.set(photo.photo_id,photo.cf_image_id);}
		}
  const photos = photoGroups.map(({key,publicationAt: _publicationAt,...rest})=>{
   const [photoId,albumKey]=key.split('\u0000');
   return {photoId,albumKey,...rest,risingValue:rest.count !== null && rest.previousCount !== null ? risingValue(rest.count, rest.previousCount, risingState) : null,measures:measuresFor(row=>row.photo_id===photoId && row.album_key===albumKey),imageUrl:previews.get(photoId)??null,photoSegment:photoSegments.get(photoId)??null};
  });

		const sourceRows = rows.filter((row) => rowMatches(row, query));
		const sourceGroups = (kind: DailyActionRow['source_kind']) => groupRows(sourceRows.filter((row) => row.source_kind === kind), (row) => row.source || 'unknown')
			.map(({ key, count }) => ({ source: key === 'direct' ? 'Unknown / no tag' : key, count }));
		const sources = {
			arrivals: sourceGroups('tagged_arrival'),
			openLocations: sourceGroups('internal_open_location'),
			unknown: sourceRows.filter((row) => row.source_kind === 'unknown').reduce((sum, row) => sum + Number(row.action_count), 0)
		};

		const diagnosticPhotoIds = [...new Set(diagnosticsRows.map((row) => row.photo_id).filter((value): value is string => !!value))];
		const diagnosticPhotoAlbums = new Map<string, { album_key: string | null; photo_category: string | null }>();
		for (let start = 0; start < diagnosticPhotoIds.length; start += 100) {
			const { data, error } = await client.from('photo_metadata').select('photo_id, album_key, photo_category').in('photo_id', diagnosticPhotoIds.slice(start, start + 100));
			if(error) diagnosticError = 'Diagnostic photo metadata could not be read.';
			for (const photo of data ?? []) diagnosticPhotoAlbums.set(photo.photo_id, photo);
		}
		const diagnosticAlbumKeys = [...new Set(diagnosticsRows.flatMap((row) => [row.album_key, row.photo_id ? diagnosticPhotoAlbums.get(row.photo_id)?.album_key : null]).filter((value): value is string => !!value))];
		const diagnosticAlbums = new Map<string, { sport: string | null; event_date: string | null; event_type: string | null }>();
		for (let start = 0; start < diagnosticAlbumKeys.length; start += 100) {
			const { data, error } = await client.from('albums').select('album_key, sport, event_date').in('album_key', diagnosticAlbumKeys.slice(start, start + 100));
			if(error) diagnosticError = 'Diagnostic album metadata could not be read.';
			for (const album of data ?? []) diagnosticAlbums.set(album.album_key, { ...album, event_type: null });
		}
		const scopedDiagnostics = diagnosticsRows.filter((row) => {
			if (dateOnly(new Date(row.occurred_at)) < query.start || dateOnly(new Date(row.occurred_at)) > query.end) return false;
			if (query.traffic === 'conservative' && row.traffic_context !== 'audience') return false;
			const albumKey = row.album_key ?? (row.photo_id ? diagnosticPhotoAlbums.get(row.photo_id)?.album_key : null);
			if (albumKey && excluded.has(albumKey)) return false;
			const album = albumKey ? diagnosticAlbums.get(albumKey) : undefined;
			if (query.scope !== 'all' && (!albumKey || !query.albumKeys.includes(albumKey))) return false;
			if (query.source && (row.source ?? 'direct') !== query.source) return false;
			if (query.category && (!row.photo_id || (diagnosticPhotoAlbums.get(row.photo_id)?.photo_category ?? 'unknown') !== query.category)) return false;
			if (query.sport && (album?.sport ?? 'unknown') !== query.sport) return false;
			if (query.eventDate && album?.event_date !== query.eventDate) return false;
			if (query.season && (album?.event_date?.slice(0, 4) ?? 'unknown') !== query.season) return false;
			if (query.albumEventType && (album?.event_type ?? 'unknown') !== query.albumEventType) return false;
			return true;
		});
		const diagnostics = aggregateDiagnostics(scopedDiagnostics);

		const selectedKeys = [...new Set([...eligibleCatalogue.map(album=>album.album_key),...rows.filter(row=>rowMatches(row,query)).map(row=>row.album_key)])];
		const publicationByAlbum = new Map(scopedPublication.map((album) => [album.album_key, album.published_at as string]));
		const ageAlbums = (query.compare === 'publication_age' ? selectedKeys : []).filter((key) => publicationByAlbum.has(key)).map((albumKey) => {
			const publishedAt = publicationByAlbum.get(albumKey)!;
			const publishedDay = dateOnly(new Date(publishedAt));
			const series = Array.from({ length: ageDays }, (_, age) => {
				const day = addDays(publishedDay, age);
				if (coverageByDate.get(day) !== 'complete') return null;
				const dayQuery = queryForDates({ ...query, scope: 'album', albumKeys: [albumKey] }, day, day);
				return rows.filter((row) => rowMatches(row, dayQuery) && rowMatchesMeasure(row, query.measure)).reduce((sum, row) => sum + Number(row.action_count), 0);
			});
			const ageCoverage = coverageFromStates(series.map((value) => value === null ? 'unavailable' : 'complete'));
			return { albumKey, publishedAt, total: ageCoverage === 'complete' ? series.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null, coverage: ageCoverage, series };
		}).sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.albumKey.localeCompare(b.albumKey));
		const missingAlbumKeys = selectedKeys.filter((key) => !publicationByAlbum.has(key));
		const publicationAge = query.compare === 'publication_age'
			? {
				available: ageAlbums.length > 0,
				label: ageAlbums.length
					? `Each album uses its first ${ageDays} calendar day${ageDays === 1 ? '' : 's'} after the recorded publication time. Albums with missing daily history remain unavailable.`
					: 'No selected album has a recorded publication time, so an equal-age comparison cannot be calculated.',
				days: ageDays, albums: ageAlbums, missingAlbumKeys
			}
			: { available: false, label: 'Choose publication-age comparison to align albums from their recorded publication dates.', days: ageDays, albums: [], missingAlbumKeys: [] };

  const inclusiveByAlbum=groupRows(rows.filter(row=>rowMatches(row,{...query,traffic:'inclusive'}) && rowMatchesMeasure(row,query.measure)),row=>row.album_key).sort((a,b)=>b.count-a.count || a.key.localeCompare(b.key));
  const conservativeByAlbum=groupRows(rows.filter(row=>rowMatches(row,{...query,traffic:'conservative'}) && rowMatchesMeasure(row,query.measure)),row=>row.album_key);
  const conservativeRanks=inclusiveByAlbum.map(item=>({key:item.key,count:conservativeByAlbum.find(row=>row.key===item.key)?.count??0})).sort((a,b)=>b.count-a.count || a.key.localeCompare(b.key));
  const trafficImpact=inclusiveByAlbum.map((item,index)=>{const rank=conservativeRanks.findIndex(row=>row.key===item.key);const conservative=conservativeRanks[rank]?.count??0;return {albumKey:item.key,inclusive:item.count,conservative,excluded:item.count-conservative,inclusiveRank:index+1,conservativeRank:rank+1};});
		const comparison = comparisonDates ? {
			start: comparisonDates.start,
			end: comparisonDates.end,
			total: previousTotal,
			coverage: comparisonCoverage,
			label: query.compare === 'custom' ? 'Selected comparison period' : 'Previous equal period'
		} : null;
		return {
			available: true, query, previous, comparison, coverage,
			catalogueBasis:[...new Set(evidence.coverage.filter(row=>row.bucket_date>=query.start&&row.bucket_date<=query.end).map(row=>row.catalogue_basis??'unknown'))].join(', ') || 'unavailable', trafficImpact, previousCoverage: comparisonCoverage, total, observedTotal:currentCount, today, dataAsOf, preservedSince, previousTotal,
			change: total !== null && previousTotal !== null && risingState.basis === 'absolute' ? rising(total, previousTotal) : null,
			rising: risingState,
			daily, albums, albumOnlyActions, photos, sources,
			traffic: groupRows(rows.filter(row=>rowMatches(row,{...query,traffic:'inclusive'}) && rowMatchesMeasure(row,query.measure)), (row) => row.traffic_classification).map(({ key, count }) => ({ classification: key, count })),
			diagnostics: diagnosticError ? [] : diagnostics,
   diagnosticsCoverage: {
    availableFrom:firstDiagnostic.error ? null : firstDiagnostic.data?.[0]?.first_recorded_at ?? null,
    error:diagnosticError,
    label:diagnosticError ?? (firstDiagnostic.data?.[0]?.first_recorded_at ? `First recorded diagnostic evidence: ${dateOnly(new Date(firstDiagnostic.data[0].first_recorded_at))}. Earlier coverage is unknown. This start does not prove uninterrupted delivery. Diagnostic content filters use current catalogue facts.` : 'No diagnostic evidence has been recorded. This is not a measured zero.')
   },
			visitorEstimate: await distinctVisitors(client, query, options.publicOnly ? selectedKeys : undefined), publicationAge, generatedAt: new Date().toISOString()
		};
	} catch (cause) {
		console.error('[analytics operator report] unavailable:', cause);
		return emptyReport(query, 'The daily analytics summary is unavailable. This is not a zero-result report.');
	}
}

export function reportCsv(report: OperatorReport, shortlist?: Set<string>, v2?: V2ReportProjection): string {
	const escape = (value: string | number | null) => `"${formulaSafe(value).replaceAll('"', '""')}"`;
	const filters = JSON.stringify({
		scope: report.query.scope, albums: report.query.albumKeys, sport: report.query.sport ?? null,
		category: report.query.category ?? null, source: report.query.source ?? null,
		eventDate: report.query.eventDate ?? null, season: report.query.season ?? null,
		albumEventType: report.query.albumEventType ?? null
	});
	const definition = report.query.measure === 'photo_opens'
		? 'Recorded photo view events deduplicated by visitor fingerprint, photo, event type, and UTC day. Chart dates use America/Chicago.'
		: report.query.measure === 'album_opens'
			? 'Recorded album-open events deduplicated by visitor fingerprint, album, event type, and UTC day. Chart dates use America/Chicago.'
			: `${report.query.measure.replaceAll('_', ' ')} are recorded actions, not verified downstream outcomes.`;
	const header = ['row_type', 'photo_id', 'album_key', 'count', 'comparison_count', 'difference', 'last_activity', 'measure', 'photo_opens', 'album_opens', 'downloads', 'favorites', 'shares', 'v2_label', 'v2_coverage', 'definition', 'period_start', 'period_end', 'comparison_start', 'comparison_end', 'timezone', 'coverage', 'traffic_rule', 'filters', 'visitor_estimate', 'catalogue_basis', 'generated_at'];
	const common = [report.query.measure, definition, report.query.start, report.query.end, report.comparison?.start ?? null, report.comparison?.end ?? null, 'America/Chicago', report.coverage, report.query.traffic, filters, report.visitorEstimate.value, report.catalogueBasis, report.generatedAt];
	const measureColumns = (measures: MeasureTotals | undefined) => measures
		? [measures.photo_opens, measures.album_opens, measures.downloads, measures.favorites, measures.shares]
		: [null, null, null, null, null];
	const photoRows = report.photos.filter((row) => !shortlist || shortlist.has(row.photoId)).map((row) => ['photo', row.photoId, row.albumKey, row.count, row.previousCount, row.difference, row.lastActivity, report.query.measure, ...measureColumns(row.measures), null, null, ...common.slice(1)]);
	const albumRows = (report.query.measure === 'album_opens' ? report.albums : report.albumOnlyActions).map((row) => {
		const measures = 'measures' in row ? row.measures as MeasureTotals : undefined;
		return ['albumKey' in row && report.query.measure === 'album_opens' ? 'album' : 'album_action', null, row.albumKey, row.count, row.previousCount, row.difference, row.lastActivity, report.query.measure, ...measureColumns(measures), null, null, ...common.slice(1)];
	});
	const v2Rows = shortlist || !v2 ? [] : v2.counts.map((row) => ['v2_event', null, null, row.count, null, null, null, 'v2_observation', null, null, null, null, null, row.label, v2.coverage.label, 'Recorded version-2 event observations; no legacy daily deduplication or conversion inference.', report.query.start, report.query.end, null, null, 'America/Chicago', v2.available ? 'available' : 'unavailable', report.query.traffic, filters, null, 'public_album_visibility', report.generatedAt]);
	const rows = shortlist ? photoRows : [...photoRows, ...albumRows, ...v2Rows];
	return [header, ...rows].map((row) => row.map((value) => escape(value as string | number | null)).join(',')).join('\n');
}
