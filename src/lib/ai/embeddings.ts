/**
 * Embedding seams — one function per vector SPACE, for BOTH the write path (ingest, backfill)
 * and the query path (explore search, chatbot). There are now TWO independent spaces; never mix
 * a vector from one with a query embedded in the other, or search returns noise:
 *
 *   1. CAPTION-TEXT space (`embedText`) — `openai/text-embedding-3-large`@768, embeds the
 *      generated caption. Written to `photo_metadata.embedding`. Still the caption-embedding
 *      seam; kept for the `caption` column and any future caption-text feature. No longer the
 *      primary semantic-search ranking signal — see space 2.
 *   2. IMAGE space (`embedImage` / `embedImageQuery`) — `google/gemini-embedding-2`@768, a
 *      multimodal model that embeds an image OR a text query into the SAME space. `embedImage`
 *      is the write-path seam (ingest, backfill-image-embeddings.ts) → `photo_metadata.image_embedding`.
 *      `embedImageQuery` is the query-path seam: it embeds the search-box TEXT with the SAME
 *      model+dims so the query vector lands in the same space as the stored image vectors. This
 *      is the primary semantic-search signal as of blueprint/decisions/0006 (recall@10 0.82 vs
 *      0.64 for caption-vector search on a 40-query eval; see that ADR for the full evidence and
 *      caveats). match_photos / match_photos_hybrid rank on `image_embedding`, not `embedding`.
 *
 * Provider: OpenRouter — the photography project's only live gateway. All direct
 * Google embedding API keys are revoked (verified 2026-06-08), so a direct Google SDK path is
 * dead; OpenRouter proxies both the OpenAI text-embedding and the Gemini multimodal-embedding
 * models used here.
 *
 * CRITICAL (per space): query and write MUST call the same space's function with the same
 * model + dims, or query vectors land in a different space than stored ones and search returns
 * noise. (That class of bug already bit this repo once — see git history for the
 * gemini-embedding-001 write vs embedding-001 query mismatch — which is why the image space's
 * write and query seams are two functions in this one file rather than reimplemented per caller.)
 */

import { SITE_URL } from '$lib/site-url';

export const EMBEDDING_MODEL = 'openai/text-embedding-3-large';
export const EMBEDDING_DIMS = 768;

/** Image-space model: multimodal (embeds an image OR a text query into the same space). */
export const IMAGE_EMBEDDING_MODEL = 'google/gemini-embedding-2';
export const IMAGE_EMBEDDING_DIMS = 768;

/** A real 768px image-embed call runs a few hundred prompt tokens (gemini-embedding-2: ~258,
 * fixed). A data-URL STRING tokenized as TEXT instead of an image runs tens of thousands to
 * low millions. This threshold sits comfortably above every legitimate image-token count and far
 * below the text-blowup failure mode — see scripts/eval/lib/embed.ts's `assertImageSizedTokenCount`
 * (same threshold), which caught this exact bug once already (an eval run that silently spent
 * ~$17 embedding data-URL strings as text before the request shape below was corrected). */
const MAX_IMAGE_PROMPT_TOKENS = 3000;

/**
 * Embed a single text string into a 768-dim vector. Returns null on missing key,
 * empty input, transport error, or a dimension mismatch (graceful degradation —
 * callers fall back to structured search).
 */
