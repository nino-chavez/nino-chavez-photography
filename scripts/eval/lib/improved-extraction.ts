/**
 * The ONE improved prompt arm, designed on TUNE albums only and scored on TEST.
 *
 * Deliberately NOT a change to src/lib/ai/ingest-extraction.ts (out of scope, and another
 * worker owns that file). This is a standalone caller + validator that:
 *   - keeps the same taxonomy contract (PHOTO_CATEGORIES, PLAY_TYPES_BY_SPORT — imported, not
 *     redefined) and the same caption visible-facts contract (reuses inspectCaption /
 *     assertCaptionContract / buildCaptionCorrectionMessage from caption-contract.ts, and
 *     parseWithRepair from ingest-extraction.ts, so both arms face identical correction rules —
 *     see ADR-backed reader-contract.json / caption-contract.ts, read before writing this file);
 *   - adds a `role` field per player: on_court | bench | spectator | official. This targets the
 *     KNOWN PROBLEM directly — find_photos_by_jersey (supabase/migrations/20260623220000) filters
 *     ONLY on jersey_number, with no role column, so a bench/spectator sighting with the same
 *     number as an on-court player is indistinguishable today. Adopting `role` in production
 *     would need a new column on photo_jersey_sightings (a migration — out of scope here); this
 *     harness scores it as a FILTER on the model's own output (role === 'on_court') to measure
 *     the ceiling that column would buy, per the brief's precision/recall definition (bench/
 *     spectator hits count as false positives against on-court-only ground truth).
 *   - adds a `legibility` field per player: clear | partial | guessed — surfaced for analysis
 *     (e.g. "guessed" jerseys are the likely source of the hallucinated-number problem) but NOT
 *     used to filter sightings scoring, since production has no analogous gate today either.
 *   - requires the caption to name every ON-COURT number it can actually read, closing the
 *     52/120 number-coverage gap noted in the June benchmark.
 */
import { PHOTO_CATEGORIES, PLAY_TYPES_BY_SPORT, type Sport } from '../../../src/lib/ai/taxonomy';
import { normJersey, normColor } from '../../../src/lib/identity/sightings';
import { parseWithRepair } from '../../../src/lib/ai/ingest-extraction';
import {
	assertCaptionContract,
	buildCaptionCorrectionMessage,
	inspectCaption,
	MAX_CAPTION_CORRECTIONS,
} from '../../../src/lib/ai/caption-contract';

const ACTION_CATEGORY = 'action';

export type PlayerRole = 'on_court' | 'bench' | 'spectator' | 'official';
export type Legibility = 'clear' | 'partial' | 'guessed';

export interface ImprovedPlayer {
	jersey_number: string | null;
	team_color: string | null;
	action: string | null;
	role: PlayerRole | null;
	legibility: Legibility | null;
}

export interface ImprovedExtraction {
	caption: string;
	photo_category: string | null;
	play_type: string | null;
	sharpness: number | null;
	composition_score: number | null;
	exposure_accuracy: number | null;
	emotional_impact: number | null;
	players: ImprovedPlayer[];
}

export interface ImprovedContext {
	albumSport: Sport | null;
	albumName?: string;
}

const ROLES: PlayerRole[] = ['on_court', 'bench', 'spectator', 'official'];
const LEGIBILITIES: Legibility[] = ['clear', 'partial', 'guessed'];

export function buildImprovedPrompt(ctx: ImprovedContext): string {
	const { albumSport, albumName } = ctx;
	const isRealSport = albumSport !== null && albumSport !== 'other';
	const plays = isRealSport ? PLAY_TYPES_BY_SPORT[albumSport as Sport] : [];

	const sportLine = isRealSport
		? `The sport is KNOWN: ${albumSport}. Do NOT identify, infer, or output the sport — it is set authoritatively at the album level.`
		: `This is NOT a typical sport-action photo. There is no play_type — return play_type: null.`;

	const playLine = isRealSport
		? `"play_type": one of [${plays.map((p) => `"${p}"`).join(', ')}] when photo_category is "action", else null. Use ONLY values from this list; if none fit, null.`
		: `"play_type": always null.`;

	const albumLine = albumName ? `\nAlbum: "${albumName}".` : '';

	return `You are extracting structured metadata from a single action-sports photograph for a photography portfolio's search index.${albumLine}
${sportLine}

Return ONLY a JSON object with EXACTLY these keys:

"caption": ONE natural-language sentence (max 30 words) for SEARCH. Name the jersey number AND color of EVERY on-court player whose number you can actually read (not just the primary subject) — this is the single most important instruction, because a caption missing a readable number is a photo nobody can find by searching for that number. Include the action and scene. Plain language, no aesthetic jargon. Do not infer identity, relationships, emotions, or outcomes; state only visible evidence. Name a person by the COLOR of what they wear, never by naming swimwear. Only state a count you can actually verify in the frame.
"photo_category": one of ["${PHOTO_CATEGORIES.join('", "')}"].
${playLine}
"sharpness": number 0-10 (technical focus quality; 0=blurry, 10=tack-sharp). Use the FULL range — most photos are NOT 7 or 8; judge each photo independently against the others, not against a fixed "good photo" anchor.
"composition_score": number 0-10 (framing/balance). Use the full range.
"exposure_accuracy": number 0-10 (10=perfect exposure). Use the full range.
"emotional_impact": number 0-10 (how strongly the photo conveys emotion). Use the full range.
"players": an array (max 10) of objects, ONE PER DISTINCT PERSON with a visible role in the frame — on-court players, bench players, and spectators/officials near the action. For each: {
  "jersey_number": string-or-null (e.g. "12", "00"; null if unreadable),
  "team_color": string-or-null (primary jersey/uniform color),
  "action": string-or-null (what they are doing right now),
  "role": one of ["${ROLES.join('", "')}"] — on_court means actively playing IN this rally on the court; bench means a substitute/teammate seated or standing off the court in team apparel; spectator means a fan/parent/non-team person in the stands or sideline crowd; official means a referee/coach/line judge. Judge role from position and posture, not jersey color alone — a person in team colors standing on the sideline bench is "bench", not "on_court".
  "legibility": one of ["${LEGIBILITIES.join('", "')}"] — clear means you can read every digit with confidence; partial means you can read some digits or infer from context but are not fully certain; guessed means you are inferring the number from a partial view, angle, or memory of typical numbering rather than actually reading it. If you would have to guess, prefer legibility "guessed" over inventing a confident-looking number, and prefer jersey_number: null over a low-confidence guess when the digits are not visible at all.
}

Do NOT include sport, composition style, lighting, color temperature, time of day, or confidence fields.
NO markdown. NO explanation. ONLY the JSON object.`;
}

