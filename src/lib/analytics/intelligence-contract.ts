import { assertReportDateBounds, comparisonWindow, dateOnly, type ReportQuery } from './report-contract';
import type { SiteSection } from './site-traffic';

export type IntelligenceScope =
	| { kind: 'gallery'; query: ReportQuery }
	| { kind: 'sites'; period: 7 | 30 | 90; section: SiteSection | 'all' };

export type IntelligenceCoverage = 'complete' | 'partial' | 'unavailable';
export type FindingStatus = 'open' | 'dismissed' | 'snoozed' | 'recorded' | 'recovered';
export type EvidenceStrength = 'strong' | 'exploratory' | 'limited';

export interface FindingEvidence {
	windows: { current: { start: string; end: string }; previous?: { start: string; end: string } | null };
	cutoff: string | null;
	coverage: IntelligenceCoverage;
	previousCoverage?: IntelligenceCoverage | null;
	units: string;
	/** A short statement of the allowed aggregate cohort, never a visitor identifier. */
	eligibility?: string;
	numerator?: number;
	denominator?: number;
	current?: number;
	previous?: number;
	strength: EvidenceStrength;
}

export interface Finding {
	id: string;
	rule: string;
	target: { kind: 'gallery' | 'album' | 'photo' | 'site' | 'page'; id?: string | null; albumKey?: string | null };
	title: string;
	explanation: string;
	action: string;
	evidence: FindingEvidence;
	reportHref: string;
	/** Stored only when the linked public photo still exists; projection rechecks it. */
	evidenceLinks?: string[];
	status: FindingStatus;
}

export interface IntelligenceSuppression { rule: string; target?: Finding['target']; reason: string; }

export interface IntelligenceAction {
	id: string;
	kind: 'record' | 'dismiss' | 'snooze' | 'undo';
	/** For undo, the owned lifecycle action being reversed. */
	actionId?: string | null;
	findingId?: string | null;
	target?: Finding['target'] | null;
	actualAt?: string | null;
	hypothesis?: string | null;
	primaryMeasure?: string | null;
	changeType?: 'promotion' | 'cover' | 'headline' | 'cta' | 'search_fix' | 'download_repair' | 'shooting' | 'editing' | 'other' | null;
	channel?: string | null;
	campaign?: string | null;
	release?: string | null;
	variant?: string | null;
	outcome?: 'unknown' | 'inquiry' | 'booking' | 'other' | null;
	observationDays?: number | null;
	followUpAt?: string | null;
	note?: string | null;
	createdAt: string;
}

export interface IntelligenceReport {
	snapshotId?: string;
	scope: IntelligenceScope;
	generatedAt: string;
	cutoff: string | null;
	coverage: IntelligenceCoverage;
	findings: Finding[];
	suppressions: IntelligenceSuppression[];
	actions: IntelligenceAction[];
	briefs: Array<{ id: string; periodKey: string; kind: 'daily' | 'weekly' | 'operational'; createdAt: string; body?: string; findings?: Finding[]; snapshotIds?: string[] }>;
	page: number;
	pageCount: number;
	owner: boolean;
}

export interface AssistantAnswer {
	scope: IntelligenceScope;
	question: string;
	operation: string;
	status: 'complete' | 'pending' | 'unavailable' | 'unsupported';
	summary: string;
	findings: Finding[];
	evidenceLinks: string[];
	limitations: string[];
	generatedAt: string;
	requestId?: string;
}

