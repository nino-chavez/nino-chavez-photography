/**
 * Slim, alt_text-ONLY vision call — for backfilling existing rows (scripts/backfill-alt-text.ts).
 *
 * The ingest-time extraction (`extractOne`, ingest-extraction.ts) returns caption + alt_text +
 * play_type + quality scores + players[] + visible_text in one pass, because a NEW photo needs
 * all of it. An EXISTING row (~20K as of 2026-09-26) already has a caption, sightings, and quality
 * scores; it is only ever missing `alt_text`. Calling `extractOne` for that would pay for the
 * whole extraction again AND risk failing the row on a caption-contract violation the backfill
 * never intends to touch or persist. This module asks for exactly one field instead.
 *
 * It also needs no jersey-digit resolution — alt_text is FORBIDDEN from naming a number — so the
 * backfill can send the CF Images 'medium' (800px) variant rather than the full-resolution
 * original ingest uses for caption extraction. Cheaper, and no `sharp`/native-binding dependency.
 *
 * This call extracts no fresh `visible_text` of its own, but a row being backfilled already HAS
 * one from its original ingest (`photo_metadata.visible_text`, written by scripts/ingest-album.ts)
 * — pass it in via `opts.visibleText` and the deterministic "named-text" cross-check
 * (alt-text-contract.ts) runs exactly as it does in the full ingest-time path. Omit it only when
 * the row genuinely has none.
 */
import { SITE_URL } from '$lib/site-url';
import {
	assertAltTextContract,
	buildAltTextCorrectionMessage,
	inspectAltText,
	MAX_ALT_TEXT_CORRECTIONS
} from './alt-text-contract';

export const ALT_TEXT_ONLY_MODEL = 'google/gemini-2.5-flash-lite'; // same locked model as ingest (ADR 0002)

export function buildAltTextOnlyPrompt(): string {
	return `You are writing screen-reader alt text for one action-sports photograph.

Return ONLY a JSON object with EXACTLY this key:

"alt_text": ONE plain sentence (under 150 characters) for a screen reader — who is doing what: describe the team by the COLOR of their uniform, the action, and the setting. Never include a jersey number or any other digit, a person's name, any printed text visible in the frame, guessed identity, or aesthetic language (no "cinematic", "stunning", "beautifully"). Name a person by the COLOR of what they wear, never by naming swimwear: write "a player in brown" or "a player in a black top", never "bikini", "swimsuit", "bathing suit", "briefs", or any description of a person's body. Ordinary athletic wear (jersey, shirt, top, shorts, trunks) may be named normally. Do not infer identity, relationships, emotions, or outcomes; state only visible evidence.

NO markdown. NO explanation. ONLY the JSON object: {"alt_text":"..."}`;
}

export interface AltTextOnlyResult {
	altText: string;
	/** OpenRouter-reported cost in USD, or null if not returned. */
	cost: number | null;
	rawText: string;
}

export interface AltTextOnlyOptions {
	apiKey: string;
	model?: string;
	/** The row's own stored `visible_text` (from its original ingest), if any — enables the
	 * deterministic "named-text" cross-check in the contract. */
	visibleText?: string[];
	/** Override the fetch impl (tests). */
	fetchImpl?: typeof fetch;
}

function parseAltText(text: string): string {
	const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
	const m = cleaned.match(/\{[\s\S]*\}/);
	if (m) {
		try {
			const obj = JSON.parse(m[0]);
			if (typeof obj?.alt_text === 'string') return obj.alt_text.trim();
		} catch {
			/* fall through to the lenient regex below */
		}
	}
	// Lenient recovery, mirroring ingest-extraction.ts's extractCaptionLenient — a stray unescaped
	// quote (a quoted banner word) shouldn't fail the whole call when the shape is otherwise fine.
	const lenient = cleaned.match(/"alt_text"\s*:\s*"([\s\S]*?)"\s*}?\s*$/i);
	return lenient ? lenient[1].replace(/\\"/g, '"').trim() : '';
}

/**
 * Extract ONLY alt_text from one image buffer. Throws `RETRY:<status>` on 429/5xx so a caller's
 * backoff loop can retry; throws a plain Error on a hard failure (bad key, unparseable response,
 * or an alt_text still violating the alt-text contract after MAX_ALT_TEXT_CORRECTIONS rounds).
 */
export async function extractAltTextOnly(
	imageBuffer: Buffer,
	opts: AltTextOnlyOptions
): Promise<AltTextOnlyResult> {
	const { apiKey, model = ALT_TEXT_ONLY_MODEL, visibleText, fetchImpl = fetch } = opts;
	if (!apiKey) throw new Error('extractAltTextOnly: missing OpenRouter API key');

	const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
	const prompt = buildAltTextOnlyPrompt();
	const messages: Array<{ role: string; content: unknown }> = [
		{
			role: 'user',
			content: [
				{ type: 'text', text: prompt },
				{ type: 'image_url', image_url: { url: dataUrl } }
			]
		}
	];
	let cost: number | null = null;

	for (let corrections = 0; ; corrections++) {
		const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': SITE_URL,
				'X-Title': 'photography backfill-alt-text'
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: 0,
				max_tokens: 256,
				usage: { include: true }
			})
		});

		if (res.status === 429 || res.status >= 500) throw new Error(`RETRY:${res.status}`);
		if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 160)}`);

		const j: any = await res.json();
		if (j.usage?.cost != null) cost = (cost ?? 0) + j.usage.cost;
		const text: string = j.choices?.[0]?.message?.content ?? '';
		const altText = parseAltText(text);
		if (!altText) throw new Error(`no alt_text parsed (got: ${text.slice(0, 80)})`);

		const issues = inspectAltText(altText, { visibleText });
		if (!issues.length) return { altText, cost, rawText: text };
		// issues are non-empty here, so this always throws — the canonical contract error.
		if (corrections >= MAX_ALT_TEXT_CORRECTIONS) assertAltTextContract(altText, { visibleText });

		messages.push({ role: 'assistant', content: text });
		messages.push({ role: 'user', content: buildAltTextCorrectionMessage(issues) });
	}
}
