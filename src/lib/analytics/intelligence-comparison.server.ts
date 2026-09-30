import type { SupabaseClient } from '@supabase/supabase-js';
import { comparisonWindow } from './report-contract';
import type { IntelligenceScope } from './intelligence-contract';

export type AlbumFact = { album_key: string; album_name?: string | null; sport: string | null; event_type: string | null; event_date: string | null; division: string | null; level: string | null; visibility?: string | null };
export type AlbumComparison = {
	available: boolean;
	criteria: string[];
	comparableAlbumKeys: string[];
	excluded: { missingKnownFacts: number; hidden: number; nonMatching: number };
	reason?: string;
	target?: { albumKey: string; current: number | null; previous: number | null; href: string };
	peers?: Array<{ albumKey: string; current: number | null; previous: number | null; href: string }>;
	median?: number | null;
	sampleSize?: number;
	coverage?: { current: 'complete' | 'partial' | 'unavailable'; previous: 'complete' | 'partial' | 'unavailable' };
	windows?: { current: { start: string; end: string }; previous: { start: string; end: string } | null };
	publicationAge?: { available: boolean; days: number; sampleSize: number; target: number | null; median: number | null; reason?: string };
	units?: string;
};
const unavailable = (reason: string): AlbumComparison => ({ available: false, criteria: [], comparableAlbumKeys: [], excluded: { missingKnownFacts: 0, hidden: 0, nonMatching: 0 }, reason });
const median = (values: number[]): number | null => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const link = (fact: AlbumFact) => `/albums/${encodeURIComponent(`${slugify(fact.album_name?.trim() || fact.album_key)}-${fact.album_key}`)}`;

/** Stored answers never supply links or catalogue authority to a public read. */
export async function projectAlbumComparison(client: SupabaseClient, scope: IntelligenceScope, value: unknown): Promise<AlbumComparison> {
	if (scope.kind !== 'gallery' || scope.query.albumKeys.length !== 1 || !value || typeof value !== 'object') return unavailable('The saved comparison is unavailable.');
	const row = value as AlbumComparison;
	const validCount = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
	if (!row.target || row.target.albumKey !== scope.query.albumKeys[0] || !Array.isArray(row.peers) || row.peers.length > 25
		|| !Array.isArray(row.criteria) || !row.criteria.every((v) => typeof v === 'string')
		|| ![row.target, ...row.peers].every((v) => typeof v?.albumKey === 'string' && validCount(v.current) && validCount(v.previous))
		|| !row.windows || row.windows.current.start !== scope.query.start || row.windows.current.end !== scope.query.end
		|| row.units !== scope.query.measure) return unavailable('The saved comparison does not match this report.');
	const keys = [row.target.albumKey, ...row.peers.map((v) => v.albumKey)];
	if (new Set(keys).size !== keys.length) return unavailable('The saved comparison contains duplicate albums.');
	const [facts, settings] = await Promise.all([
		client.from('albums').select('album_key, album_name, sport, event_type, event_date, division, level').in('album_key', keys),
		client.from('album_settings').select('album_key, visibility').in('album_key', keys)
	]);
	if (facts.error || settings.error) return unavailable('Current public catalogue visibility could not be checked.');
	const hidden = new Set((settings.data ?? []).filter((v) => v.visibility === 'unlisted').map((v) => v.album_key));
	const byKey = new Map<string, AlbumFact>((facts.data ?? []).map((v) => [v.album_key, v as AlbumFact]));
	if (keys.some((key) => !byKey.has(key) || hidden.has(key))) return unavailable('An album in this saved comparison is no longer public. Run a new comparison.');
	const currentFacts = comparableAlbums(byKey.get(keys[0])!, keys.slice(1).map((key) => byKey.get(key)!));
	if (JSON.stringify(currentFacts.criteria) !== JSON.stringify(row.criteria) || currentFacts.comparableAlbumKeys.length !== row.peers.length) return unavailable('Known album facts have changed since this comparison. Run a new comparison.');
	const project = (v: NonNullable<AlbumComparison['target']>) => ({ albumKey: v.albumKey, current: v.current, previous: v.previous, href: link(byKey.get(v.albumKey)!) });
	const peers = row.peers.map(project);
	const values = row.coverage?.current === 'complete' ? peers.flatMap((v) => v.current === null ? [] : [v.current]) : [];
	const age = row.publicationAge;
	const validAge = age && typeof age.available === 'boolean' && Number.isSafeInteger(age.days) && age.days > 0
		&& Number.isSafeInteger(age.sampleSize) && age.sampleSize >= 0 && age.sampleSize <= peers.length && validCount(age.target) && validCount(age.median);
	return {
		available: row.available === true && values.length > 0, target: project(row.target), peers,
		criteria: currentFacts.criteria, comparableAlbumKeys: currentFacts.comparableAlbumKeys, excluded: currentFacts.excluded,
		median: median(values), sampleSize: values.length, units: scope.query.measure,
		coverage: row.coverage, windows: { current: { start: scope.query.start, end: scope.query.end }, previous: comparisonWindow(scope.query) },
		...(validAge ? { publicationAge: { available: age.available && age.sampleSize >= 3, days: age.days, sampleSize: age.sampleSize, target: age.target, median: age.median, ...(typeof age.reason === 'string' ? { reason: age.reason } : {}) } } : {}),
		...(values.length < 3 ? { reason: 'Fewer than three complete public peers are available; values are shown without a peer ranking.' } : {})
	};
}
type ComparisonReport = { coverage: 'complete' | 'partial' | 'unavailable'; previousCoverage: 'complete' | 'partial' | 'unavailable'; albums: Array<{ albumKey: string; count: number | null; previousCount: number | null }>; publicationAge: { available: boolean; days: number; albums: Array<{ albumKey: string; coverage: 'complete' | 'partial' | 'unavailable'; total: number | null }> } };
type ReportLoader = (client: SupabaseClient, query: Extract<IntelligenceScope, { kind: 'gallery' }>['query']) => Promise<ComparisonReport>;
async function scheduledReport(client: SupabaseClient, query: Extract<IntelligenceScope, { kind: 'gallery' }>['query']): Promise<ComparisonReport> {
	const { fetchScheduledGalleryReport } = await import('./scheduled-gallery-report.server');
	return fetchScheduledGalleryReport(client, query, { publicOnly: true, includeToday: false, photoWindow: { page: 0, pageSize: 0, rank: 'popular' } });
}