export const INTELLIGENCE_RULE_VERSION = 2;
export const INTELLIGENCE_PAGE_SIZE = 20;
export const STANDARD_SITE_INTELLIGENCE_SCOPES: readonly IntelligenceScope[] = [
	...(['all', 'profile', 'writing', 'demos', 'photography', 'other'] as const).flatMap((section) =>
		([7, 30, 90] as const).map((period) => ({ kind: 'sites' as const, period, section }))
	)
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_FILTERS = ['sport', 'category', 'source', 'season', 'albumEventType'] as const;
const scopeNames = new Set(['all', 'album', 'selected']);
const compareNames = new Set(['previous', 'custom', 'publication_age', 'none']);
const trafficNames = new Set(['inclusive', 'conservative']);

function validDate(value: unknown): value is string {
	return typeof value === 'string' && DATE.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
function text(value: unknown, limit: number): string | undefined | null {
	if (value === undefined || value === null) return undefined;
	return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit ? value.trim() : null;
}
function normalizeQuery(value: unknown): ReportQuery | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	const known = new Set(['start', 'end', 'measure', 'scope', 'albumKeys', 'compare', 'compareStart', 'compareEnd', 'traffic', ...TEXT_FILTERS, 'eventDate']);
	if (Object.keys(raw).some((key) => !known.has(key)) || !validDate(raw.start) || !validDate(raw.end)
		|| typeof raw.measure !== 'string' || !['photo_opens', 'album_opens', 'downloads', 'favorites', 'shares'].includes(raw.measure)
		|| typeof raw.scope !== 'string' || !scopeNames.has(raw.scope) || !Array.isArray(raw.albumKeys)
		|| raw.albumKeys.length > 25 || !raw.albumKeys.every((key) => typeof key === 'string' && key.trim().length > 0 && key.trim().length <= 180)
		|| typeof raw.compare !== 'string' || !compareNames.has(raw.compare) || typeof raw.traffic !== 'string' || !trafficNames.has(raw.traffic)) return null;
	const albumKeys = [...new Set(raw.albumKeys.map((key) => (key as string).trim()))].sort();
	if ((raw.scope === 'album' && albumKeys.length !== 1) || (raw.scope === 'selected' && albumKeys.length < 2) || (raw.scope === 'all' && albumKeys.length !== 0)) return null;
	const query: ReportQuery = { start: raw.start, end: raw.end, measure: raw.measure as ReportQuery['measure'], scope: raw.scope as ReportQuery['scope'], albumKeys, compare: raw.compare as ReportQuery['compare'], traffic: raw.traffic as ReportQuery['traffic'] };
	for (const key of TEXT_FILTERS) {
		const value = text(raw[key], key === 'source' ? 120 : 80);
		if (value === null) return null;
		if (value) query[key] = value;
	}
	if (raw.eventDate !== undefined && !validDate(raw.eventDate)) return null;
	if (validDate(raw.eventDate)) query.eventDate = raw.eventDate;
	if (query.season && !/^(\d{4}|unknown)$/.test(query.season)) return null;
	if (query.compare === 'custom') {
		if (!validDate(raw.compareStart) || !validDate(raw.compareEnd)) return null;
		query.compareStart = raw.compareStart; query.compareEnd = raw.compareEnd;
	} else if (raw.compareStart !== undefined || raw.compareEnd !== undefined) return null;
	try { assertReportDateBounds(query, 'evidence'); } catch { return null; }
	return query;
}

/** Strictly validates every field accepted by the persistence and public boundaries. */
export function parseIntelligenceScope(value: unknown): IntelligenceScope | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const raw = value as Record<string, unknown>;
	if (raw.kind === 'sites' && Object.keys(raw).every((key) => key === 'kind' || key === 'period' || key === 'section')
		&& ([7, 30, 90] as number[]).includes(raw.period as number)
		&& ['all', 'profile', 'writing', 'demos', 'photography', 'other'].includes(raw.section as string)) {
		return { kind: 'sites', period: raw.period as 7 | 30 | 90, section: raw.section as SiteSection | 'all' };
	}
	if (raw.kind !== 'gallery' || Object.keys(raw).some((key) => key !== 'kind' && key !== 'query')) return null;
	const query = normalizeQuery(raw.query);
	return query ? { kind: 'gallery', query } : null;
}

/** Stable canonical key. It has no caller ordering, UTC clock, or ignored input fields. */
export function intelligenceScopeKey(scope: IntelligenceScope): string {
	const normalized = parseIntelligenceScope(scope);
	if (!normalized) throw new Error('invalid intelligence scope');
	// PostgreSQL jsonb orders object keys by length then byte order and renders
	// punctuation with spaces.  This gives the database and server the same key
	// without relying on a caller's property insertion order.
	return jsonbStableText(normalized);
}

function jsonbStableText(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(jsonbStableText).join(', ')}]`;
	if (value && typeof value === 'object') {
		const row = value as Record<string, unknown>;
		return `{${Object.keys(row).sort((a, b) => a.length - b.length || a.localeCompare(b)).map((key) => `${JSON.stringify(key)}: ${jsonbStableText(row[key])}`).join(', ')}}`;
	}
	return JSON.stringify(value);
}

/** Scheduler scopes end at the last completed Chicago gallery day, including across DST. */
export function standardIntelligenceScopes(now = new Date()): IntelligenceScope[] {
	const end = new Date(`${dateOnly(now)}T12:00:00Z`);
	end.setUTCDate(end.getUTCDate() - 1);
	const gallery: IntelligenceScope[] = ([30, 90] as const).map((period) => {
		const start = new Date(end); start.setUTCDate(start.getUTCDate() - period + 1);
		return { kind: 'gallery' as const, query: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), measure: 'photo_opens' as const, scope: 'all' as const, albumKeys: [], compare: 'previous' as const, traffic: 'conservative' as const } };
	});
	return [...gallery, ...STANDARD_SITE_INTELLIGENCE_SCOPES];
}

export function declaredComparison(scope: IntelligenceScope) {
	return scope.kind === 'gallery' ? comparisonWindow(scope.query) : null;
}
