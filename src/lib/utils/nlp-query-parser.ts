/**
 * Search Query Parser
 *
 * Parses search queries into structured metadata filters with unmatched term tracking.
 * Powers the "Smart Parse + Vector Fallback" search architecture:
 * - If all terms match → structured filter path (fast, no API call)
 * - If unmatched terms remain → vector semantic search fallback
 *
 * Example: "volleyball spike golden hour" → { sportType: 'volleyball', playTypes: ['attack'], timeOfDay: ['golden_hour'] }
 * Example: "powerful athletic moments" → all terms unmatched → triggers vector search
 */

import type { PhotoFilterState } from '$types/photo';

export interface ParsedSearchResult {
	matchedFilters: Partial<PhotoFilterState>;
	unmatchedTerms: string[];
	description: string;
	jerseyNumber?: number;
	albumKey?: string;
}

// Multi-word phrases must be checked before single words to avoid partial matches
const MULTI_WORD_PHRASES: Array<{ phrase: string; filterKey: string; value: string }> = [
	// Time of day (multi-word)
	{ phrase: 'golden hour', filterKey: 'timeOfDay', value: 'golden_hour' },
	{ phrase: 'magic hour', filterKey: 'timeOfDay', value: 'golden_hour' },
	{ phrase: 'blue hour', filterKey: 'timeOfDay', value: 'blue_hour' },
	// Composition (multi-word)
	{ phrase: 'rule of thirds', filterKey: 'compositions', value: 'rule_of_thirds' },
	{ phrase: 'leading lines', filterKey: 'compositions', value: 'leading_lines' },
	{ phrase: 'negative space', filterKey: 'compositions', value: 'negative_space' },
	// Sport (multi-word)
	{ phrase: 'cross country', filterKey: 'sportType', value: 'cross_country' },
];

// Single-word keyword → filter mapping
// Key: keyword (lowercase), Value: { filterKey, value }
interface FilterMapping {
	filterKey: string;
	value: string;
}

const KEYWORD_MAP: Record<string, FilterMapping> = {};

function addKeywords(filterKey: string, value: string, keywords: string[]) {
	for (const kw of keywords) {
		KEYWORD_MAP[kw] = { filterKey, value };
	}
}

// Sports
addKeywords('sportType', 'volleyball', ['volleyball', 'vball', 'volley']);
addKeywords('sportType', 'basketball', ['basketball', 'bball', 'hoops']);
addKeywords('sportType', 'soccer', ['soccer']);
addKeywords('sportType', 'softball', ['softball']);
addKeywords('sportType', 'baseball', ['baseball']);
addKeywords('sportType', 'football', ['football']);
addKeywords('sportType', 'track', ['track', 'sprints', 'hurdles', 'relay']);
addKeywords('sportType', 'golf', ['golf']);
addKeywords('sportType', 'tennis', ['tennis']);
addKeywords('sportType', 'bowling', ['bowling']);
addKeywords('sportType', 'pickleball', ['pickleball']);
addKeywords('sportType', 'cross_country', ['xc']);
addKeywords('sportType', 'other', []);

// Categories
addKeywords('photoCategory', 'action', ['action', 'gameplay', 'playing', 'game']);
addKeywords('photoCategory', 'celebration', ['celebration', 'celebrating', 'victory', 'cheer']);
addKeywords('photoCategory', 'candid', ['candid', 'closeup', 'close-up']);
addKeywords('photoCategory', 'portrait', ['portrait', 'headshot', 'face']);
addKeywords('photoCategory', 'warmup', ['warmup', 'warm-up', 'practice', 'training', 'stretching']);

// Play types
addKeywords('playTypes', 'attack', ['attack', 'attacking', 'spike', 'spiking', 'hit', 'hitting', 'kill', 'smash']);
addKeywords('playTypes', 'block', ['block', 'blocking', 'blocker', 'stuff']);
addKeywords('playTypes', 'dig', ['dig', 'digging', 'defense', 'defensive', 'libero', 'pancake']);
addKeywords('playTypes', 'set', ['set', 'setting', 'setter', 'assist']);
addKeywords('playTypes', 'serve', ['serve', 'serving', 'server', 'service', 'ace']);
addKeywords('playTypes', 'celebration', ['celebrate']);
addKeywords('playTypes', 'transition', ['transition']);

