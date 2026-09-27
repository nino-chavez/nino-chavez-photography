/**
 * Unified ingest extraction (#10) — ONE structured, sport-aware vision pass per photo.
 *
 * Replaces the legacy two-bucket prompt + EXIF round-trip. Returns ONLY the fields the
 * north-star schema keeps:
 *   caption · photo_category · play_type · the 4 numeric quality sub-scores · players[]
 * It deliberately does NOT emit sport_type (album-authoritative via the `enforce_album_sport`
 * trigger — see [[album-management-pipeline]]) nor any of the dropped vanity facets
 * (composition / lighting / color_temperature / time_of_day / categorical emotion /
 * action_intensity / ai_confidence).
 *
 * SPORT IS KNOWN. The album's sport is passed in; the model must not infer it. play_type is
 * constrained to `PLAY_TYPES_BY_SPORT[albumSport]` and dropped if the model returns anything
 * outside that set (or if the photo isn't an action shot).
 *
 * Model: OpenRouter `google/gemini-2.5-flash-lite` — the benchmark-proven choice (do NOT
 * "upgrade"; see scripts/backfill-vnext.ts). Embedding is a separate seam (embeddings.ts).
 *
 * PROMPT v2 (2026-09-25, blueprint/decisions/0006): the caption instruction's first sentence is
 * copied VERBATIM from the evaluation's winning arm (.claude/worktrees/agent-a9ac18f4737ef6552's
 * scripts/eval/lib/v2-extraction.ts `buildV2Prompt` — "Name the jersey number AND color of EVERY
 * on-court player whose number you can actually read..."), not reworded. Evaluated on 65 held-out
 * photos: caption ground-truth number-coverage 0.32 -> 0.80, at a real but bounded cost to
 * players[] sightings precision (0.775 -> 0.724; recall 0.917 unchanged) since a model primed to
 * assert more numbers also asserts a few more wrong ones. The players[] schema/instructions below
 * are UNCHANGED — only the caption line moved, matching the eval's isolation test exactly. See
 * the ADR for the full evidence table and what would reverse this.
 *
 * ALT_TEXT (2026-09-26): a second, purpose-built sentence for `<img alt>` and screen readers,
 * separate from `caption`. `caption` MUST name jersey numbers (the instruction above); downstream
 * consumers that needed accessible alt text were instead stripping numbers back OUT of the
 * caption with regex, which produced broken sentences and missed numbers ("numbers 3 and 12"
 * shipped to a published Instagram alt text). `alt_text` never contains a number, a name, printed
 * text, guessed identity, or aesthetic filler — see alt-text-contract.ts. It is placed BEFORE
 * `visible_text` in the returned JSON (both here and in the prompt below) deliberately:
 * `parseWithRepair`'s truncation-recovery path closes the object right before `"visible_text"`,
 * so any key that comes after it is lost on a repaired parse.
 */

import { PHOTO_CATEGORIES, PLAY_TYPES_BY_SPORT, type Sport } from './taxonomy';
import { normJersey, normColor } from '$lib/identity/sightings';
import { SITE_URL } from '$lib/site-url';
import {
	assertCaptionContract,
	buildCaptionCorrectionMessage,
	inspectCaption,
	MAX_CAPTION_CORRECTIONS
} from './caption-contract';
import { assertAltTextContract, buildAltTextCorrectionMessage, inspectAltText } from './alt-text-contract';

export const INGEST_MODEL = 'google/gemini-2.5-flash-lite';
/** Stamped into `photo_metadata.extraction_version` so future prompt/model changes re-process only stale rows. */
export const EXTRACTION_VERSION = `ingest-v4:${INGEST_MODEL}`; // v4: adds alt_text, a separate screen-reader sentence with no jersey numbers (see header comment)

/** Only "action" photos carry a play_type; everything else is null by rule. */
const ACTION_CATEGORY = 'action';

export interface IngestPlayer {
	/** TEXT to preserve leading zeros ("00" != "0"); normalized via normJersey. */
	jersey_number: string | null;
	team_color: string | null;
	action: string | null;
}

export interface IngestExtraction {
	caption: string;
	/** Screen-reader / `<img alt>` sentence — never a jersey number, name, printed text, guessed
	 * identity, or aesthetic filler. Distinct job from `caption`; see alt-text-contract.ts. */
	alt_text: string;
	photo_category: string | null;
	play_type: string | null;
	sharpness: number | null;
	composition_score: number | null;
	exposure_accuracy: number | null;
	emotional_impact: number | null;
	players: IngestPlayer[];
	/** Readable text in the frame — jersey fronts/backs, banners, scoreboards. The photo often
	 * literally names the school/player; without this field that signal was discarded. */
	visible_text: string[];
}

