/**
 * Canonical Album Naming Utility
 *
 * Generates IA-optimized album names for maximum scanability.
 * Used by:
 * - Data enrichment pipeline (creates albums with proper names)
 * - Normalization scripts (fixes existing albums)
 * - CLI utilities (standalone name generation)
 *
 * Format (the standard since 2026-09-26, set by Nino): [Level Division Sport] - [Event or matchup] - [MM-DD-YYYY]
 *   "HS Girls VB - JCA at ACC - 09-22-2026"
 *   The prefix comes from the album's known facts (albums.level / division / sport) and is
 *   omitted when none is known; the middle is the event or matchup as the operator writes it
 *   ("JCA at ACC", "Bump Bash #5"); the date is the capture date, "MM-DD-YYYY to MM-DD-YYYY"
 *   for a multi-day album. It replaced "[Event/Teams] - [Date]" ("Team vs Team - May 30"), which
 *   dropped the year and the level and never matched how albums were actually being named.
 * Character limit: 35-45 characters is a scanning target, not a rule the standard enforces.
 * See: .agent-os/CANONICAL_NAMING_STRATEGY.md (historical)
 */

import { SPORTS } from '../ai/taxonomy';

// UX-aware character limits
export const MAX_LENGTH_IDEAL = 35; // Optimal for scanning (1 line)
export const MAX_LENGTH_HARD = 45; // Absolute maximum (2 lines mobile)

// ---------------------------------------------------------------------------
// The naming standard: prefix, date, compose, check
// ---------------------------------------------------------------------------

/** albums.level vocabulary -> the label a name carries. */
export const LEVEL_LABELS: Record<string, string> = {
	high_school: 'HS',
	middle_school: 'MS',
	college: 'College',
	club: 'Club',
};

/** albums.division vocabulary -> the label a name carries. */
export const DIVISION_LABELS: Record<string, string> = {
	girls: 'Girls',
	boys: 'Boys',
	womens: "Women's",
	mens: "Men's",
	coed: 'Coed',
};