/** Pure known-fact comparator. It never infers a team, date, or sport. */
export function comparableAlbums(target: AlbumFact | null, candidates: AlbumFact[]): AlbumComparison {
	if (!target || !target.sport || !target.event_type) return unavailable('The selected album lacks the known sport or event type needed for a comparison.');
	const criteria = [`sport = ${target.sport}`, `event type = ${target.event_type}`];
	if (target.division) criteria.push(`division = ${target.division}`);
	if (target.level) criteria.push(`level = ${target.level}`);
	if (target.event_date) criteria.push(`event year = ${target.event_date.slice(0, 4)}`);
	let hidden = 0; let missingKnownFacts = 0; let nonMatching = 0;
	const comparableAlbumKeys = candidates.filter((candidate) => {
		if (candidate.album_key === target.album_key) return false;
		if (candidate.visibility === 'unlisted') { hidden += 1; return false; }
		if (!candidate.sport || !candidate.event_type) { missingKnownFacts += 1; return false; }
		const match = candidate.sport === target.sport && candidate.event_type === target.event_type
			&& (!target.division || candidate.division === target.division) && (!target.level || candidate.level === target.level)
			&& (!target.event_date || candidate.event_date?.slice(0, 4) === target.event_date.slice(0, 4));
		if (!match) nonMatching += 1;
		return match;
	}).map((candidate) => candidate.album_key).sort().slice(0, 25);
	return { available: comparableAlbumKeys.length > 0, criteria, comparableAlbumKeys, excluded: { missingKnownFacts, hidden, nonMatching }, ...(comparableAlbumKeys.length ? {} : { reason: 'No public albums match every available known comparison fact.' }) };
}

