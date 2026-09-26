/**
 * Prompt v2 — orchestrator-specified isolation test: change ONLY the caption instruction,
 * leave the players[] extraction section byte-for-byte identical to production (no role, no
 * legibility field). This isolates whether the caption number-coverage win from the "improved"
 * prompt (job b) can be had WITHOUT the players[]-enumeration change that job (a) found hurts
 * jersey precision (asking the model to also list bench/spectator players inflated hallucinated
 * false positives — see REPORT.md job (a)).
 *
 * Every line below is copied verbatim from src/lib/ai/ingest-extraction.ts's buildIngestPrompt
 * EXCEPT the "caption" line, which adds: name every legible on-court number, and the action.
 * validateExtraction (production's own validator) is reused unchanged — since the players[]
 * schema is untouched, there is nothing new to validate.
 */
import { PHOTO_CATEGORIES, PLAY_TYPES_BY_SPORT, type Sport } from '../../../src/lib/ai/taxonomy';
import { parseWithRepair, validateExtraction, type ExtractContext, type IngestExtraction } from '../../../src/lib/ai/ingest-extraction';
import {
	assertCaptionContract,
	buildCaptionCorrectionMessage,
	inspectCaption,
	MAX_CAPTION_CORRECTIONS,
} from '../../../src/lib/ai/caption-contract';

export function buildV2Prompt(ctx: ExtractContext): string {
	const { albumSport, albumName } = ctx;
	const isRealSport = albumSport !== null && albumSport !== 'other';
	const plays = isRealSport ? PLAY_TYPES_BY_SPORT[albumSport as Sport] : [];

	const sportLine = isRealSport
		? `The sport is KNOWN: ${albumSport}. Do NOT identify, infer, or output the sport — it is set authoritatively at the album level. Focus on the action, quality, caption, and visible players/jerseys.`
		: `This is NOT a typical sport-action photo (it may be a portrait, ceremony, or non-sport event). There is no play_type — return play_type: null.`;

	const playLine = isRealSport
		? `"play_type": one of [${plays.map((p) => `"${p}"`).join(', ')}] when photo_category is "action", else null. Use ONLY values from this list; if none fit, null.`
		: `"play_type": always null.`;

	const albumLine = albumName ? `\nAlbum: "${albumName}".` : '';

	return `You are extracting structured metadata from a single action-sports photograph for a photography portfolio's search index.${albumLine}
${sportLine}

Return ONLY a JSON object with EXACTLY these keys:

"caption": ONE natural-language sentence (max 30 words) describing the photo for SEARCH. Name the jersey number AND color of EVERY on-court player whose number you can actually read (not just the primary subject) — this is the single most important instruction, because a caption missing a readable number is a photo nobody can find by searching for that number. Include the action and scene. Plain language, no aesthetic jargon. Do not infer identity, relationships, emotions, or outcomes; state only visible evidence.
  Name a person by the COLOR of what they wear, never by naming swimwear: write "a player in brown" or "a player in a black top", never "bikini", "swimsuit", "bathing suit", "briefs", or any description of a person's body. Ordinary athletic wear (jersey, shirt, top, shorts, trunks) may be named normally.
  Only state a number you can actually count in the frame — "two players", "three balls". If you are not certain how many, describe without a number rather than guessing one.
"photo_category": one of ["${PHOTO_CATEGORIES.join('", "')}"].
${playLine}
"sharpness": number 0-10 (technical focus quality; 0=blurry, 10=tack-sharp).
"composition_score": number 0-10 (framing/balance; 10=award-worthy).
"exposure_accuracy": number 0-10 (10=perfect exposure).
"emotional_impact": number 0-10 (how strongly the photo conveys emotion).
"players": an array (max 8) of objects, one per clearly visible player: {"jersey_number": string-or-null (e.g. "12", "00"; null if unreadable), "team_color": string-or-null (primary jersey color), "action": string-or-null}.
"visible_text": an array (max 12) of distinct text strings CLEARLY READABLE in the frame — school/team names on jerseys or warmups, player surnames on jersey backs, banner/signage text, scoreboard team names. Transcribe exactly what is printed (e.g. "LEWIS", "FLYERS", "SIKORA"). Do NOT include jersey numbers (captured above), guessed/partially-legible text, or generic words like "VOLLEYBALL" alone on equipment. Empty array if none.

Do NOT include sport, composition style, lighting, color temperature, time of day, or confidence fields.
NO markdown. NO explanation. ONLY the JSON object.`;
}

export interface V2ExtractResult {
	extraction: IngestExtraction;
	cost: number | null;
	rawText: string;
}

export interface V2ExtractOptions extends ExtractContext {
	apiKey: string;
	model: string;
	fetchImpl?: typeof fetch;
}

/** Same mechanics as production's extractOne (correction loop reused verbatim via
 * caption-contract.ts), just pointed at buildV2Prompt instead of buildIngestPrompt. */
export async function extractOneV2(imageBuffer: Buffer, opts: V2ExtractOptions): Promise<V2ExtractResult> {
	const { apiKey, model, fetchImpl = fetch } = opts;
	if (!apiKey) throw new Error('extractOneV2: missing OpenRouter API key');

	const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
	const prompt = buildV2Prompt({ albumSport: opts.albumSport, albumName: opts.albumName });
	const messages: Array<{ role: string; content: unknown }> = [
		{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] },
	];
	let cost: number | null = null;

	for (let corrections = 0; ; corrections++) {
		const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'photography model-eval (v2 caption-only prompt)' },
			body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 2048, usage: { include: true } }),
		});
		if (res.status === 429 || res.status >= 500) throw new Error(`RETRY:${res.status}`);
		if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);

		const j: any = await res.json();
		if (j.usage?.cost != null) cost = (cost ?? 0) + j.usage.cost;
		const text: string = j.choices?.[0]?.message?.content ?? '';
		const parsed = parseWithRepair(text);
		const extraction = validateExtraction(parsed ?? {}, opts);
		if (!extraction.caption) throw new Error(`no caption parsed (got: ${text.slice(0, 120)})`);

		const issues = inspectCaption(extraction.caption);
		if (!issues.length) return { extraction, cost, rawText: text };
		if (corrections >= MAX_CAPTION_CORRECTIONS) assertCaptionContract(extraction.caption);

		messages.push({ role: 'assistant', content: text });
		messages.push({ role: 'user', content: buildCaptionCorrectionMessage(issues) });
	}
}