/** Sport label in a name: volleyball is "VB" (the house abbreviation); others are title-cased. */
export function sportLabel(sport: string | null | undefined): string {
	if (!sport || sport === 'other') return '';
	if (sport === 'volleyball') return 'VB';
	return sport
		.split('_')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

export interface AlbumNameFacts {
	level?: string | null;
	division?: string | null;
	sport?: string | null;
	/** Earliest capture date, YYYY-MM-DD (or any string starting with it). */
	earliestDate?: string | null;
	/** Latest capture date, YYYY-MM-DD; equal to or absent for a single-day album. */
	latestDate?: string | null;
}

/**
 * "HS Girls VB" from the known facts. '' unless a level or division is known: the sport label
 * belongs to that team descriptor, and a bare "VB - Bump Bash #5 - 08-22-2026" reads worse than
 * the event name on its own.
 */
export function albumNamePrefix(facts: AlbumNameFacts): string {
	const level = facts.level ? LEVEL_LABELS[facts.level] ?? '' : '';
	const division = facts.division ? DIVISION_LABELS[facts.division] ?? '' : '';
	if (!level && !division) return '';
	return [level, division, sportLabel(facts.sport)].filter(Boolean).join(' ');
}

const mdy = (isoDate: string): string => {
	const [y, m, d] = isoDate.slice(0, 10).split('-');
	return `${m}-${d}-${y}`;
};

/** "09-22-2026", or "09-20-2026 to 09-22-2026" for a multi-day album; '' without a date. */
export function formatAlbumDate(earliest?: string | null, latest?: string | null): string {
	const first = earliest || latest;
	if (!first) return '';
	const last = latest || earliest!;
	return first.slice(0, 10) === last.slice(0, 10) ? mdy(first) : `${mdy(first)} to ${mdy(last)}`;
}

/** Joins the three segments, skipping any that are empty. */
export function composeAlbumName(facts: AlbumNameFacts, middle: string): string {
	return [albumNamePrefix(facts), middle.trim(), formatAlbumDate(facts.earliestDate, facts.latestDate)]
		.filter(Boolean)
		.join(' - ');
}

export interface AlbumNameCheck {
	ok: boolean;
	issues: string[];
	/** The standard name built from the facts, keeping the operator's middle segment. */
	suggestion: string;
}

/**
 * Every level+division+sport prefix the standard can produce ("HS Girls VB", "College Men's
 * Soccer", "Club VB", ...), built once from `albumNamePrefix` itself over every known level,
 * division, and `SPORTS` entry (including "none" for each). A display consumer that only has
 * the rendered album name — not the album's `level`/`division`/`sport` facts — recognizes the
 * standard's prefix segment by exact membership in this set, never by guessing from words. That
 * keeps an event name that happens to start with a word like "College" ("Chicago Big Dig 2026")
 * from being misread as the standard's prefix.
 */
const KNOWN_PREFIXES: Set<string> = (() => {
	const set = new Set<string>();
	const levels: (string | undefined)[] = [undefined, ...Object.keys(LEVEL_LABELS)];
	const divisions: (string | undefined)[] = [undefined, ...Object.keys(DIVISION_LABELS)];
	const sports: (string | undefined)[] = [undefined, ...SPORTS];
	for (const level of levels) {
		for (const division of divisions) {
			for (const sport of sports) {
				const prefix = albumNamePrefix({ level, division, sport });
				if (prefix) set.add(prefix);
			}
		}
	}
	return set;
})();

/** A trailing segment in the standard's date format — the one the date·photo-count line repeats. */
const TRAILING_DATE_SEGMENT = /^\d{2}-\d{2}-\d{4}( to \d{2}-\d{2}-\d{4})?$/;

export interface AlbumDisplayParts {
	/** The event or matchup segment — the card's title. */
	title: string;
	/** The level/division/sport prefix ("HS Girls VB"), for a small secondary line/tag; `null` when the name has none (or one this parser doesn't recognize). */
	levelLabel: string | null;
}

/**
 * Splits a rendered album name into a title and an optional level/division/sport tag, for a card
 * that already shows the capture date on its own line (so the date must not also open the
 * title). The album name is a precision lock: this never rewrites a word, it only
 * - drops a trailing segment that exactly matches the standard's date format (duplicating the
 *   date line), and
 * - moves a recognized prefix segment (see `KNOWN_PREFIXES`) to `levelLabel`.
 * A name that isn't in the standard shape — no recognized prefix, no matching trailing date, e.g.
 * "Chicago Big Dig 2026 - North Avenue Beach" or "Jalapeño Open - July 2026" — comes back with
 * `title` equal to the full original name and `levelLabel: null`.
 */
export function splitAlbumNameForDisplay(name: string): AlbumDisplayParts {
	const segments = name
		.split(/\s+[-–—]\s+/)
		.map((s) => s.trim())
		.filter(Boolean);
	if (segments.length === 0) return { title: name, levelLabel: null };

	let rest = [...segments];
	if (rest.length > 1 && TRAILING_DATE_SEGMENT.test(rest[rest.length - 1])) {
		rest = rest.slice(0, -1);
	}

	let levelLabel: string | null = null;
	if (rest.length > 1 && KNOWN_PREFIXES.has(rest[0])) {
		levelLabel = rest[0];
		rest = rest.slice(1);
	}

	return { title: rest.join(' - ') || name, levelLabel };
}

/**
 * Check an operator-typed name against the standard. Only the parts the facts decide are
 * checked — the prefix and the date. The middle (event or matchup) is the operator's to write,
 * so it is kept as typed: team names like "JCA at ACC" cannot be derived from
 * "Joliet Catholic Academy, Aurora Central Catholic", and comparing whole names against a
 * generated one is what made the previous drift warning fire on every album.
 */
export function checkAlbumName(name: string, facts: AlbumNameFacts): AlbumNameCheck {
	const segments = name.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
	const prefix = albumNamePrefix(facts);
	const date = formatAlbumDate(facts.earliestDate, facts.latestDate);
	const issues: string[] = [];

	let rest = [...segments];
	if (prefix) {
		if (rest[0] === prefix) rest = rest.slice(1);
		else issues.push(`starts with "${segments[0] ?? ''}", expected the prefix "${prefix}"`);
	}
	if (date) {
		if (rest[rest.length - 1] === date) rest = rest.slice(0, -1);
		else issues.push(`ends with "${segments[segments.length - 1] ?? ''}", expected the capture date "${date}"`);
	}
	// When a segment was missing or wrong, keep whatever is left that isn't a date or a prefix.
	const looksLikeDate = (s: string) => /\d{1,4}[-/]\d{1,2}([-/]\d{2,4})?/.test(s) || /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/.test(s);
	const middle = rest.filter((s) => s !== prefix && !looksLikeDate(s)).join(' - ');
	if (!middle) issues.push('has no event or matchup segment');

	return { ok: issues.length === 0, issues, suggestion: composeAlbumName(facts, middle) };
}

/**
 * Album Data for canonical name generation
 */
export interface AlbumData {
	albumKey: string;
	name: string; // Existing name (used for drift scoring only)

	// Date fields
	dateStart?: string; // Album start date (ISO format)
	dateEnd?: string; // Album end date (ISO format)

	// Album metadata
	keywords?: string[]; // Sport, category, event type
	description?: string; // Full album description

	// Photo data for EXIF extraction
	photos?: Array<{
		exif?: {
			DateTimeOriginal?: string; // EXIF date (most reliable)
		};
		keywords?: string[]; // Photo-level keywords
		caption?: string; // Photo caption (may contain team/event info)
	}>;

	// Known album facts (albums.level / albums.division) for the name's prefix; sport comes from
	// enrichment.sportType.
	level?: string | null;
	division?: string | null;

	// AI-enriched metadata (if available)
	enrichment?: {
		sportType?: string;
		teams?: { home: string; away: string };
		eventName?: string;
		category?: string;
	};
}

/**
 * Legacy input format (for backward compatibility)
 */
export interface AlbumNameInput {
	currentName?: string; // Optional: existing name to parse
	sportType?: string; // e.g., "volleyball", "basketball"
	earliestPhotoDate?: string; // ISO date string
	latestPhotoDate?: string; // ISO date string
	teams?: { home: string; away: string }; // For matchups
	eventName?: string; // For tournaments/events
	level?: string | null; // albums.level, for the name's prefix
	division?: string | null; // albums.division, for the name's prefix
}

/**
 * Canonical name result with drift analysis
 */
export interface CanonicalNameResult {
	name: string;
	length: number;
	truncated: boolean;
	components: {
		event: string;
		date: string;
	};
	metadata: {
		isMatchup: boolean;
		isMultiDay: boolean;
		dateSource: 'exif' | 'album_field' | 'inferred' | 'fallback';
		confidence: 'high' | 'medium' | 'low';
	};
	driftScore?: number; // 0-100: how different from existing name
	driftAnalysis?: {
		existingName: string;
		proposedName: string;
		changes: string[];
	};
}

/**
 * Generate canonical name from album data (PRIMARY METHOD)
 *
 * Uses album data and photo EXIF as primary sources of truth.
 * Existing album name is only used for drift analysis, not as input.
 */
export function generateCanonicalNameFromAlbum(
	album: AlbumData
): CanonicalNameResult {
	const parts: string[] = [];
	let isMatchup = false;
	let isMultiDay = false;
	let dateSource: 'exif' | 'album_field' | 'inferred' | 'fallback' = 'fallback';
	let confidence: 'high' | 'medium' | 'low' = 'low';

	// 1. Event or Teams (PRIMARY identifier)
	// Priority: enrichment > keywords > caption analysis > existing name fallback
	if (album.enrichment?.teams) {
		// AI-enriched team data (highest confidence)
		const homeTeam = cleanTeamName(album.enrichment.teams.home);
		const awayTeam = cleanTeamName(album.enrichment.teams.away);
		parts.push(`${homeTeam} vs ${awayTeam}`);
		isMatchup = true;
		confidence = 'high';
	} else if (album.enrichment?.eventName) {
		// AI-enriched event name
		const cleanEvent = cleanEventName(album.enrichment.eventName);
		parts.push(cleanEvent);
		confidence = 'high';
	} else {
		// Fallback: parse from existing name (lower confidence)
		const parsed = parseExistingName(album.name);
		if (parsed.teams) {
			parts.push(`${parsed.teams.home} vs ${parsed.teams.away}`);
			isMatchup = true;
			confidence = 'medium';
		} else if (parsed.event) {
			parts.push(parsed.event);
			confidence = 'medium';
		}
	}

	// 2. Date (SECONDARY differentiator)
	// Priority: EXIF DateTimeOriginal > album dateStart/dateEnd > infer from existing name
	const dateResult = extractDateRange(album);
	const earliest = dateResult.earliest;
	const latest = dateResult.latest;
	dateSource = dateResult.source;

	if (dateResult.source === 'exif' || dateResult.source === 'album_field') {
		// High confidence if from EXIF or album fields
		if (confidence === 'low') confidence = 'medium';
	}

	if (latest) {
		const canonicalDate = formatCanonicalDate(earliest, latest, dateResult.precision);
		if (canonicalDate) {
			parts.push(canonicalDate);
			isMultiDay = earliest !== latest;
		}
	}

	// Standard prefix ("HS Girls VB") from the known facts; cleanTeamName/cleanEventName strip any
	// level or sport words the event text carried, so the prefix is the only place they appear.
	const prefix = albumNamePrefix({ level: album.level, division: album.division, sport: album.enrichment?.sportType });
	if (prefix) parts.unshift(prefix);

	let proposed = parts.join(' - ');

	// 3. Apply smart truncation if needed
	const { name: truncatedName, truncated } = truncateIfNeeded(proposed, MAX_LENGTH_HARD);

	// 4. Calculate drift score (how different from existing name)
	const { score, changes } = calculateDriftScore(album.name, truncatedName);

	return {
		name: truncatedName,
		length: truncatedName.length,
		truncated,
		components: {
			event: parts[prefix ? 1 : 0] || '',
			date: parts[prefix ? 2 : 1] || '',
		},
		metadata: {
			isMatchup,
			isMultiDay,
			dateSource,
			confidence,
		},
		driftScore: score,
		driftAnalysis: {
			existingName: album.name,
			proposedName: truncatedName,
			changes,
		},
	};
}

/**
 * Extract date range from album data
 * Priority: EXIF DateTimeOriginal > album dateStart/dateEnd > infer from name
 */
function extractDateRange(album: AlbumData): {
	earliest: string | undefined;
	latest: string | undefined;
	source: 'exif' | 'album_field' | 'inferred' | 'fallback';
	precision: 'day' | 'year';
} {
	// Priority 1: Extract from photo EXIF data (most reliable)
	if (album.photos && album.photos.length > 0) {
		const exifDates = album.photos
			.map((p) => p.exif?.DateTimeOriginal)
			.filter((d): d is string => !!d)
			.map((d) => normalizeExifDate(d))
			.filter((d): d is string => !!d)
			.sort();

		if (exifDates.length > 0) {
			return {
				earliest: exifDates[0],
				latest: exifDates[exifDates.length - 1],
				source: 'exif',
				precision: 'day',
			};
		}
	}

	// Priority 2: Use album date fields
	if (album.dateStart || album.dateEnd) {
		return {
			earliest: album.dateStart,
			latest: album.dateEnd || album.dateStart,
			source: 'album_field',
			precision: 'day',
		};
	}

	// Priority 3: Try to infer from existing name (low confidence). A year-only
	// match carries precision: 'year' so we don't fabricate a precise day.
	const inferredDate = inferDateFromName(album.name);
	if (inferredDate) {
		return {
			earliest: inferredDate.date,
			latest: inferredDate.date,
			source: 'inferred',
			precision: inferredDate.precision,
		};
	}

	// Fallback: no date available
	return {
		earliest: undefined,
		latest: undefined,
		source: 'fallback',
		precision: 'day',
	};
}

/**
 * Normalize EXIF DateTimeOriginal to ISO date string
 * EXIF format: "YYYY:MM:DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
 *
 * Note: Extracts only the date portion to avoid timezone conversion issues.
 * We don't need the time component for album naming.
 */
function normalizeExifDate(exifDate: string): string | undefined {
	try {
		// Extract date portion only (YYYY:MM:DD or YYYY-MM-DD)
		const dateMatch = exifDate.match(/^(\d{4})[-:](\d{2})[-:](\d{2})/);

		if (!dateMatch) {
			return undefined;
		}

		// Return as ISO date string (YYYY-MM-DD)
		return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
	} catch {
		return undefined;
	}
}

/**
 * Try to infer date from existing album name (low confidence)
 * Looks for patterns like: 2025, 09-12-2022, 2022-09-12
 */
function inferDateFromName(name: string): { date: string; precision: 'day' | 'year' } | undefined {
	// Try ISO date: YYYY-MM-DD
	const isoMatch = name.match(/(\d{4})-(\d{2})-(\d{2})/);
	if (isoMatch) {
		return { date: isoMatch[0], precision: 'day' };
	}

	// Try US date: MM-DD-YYYY
	const usMatch = name.match(/(\d{2})-(\d{2})-(\d{4})/);
	if (usMatch) {
		return { date: `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`, precision: 'day' };
	}

	// Try year only: YYYY (but only if 2000-2099). We know the year but NOT the
	// month/day, so carry precision: 'year' — the formatter renders just "2025"
	// instead of fabricating a precise "Jan 1" (the old placeholder bug).
	const yearMatch = name.match(/\b(20\d{2})\b/);
	if (yearMatch) {
		return { date: `${yearMatch[1]}-01-01`, precision: 'year' };
	}

	return undefined;
}

/**
 * Calculate drift score: how different is proposed name from existing
 * Score: 0 = identical, 100 = completely different
 */
function calculateDriftScore(
	existingName: string,
	proposedName: string
): { score: number; changes: string[] } {
	const changes: string[] = [];

	// Normalize for comparison
	const existing = existingName.toLowerCase().trim();
	const proposed = proposedName.toLowerCase().trim();

	// Exact match
	if (existing === proposed) {
		return { score: 0, changes: [] };
	}

	let score = 0;

	// Check length difference
	const lengthDiff = Math.abs(existing.length - proposed.length);
	const lengthDiffPercent = lengthDiff / Math.max(existing.length, proposed.length);
	score += lengthDiffPercent * 20; // Up to 20 points for length difference

	if (lengthDiff > 10) {
		changes.push(`Length changed by ${lengthDiff} characters`);
	}

	// Check if sport prefix removed
	if (/^(hs|ms|college|men's|women's|pro|vb|volleyball|basketball)\s/i.test(existing) &&
		!/^(hs|ms|college|men's|women's|pro|vb|volleyball|basketball)\s/i.test(proposed)) {
		score += 15;
		changes.push('Removed sport/level prefix');
	}

	// Check if date format changed
	const existingHasISODate = /\d{4}-\d{2}-\d{2}/.test(existing);
	const proposedHasISODate = /\d{4}-\d{2}-\d{2}/.test(proposed);

	if (existingHasISODate && !proposedHasISODate) {
		score += 10;
		changes.push('Date format changed from ISO to readable');
	}

	// Check if year format changed (YYYY → Mon YYYY)
	const existingHasYear = /\b(20\d{2})\b/.test(existing);
	const proposedHasMonthYear = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}/i.test(proposed);

	if (existingHasYear && proposedHasMonthYear) {
		score += 5;
		changes.push('Date format enhanced with month');
	}

	// Check Levenshtein distance for semantic similarity
	const distance = levenshteinDistance(existing, proposed);
	const maxLen = Math.max(existing.length, proposed.length);
	const similarity = 1 - distance / maxLen;
	score += (1 - similarity) * 40; // Up to 40 points for text changes

	if (similarity < 0.7) {
		changes.push('Significant text changes detected');
	}

	// Check if team names preserved (high confidence indicator)
	const existingVs = existing.includes(' vs ');
	const proposedVs = proposed.includes(' vs ');

	if (existingVs && proposedVs) {
		score -= 10; // Reduce score if vs matchup structure preserved
		changes.push('Matchup structure preserved');
	}

	// Cap score at 100
	score = Math.min(100, Math.max(0, score));

	return { score: Math.round(score), changes };
}

