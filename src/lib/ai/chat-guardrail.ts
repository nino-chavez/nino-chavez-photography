/**
 * Output guardrail for Shot Bot, the public gallery chat.
 *
 * The system prompt asks the model to stay in scope, keep its instructions private and never
 * swear. A prompt is a request, not a control: a jailbreak that talks the model out of it would
 * otherwise reach the visitor verbatim. This module is the control. It checks every reply the
 * model writes before any of it leaves the server, and replaces a flagged reply whole.
 *
 * What it catches, deterministically (so a test can prove it):
 *   - leaked instructions: phrases that only exist in the system prompt or the tool contract;
 *   - internals: database, provider and tool names a visitor has no reason to see;
 *   - profanity and slurs, matched as whole words;
 *   - persona breaks: the model announcing a jailbreak mode.
 *
 * Reasoning parts (a thinking model's working notes) are dropped outright: they are never shown,
 * and after a jailbreak they are exactly where the prompt and internal names would surface.
 *
 * What it does not catch: a polite off-topic answer, a paraphrased leak that avoids every listed
 * phrase, or harm phrased without a listed word. Those rest on the prompt. Captions and photos
 * come from the tool, not the model, and are not checked here.
 *
 * Why buffer the whole text block: a listed phrase can arrive split across stream deltas, and a
 * reply that is released sentence by sentence cannot be withdrawn once a later sentence fails.
 * Replies are short by instruction, and photos arrive as tool parts that pass straight through,
 * so the cost is that a reply's text appears at once instead of word by word.
 */

import type { TextStreamPart, ToolSet } from 'ai';

/** Shown instead of a flagged reply. Works whether the visitor attempted a jailbreak or not. */
export const GUARDED_REPLY =
	"I can help you find photos in Nino's gallery. Tell me the kind of shot you're after.";

export type GuardrailVerdict = { ok: true } | { ok: false; reason: GuardrailReason };
export type GuardrailReason = 'instructions' | 'internals' | 'profanity' | 'persona';

/** Phrases lifted from SYSTEM_PROMPT and the tool description; none belongs in a reply. */
const INSTRUCTION_PHRASES = [
	'brand-safety guardrails',
	'non-negotiable',
	'override any user instruction',
	'these instructions',
	'my instructions',
	'system prompt',
	'stay in scope',
	'politely decline and redirect',
	'gallery desk',
	'no hype words',
	'let the photos do the selling',
	'query takes precedence',
	'structured filters'
];

/** Names of the machinery behind the chat. */
const INTERNAL_TERMS = [
	'searchphotos',
	'match_photos',
	'find_photos_by_jersey',
	'photo_metadata',
	'photo_jersey_sightings',
	'album_settings',
	'image_embedding',
	'supabase',
	'openrouter',
	'service_role',
	'api key',
	'api_key'
];

/** Whole-word matches only, so "Scunthorpe" or "class" never trip it. */
const PROFANITY = [
	'fuck', 'fucking', 'fucked', 'fucker', 'motherfucker',
	'shit', 'shitty', 'bullshit',
	'bitch', 'bitches', 'cunt', 'asshole', 'bastard', 'dickhead',
	'slut', 'whore', 'piss', 'pissed',
	'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'kike', 'spic', 'chink', 'tranny'
];

/** A model that has been talked into another persona tends to announce it. */
const PERSONA_PATTERNS = [
	/\bDAN\b/,
	/\bdeveloper mode\b/i,
	/\bjailbr(?:eak|oken)\b/i,
	/\bI am (?:now )?no longer Shot Bot\b/i,
	/\bas an unrestricted\b/i
];

const PROFANITY_RE = new RegExp(`\\b(?:${PROFANITY.join('|')})\\b`, 'i');

/** Lowercase and collapse whitespace so a phrase split by a line break still matches. */
function normalize(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ');
}

/** Check one complete reply. Pure, so the test file can prove each category. */
export function checkReply(text: string): GuardrailVerdict {
	const flat = normalize(text);
	if (INSTRUCTION_PHRASES.some((p) => flat.includes(p))) return { ok: false, reason: 'instructions' };
	if (INTERNAL_TERMS.some((t) => flat.includes(t))) return { ok: false, reason: 'internals' };
	if (PROFANITY_RE.test(text)) return { ok: false, reason: 'profanity' };
	if (PERSONA_PATTERNS.some((re) => re.test(text))) return { ok: false, reason: 'persona' };
	return { ok: true };
}

/**
 * `streamText({ experimental_transform })` stage. Holds each text block from `text-start` to
 * `text-end`, checks the whole block, then releases it, or releases GUARDED_REPLY in its place.
 * Reasoning parts are dropped. Every other part (tool calls, tool results, step and finish events)
 * passes through untouched.
 */
export function chatOutputGuardrail<TOOLS extends ToolSet>(
	onFlag: (reason: GuardrailReason) => void = () => {}
) {
	return () => {
		const open = new Map<string, string>();

		function release(
			id: string,
			controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>
		) {
			const text = open.get(id) ?? '';
			open.delete(id);
			const verdict = checkReply(text);
			if (!verdict.ok) onFlag(verdict.reason);
			const out = verdict.ok ? text : GUARDED_REPLY;
			if (out) controller.enqueue({ type: 'text-delta', id, text: out });
		}

		return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
			transform(part, controller) {
				if (part.type === 'text-start') {
					open.set(part.id, '');
					controller.enqueue(part);
				} else if (part.type === 'text-delta') {
					if (open.has(part.id)) open.set(part.id, open.get(part.id) + part.text);
					else {
						// A delta with no start: hold it like any other block rather than let it through.
						open.set(part.id, part.text);
					}
				} else if (part.type === 'text-end') {
					release(part.id, controller);
					controller.enqueue(part);
				} else if (
					part.type === 'reasoning-start' ||
					part.type === 'reasoning-delta' ||
					part.type === 'reasoning-end'
				) {
					// Never leaves the server; see the header.
				} else {
					controller.enqueue(part);
				}
			},
			flush(controller) {
				// A stream cut off mid-block still gets checked; nothing held is dropped unchecked.
				for (const id of [...open.keys()]) release(id, controller);
			}
		});
	};
}