// Action intensity
addKeywords('actionIntensity', 'low', ['calm', 'relaxed']);
addKeywords('actionIntensity', 'medium', ['moderate']);
addKeywords('actionIntensity', 'high', ['intense', 'fast']);
addKeywords('actionIntensity', 'peak', ['peak', 'extreme', 'explosive', 'crucial']);

// Lighting
addKeywords('lighting', 'natural', ['natural', 'sunlight', 'daylight']);
addKeywords('lighting', 'backlit', ['backlit', 'backlight', 'silhouette']);
addKeywords('lighting', 'dramatic', ['dramatic']);
addKeywords('lighting', 'soft', ['soft', 'diffused']);
addKeywords('lighting', 'artificial', ['artificial', 'gym', 'arena', 'stadium']);

// Color temperature
addKeywords('colorTemperature', 'warm', ['warm']);
addKeywords('colorTemperature', 'cool', ['cool']);
addKeywords('colorTemperature', 'neutral', ['neutral']);

// Time of day (single-word entries; multi-word handled above)
addKeywords('timeOfDay', 'golden_hour', ['golden', 'sunset']);
addKeywords('timeOfDay', 'midday', ['midday', 'noon']);
addKeywords('timeOfDay', 'evening', ['evening', 'dusk']);
addKeywords('timeOfDay', 'blue_hour', []);
addKeywords('timeOfDay', 'night', ['night', 'nighttime']);
addKeywords('timeOfDay', 'dawn', ['dawn', 'sunrise', 'morning']);

// Composition (single-word entries; multi-word handled above)
addKeywords('compositions', 'rule_of_thirds', ['thirds']);
addKeywords('compositions', 'leading_lines', []);
addKeywords('compositions', 'framing', ['framed', 'framing']);
addKeywords('compositions', 'symmetry', ['symmetry', 'symmetric', 'symmetrical']);
addKeywords('compositions', 'depth', ['depth']);
addKeywords('compositions', 'negative_space', []);

// Emotions
addKeywords('emotion', 'triumph', ['triumph', 'triumphant']);
addKeywords('emotion', 'determination', ['determination', 'determined', 'grit']);
addKeywords('emotion', 'intensity', ['intensity']);
addKeywords('emotion', 'focus', ['focus', 'focused', 'concentration']);
addKeywords('emotion', 'excitement', ['excitement', 'excited', 'hype']);
addKeywords('emotion', 'serenity', ['serenity', 'serene', 'peaceful']);

// Jersey number regex patterns
const JERSEY_PATTERNS = [
	/\b#(\d{1,3})\b/,
	/\bnumber\s+(\d{1,3})\b/i,
	/\bjersey\s+(\d{1,3})\b/i,
	/\bno\.?\s*(\d{1,3})\b/i,
];

// Stop words to ignore when calculating unmatched terms
const STOP_WORDS = new Set([
	'a', 'an', 'the', 'at', 'in', 'on', 'of', 'for', 'and', 'or', 'with',
	'by', 'to', 'from', 'is', 'are', 'was', 'were', 'photos', 'photo',
	'pictures', 'images', 'shots', 'show', 'me', 'find',
]);

/**
 * Parse a search query into structured filters + unmatched terms.
 * Optionally accepts album names for album matching.
 */