/**
 * Levenshtein distance (edit distance) between two strings
 */
function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}

	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1 // deletion
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

/**
 * Generate canonical album name from metadata (LEGACY METHOD)
 *
 * @deprecated Use generateCanonicalNameFromAlbum() instead for new code
 */
export function generateCanonicalName(input: AlbumNameInput): CanonicalNameResult {
	const parts: string[] = [];
	let isMatchup = false;
	let isMultiDay = false;

	// 1. Event or Teams (PRIMARY identifier)
	if (input.teams) {
		// Matchup format: "Team A vs Team B"
		const homeTeam = cleanTeamName(input.teams.home);
		const awayTeam = cleanTeamName(input.teams.away);
		parts.push(`${homeTeam} vs ${awayTeam}`);
		isMatchup = true;
	} else if (input.eventName) {
		// Event format: "Event Name"
		const cleanEvent = cleanEventName(input.eventName);
		parts.push(cleanEvent);
	} else if (input.currentName) {
		// Parse from existing name
		const parsed = parseExistingName(input.currentName);
		if (parsed.teams) {
			parts.push(`${parsed.teams.home} vs ${parsed.teams.away}`);
			isMatchup = true;
		} else if (parsed.event) {
			parts.push(parsed.event);
		}
	}

	// 2. Date (SECONDARY differentiator)
	const earliest = input.earliestPhotoDate;
	const latest = input.latestPhotoDate || earliest;

	if (latest) {
		const canonicalDate = formatCanonicalDate(earliest, latest);
		if (canonicalDate) {
			parts.push(canonicalDate);
			isMultiDay = earliest !== latest;
		}
	}

	// Standard prefix ("HS Girls VB") from the known facts; cleanTeamName/cleanEventName strip any
	// level or sport words the event text carried, so the prefix is the only place they appear.
	const prefix = albumNamePrefix({ level: input.level, division: input.division, sport: input.sportType });
	if (prefix) parts.unshift(prefix);

	let proposed = parts.join(' - ');

	// 3. Apply smart truncation if needed
	const { name: truncatedName, truncated } = truncateIfNeeded(proposed, MAX_LENGTH_HARD);

	return {
		name: truncatedName,
		length: truncatedName.length,
		truncated,
		components: {
			event: parts[prefix ? 1 : 0] || '',
			date: parts[prefix ? 2 : 1] || '',
		},
		metadata: {
			isMatchup,
			isMultiDay,
			dateSource: 'fallback', // Legacy method doesn't track source
			confidence: 'medium', // Legacy method has medium confidence
		},
	};
}

