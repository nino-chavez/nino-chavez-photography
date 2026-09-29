/**
 * The shared, server-only analytics report contract.
 *
 * This module deliberately has no Supabase imports. It owns date and comparison
 * rules so the page, CSV export, and tests cannot drift into three definitions.
 */
export const REPORT_TIME_ZONE = 'America/Chicago';
export const REPORT_MEASURES = ['photo_opens', 'album_opens', 'downloads', 'favorites', 'shares'] as const;
export type ReportMeasure = (typeof REPORT_MEASURES)[number];
export type TrafficMode = 'inclusive' | 'conservative';
export type ReportScope = 'all' | 'album' | 'selected';
export type ComparisonMode = 'previous' | 'custom' | 'publication_age' | 'none';

export interface ReportQuery {
	start: string;
	end: string;
	measure: ReportMeasure;
	scope: ReportScope;
	albumKeys: string[];
	sport?: string;
	category?: string;
	source?: string;
	eventDate?: string;
	season?: string;
	albumEventType?: string;
	compare: ComparisonMode;
	compareStart?: string;
	compareEnd?: string;
	traffic: TrafficMode;
}

export interface DailyActionRow {
	id?: number;
	bucket_date: string;
	album_key: string;
	photo_id: string;
	event_type: string;
	source: string;
	source_kind: 'tagged_arrival' | 'internal_open_location' | 'action' | 'unknown';
	sport: string;
	event_date?: string | null;
	album_event_type?: string;
	publication_at?: string | null;
	photo_category: string;
	traffic_classification: 'audience' | 'operator' | 'test' | 'known_crawler' | 'suspected_automation' | 'unclassified';
	action_count: number | string;
	coverage_state: 'complete' | 'partial' | 'unavailable';
	latest_event_at?: string | null;
}

export function dateOnly(value: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: REPORT_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(value);
}

/** Convert a Chicago calendar boundary to UTC without assuming a fixed DST offset. */
export function chicagoDayStart(day:string):string {
 const target=Date.parse(`${day}T00:00:00Z`);
 let instant=target;
 for(let attempt=0;attempt<3;attempt++) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:REPORT_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const local=Date.parse(`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`);
  instant+=target-local;
 }
 return new Date(instant).toISOString();
}

function calendarDaysBefore(today: Date, days: number): string {
	const copy = new Date(`${dateOnly(today)}T12:00:00Z`);
	copy.setUTCDate(copy.getUTCDate() - days);
	return copy.toISOString().slice(0, 10);
}

function cleanDate(value: string | null, fallback: string): string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
	const parsed = new Date(`${value}T12:00:00Z`);
	return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? fallback : value;
}

function list(value: string | null): string[] {
	return (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 25);
}

export function parseReportQuery(search: URLSearchParams, now = new Date()): ReportQuery {
	const period = search.get('period') ?? '30';
	const end = cleanDate(search.get('end'), calendarDaysBefore(now, 1));
	const days = period === '7' || period === '90' ? Number(period) : 30;
	const start = period === 'custom'
		? cleanDate(search.get('start'), calendarDaysBefore(now, 30))
		: calendarDaysBefore(new Date(`${end}T12:00:00Z`), days - 1);
	const measure = REPORT_MEASURES.includes(search.get('measure') as ReportMeasure)
		? (search.get('measure') as ReportMeasure)
		: 'photo_opens';
	const albumKeys = list(search.get('albums'));
	const scope = search.get('scope') === 'album' && albumKeys.length === 1
		? 'album'
		: search.get('scope') === 'selected' && albumKeys.length > 1 ? 'selected' : 'all';
	return {
		start: start <= end ? start : end,
		end: start <= end ? end : start,
		measure,
		scope,
		albumKeys,
		sport: search.get('sport')?.trim() || undefined,
		category: search.get('category')?.trim() || undefined,
		source: search.get('source')?.trim() || undefined,
		eventDate: cleanDate(search.get('event_date'),'') || undefined,
		season: search.get('season') && (/^(\d{4}|unknown)$/.test(search.get('season')!)) ? search.get('season')! : undefined,
		albumEventType: search.get('event_type')?.trim() || undefined,
		compare: search.get('compare') === 'publication_age' ? 'publication_age'
			: search.get('compare') === 'custom' ? 'custom'
			: search.get('compare') === 'none' ? 'none' : 'previous',
		compareStart: search.get('compare') === 'custom' ? cleanDate(search.get('compare_start'), calendarDaysBefore(now, 60)) : undefined,
		compareEnd: search.get('compare') === 'custom' ? cleanDate(search.get('compare_end'), calendarDaysBefore(now, 31)) : undefined,
		traffic: search.get('traffic') === 'inclusive' ? 'inclusive' : 'conservative'
	};
}

