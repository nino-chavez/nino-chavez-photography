/**
 * Input side of the public chat endpoint: turn whatever the client sent into messages the
 * model may see.
 *
 * The client owns the `messages` array, so every field in it is untrusted. Two rules:
 *   - Only `user` and `assistant` turns survive. A forged `system` turn would sit beside the
 *     server's prompt.
 *   - Only `text` parts survive. In the v5 UI message format an assistant turn carries its tool
 *     calls as `tool-<name>` parts with an `output`; `convertToModelMessages` hands that output
 *     to the model as a real tool result. A client could plant invented "search results" there,
 *     so earlier tool parts are dropped and the model searches again when it needs photos.
 *
 * The size limits count the text that survives, which is the text the model is billed for.
 */

import type { UIMessage } from 'ai';

export const MAX_CHAT_MESSAGES = 50;
export const MAX_CHAT_CHARS = 50_000;

export type SanitizedChat =
	| { ok: true; messages: UIMessage[] }
	| { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

export function sanitizeChatMessages(raw: unknown): SanitizedChat {
	if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Invalid messages array' };
	if (raw.length > MAX_CHAT_MESSAGES) {
		return { ok: false, error: 'Conversation too long. Please start a new chat.' };
	}

	const messages: UIMessage[] = [];
	let chars = 0;
	for (const [i, m] of raw.entries()) {
		if (!isRecord(m) || (m.role !== 'user' && m.role !== 'assistant')) continue;
		const parts = Array.isArray(m.parts) ? m.parts : [];
		const text = parts
			.filter((p): p is { type: 'text'; text: string } => isRecord(p) && p.type === 'text' && typeof p.text === 'string')
			.map((p) => p.text)
			.join('\n')
			.trim();
		if (!text) continue;
		chars += text.length;
		messages.push({
			id: typeof m.id === 'string' && m.id ? m.id.slice(0, 64) : `m${i}`,
			role: m.role,
			parts: [{ type: 'text', text }]
		});
	}

	if (chars > MAX_CHAT_CHARS) return { ok: false, error: 'Message content too large' };
	if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
		return { ok: false, error: 'Invalid messages array' };
	}
	return { ok: true, messages };
}