/**
 * Clean team name by removing redundant prefixes
 */
function cleanTeamName(team: string): string {
	return team
		.trim()
		.replace(/^(hs|ms|college|men's|women's|boys|girls|pro)\s+/i, '')
		.replace(/\s+(volleyball|vb|basketball|soccer|football|baseball|softball|track)\s*$/i, '')
		.trim();
}

/**
 * Clean event name by removing redundant words and sport prefixes
 */
function cleanEventName(event: string): string {
	let cleaned = event
		.trim()
		.replace(/^\d{4}\s*[-–]?\s*/, '') // Remove leading year
		.replace(/\s*[-–]\s*\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\s*$/, '') // Remove trailing date
		.replace(/\s*[-–]\s*\d{4}-\d{2}-\d{2}\s*$/, '') // Remove ISO date
		.replace(/\s*[-–]?\s*\d{4}\s*$/, '') // Remove trailing year
		.replace(/\s+\d{1,2}-\d{1,2}-\d{2,4}\s*$/i, '') // Remove embedded date at end (e.g., " 09-12-2022")
		.replace(/\s+\d{1,2}-\d{1,2}\s*$/i, '') // Remove short embedded date (e.g., " 09-12")
		.replace(/^\s*(hs|ms|college|men's|women's)\s+/i, '') // Remove level prefix
		.replace(/^\s*(volleyball|vb|basketball|soccer|football|baseball|softball|track)\s+/i, '') // Remove sport
		.replace(/\s{2,}/g, ' ') // Fix double spaces
		.trim();

	// Shorten verbose event types for scanability
	cleaned = cleaned
		.replace(/\bchampionship\b/gi, 'Champ')
		.replace(/\binvitational\b/gi, 'Invite')
		.replace(/\btournament\b/gi, 'Tourney')
		.replace(/\bpicture day\b/gi, '')
		.replace(/\s+photos?\s*$/i, ''); // Remove trailing "photos"

	return cleaned.trim();
}