export function previousWindow(query: Pick<ReportQuery, 'start' | 'end'>): { start: string; end: string } {
	const start = new Date(`${query.start}T12:00:00Z`);
	const end = new Date(`${query.end}T12:00:00Z`);
	const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	start.setUTCDate(start.getUTCDate() - span);
	end.setUTCDate(end.getUTCDate() - span);
	return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function comparisonWindow(query: ReportQuery): { start: string; end: string } | null {
	if (query.compare === 'none' || query.compare === 'publication_age') return null;
	if (query.compare === 'previous') return previousWindow(query);
	const start = query.compareStart ?? previousWindow(query).start;
	const end = query.compareEnd ?? previousWindow(query).end;
	return start <= end ? { start, end } : { start: end, end: start };
}

export function datesInclusive(start: string, end: string): string[] {
	const dates: string[] = [];
	for (const cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
	return dates;
}

export function isConservative(row: Pick<DailyActionRow, 'traffic_classification'>): boolean {
	return row.traffic_classification === 'audience' || row.traffic_classification === 'unclassified';
}

export function rowMatches(row: DailyActionRow, query: ReportQuery): boolean {
	if (row.bucket_date < query.start || row.bucket_date > query.end) return false;
	if (query.scope !== 'all' && !query.albumKeys.includes(row.album_key)) return false;
	if (query.sport && row.sport !== query.sport) return false;
	if (query.category && row.photo_category !== query.category) return false;
	if (query.source && row.source !== query.source) return false;
	if (query.eventDate && row.event_date !== query.eventDate) return false;
	if (query.season && (row.event_date?.slice(0, 4) ?? 'unknown') !== query.season) return false;
	if (query.albumEventType && row.album_event_type !== query.albumEventType) return false;
	return query.traffic === 'inclusive' || isConservative(row);
}

export function measureEventType(measure: ReportMeasure): string {
	return measure === 'photo_opens' ? 'view' : measure === 'album_opens' ? 'album_open' : measure.slice(0, -1);
}

export function rowMatchesMeasure(row: DailyActionRow, measure: ReportMeasure): boolean {
	if (measure === 'photo_opens') return row.event_type === 'view' && !!row.photo_id;
	if (measure === 'album_opens') return row.event_type === 'album_open' && !row.photo_id;
	return row.event_type === measureEventType(measure);
}

export function sumMeasure(rows: DailyActionRow[], query: ReportQuery): number {
	return rows
		.filter((row) => rowMatches(row, query) && rowMatchesMeasure(row, query.measure))
		.reduce((total, row) => total + Number(row.action_count), 0);
}

export function coverageFor(rows: DailyActionRow[], query: ReportQuery): 'complete' | 'partial' | 'unavailable' {
	const relevant = rows.filter((row) => rowMatches(row, query));
	if (relevant.length === 0) return 'unavailable';
	return relevant.some((row) => row.coverage_state !== 'complete') ? 'partial' : 'complete';
}

/** Coverage is an independent ledger: a complete zero-day has no action row. */
export function coverageFromStates(states: Array<'complete' | 'partial' | 'unavailable'>): 'complete' | 'partial' | 'unavailable' {
	if (states.length === 0 || states.some((state) => state === 'unavailable')) return 'unavailable';
	return states.some((state) => state === 'partial') ? 'partial' : 'complete';
}

export function rising(current: number, previous: number): { difference: number; label: string } {
	const difference = current - previous;
	if (previous === 0) return { difference, label: current === 0 ? 'No recorded activity' : 'New activity' };
	return { difference, label: `${difference >= 0 ? '+' : ''}${difference} actions` };
}
