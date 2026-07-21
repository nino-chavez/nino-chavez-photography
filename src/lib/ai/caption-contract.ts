/**
 * Reader contract for AI search captions.
 *
 * Captions are retrieval data and public copy. They may describe visible
 * people, clothing, text, actions, and scene details; they must not turn a
 * single frame into claims about identity, relationships, emotions, outcomes,
 * or aesthetic merit.
 */

export type CaptionIssueCode =
	| 'empty'
	| 'too-long'
	| 'relationship-claim'
	| 'emotion-claim'
	| 'outcome-claim'
	| 'aesthetic-claim';

export interface CaptionIssue {
	code: CaptionIssueCode;
	message: string;
	match?: string;
}

const CLAIM_RULES: Array<{ code: CaptionIssueCode; message: string; pattern: RegExp }> = [
	{
		code: 'relationship-claim',
		message: 'a photo alone does not establish personal or family relationships',
		pattern: /\b(?:best\s+friends?|friends?|family|families|mother|mom|father|dad|daughter|son|sisters?|brothers?|siblings?|couple|husband|wife|boyfriend|girlfriend)\b/i
	},
	{
		code: 'emotion-claim',
		message: 'describe visible expression or action instead of assigning an emotion',
		pattern: /\b(?:happy|happily|proud|proudly|determined|excited|joyful|sad|disappointed|frustrated|angry|nervous|confident)\b/i
	},
	{
		code: 'outcome-claim',
		message: 'a single frame does not establish the result of a play or event',
		pattern: /\b(?:winner|winning|victory|victorious|champion|championship-winning|game-winning|match-winning|successful(?:ly)?)\b/i
	},
	{
		code: 'aesthetic-claim',
		message: 'search captions should describe visible facts, not market the image',
		pattern: /\b(?:cinematic|stunning|beautiful|beautifully|dramatic(?:ally)?|breathtaking|gorgeous)\b/i
	}
];

export function captionWordCount(caption: string): number {
	return caption.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

export function inspectCaption(caption: string): CaptionIssue[] {
	const text = String(caption ?? '').trim();
	if (!text) return [{ code: 'empty', message: 'caption must be a non-empty sentence' }];
	// Printed words are visible evidence. Do not treat a quoted sign, jersey, or
	// scoreboard phrase as the model making that claim itself.
	const claimsText = text.replace(/"[^"]*"|“[^”]*”/g, ' ');

	const issues: CaptionIssue[] = [];
	const count = captionWordCount(text);
	if (count > 30) issues.push({ code: 'too-long', message: `caption has ${count} words; maximum is 30` });

	for (const rule of CLAIM_RULES) {
		const match = claimsText.match(rule.pattern)?.[0];
		if (match) issues.push({ code: rule.code, message: rule.message, match });
	}
	return issues;
}

export function assertCaptionContract(caption: string): void {
	const issues = inspectCaption(caption);
	if (!issues.length) return;
	throw new Error(`caption contract: ${issues.map((issue) => `${issue.code}${issue.match ? ` (${JSON.stringify(issue.match)})` : ''}`).join(', ')}`);
}

/** Contract-violating captions get this many conversational correction retries before failing. */
export const MAX_CAPTION_CORRECTIONS = 2;

/**
 * Build the follow-up user message for a self-correction retry. At temperature 0 a violating
 * caption reproduces identically on a plain retry, so the fix must be conversational: show the
 * model its own words and the specific rule they broke, then ask for the same JSON with a
 * rewritten caption.
 */
export function buildCaptionCorrectionMessage(issues: CaptionIssue[]): string {
	const details = issues
		.map(
			(issue) =>
				`- ${issue.code}${issue.match ? ` — your caption used ${JSON.stringify(issue.match)}` : ''}: ${issue.message}`
		)
		.join('\n');
	const instructions = [
		'Describe only what is visible in the frame: people by appearance (e.g. "a man and two children" — never their relationship), visible actions and expressions, clothing, printed text, the scene.',
		issues.some((issue) => issue.match)
			? 'Do not use the flagged words or synonyms that make the same claim.'
			: '',
		issues.some((issue) => issue.code === 'too-long')
			? 'Cut it to 30 words or fewer: keep jersey numbers, colors, and the main action; drop secondary scene detail.'
			: ''
	]
		.filter(Boolean)
		.join(' ');
	return `Your caption broke the visible-facts rule:
${details}

Return the SAME JSON object again with a corrected "caption" (max 30 words). ${instructions} Keep every other field unchanged. NO markdown. ONLY JSON.`;
}
