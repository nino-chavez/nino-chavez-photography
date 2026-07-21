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