/**
 * Format date for canonical album names — the standard's date segment (formatAlbumDate):
 * Single-day: "05-30-2024"
 * Multi-day: "05-30-2024 to 06-01-2024"
 * Year-only precision (date inferred from a bare year, month/day unknown): "2024" rather than a
 * fabricated "01-01-2024".
 */
function formatCanonicalDate(
	earliest: string | undefined,
	latest: string | undefined,
	precision: 'day' | 'year' = 'day'
): string {
	if (!latest) return '';
	if (precision === 'year') return latest.slice(0, 4);
	return formatAlbumDate(earliest, latest);
}

/**
 * Parse existing album name to extract components
 */
function parseExistingName(name: string): {
	teams?: { home: string; away: string };
	event?: string;
} {
	// First strip common prefixes from the entire name
	let cleanedName = name
		.replace(/^(hs|ms|college|men's|women's|boys|girls|pro)\s+/i, '')
		.replace(/^(vb|volleyball|basketball|soccer|football|baseball|softball|track)\s+[-–]?\s*/i, '')
		.trim();

	// Try to extract matchup
	const vsMatch = cleanedName.match(/(.+?)\s+vs\.?\s+(.+?)(?:\s+[-–]\s+|\s+\d{4}|$)/i);
	if (vsMatch) {
		return {
			teams: {
				home: cleanTeamName(vsMatch[1]),
				away: cleanTeamName(vsMatch[2]),
			},
		};
	}

	// Otherwise treat as event
	const eventName = cleanEventName(cleanedName);
	if (eventName.length > 3) {
		return { event: eventName };
	}

	return {};
}