export async function embedText(text: string, apiKey: string | undefined | null): Promise<number[] | null> {
	if (!apiKey) return null;
	const input = (text ?? '').trim();
	if (!input) return null;

	try {
		const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': SITE_URL,
				'X-Title': 'photography embeddings'
			},
			body: JSON.stringify({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMS })
		});
		if (!res.ok) {
			console.error(`[embedText] OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
			return null;
		}
		const json: any = await res.json();
		const values = json?.data?.[0]?.embedding;
		if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
			console.error(`[embedText] unexpected embedding shape (len=${values?.length})`);
			return null;
		}
		return values as number[];
	} catch (err) {
		console.error('[embedText] error:', err);
		return null;
	}
}

export interface EmbedImageResult {
	vector: number[];
	/** OpenRouter-reported cost in USD for this call, or null if not returned. Callers doing a
	 * batch run (backfill-image-embeddings.ts) should accumulate this into a running total. */
	cost: number | null;
	/** Reported prompt token count — already validated against MAX_IMAGE_PROMPT_TOKENS below;
	 * surfaced for callers that want to log it. */
	promptTokens: number | null;
}

/**
 * Embed a single image into the IMAGE space (`google/gemini-embedding-2`@768). Takes an
 * ALREADY-RESIZED JPEG buffer — this function does not resize. Callers (ingest-album.ts,
 * backfill-image-embeddings.ts) resize with `resizeForEmbedding` (src/lib/ai/image-resize.ts)
 * first. This split matters, not just for parity with the eval harness it's reused from
 * (scripts/eval/lib/embed.ts's `embedImageWith`, which documents the same reason): `sharp` is a
 * native binding, and `embeddings.ts` is imported by `src/lib/supabase/server.ts` and
 * `src/routes/api/chat/+server.ts`, which ARE part of the SvelteKit build adapter-cloudflare
 * bundles for the Workers runtime. A native binding in that import graph is a platform hazard —
 * keeping the sharp-dependent resize step confined to the node-only script files that call this
 * function is what keeps `sharp` out of it.
 *
 * Request shape is the corrected one (verified live against a real photo, 2026-09-25 eval
 * correction): `input: [{ content: [{ type: 'image_url', image_url: { url: dataUrl } }] }]`.
 * The naive shape — `input: [dataUrl]`, a plain array holding the data-URL STRING — is accepted
 * by OpenRouter WITHOUT ERROR but embeds the string AS TEXT: a full-resolution photo's base64
 * tokenizes into roughly 1-2 million tokens ($0.14-$0.46 per call measured live), and the
 * resulting vector carries no image semantics at all. Never revert to that shape.
 *
 * Returns null on missing key or empty buffer. THROWS `RETRY:<status>` on 429/5xx, same
 * convention as `extractOne` in ingest-extraction.ts, so a caller's backoff loop can retry.
 * THROWS a plain Error when the response's prompt-token count exceeds `MAX_IMAGE_PROMPT_TOKENS`
 * — that specific failure means the request silently regressed to the text-tokenized-string bug
 * above, a defect to surface loudly (and stop a batch run over), not swallow. Returns null on any
 * other transport error or a dimension mismatch (graceful degradation, same contract as `embedText`).
 */
export async function embedImage(
	resizedJpegBuffer: Buffer,
	apiKey: string | undefined | null,
	/** Override the fetch impl (tests) — same convention as `extractOne` in ingest-extraction.ts. */
	fetchImpl: typeof fetch = fetch
): Promise<EmbedImageResult | null> {
	if (!apiKey) return null;
	if (!resizedJpegBuffer || resizedJpegBuffer.length === 0) return null;

	const dataUrl = `data:image/jpeg;base64,${resizedJpegBuffer.toString('base64')}`;

	try {
		const res = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': SITE_URL,
				'X-Title': 'photography embeddings'
			},
			body: JSON.stringify({
				model: IMAGE_EMBEDDING_MODEL,
				input: [{ content: [{ type: 'image_url', image_url: { url: dataUrl } }] }],
				dimensions: IMAGE_EMBEDDING_DIMS
			})
		});
		if (res.status === 429 || res.status >= 500) throw new Error(`RETRY:${res.status}`);
		if (!res.ok) {
			console.error(`[embedImage] OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
			return null;
		}
		const json: any = await res.json();
		const promptTokens: number | null = json?.usage?.prompt_tokens ?? json?.usage?.total_tokens ?? null;
		if (promptTokens != null && promptTokens > MAX_IMAGE_PROMPT_TOKENS) {
			throw new Error(
				`embedImage: prompt_tokens=${promptTokens} exceeds ${MAX_IMAGE_PROMPT_TOKENS} — the image was ` +
				`likely tokenized as TEXT (a data-URL string), not as an image. Refusing the result.`
			);
		}
		const values = json?.data?.[0]?.embedding;
		if (!Array.isArray(values) || values.length !== IMAGE_EMBEDDING_DIMS) {
			console.error(`[embedImage] unexpected embedding shape (len=${values?.length})`);
			return null;
		}
		return { vector: values as number[], cost: json?.usage?.cost ?? null, promptTokens };
	} catch (err) {
		if (err instanceof Error && (err.message.startsWith('embedImage: prompt_tokens=') || err.message.startsWith('RETRY:'))) throw err;
		console.error('[embedImage] error:', err);
		return null;
	}
}

/**
 * Embed a search-box TEXT query into the IMAGE space, using the SAME model + dims as `embedImage`
 * so the query vector lands in the same space as the stored `image_embedding` vectors. This is
 * the query-side counterpart the search RPCs (match_photos / match_photos_hybrid) call — see
 * blueprint/decisions/0006. Returns null on missing key, empty input, transport error, or a
 * dimension mismatch (graceful degradation — callers fall back to structured search).
 */
export async function embedImageQuery(
	text: string,
	apiKey: string | undefined | null,
	fetchImpl: typeof fetch = fetch
): Promise<number[] | null> {
	if (!apiKey) return null;
	const input = (text ?? '').trim();
	if (!input) return null;

	try {
		const res = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': SITE_URL,
				'X-Title': 'photography embeddings'
			},
			body: JSON.stringify({ model: IMAGE_EMBEDDING_MODEL, input, dimensions: IMAGE_EMBEDDING_DIMS })
		});
		if (!res.ok) {
			console.error(`[embedImageQuery] OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
			return null;
		}
		const json: any = await res.json();
		const values = json?.data?.[0]?.embedding;
		if (!Array.isArray(values) || values.length !== IMAGE_EMBEDDING_DIMS) {
			console.error(`[embedImageQuery] unexpected embedding shape (len=${values?.length})`);
			return null;
		}
		return values as number[];
	} catch (err) {
		console.error('[embedImageQuery] error:', err);
		return null;
	}
}