export interface ExtractContext {
	/** The album's authoritative sport, or null for a non-sport shoot (portrait/event). */
	albumSport: Sport | null;
	albumName?: string;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Build the single ingest prompt. Sport-aware: when `albumSport` is a real sport the prompt
 * lists ONLY that sport's plays; for a non-sport album it forbids play_type entirely.
 */
export function buildIngestPrompt(ctx: ExtractContext): string {
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
"alt_text": a DIFFERENT, SEPARATE sentence (under 150 characters, one sentence) for a screen reader — who is doing what: describe the team by the COLOR of their uniform and the visible body position and motion toward the ball — e.g. "reaches overhead for the ball", "leans back with arms raised toward the ball", "extends low for the ball", "stands ready to play the ball". Do NOT name a specific volleyball play — never write "serves", "sets", "spikes", "attacks", "blocks", "digs", or "passes". Naming the play is a guess about intent and timing this sentence must never make, even when it looks obvious: describe only what the body and the ball are visibly doing, not which play it is. Only add a setting detail (the net, the sideline, the bleachers, a gym, a beach court) when THAT SPECIFIC detail is actually visible in this frame — do not default to "near the net" or any other location as generic filler when nothing in the frame shows it. This sentence must NEVER include a jersey number or any other digit, a person's name, any printed text from the frame, guessed identity, or aesthetic language (no "cinematic", "stunning", "beautifully"). Do not just copy "caption" — caption names jersey numbers for search; alt_text never does.
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

// ---------------------------------------------------------------------------
// Parse helpers (lenient — models occasionally emit unescaped quotes / code fences)
// ---------------------------------------------------------------------------

function parseModelJson(text: string): any | null {
	const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
	const m = cleaned.match(/\{[\s\S]*\}/);
	if (!m) return null;
	try {
		return JSON.parse(m[0]);
	} catch {
		return null;
	}
}

/** Recover a caption whose value contains unescaped inner quotes (team names/logos). */
function extractCaptionLenient(text: string): string {
	const m = text.match(/"caption"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"[a-z_]+"\s*:|}\s*$)/i);
	return m ? m[1].replace(/\\"/g, '"').trim() : '';
}

/**
 * Parse with token-loop repair. At temperature 0 the model occasionally repeats one
 * visible_text element ("WILSON","WILSON",…) until max_tokens truncates the JSON mid-array
 * (~1% of frames in the 21.7K backfill; a retry hits the same wall). visible_text is the LAST
 * key, so the object can be closed just before it — recovering caption/scores/players intact —
 * and the array salvaged from the tail (coerceVisibleText's dedupe+filters reduce a loop to []).
 * Without this the whole row degrades to a lenient-caption-only extraction AND gets stamped
 * with the current EXTRACTION_VERSION, so nothing would ever reprocess it.
 */
export function parseWithRepair(text: string): any | null {
	const parsed = parseModelJson(text);
	if (parsed) return parsed;
	const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
	const idx = cleaned.indexOf('"visible_text"');
	if (idx < 0) return null;
	const head = cleaned.slice(0, idx).replace(/,\s*$/, '') + '}';
	const m = head.match(/\{[\s\S]*\}/);
	if (!m) return null;
	let obj: any;
	try { obj = JSON.parse(m[0]); } catch { return null; }
	obj.visible_text = [...cleaned.slice(idx + '"visible_text"'.length).matchAll(/"([^"\n]{2,60})"/g)].map((x) => x[1]);
	return obj;
}

function clampScore(n: unknown): number | null {
	const v = typeof n === 'string' ? parseFloat(n) : n;
	if (typeof v !== 'number' || Number.isNaN(v)) return null;
	return Math.max(0, Math.min(10, v));
}

// ---------------------------------------------------------------------------
// Validation — coerce a raw model object into a clean IngestExtraction
// ---------------------------------------------------------------------------

/** Noise the legacy corpus was cleaned of (backfill-visible-text.ts) — keep new rows consistent. */
const VISIBLE_TEXT_BRANDS = new Set(['adidas', 'nike', 'wilson', 'molten', 'mizuno', 'asics', 'under armour', 'nba', 'baden']);

/** Coerce a raw visible_text value: strings only, trimmed, deduped, capped; drop digit-only
 * strings (scoreboards/clocks) and apparel brands. Same rules as the legacy backfill. */
function coerceVisibleText(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return [...new Set(
		raw
			.filter((t: unknown): t is string => typeof t === 'string')
			.map((t: string) => t.trim())
			.filter((t: string) => t.length >= 2 && t.length <= 60)
			.filter((t: string) => !/^[\d\s:.\-#]+$/.test(t))
			.filter((t: string) => !VISIBLE_TEXT_BRANDS.has(t.toLowerCase()))
	)].slice(0, 12) as string[];
}

/** Public for unit tests: the validation/coercion layer with NO network call. */
export function validateExtraction(raw: any, ctx: ExtractContext): IngestExtraction {
	const category = PHOTO_CATEGORIES.includes(raw?.photo_category)
		? raw.photo_category
		: null;

	// play_type only for action shots, only from the album sport's vocabulary.
	let playType: string | null = null;
	const isRealSport = ctx.albumSport !== null && ctx.albumSport !== 'other';
	if (isRealSport && category === ACTION_CATEGORY && typeof raw?.play_type === 'string') {
		const allowed = PLAY_TYPES_BY_SPORT[ctx.albumSport as Sport] as readonly string[];
		if (allowed.includes(raw.play_type)) playType = raw.play_type;
	}

	const players: IngestPlayer[] = Array.isArray(raw?.players)
		? raw.players
				.slice(0, 8)
				.map((p: any) => ({
					jersey_number: normJersey(p?.jersey_number),
					team_color: normColor(p?.team_color),
					action: (typeof p?.action === 'string' && p.action.trim()) || null,
				}))
				// keep only players that carry some signal (jersey or color)
				.filter((p: IngestPlayer) => p.jersey_number || p.team_color || p.action)
		: [];

	const visibleText: string[] = coerceVisibleText(raw?.visible_text);

	let caption = (raw?.caption ?? '').toString().trim();
	let altText = (raw?.alt_text ?? '').toString().trim();

	return {
		caption,
		alt_text: altText,
		photo_category: category,
		play_type: playType,
		sharpness: clampScore(raw?.sharpness),
		composition_score: clampScore(raw?.composition_score),
		exposure_accuracy: clampScore(raw?.exposure_accuracy),
		emotional_impact: clampScore(raw?.emotional_impact),
		players,
		visible_text: visibleText,
	};
}

// ---------------------------------------------------------------------------
// extractOne — the network call + parse + validate
// ---------------------------------------------------------------------------

export interface ExtractResult {
	extraction: IngestExtraction;
	/** OpenRouter-reported cost in USD, or null if not returned. */
	cost: number | null;
	rawText: string;
}

export interface ExtractOptions extends ExtractContext {
	apiKey: string;
	model?: string;
	/** Override the fetch impl (tests). */
	fetchImpl?: typeof fetch;
}

/**
 * Extract structured metadata from one image buffer. Throws `RETRY:<status>` on 429/5xx so a
 * caller's backoff loop can retry; throws a plain Error on a hard failure (bad key, unparseable
 * response, empty caption, or a caption still violating the visible-facts contract after
 * MAX_CAPTION_CORRECTIONS conversational correction rounds).
 */
export async function extractOne(
	imageBuffer: Buffer,
	opts: ExtractOptions
): Promise<ExtractResult> {
	const { apiKey, model = INGEST_MODEL, fetchImpl = fetch } = opts;
	if (!apiKey) throw new Error('extractOne: missing OpenRouter API key');

	const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
	const prompt = buildIngestPrompt({ albumSport: opts.albumSport, albumName: opts.albumName });
	const messages: Array<{ role: string; content: unknown }> = [
		{
			role: 'user',
			content: [
				{ type: 'text', text: prompt },
				{ type: 'image_url', image_url: { url: dataUrl } },
			],
		},
	];
	let cost: number | null = null;

	for (let corrections = 0; ; corrections++) {
		const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': SITE_URL,
				'X-Title': 'photography ingest-album',
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: 0,
				max_tokens: 2048,
				usage: { include: true },
			}),
		});

