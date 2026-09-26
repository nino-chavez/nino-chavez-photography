/**
 * Embedding candidates, called against OpenRouter's /api/v1/embeddings.
 *
 * CORRECTED 2026-09-25 (orchestrator catch): the first version of this file sent image input as
 * `input: [dataUrl]` — a plain array containing the raw data-URL STRING. OpenRouter's embeddings
 * endpoint accepts that shape without error, but it embeds the data URL AS TEXT (base64 characters
 * tokenized literally), not as an image. Live evidence: a real production photo through the plain-
 * string shape reports prompt_tokens in the tens of thousands (a giant "word"), and its cosine
 * similarity to an unrelated text query ("a bowl of tomato soup") is statistically indistinguishable
 * from its similarity to a matching query ("volleyball players jumping at the net") — i.e. no
 * semantic signal at all. The correct shape is the chat-style content object:
 *   input: [{ content: [{ type: 'image_url', image_url: { url: dataUrl } }] }]
 * verified live (2026-09-25) to return prompt_tokens in the hundreds (an image-sized token count,
 * not a text-sized one) AND a real semantic split between matching/non-matching text queries for
 * both google/gemini-embedding-2 and voyageai/voyage-multimodal-3.5. The original file's claim that
 * this shape "400s" was never actually exercised against a real photo (only tested with a 1x1 pixel
 * placeholder and a shape that omitted the `content` wrapper) — see the retracted probe. Every
 * img_gemini / img_voyage vector computed before this fix is invalid and was recomputed.
 *
 * `assertImageSizedTokenCount` is the standing guard against silently regressing back to the
 * text-treated-as-image failure: a real image embedding at the resize this harness uses (768px
 * long edge) costs a few hundred tokens (gemini: ~258 fixed regardless of resolution; voyage:
 * ~700 at 768px, scaling with resolution) — a multi-thousand-token report means something is being
 * tokenized as text again.
 */
import { logSpend, checkBudgetOrThrow } from './spend';

export interface EmbedResult {
	vector: number[];
	costTokens: number | null;
}

/** Reject any embedding response whose reported prompt token count is not image-sized. Calibrated
 * against real measurements: 768px-resized production photos cost 258 (gemini, fixed) to ~700-1250
 * (voyage, scales with resolution); a full-resolution (unresized) photo mistakenly tokenized as an
 * image can still legitimately run a few thousand tokens for voyage, but the text-as-image failure
 * mode measured tens of thousands. 3000 sits comfortably above every legitimate image-token count
 * observed at this harness's resize settings and far below the text-blowup failure mode. */
const MAX_IMAGE_PROMPT_TOKENS = 3000;

function assertImageSizedTokenCount(model: string, jobLabel: string, promptTokens: number | null): void {
	if (promptTokens != null && promptTokens > MAX_IMAGE_PROMPT_TOKENS) {
		throw new Error(
			`embedImageWith ${model} (${jobLabel}): prompt_tokens=${promptTokens} exceeds ${MAX_IMAGE_PROMPT_TOKENS} — ` +
			`this is the signature of the image being tokenized as TEXT (a data-URL string), not as an image. Refusing the result.`
		);
	}
}

async function callEmbeddings(apiKey: string, model: string, input: unknown, dimensions?: number): Promise<any> {
	const body: any = { model, input };
	if (dimensions) body.dimensions = dimensions;
	const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`embeddings ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	return res.json();
}

export async function embedTextWith(apiKey: string, model: string, text: string, dimensions: number | undefined, jobLabel: string): Promise<EmbedResult> {
	checkBudgetOrThrow();
	const j = await callEmbeddings(apiKey, model, text, dimensions);
	const vector = j?.data?.[0]?.embedding;
	if (!Array.isArray(vector)) throw new Error(`embedTextWith ${model}: no vector in response`);
	const tokens = j?.usage?.total_tokens ?? null;
	const cost = j?.usage?.cost ?? 0;
	logSpend({ job: `embed-text:${model}:${jobLabel}`, model, cost });
	return { vector, costTokens: tokens };
}

/** dataUrl should already be resized (this harness uses 768px long edge — see compute-vectors.ts)
 * before calling this; embedImageWith does not resize itself, to keep the API-shape fix and the
 * resize policy independently visible/testable. */
export async function embedImageWith(apiKey: string, model: string, dataUrl: string, dimensions: number | undefined, jobLabel: string): Promise<EmbedResult> {
	checkBudgetOrThrow();
	const j = await callEmbeddings(apiKey, model, [{ content: [{ type: 'image_url', image_url: { url: dataUrl } }] }], dimensions);
	const vector = j?.data?.[0]?.embedding;
	if (!Array.isArray(vector)) throw new Error(`embedImageWith ${model}: no vector in response (${JSON.stringify(j).slice(0, 300)})`);
	const tokens = j?.usage?.total_tokens ?? j?.usage?.prompt_tokens ?? null;
	assertImageSizedTokenCount(model, jobLabel, tokens);
	const cost = j?.usage?.cost ?? 0;
	logSpend({ job: `embed-image:${model}:${jobLabel}`, model, cost });
	return { vector, costTokens: tokens };
}

export function cosineSim(a: number[], b: number[]): number {
	let dot = 0, na = 0, nb = 0;
	for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