export function parseQuery(query: string, albumNames?: string[]): ParsedSearchResult {
	const result: ParsedSearchResult = {
		matchedFilters: {},
		unmatchedTerms: [],
		description: '',
	};

	const normalizedQuery = query.toLowerCase().trim();
	if (normalizedQuery.length < 2) return result;

	// Track which character ranges have been consumed
	let remaining = normalizedQuery;

	// Step 1: Extract jersey numbers
	for (const pattern of JERSEY_PATTERNS) {
		const match = remaining.match(pattern);
		if (match) {
			const num = parseInt(match[1], 10);
			if (num >= 0 && num <= 99) {
				result.jerseyNumber = num;
				result.matchedFilters.jerseyNumber = num;
				remaining = remaining.replace(match[0], ' ').trim();
			}
		}
	}

	// Step 2: Match album names (longest first to avoid partial matches)
	if (albumNames && albumNames.length > 0) {
		const sortedAlbums = [...albumNames].sort((a, b) => b.length - a.length);
		for (const albumName of sortedAlbums) {
			const albumLower = albumName.toLowerCase();
			if (remaining.includes(albumLower)) {
				result.albumKey = albumName;
				result.matchedFilters.albumKey = albumName;
				remaining = remaining.replace(albumLower, ' ').trim();
				break;
			}
		}
	}

	// Step 3: Match multi-word phrases (before splitting into tokens)
	for (const { phrase, filterKey, value } of MULTI_WORD_PHRASES) {
		if (remaining.includes(phrase)) {
			applyFilter(result.matchedFilters, filterKey, value);
			remaining = remaining.replace(phrase, ' ').trim();
		}
	}

	// Step 4: Tokenize remaining text and match single keywords
	const tokens = remaining.split(/\s+/).filter(Boolean);
	const unmatchedTokens: string[] = [];

	for (const token of tokens) {
		if (STOP_WORDS.has(token)) continue;

		const mapping = KEYWORD_MAP[token];
		if (mapping) {
			applyFilter(result.matchedFilters, mapping.filterKey, mapping.value);
		} else {
			unmatchedTokens.push(token);
		}
	}

	result.unmatchedTerms = unmatchedTokens;

	// Step 5: Generate description
	result.description = buildDescription(result);

	return result;
}

function applyFilter(filters: Partial<PhotoFilterState>, key: string, value: string) {
	switch (key) {
		case 'sportType':
			filters.sportType = value;
			break;
		case 'photoCategory':
			filters.photoCategory = value;
			break;
		case 'playTypes':
			if (!filters.playTypes) filters.playTypes = [];
			if (!filters.playTypes.includes(value as any)) filters.playTypes.push(value as any);
			break;
		case 'actionIntensity':
			if (!filters.actionIntensity) filters.actionIntensity = [];
			if (!filters.actionIntensity.includes(value as any)) filters.actionIntensity.push(value as any);
			break;
		case 'lighting':
			if (!filters.lighting) filters.lighting = [];
			if (!filters.lighting.includes(value as any)) filters.lighting.push(value as any);
			break;
		case 'colorTemperature':
			if (!filters.colorTemperature) filters.colorTemperature = [];
			if (!filters.colorTemperature.includes(value as any)) filters.colorTemperature.push(value as any);
			break;
		case 'timeOfDay':
			if (!filters.timeOfDay) filters.timeOfDay = [];
			if (!filters.timeOfDay.includes(value as any)) filters.timeOfDay.push(value as any);
			break;
		case 'compositions':
			if (!filters.compositions) filters.compositions = [];
			if (!filters.compositions.includes(value as any)) filters.compositions.push(value as any);
			break;
		case 'emotion':
			filters.emotion = value as any;
			break;
	}
}

function buildDescription(result: ParsedSearchResult): string {
	const parts: string[] = [];
	const f = result.matchedFilters;

	if (f.sportType) parts.push(f.sportType);
	if (f.playTypes?.length) parts.push(f.playTypes.join('/'));
	if (f.photoCategory) parts.push(f.photoCategory);
	if (f.actionIntensity?.length) parts.push(`${f.actionIntensity.join('/')} intensity`);
	if (f.timeOfDay?.length) parts.push(f.timeOfDay.map(t => t.replace(/_/g, ' ')).join(', '));
	if (f.lighting?.length) parts.push(`${f.lighting.join('/')} lighting`);
	if (f.colorTemperature?.length) parts.push(`${f.colorTemperature.join('/')} colors`);
	if (f.compositions?.length) parts.push(f.compositions.map(c => c.replace(/_/g, ' ')).join(', '));
	if (f.emotion) parts.push(f.emotion);
	if (result.jerseyNumber !== undefined) parts.push(`#${result.jerseyNumber}`);
	if (result.albumKey) parts.push(`album: ${result.albumKey}`);

	return parts.length > 0 ? parts.join(' \u00b7 ') : '';
}
