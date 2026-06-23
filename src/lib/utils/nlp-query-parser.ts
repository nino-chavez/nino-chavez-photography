/**
 * Search Query Parser
 *
 * Parses search queries into structured metadata filters with unmatched term tracking.
 * Powers the "Smart Parse + Vector Fallback" search architecture:
 * - If all terms match → structured filter path (fast, no API call)
 * - If unmatched terms remain → vector semantic search fallback
 *
 * NOTE: the vanity CATEGORICAL aesthetic mappings (composition, time_of_day, lighting,
 * color_temperature, emotion, action_intensity) were removed (cutover prep) — their backing
 * columns are being DROPPED at the schema cutover. Queries mentioning those aesthetics now
 * fall through to the unmatched-terms path and trigger vector semantic search instead.
 *
 * Example: "volleyball spike" → { sportType: 'volleyball', playTypes: ['attack'] }
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

// REMOVED: vanity CATEGORICAL keyword mappings (action intensity, lighting, color temperature,
// time of day, composition, emotions) — those columns are being DROPPED at the schema cutover.
// Such terms now fall through to the unmatched-terms path → vector semantic search.

// Jersey number regex patterns
const JERSEY_PATTERNS = [
	// `#` is its own delimiter — no leading \b (it fails at string start since `#` isn't a word char,
	// which is exactly the "#12" form the hero advertises).
	/#\s*(\d{1,3})\b/,
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
	}
}

function buildDescription(result: ParsedSearchResult): string {
	const parts: string[] = [];
	const f = result.matchedFilters;

	if (f.sportType) parts.push(f.sportType);
	if (f.playTypes?.length) parts.push(f.playTypes.join('/'));
	if (f.photoCategory) parts.push(f.photoCategory);
	if (result.jerseyNumber !== undefined) parts.push(`#${result.jerseyNumber}`);
	if (result.albumKey) parts.push(`album: ${result.albumKey}`);

	return parts.length > 0 ? parts.join(' · ') : '';
}
