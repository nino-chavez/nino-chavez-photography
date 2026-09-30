import type { ReportQuery } from './report-contract';
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
	units: string;
	numerator?: number;
	denominator?: number;
	current?: number;
	previous?: number;
	strength: EvidenceStrength;
}

export interface Finding {
	id: string;
	rule: string;
	target: { kind: 'gallery' | 'album' | 'photo' | 'site' | 'page'; id?: string | null };
	title: string;
	explanation: string;
	action: string;
	evidence: FindingEvidence;
	reportHref: string;
	status: FindingStatus;
}

export interface IntelligenceSuppression {
	rule: string;
	target?: Finding['target'];
	reason: string;
}

export interface IntelligenceAction {
	id: string;
	kind: 'record' | 'dismiss' | 'snooze' | 'undo';
	findingId?: string | null;
	target?: Finding['target'] | null;
	actualAt?: string | null;
	hypothesis?: string | null;
	primaryMeasure?: string | null;
	followUpAt?: string | null;
	note?: string | null;
	createdAt: string;
}

export interface IntelligenceReport {
	scope: IntelligenceScope;
	generatedAt: string;
	cutoff: string | null;
	coverage: IntelligenceCoverage;
	findings: Finding[];
	suppressions: IntelligenceSuppression[];
	actions: IntelligenceAction[];
	briefs: Array<{ id: string; periodKey: string; kind: 'daily' | 'weekly' | 'operational'; createdAt: string }>;
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

export const INTELLIGENCE_RULE_VERSION = 1;
export const INTELLIGENCE_PAGE_SIZE = 20;
export const STANDARD_SITE_INTELLIGENCE_SCOPES: readonly IntelligenceScope[] = [
	{ kind: 'sites', period: 7, section: 'all' }, { kind: 'sites', period: 30, section: 'all' }, { kind: 'sites', period: 90, section: 'all' },
	...(['profile', 'writing', 'demos', 'photography', 'other'] as const).flatMap((section) =>
		([7, 30, 90] as const).map((period) => ({ kind: 'sites' as const, period, section }))
	)
];

function dateBefore(now: Date, days: number): string {
	const date = new Date(now);
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().slice(0, 10);
}

/** Scheduler-owned finite scopes. Dates are generated at refresh time, never accepted from a job payload. */
export function standardIntelligenceScopes(now = new Date()): IntelligenceScope[] {
	const gallery = ([30, 90] as const).map((period) => ({
		kind: 'gallery' as const,
		query: {
			start: dateBefore(now, period), end: dateBefore(now, 1), measure: 'photo_opens' as const,
			scope: 'all' as const, albumKeys: [], compare: 'previous' as const, traffic: 'conservative' as const
		}
	}));
	return [...gallery, ...STANDARD_SITE_INTELLIGENCE_SCOPES];
}

function validDate(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

export function parseIntelligenceScope(value: unknown): IntelligenceScope | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const scope = value as Record<string, unknown>;
	if (scope.kind === 'sites' && ([7, 30, 90] as number[]).includes(scope.period as number)
		&& ['all', 'profile', 'writing', 'demos', 'photography', 'other'].includes(scope.section as string)) {
		return { kind: 'sites', period: scope.period as 7 | 30 | 90, section: scope.section as SiteSection | 'all' };
	}
	if (scope.kind !== 'gallery' || !scope.query || typeof scope.query !== 'object' || Array.isArray(scope.query)) return null;
	const query = scope.query as Record<string, unknown>;
	if (!validDate(query.start) || !validDate(query.end) || query.start > query.end
		|| !['photo_opens', 'album_opens', 'downloads', 'favorites', 'shares'].includes(query.measure as string)
		|| !['all', 'album', 'selected'].includes(query.scope as string)
		|| !Array.isArray(query.albumKeys) || query.albumKeys.length > 25 || !query.albumKeys.every((key) => typeof key === 'string' && key.length > 0 && key.length <= 180)
		|| !['previous', 'custom', 'publication_age', 'none'].includes(query.compare as string)
		|| !['inclusive', 'conservative'].includes(query.traffic as string)) return null;
	return { kind: 'gallery', query: query as unknown as ReportQuery };
}

export function intelligenceScopeKey(scope: IntelligenceScope): string {
	return JSON.stringify(scope);
}
