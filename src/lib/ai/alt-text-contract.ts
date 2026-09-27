/**
 * Reader contract for `alt_text` — a separate, purpose-built sentence for screen readers and the
 * `<img alt>` attribute, distinct from `caption` (search retrieval metadata).
 *
 * `caption` MUST name every legible jersey number (ADR 0006, prompt v2) so a photo is findable by
 * searching for that number. Downstream consumers that needed accessible alt text instead of a
 * search caption were stripping numbers back out with regex patterns — imperfectly: broken
 * sentences ("A player in a light blue jersey with red stripes and serves the ball") and missed
 * numbers ("numbers 3 and 12" survived into a published Instagram alt text, letspepper's
 * scripts/social-publish/alt-text.mjs). `alt_text` exists so nothing needs to be subtracted from
 * a sentence written for a different job: it describes who is doing what — team by uniform color,
 * the action, the setting — and never contains a jersey number, a name, printed text from the
 * frame, guessed identity, or aesthetic filler.
 *
 * Shares the relationship/emotion/outcome/aesthetic/swimwear rules with caption-contract.ts
 * (CLAIM_RULES) — a photo alone still does not establish a relationship, an emotion, an outcome,
 * or license marketing language, regardless of which sentence is carrying the claim.
 */

import { CLAIM_RULES, captionWordCount, type CaptionIssueCode } from './caption-contract';

export type AltTextIssueCode = CaptionIssueCode | 'jersey-number' | 'named-text' | 'too-short';

export interface AltTextIssue {
	code: AltTextIssueCode;
	message: string;
	match?: string;
}

/** Target length for an <img alt> — see reader-contract.json's "AI alt text" surface. */
export const ALT_TEXT_MAX_CHARS = 150;

/** Below this, a value reads as a keyword/tag rather than a sentence describing the frame. */
const MIN_WORDS = 3;

/**
 * Generic, non-identifying vocabulary that a SINGLE-WORD `visible_text` entry does not trigger
 * the named-text reject over, even on an exact match. Sourced from the actual distribution of
 * `photo_metadata.visible_text` (2026-09-26, 22,442 rows / 11,512 distinct values) — every word
 * below is one alt_text is expected to say (a sport name, a scoreboard/broadcast word, a color, a
 * direction, a generic sports noun, or a stopword), not something that identifies a person or a
 * school. Genuinely identifying single words (team/school names, surnames — "chargers", "lewis",
 * "sikora") are NOT in this list and still trigger the reject; neither is any multi-word entry
 * ("aurora central catholic"), which is never filtered (see inspectAltText's own comment).
 */
const NAMED_TEXT_STOPWORDS = new Set([
	// sports
	'volleyball', 'basketball', 'football', 'baseball', 'softball', 'soccer', 'tennis', 'track',
	'field', 'athletics', 'sports', 'sport',
	// scoreboard / broadcast
	'home', 'visitor', 'visitors', 'guest', 'guests', 'period', 'bonus', 'fouls', 'exit', 'welcome',
	'seating', 'score', 'scores',
	// generic sports nouns
	'team', 'teams', 'players', 'player', 'court', 'ball', 'game', 'games', 'club', 'class',
	'classic', 'school', 'college', 'university', 'conference', 'championship', 'champion',
	'champions', 'senior', 'seniors', 'junior', 'juniors', 'captain', 'national', 'state', 'group',
	'media', 'academy', 'high', 'night',
	// colors (alt_text is expected/allowed to name a color)
	'red', 'blue', 'white', 'black', 'gold', 'green', 'yellow', 'orange', 'purple', 'navy', 'gray',
	'grey', 'silver', 'maroon', 'pink', 'teal', 'brown',
	// directions
	'north', 'south', 'east', 'west',
	// setting / venue (alt_text is expected to name the setting)
	'park', 'beach', 'gym', 'gymnasium', 'arena', 'stadium', 'indoor', 'outdoor', 'sand', 'grass',
	'net', 'sideline',
	// action verbs (alt_text is expected to name the action) — "dive" is measured in real
	// visible_text (44 rows, 2026-09-26), almost certainly a sponsor/banner artifact, not a name;
	// the rest of the family is stoplisted preemptively for the same reason.
	'spike', 'spikes', 'spiking', 'block', 'blocks', 'blocking', 'dig', 'digs', 'digging', 'dive',
	'dives', 'diving', 'serve', 'serves', 'serving', 'set', 'sets', 'setting', 'pass', 'passes',
	'passing', 'watch', 'watches', 'watching', 'celebrate', 'celebrates', 'huddle', 'huddles',
	// stopwords / filler
	'the', 'of', 'a', 'an', 'and', 'in', 'on', 'at', 'to', 'go', 'big', 'pro', 'ace', 'love', 'one',
	'two', 'three', 'four', 'five'
]);

/** Any digit is treated as a jersey number — the one thing alt text is never allowed to name.
 * Broader than "reject a 1-2 digit token after #/number" on purpose: "numbers 3 and 12" (the
 * observed production failure) has no leading marker at all, and alt text has no legitimate use
 * for a bare digit (no dates, no scores, no counts spelled as digits). */
const DIGIT_PATTERN = /\d/;