/** One bounded peer report: target plus at most 25 public peers, never a per-album query loop. */
export async function calculateAlbumComparison(client: SupabaseClient, scope: IntelligenceScope, options: { loadReport?: ReportLoader } = {}): Promise<AlbumComparison> {
	if (scope.kind !== 'gallery' || scope.query.albumKeys.length !== 1) return unavailable('Album comparison requires one selected album in the stored scope.');
	const targetKey = scope.query.albumKeys[0];
	const targetResult = await client.from('albums').select('album_key, album_name, sport, event_type, event_date, division, level').eq('album_key', targetKey).maybeSingle();
	if (targetResult.error || !targetResult.data) return unavailable('The selected album catalogue record is unavailable.');
	const target = targetResult.data as AlbumFact;
	if (!target.sport || !target.event_type) return comparableAlbums(target, []);
	let candidates = client.from('albums').select('album_key, album_name, sport, event_type, event_date, division, level').eq('sport', target.sport).eq('event_type', target.event_type).neq('album_key', targetKey).order('album_key').limit(25);
	if (target.division) candidates = candidates.eq('division', target.division);
	if (target.level) candidates = candidates.eq('level', target.level);
	if (target.event_date) candidates = candidates.gte('event_date', `${target.event_date.slice(0, 4)}-01-01`).lte('event_date', `${target.event_date.slice(0, 4)}-12-31`);
	const candidateResult = await candidates;
	if (candidateResult.error) throw new Error('album catalogue unavailable');
	const candidateFacts = (candidateResult.data ?? []) as AlbumFact[];
	const keys = [targetKey, ...candidateFacts.map((candidate) => candidate.album_key)];
	const settingsResult = await client.from('album_settings').select('album_key, visibility').in('album_key', keys);
	if (settingsResult.error) throw new Error('album catalogue visibility unavailable');
	const visibility = new Map((settingsResult.data ?? []).map((row) => [row.album_key, row.visibility]));
	const withVisibility = candidateFacts.map((candidate) => ({ ...candidate, visibility: visibility.get(candidate.album_key) ?? 'public' }));
	const selected = comparableAlbums({ ...target, visibility: visibility.get(targetKey) ?? 'public' }, withVisibility);
	if ((visibility.get(targetKey) ?? 'public') === 'unlisted') return unavailable('The selected album is not public.');
	if (!selected.available) return selected;
	const factsByKey = new Map([[targetKey, target], ...withVisibility.map((candidate) => [candidate.album_key, candidate] as const)]);
	const selectedKeys = [targetKey, ...selected.comparableAlbumKeys];
	// The scheduled report keeps the requested calendar window for `albums` while
	// adding the exact recorded-publication-age series in the same bounded RPC.
	const query = { ...scope.query, scope: 'selected' as const, albumKeys: selectedKeys };
	const loadReport = options.loadReport ?? scheduledReport;
	const report = await loadReport(client, query);
	const ageReport = query.compare === 'publication_age' ? report : await loadReport(client, { ...query, compare: 'publication_age', compareStart: undefined, compareEnd: undefined });
	const rows = new Map(report.albums.map((row) => [row.albumKey, row]));
	const rowFor = (albumKey: string) => {
		const row = rows.get(albumKey); const fact = factsByKey.get(albumKey)!;
		return { albumKey, current: row?.count ?? null, previous: row?.previousCount ?? null, href: link(fact) };
	};
	const peerRows = selected.comparableAlbumKeys.map(rowFor);
	const currentPeerValues = report.coverage === 'complete' ? peerRows.map((row) => row.current).filter((value): value is number => value !== null) : [];
	const publicationRows = ageReport.publicationAge.albums;
	const publicationByKey = new Map(publicationRows.map((row) => [row.albumKey, row]));
	const targetAge = publicationByKey.get(targetKey);
	const peerAgeValues = ageReport.publicationAge.available && targetAge?.coverage === 'complete'
		? selected.comparableAlbumKeys.map((key) => publicationByKey.get(key)).filter((row): row is NonNullable<typeof row> => row?.coverage === 'complete' && row.total !== null).map((row) => row.total!) : [];
	const publicationAge = ageReport.publicationAge.available
		? { available: peerAgeValues.length >= 3 && targetAge?.coverage === 'complete', days: ageReport.publicationAge.days, sampleSize: peerAgeValues.length, target: targetAge?.coverage === 'complete' ? targetAge.total : null, median: median(peerAgeValues), ...(peerAgeValues.length < 3 ? { reason: 'Fewer than three complete public peers share this publication-age window; no peer ranking is shown.' } : {}) }
		: { available: false, days: ageReport.publicationAge.days, sampleSize: 0, target: null, median: null, reason: 'Publication-age values require a selected report with recorded publication times and complete daily coverage.' };
	return {
		...selected, available: report.coverage === 'complete' && currentPeerValues.length > 0,
		target: rowFor(targetKey), peers: peerRows, median: median(currentPeerValues), sampleSize: currentPeerValues.length,
		coverage: { current: report.coverage, previous: report.previousCoverage }, units: scope.query.measure, windows: { current: { start: query.start, end: query.end }, previous: comparisonWindow(scope.query) },
		publicationAge,
		...(currentPeerValues.length < 3 ? { reason: 'Fewer than three complete public peers are available; values are shown without a peer ranking.' } : {})
	};
}