/**
 * Smart truncation that preserves meaning
 */
function truncateIfNeeded(
	name: string,
	maxLength: number
): { name: string; truncated: boolean } {
	if (name.length <= maxLength) {
		return { name, truncated: false };
	}

	const parts = name.split(' - ');

	if (parts.length <= 1) {
		// Simple name, hard truncate
		return { name: name.substring(0, maxLength - 3) + '...', truncated: true };
	}

	// Try shortening event/team names while keeping date
	const date = parts[parts.length - 1];
	const availableForContent = maxLength - date.length - 3; // " - "

	if (availableForContent > 20) {
		const content = parts.slice(0, -1).join(' - ');
		if (content.length > availableForContent) {
			return { name: `${content.substring(0, availableForContent - 3)}... - ${date}`, truncated: true };
		}
	}

	// Last resort
	return { name: name.substring(0, maxLength - 3) + '...', truncated: true };
}

/**
 * Validate if a proposed name meets quality standards
 */
export function validateCanonicalName(name: string): {
	valid: boolean;
	warnings: string[];
	errors: string[];
} {
	const warnings: string[] = [];
	const errors: string[] = [];

	if (name.length > MAX_LENGTH_HARD) {
		errors.push(`Name exceeds maximum length (${name.length} > ${MAX_LENGTH_HARD})`);
	}

	if (name.length > MAX_LENGTH_IDEAL) {
		warnings.push(`Name over ideal length (${name.length} > ${MAX_LENGTH_IDEAL}), will wrap`);
	}

	if (name.includes('  ')) {
		errors.push('Name contains double spaces');
	}

	if (name.match(/\d{4}-\d{2}-\d{2}/)) {
		warnings.push('Name contains ISO date format (should use "Mon DD" or "Mon YYYY")');
	}

	// Check for common redundant prefixes
	const redundantPrefixes = ['HS VB', 'College VB', 'Volleyball -', 'Basketball -'];
	for (const prefix of redundantPrefixes) {
		if (name.includes(prefix)) {
			warnings.push(`Name contains redundant prefix: "${prefix}"`);
		}
	}

	return {
		valid: errors.length === 0,
		warnings,
		errors,
	};
}

