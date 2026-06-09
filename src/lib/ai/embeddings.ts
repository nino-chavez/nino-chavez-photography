/**
 * Caption / text embedding — the single source of truth for BOTH the write path
 * (backfill, generate-embeddings) and the query path (explore search, chatbot).
 *
 * Provider: OpenRouter — the photography project's only live gateway. All direct
 * Google embedding API keys are revoked (verified 2026-06-08), so the prior
 * `gemini-embedding-001` path is dead. OpenRouter proxies OpenAI embeddings.
 *
 * Model: `openai/text-embedding-3-large` at `dimensions: 768`. The 768 matches the
 * existing `photo_metadata.embedding vector(768)` column and its HNSW index, so no
 * dimension migration is needed. `-large` honors the Phase 0 "large text-embedding
 * model" decision; reduced to 768 dims the absolute cost is ~$0.10 for the full 20K.
 *
 * CRITICAL: query and write MUST call this same function with the same model + dims,
 * or query vectors land in a different space than stored ones and search returns
 * noise. (That class of bug already bit this repo once — see git history for the
 * gemini-embedding-001 write vs embedding-001 query mismatch.)
 */

export const EMBEDDING_MODEL = 'openai/text-embedding-3-large';
export const EMBEDDING_DIMS = 768;

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
				'HTTP-Referer': 'https://photography.ninochavez.co',
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
