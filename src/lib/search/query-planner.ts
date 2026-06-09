/**
 * LLM query planner — turns a natural-language search into a typed plan for HYBRID search.
 *
 * Replaces (well, fronts) the brittle keyword matcher in nlp-query-parser.ts: instead of
 * enumerating phrases, a cheap model (OpenRouter flash-lite, structured output) decomposes the
 * query into structured facets (sport / category / play / jersey / date range) PLUS a
 * `semantic_text` for the caption-embedding vector search. The caller ANDs them together via the
 * `match_photos_hybrid` RPC — which is what lets "volleyball blocks from last summer" combine a
 * sport filter, a play filter, a date range, and semantic ranking in one query.
 *
 * WHY a planner and not more keyword rules: relative dates ("last summer", "a couple years ago"),
 * compositional queries, and arbitrary phrasing don't enumerate. WHY a single pass and not an
 * agentic loop: ~300ms / ~$0.0001 on flash-lite is fine for an interactive search box; an
 * iterative retrieve→reformulate loop is seconds and buys nothing for the common case (reserve it
 * for a separate deep-search mode).
 *
 * IMPORTANT: the planner only decides WHAT to filter — it cannot create data. "in chicago" parses
 * into `place` but there is no location column yet, so `place` is surfaced (for a future facet) and
 * otherwise ignored. Time works today because `photo_date` exists.
 *
 * Graceful degradation: returns null on missing key / transport error / unparseable output, so the
 * caller falls back to the existing rule-based path. Never throws into the request.
 */

import {
	SPORTS,
	PHOTO_CATEGORIES,
	ALL_PLAY_TYPES,
	isSport,
	type Sport,
} from '$lib/ai/taxonomy';

const PLANNER_MODEL = 'google/gemini-2.5-flash-lite';

export interface QueryPlan {
	/** The visual/descriptive part to vector-match against captions. '' for a purely structured query. */
	semantic_text: string;
	sport: Sport | null;
	photo_category: string | null;
	play_type: string | null;
	jersey_number: string | null;
	/** ISO date (YYYY-MM-DD) lower bound on photo_date, or null. */
	date_from: string | null;
	/** ISO date (YYYY-MM-DD) upper bound on photo_date, or null. */
	date_to: string | null;
	/** A place/venue phrase ("chicago") with no backing column yet — surfaced, not yet filterable. */
	place: string | null;
	/** True if anything beyond semantic_text was extracted (so the caller knows the plan is useful). */
	hasStructure: boolean;
}

function buildPlannerPrompt(today: string): string {
	return `You convert a photo-gallery search query into a structured search plan. Today's date is ${today}.
The gallery is volleyball / action-sports photography (captions describe players, jerseys, colors, actions, and scenes).

Return ONLY a JSON object with these keys:
"semantic_text": the visual/descriptive part of the query to match against photo captions (e.g. "player diving to dig near the sideline", "team celebrating"). Use "" (empty) when the query is purely structured with nothing visual to match (e.g. "volleyball last summer").
"sport": one of [${SPORTS.filter((s) => s !== 'other').map((s) => `"${s}"`).join(', ')}] or null.
"photo_category": one of [${PHOTO_CATEGORIES.map((c) => `"${c}"`).join(', ')}] or null.
"play_type": one of [${ALL_PLAY_TYPES.map((p) => `"${p}"`).join(', ')}] or null. Only set for a specific action.
"jersey_number": a jersey number as a string (e.g. "12", "00") if the query names one, else null.
"date_from": ISO date "YYYY-MM-DD" resolving the EARLIEST date implied by any time expression relative to today, or null.
"date_to": ISO date "YYYY-MM-DD" resolving the LATEST date implied, or null.
"place": a city / venue / location phrase if present (e.g. "chicago", "the beach"), else null.

Date guidance (resolve relative to ${today}): "last summer" = Jun 1–Aug 31 of the most recent past summer; "this year" = Jan 1 of this year to ${today}; "last weekend"/"last month"/"a couple years ago" similarly. A bare year like "2024" = that whole year. If no time is implied, both date fields are null.

Map synonyms to the controlled values (spike/hit/kill -> "spike"; beach/grass/indoor describe surface, keep them in semantic_text). NO markdown, NO explanation, ONLY the JSON object.`;
}

function extractJson(text: string): any | null {
	const cleaned = text.replace(/```json/gi, '').replace(/```/g, '');
	const m = cleaned.match(/\{[\s\S]*\}/);
	if (!m) return null;
	try {
		return JSON.parse(m[0]);
	} catch {
		return null;
	}
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toIsoDate = (v: unknown): string | null =>
	typeof v === 'string' && ISO_DATE.test(v.trim()) ? v.trim() : null;

/** Validate/coerce a raw model object into a QueryPlan (pure — exported for tests). */
export function validatePlan(raw: any): QueryPlan {
	const sport = isSport(raw?.sport) && raw.sport !== 'other' ? (raw.sport as Sport) : null;
	const photo_category = PHOTO_CATEGORIES.includes(raw?.photo_category) ? raw.photo_category : null;
	const play_type = (ALL_PLAY_TYPES as readonly string[]).includes(raw?.play_type) ? raw.play_type : null;
	const jersey_number =
		raw?.jersey_number != null && /^[0-9]{1,3}[A-Z]?$/i.test(String(raw.jersey_number).trim())
			? String(raw.jersey_number).trim().toUpperCase()
			: null;
	const date_from = toIsoDate(raw?.date_from);
	const date_to = toIsoDate(raw?.date_to);
	const place = typeof raw?.place === 'string' && raw.place.trim() ? raw.place.trim() : null;
	const semantic_text = typeof raw?.semantic_text === 'string' ? raw.semantic_text.trim() : '';

	const hasStructure = !!(sport || photo_category || play_type || jersey_number || date_from || date_to);
	return { semantic_text, sport, photo_category, play_type, jersey_number, date_from, date_to, place, hasStructure };
}

export interface PlanOptions {
	apiKey: string | undefined | null;
	now?: Date;
	fetchImpl?: typeof fetch;
	model?: string;
}

/**
 * Plan a search query. Returns null (caller falls back to the rule parser) on missing key,
 * transport error, or unparseable output. Never throws.
 */
export async function planQuery(query: string, opts: PlanOptions): Promise<QueryPlan | null> {
	const { apiKey, now = new Date(), fetchImpl = fetch, model = PLANNER_MODEL } = opts;
	const q = (query ?? '').trim();
	if (!apiKey || !q) return null;
	const today = now.toISOString().slice(0, 10);
	const body = JSON.stringify({
		model,
		messages: [
			{ role: 'system', content: buildPlannerPrompt(today) },
			{ role: 'user', content: q },
		],
		temperature: 0,
		max_tokens: 400,
		response_format: { type: 'json_object' },
	});

	// One retry: the planner is the preferred path, and a transient blip / occasional unparseable
	// completion shouldn't silently demote every such query to the weaker rule parser.
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://photography.ninochavez.co',
					'X-Title': 'photography query-planner',
				},
				body,
			});
			if (!res.ok) {
				console.warn(`[planQuery] OpenRouter ${res.status} (attempt ${attempt + 1})`);
				continue;
			}
			const j: any = await res.json();
			const raw = extractJson(j.choices?.[0]?.message?.content ?? '');
			if (raw) return validatePlan(raw);
		} catch (err) {
			console.warn(`[planQuery] error (attempt ${attempt + 1}):`, err);
		}
	}
	return null; // exhausted retries → caller falls back to the rule parser
}
