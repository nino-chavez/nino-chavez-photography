import { ALL_PLAY_TYPES, PHOTO_CATEGORIES, SPORTS } from '$lib/ai/taxonomy';
import { DIVISION_LABELS, LEVEL_LABELS } from '$lib/utils/canonical-album-naming';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SORTS = ['quality', 'newest', 'oldest'] as const;

export function optionalKnownFilter(value: string | null, allowed: readonly string[]): string | undefined {
	if (value === null || value === '') return undefined;
	return allowed.includes(value) ? value : undefined;
}

export function validSearchCorrelationId(value: string | null): string | null {
	return value && ID_PATTERN.test(value) ? value : null;
}

export function isValidAnalyticsFilter(key: string, value: unknown): boolean {
	if (typeof value !== 'string') return false;
	if (key === 'sport') return (SPORTS as readonly string[]).includes(value);
	if (key === 'category') return (PHOTO_CATEGORIES as readonly string[]).includes(value);
	if (key === 'play_type') return (ALL_PLAY_TYPES as readonly string[]).includes(value);
	if (key === 'division') return Object.hasOwn(DIVISION_LABELS, value);
	if (key === 'level') return Object.hasOwn(LEVEL_LABELS, value);
	if (key === 'sort') return (SORTS as readonly string[]).includes(value);
	return true;
}

export const EXPLORE_FILTER_VALUES = {
	sport: SPORTS,
	category: PHOTO_CATEGORIES,
	play_type: ALL_PLAY_TYPES,
	division: Object.keys(DIVISION_LABELS),
	level: Object.keys(LEVEL_LABELS),
	sort: SORTS
} as const;