		if (res.status === 429 || res.status >= 500) throw new Error(`RETRY:${res.status}`);
		if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 160)}`);

		const j: any = await res.json();
		if (j.usage?.cost != null) cost = (cost ?? 0) + j.usage.cost;
		const text: string = j.choices?.[0]?.message?.content ?? '';
		const parsed = parseWithRepair(text);
		const extraction = validateExtraction(parsed ?? {}, opts);
		if (!extraction.caption) extraction.caption = extractCaptionLenient(text);
		if (!extraction.caption) throw new Error(`no caption parsed (got: ${text.slice(0, 80)})`);

		const captionIssues = inspectCaption(extraction.caption);
		const altTextIssues = inspectAltText(extraction.alt_text, { visibleText: extraction.visible_text });
		if (!captionIssues.length && !altTextIssues.length) return { extraction, cost, rawText: text };
		// One of the two issue lists is non-empty here, so one of these always throws — the
		// canonical contract error (caption checked first, matching its historical priority).
		if (corrections >= MAX_CAPTION_CORRECTIONS) {
			if (captionIssues.length) assertCaptionContract(extraction.caption);
			assertAltTextContract(extraction.alt_text, { visibleText: extraction.visible_text });
		}

		messages.push({ role: 'assistant', content: text });
		// Both correction messages are self-contained (each ends its own "return the SAME JSON"
		// instruction), so when both fields have issues they're just concatenated rather than
		// merged into one hand-written message — same retry budget, one round trip either way.
		const correctionParts = [
			captionIssues.length ? buildCaptionCorrectionMessage(captionIssues) : '',
			altTextIssues.length ? buildAltTextCorrectionMessage(altTextIssues) : ''
		].filter(Boolean);
		messages.push({ role: 'user', content: correctionParts.join('\n\n') });
	}
}
