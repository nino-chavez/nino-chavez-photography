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
 * frame, guessed identity, or aesthetic filler. The sole printed-text exception is an album's
 * own canonical team name, when that two-team matchup is supplied and the frame reads that name.
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

export interface AltTextContractOptions {
	visibleText?: string[];
	/** The canonical names of this album's two competing teams. A team may be named only when it
	 * is one of these AND a `visible_text` entry reads that team's name (see teamNameForms). */
	teamNames?: string[];
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
 * for a bare digit (no dates, no scores, no counts spelled as digits). Cheap existence test before
 * computing the more expensive match-with-context below — most alt text has no digit at all. */
const DIGIT_PATTERN = /\d/;

/** Lowercase, and treat hyphens and other punctuation as word breaks: the same album's
 * visible_text holds both "NORTH-CENTRAL" and "NORTH CENTRAL COLLEGE" (DWdCET, 2026-09-26). */
const normalizeTeamName = (value: string): string =>
	value.toLocaleLowerCase().replace(/[^\p{L}\p{N}']+/gu, ' ').trim();

/** Words that name the kind of institution, not which one. */
const INSTITUTION_WORDS = new Set(['university', 'college', 'high', 'school', 'hs', 'of', 'the']);

/**
 * The forms a team's name takes in print. Canonical names are the institution's full name
 * ("Millikin University", "North Central College"), but uniforms print the distinctive part:
 * the Millikin album DWdCET reads "MILLIKIN" 6 times and never "Millikin University". So each
 * team is recognised by its full name and by that name with the institution words removed.
 * A nickname or mascot ("CARDINALS") is not derivable from the name and is never proof.
 */
export function teamNameForms(teamName: string): string[] {
	const full = normalizeTeamName(teamName);
	const short = full.split(' ').filter((word) => !INSTITUTION_WORDS.has(word)).join(' ');
	return short && short !== full ? [full, short] : [full];
}

/** The team's shortest printed form in its original casing, e.g. "Millikin University" -> "Millikin". */
function teamShortName(teamName: string): string {
	const words = teamName.trim().split(/\s+/).filter((word) => !INSTITUTION_WORDS.has(normalizeTeamName(word)));
	return words.length ? words.join(' ') : teamName.trim();
}

const containsForm = (normalizedText: string, form: string): boolean =>
	` ${normalizedText} `.includes(` ${form} `);

/** Return a matchup's two distinct canonical team names, or no context for every other album. */
export function getTwoTeamMatchupNames(teamNames: readonly string[] | undefined): string[] {
	const names = new Map<string, string>();
	for (const teamName of teamNames ?? []) {
		if (typeof teamName !== 'string' || !teamName.trim()) continue;
		names.set(normalizeTeamName(teamName), teamName.trim());
	}
	return names.size === 2 ? [...names.values()] : [];
}

interface MatchupTeam {
	name: string;
	/** Every printed form of this team's name, used to catch any mention of it. */
	allForms: string[];
	/** The forms that identify THIS team and not the other one: a form that appears inside any
	 * form of the other team ("chicago" inside "university of chicago") can prove neither. */
	provingForms: string[];
	/** How the prompt names the team: its shortest proving form, in canonical casing. */
	label: string | null;
}

/** A two-team matchup's teams with collision-safe forms, or [] for every other album. */
function matchupTeams(teamNames: readonly string[] | undefined): MatchupTeam[] {
	const names = getTwoTeamMatchupNames(teamNames);
	if (names.length !== 2) return [];
	const forms = names.map(teamNameForms);
	return names.map((name, i) => {
		const other = forms[1 - i];
		const provingForms = forms[i].filter((form) => !other.some((o) => containsForm(o, form)));
		const short = teamShortName(name);
		const label = provingForms.includes(normalizeTeamName(short))
			? short
			: provingForms.includes(normalizeTeamName(name)) ? name.trim() : null;
		return { name, allForms: forms[i], provingForms, label };
	});
}

/**
 * True when some `visible_text` entry reads a proving form of one of the matchup's teams. Ingest
 * uses this to decide whether a photo is worth the separate, team-aware alt-text call: the
 * visible_text it checks was extracted without the team names in the prompt, so it is evidence
 * the naming call cannot have produced itself.
 */
export function visibleTextProvesMatchupTeam(
	visibleText: readonly string[] | null | undefined,
	teamNames: readonly string[] | undefined
): boolean {
	const teams = matchupTeams(teamNames);
	return (visibleText ?? []).some(
		(entry) =>
			typeof entry === 'string' &&
			teams.some((team) => team.provingForms.some((form) => containsForm(normalizeTeamName(entry), form)))
	);
}

/**
 * The prompt rule for the slim alt-text call. Only that call gets it: its evidence is the row's
 * stored visible_text from a pass that never saw the team names. The ingest prompt deliberately
 * never carries it, because a visible_text written in the same reply as the alt text, after the
 * names were disclosed, would let the model's own claim serve as its proof.
 */
export function buildAltTextTeamContext(teamNames: readonly string[] | undefined): string {
	const nameable = matchupTeams(teamNames).filter((team) => team.label);
	if (!nameable.length) return '';
	const quoted = nameable.map((team) => (team.label === team.name ? `"${team.name}"` : `"${team.label}" (${team.name})`));
	const list = quoted.length === 2 ? `${quoted[0]} and ${quoted[1]}` : quoted[0];
	return `This album is a two-team matchup. You may name ${nameable.length === 2 ? 'one of these teams' : 'this team'} in alt_text: ${list}. Name a team ONLY when THIS frame proves it: that team's name is legible on that player's uniform — not on a banner, sign, scoreboard, or the floor. Use the quoted name exactly (e.g. "a ${nameable[0].label} player"). A nickname or mascot alone does not prove the team. Otherwise describe the player by uniform color. Never infer a team from home/away, court side, or usual uniform colors. Jersey numbers, player names, and every other printed word remain forbidden.`;
}

export function inspectAltText(text: string, opts: AltTextContractOptions = {}): AltTextIssue[] {
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

	if (DIGIT_PATTERN.test(raw)) {
		const digitMatch = raw.match(/\S*\d\S*/)?.[0];
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

	const teams = matchupTeams(opts.teamNames);
	const visibleEntries = (opts.visibleText ?? [])
		.filter((term): term is string => typeof term === 'string' && Boolean(term.trim()))
		.map(normalizeTeamName);
	const provesAllowedTeam = (normalizedEntry: string): boolean =>
		teams.some((team) => team.provingForms.some((form) => containsForm(normalizedEntry, form)));
	// Supplying album context alone is not proof. A visible_text entry must read one of the team's
	// proving forms, and the alt text must name the team by that same identifying form; any other
	// mention of either team (an unproven one, or an ambiguous shared form) is rejected so the
	// retry falls back to the safe color description.
	// First remove every properly proven mention, so "University of Chicago" named with proof is
	// not then read as an unproven mention of a team called "Chicago".
	let unprovenAlt = ` ${normalizeTeamName(raw)} `;
	for (const team of teams) {
		for (const form of team.provingForms) {
			if (visibleEntries.some((entry) => containsForm(entry, form))) {
				unprovenAlt = unprovenAlt.split(` ${form} `).join('  ');
			}
		}
	}
	for (const team of teams) {
		if (team.allForms.some((form) => containsForm(unprovenAlt.trim(), form))) {
			issues.push({
				code: 'named-text',
				message: 'alt text may name an album team only when that team name is legible in this frame',
				match: team.name
			});
			break;
		}
	}
	for (const term of opts.visibleText ?? []) {
		if (!term || typeof term !== 'string') continue;
		const trimmed = term.trim();
		if (!trimmed) continue;
		// An entry that reads one of THIS album's teams ("MILLIKIN", "NORTH CENTRAL COLLEGE") is the
		// allowed exception, checked above. It runs before the generic-text filter so a multi-word
		// name such as "North Central" is still rejected for every other album.
		if (provesAllowedTeam(normalizeTeamName(trimmed))) continue;
		// A visible_text entry is skipped when EVERY word in it is generic vocabulary (the stoplist
		// below), whether it's one word or several. Measured against real photo_metadata.visible_text
		// (22,442 rows, 11,512 distinct values, 2026-09-26): the highest-frequency entries are
		// overwhelmingly generic sports/broadcast/color vocabulary ("volleyball" 1,025x, "home"
		// 320x, "team" 220x, "blue" 88x, "court" 48x, "dive" 44x) that alt_text is EXPECTED to use
		// ("a player in blue... a volleyball... on the court"). Without this filter, the check
		// would hard-fail ingest on a large fraction of real photos over words that identify
		// nobody — and that includes MULTI-word all-generic phrases actually present in the same
		// data ("beach volleyball" 42x, "high school" 65x, "senior night" 45x, "game ball" 33x): an
		// earlier version of this filter only ever skipped a single-word entry, so "on a beach
		// volleyball court" would still have been flagged. A phrase with even one non-generic word
		// ("home of the chargers", "aurora central catholic") is NOT skipped — "chargers"/"aurora"
		// is real signal, same as a single genuinely identifying word ("sikora").
		const words = trimmed.toLowerCase().split(/\s+/).filter((w) => /[a-z]/i.test(w));
		if (words.length > 0 && words.every((w) => NAMED_TEXT_STOPWORDS.has(w))) continue;
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

export function assertAltTextContract(text: string, opts: AltTextContractOptions = {}): void {
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