export function inspectAltText(text: string, opts: { visibleText?: string[] } = {}): AltTextIssue[] {
	const raw = String(text ?? '').trim();
	if (!raw) return [{ code: 'empty', message: 'alt text must be a non-empty sentence' }];

	const issues: AltTextIssue[] = [];

	if (raw.length > ALT_TEXT_MAX_CHARS) {
		issues.push({
			code: 'too-long',
			message: `alt text has ${raw.length} characters; maximum is ${ALT_TEXT_MAX_CHARS}`
		});
	}

	if (captionWordCount(raw) < MIN_WORDS) {
		issues.push({ code: 'too-short', message: 'alt text must be a sentence, not a keyword or tag' });
	}

	const digitMatch = raw.match(/\S*\d\S*/)?.[0];
	if (digitMatch) {
		issues.push({
			code: 'jersey-number',
			message: 'alt text must never name a jersey number or any other digit — describe the team by uniform color instead',
			match: digitMatch
		});
	}

	// Printed words quoted from the frame (a banner, a scoreboard) are visible evidence in a
	// caption; the same carve-out applies here before the shared claim rules run.
	const claimsText = raw.replace(/"[^"]*"|“[^”]*”/g, ' ');
	for (const rule of CLAIM_RULES) {
		const match = claimsText.match(rule.pattern)?.[0];
		if (match) issues.push({ code: rule.code, message: rule.message, match });
	}

	for (const term of opts.visibleText ?? []) {
		if (!term || typeof term !== 'string') continue;
		const trimmed = term.trim();
		if (!trimmed) continue;
		// A SINGLE-WORD visible_text entry is checked against the generic-vocabulary stoplist below
		// before it can trigger a reject. Measured against real photo_metadata.visible_text
		// (22,442 rows, 11,512 distinct values, 2026-09-26): the highest-frequency entries are
		// overwhelmingly generic sports/broadcast/color vocabulary ("volleyball" 1,025x, "home"
		// 320x, "team" 220x, "blue" 88x, "court" 48x, "ball" 76x) that alt_text is EXPECTED to use
		// ("a player in blue... a volleyball... on the court"). Without this filter, the check
		// would hard-fail ingest on a large fraction of real photos over words that identify
		// nobody. A MULTI-WORD entry ("aurora central catholic", "lewis university") is never
		// stopword-filtered — a generic alt_text sentence has no legitimate reason to contain a
		// multi-word phrase verbatim, so a match there is real signal, same as a single genuinely
		// identifying word ("sikora", "chargers").
		if (!trimmed.includes(' ') && NAMED_TEXT_STOPWORDS.has(trimmed.toLowerCase())) continue;
		const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const match = raw.match(new RegExp(`\\b${escaped}\\b`, 'i'))?.[0];
		if (match) {
			issues.push({
				code: 'named-text',
				message: 'alt text must not repeat printed text (names, school names, signage) from the frame',
				match
			});
			break; // one instance is enough to trigger a correction; no need to enumerate every hit
		}
	}

	return issues;
}

export function assertAltTextContract(text: string, opts: { visibleText?: string[] } = {}): void {
	const issues = inspectAltText(text, opts);
	if (!issues.length) return;
	throw new Error(
		`alt text contract: ${issues.map((issue) => `${issue.code}${issue.match ? ` (${JSON.stringify(issue.match)})` : ''}`).join(', ')}`
	);
}

/** Matches MAX_CAPTION_CORRECTIONS in caption-contract.ts — one retry budget, shared by the
 * combined correction loop in ingest-extraction.ts's extractOne. */
export { MAX_CAPTION_CORRECTIONS as MAX_ALT_TEXT_CORRECTIONS } from './caption-contract';

/**
 * Build the follow-up user message for a self-correction retry — same conversational-retry shape
 * as buildCaptionCorrectionMessage (a violating value reproduces identically on a plain retry at
 * temperature 0, so the fix has to show the model its own words and the rule they broke).
 */
export function buildAltTextCorrectionMessage(issues: AltTextIssue[]): string {
	const details = issues
		.map(
			(issue) =>
				`- ${issue.code}${issue.match ? ` — your alt_text used ${JSON.stringify(issue.match)}` : ''}: ${issue.message}`
		)
		.join('\n');
	const instructions = [
		'Describe only who is doing what: the team by uniform color, the action, and the setting — one plain sentence for a screen reader.',
		issues.some((issue) => issue.code === 'jersey-number')
			? 'Remove every digit. Do not write "#12", "number 12", or a bare count — describe the team by uniform color instead.'
			: '',
		issues.some((issue) => issue.code === 'named-text')
			? 'Drop any printed name, school name, or signage text — describe the team by uniform color instead.'
			: '',
		issues.some((issue) => issue.code === 'too-long')
			? `Rewrite it under ${ALT_TEXT_MAX_CHARS} characters.`
			: '',
		issues.some((issue) => issue.code === 'too-short')
			? 'Write a full sentence, not a keyword or tag.'
			: '',
		issues.some((issue) => issue.code === 'swimwear-term')
			? 'Keep the color — it is how someone finds their own photo — but drop the garment: write "a player in navy" or "a player in a red top", never the swimwear itself.'
			: ''
	]
		.filter(Boolean)
		.join(' ');
	return `Your alt_text broke the alt-text rule:
${details}

Return the SAME JSON object again with a corrected "alt_text" (max ${ALT_TEXT_MAX_CHARS} characters, one sentence, no digits). ${instructions} Keep every other field unchanged. NO markdown. ONLY JSON.`;
}