function clampScore(n: unknown): number | null {
	const v = typeof n === 'string' ? parseFloat(n) : n;
	if (typeof v !== 'number' || Number.isNaN(v)) return null;
	return Math.max(0, Math.min(10, v));
}

function coerceRole(v: unknown): PlayerRole | null {
	return typeof v === 'string' && (ROLES as string[]).includes(v) ? (v as PlayerRole) : null;
}
function coerceLegibility(v: unknown): Legibility | null {
	return typeof v === 'string' && (LEGIBILITIES as string[]).includes(v) ? (v as Legibility) : null;
}

export function validateImprovedExtraction(raw: any, ctx: ImprovedContext): ImprovedExtraction {
	const category = PHOTO_CATEGORIES.includes(raw?.photo_category) ? raw.photo_category : null;

	let playType: string | null = null;
	const isRealSport = ctx.albumSport !== null && ctx.albumSport !== 'other';
	if (isRealSport && category === ACTION_CATEGORY && typeof raw?.play_type === 'string') {
		const allowed = PLAY_TYPES_BY_SPORT[ctx.albumSport as Sport] as readonly string[];
		if (allowed.includes(raw.play_type)) playType = raw.play_type;
	}

	const players: ImprovedPlayer[] = Array.isArray(raw?.players)
		? raw.players
				.slice(0, 10)
				.map((p: any) => ({
					jersey_number: normJersey(p?.jersey_number),
					team_color: normColor(p?.team_color),
					action: (typeof p?.action === 'string' && p.action.trim()) || null,
					role: coerceRole(p?.role),
					legibility: coerceLegibility(p?.legibility),
				}))
				.filter((p: ImprovedPlayer) => p.jersey_number || p.team_color || p.action)
		: [];

	const caption = (raw?.caption ?? '').toString().trim();

	return {
		caption,
		photo_category: category,
		play_type: playType,
		sharpness: clampScore(raw?.sharpness),
		composition_score: clampScore(raw?.composition_score),
		exposure_accuracy: clampScore(raw?.exposure_accuracy),
		emotional_impact: clampScore(raw?.emotional_impact),
		players,
	};
}

export interface ImprovedExtractResult {
	extraction: ImprovedExtraction;
	cost: number | null;
	rawText: string;
}

export interface ImprovedExtractOptions extends ImprovedContext {
	apiKey: string;
	model: string;
	fetchImpl?: typeof fetch;
}

/** Same shape as production's extractOne: network call + parse + caption-contract correction
 * loop, but building on buildImprovedPrompt / validateImprovedExtraction. */
export async function extractOneImproved(
	imageBuffers: Buffer[],
	opts: ImprovedExtractOptions
): Promise<ImprovedExtractResult> {
	const { apiKey, model, fetchImpl = fetch } = opts;
	if (!apiKey) throw new Error('extractOneImproved: missing OpenRouter API key');

	const prompt = buildImprovedPrompt({ albumSport: opts.albumSport, albumName: opts.albumName });
	const imageParts = imageBuffers.map((buf) => ({
		type: 'image_url',
		image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
	}));
	const messages: Array<{ role: string; content: unknown }> = [
		{ role: 'user', content: [{ type: 'text', text: prompt }, ...imageParts] },
	];
	let cost: number | null = null;

	for (let corrections = 0; ; corrections++) {
		const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'X-Title': 'photography model-eval (improved prompt)',
			},
			body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 2560, usage: { include: true } }),
		});

		if (res.status === 429 || res.status >= 500) throw new Error(`RETRY:${res.status}`);
		if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);

		const j: any = await res.json();
		if (j.usage?.cost != null) cost = (cost ?? 0) + j.usage.cost;
		const text: string = j.choices?.[0]?.message?.content ?? '';
		const parsed = parseWithRepair(text);
		const extraction = validateImprovedExtraction(parsed ?? {}, opts);
		if (!extraction.caption) throw new Error(`no caption parsed (got: ${text.slice(0, 120)})`);

		const issues = inspectCaption(extraction.caption);
		if (!issues.length) return { extraction, cost, rawText: text };
		if (corrections >= MAX_CAPTION_CORRECTIONS) assertCaptionContract(extraction.caption);

		messages.push({ role: 'assistant', content: text });
		messages.push({ role: 'user', content: buildCaptionCorrectionMessage(issues) });
	}
}
