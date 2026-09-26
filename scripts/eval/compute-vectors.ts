/**
 * Build the vector corpus for the retrieval eval: for all 74 eval photos, compute
 *   - caption vector, CURRENT arm: production-prompt caption (from the baseline-model production
 *     run) embedded with openai/text-embedding-3-large@768 (production's own embedText seam).
 *   - caption vector, IMPROVED arm: improved-prompt caption (same baseline model, for a clean
 *     prompt-only comparison) embedded the same way.
 *   - image vector: google/gemini-embedding-2@768 (fits vector(768) natively, no migration).
 *   - image vector: voyageai/voyage-multimodal-3.5@1024 (no 768 option on this model - see
 *     probe-embeddings smoke test; scored at its native 1024 dims, flagged as migration-requiring
 *     in the report if ever adopted).
 * And for the 25 queries, embeds the query text into each of those three spaces so retrieval can
 * be scored by cosine similarity within each space.
 *
 * Output: .temp/eval/vectors.json — { photos: { [cf_image_id]: {...vectors} }, queries: {...} }
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import { getOpenRouterKey } from './lib/key';
import { fetchProductionBuffer } from './lib/images';
import { embedTextWith, embedImageWith } from './lib/embed';
import { toDataUrl } from './lib/images';

const TEXT_MODEL = 'openai/text-embedding-3-large';
const TEXT_DIMS = 768;
const GEMINI_EMBED_MODEL = 'google/gemini-embedding-2';
const GEMINI_EMBED_DIMS = 768;
const VOYAGE_MODEL = 'voyageai/voyage-multimodal-3.5';
const VOYAGE_DIMS = 1024;

function readJsonl(path: string): any[] {
	try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
	catch { return []; }
}

async function main() {
	const key = getOpenRouterKey();
	const photos = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/photos.json'), 'utf8'));
	const queries = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/queries.json'), 'utf8'));

	const prodResults = readJsonl(resolve(process.cwd(), '.temp/eval/results/google_gemini-2_5-flash-lite--production.jsonl'));
	const improvedResults = readJsonl(resolve(process.cwd(), '.temp/eval/results/google_gemini-2_5-flash-lite--improved.jsonl'));
	const prodByPhoto = new Map(prodResults.filter((r) => r.ok).map((r) => [r.cf_image_id, r]));
	const improvedByPhoto = new Map(improvedResults.filter((r) => r.ok).map((r) => [r.cf_image_id, r]));

	const outPath = resolve(process.cwd(), '.temp/eval/vectors.json');
	let existing: any = { photos: {}, queries: {} };
	try { existing = JSON.parse(readFileSync(outPath, 'utf8')); } catch {}

	for (const p of photos) {
		if (existing.photos[p.cf_image_id]?.done) { continue; }
		const prod = prodByPhoto.get(p.cf_image_id);
		const improved = improvedByPhoto.get(p.cf_image_id);
		if (!prod) { console.log(`SKIP ${p.cf_image_id}: no production result yet`); continue; }
		try {
			const capCurrent = await embedTextWith(key, TEXT_MODEL, prod.extraction.caption, TEXT_DIMS, `${p.cf_image_id}:cap-current`);
			const capImproved = improved
				? await embedTextWith(key, TEXT_MODEL, improved.extraction.caption, TEXT_DIMS, `${p.cf_image_id}:cap-improved`)
				: null;
			const imgBuf = await fetchProductionBuffer(p.cf_image_id);
			const resizedForEmbed = await sharp(imgBuf).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
			const dataUrl = toDataUrl(resizedForEmbed);
			const imgGemini = await embedImageWith(key, GEMINI_EMBED_MODEL, dataUrl, GEMINI_EMBED_DIMS, `${p.cf_image_id}:img-gemini`);
			const imgVoyage = await embedImageWith(key, VOYAGE_MODEL, dataUrl, VOYAGE_DIMS, `${p.cf_image_id}:img-voyage`);

			existing.photos[p.cf_image_id] = {
				done: true,
				cap_current: capCurrent.vector,
				cap_improved: capImproved?.vector ?? null,
				img_gemini: imgGemini.vector,
				img_voyage: imgVoyage.vector,
			};
			writeFileSync(outPath, JSON.stringify(existing)); // checkpoint after every photo
			console.log(`vectors OK: ${p.cf_image_id}`);
		} catch (err: any) {
			console.log(`vectors FAIL ${p.cf_image_id}: ${err.message?.slice(0, 200)}`);
		}
	}

	for (const q of queries) {
		if (existing.queries[q.id]?.done) continue;
		try {
			const capSpace = await embedTextWith(key, TEXT_MODEL, q.query, TEXT_DIMS, `${q.id}:text-space`);
			const geminiSpace = await embedTextWith(key, GEMINI_EMBED_MODEL, q.query, GEMINI_EMBED_DIMS, `${q.id}:gemini-space`);
			const voyageSpace = await embedTextWith(key, VOYAGE_MODEL, q.query, VOYAGE_DIMS, `${q.id}:voyage-space`);
			existing.queries[q.id] = { done: true, text_space: capSpace.vector, gemini_space: geminiSpace.vector, voyage_space: voyageSpace.vector };
			writeFileSync(outPath, JSON.stringify(existing));
			console.log(`query vectors OK: ${q.id}`);
		} catch (err: any) {
			console.log(`query vectors FAIL ${q.id}: ${err.message?.slice(0, 200)}`);
		}
	}
}
main();
