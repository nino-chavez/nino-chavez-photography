/** Adds cap_v2 (gemini-2.5-flash-lite's v2 captions, the winning model from task A) to all 65
 * TEST photos in vectors.json, and embeds the 40-query replication set into the 3 relevant
 * spaces (text/caption space, gemini image space, voyage image space). */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getOpenRouterKey } from './lib/key';
import { embedTextWith } from './lib/embed';

const TEXT_MODEL = 'openai/text-embedding-3-large';
const TEXT_DIMS = 768;
const GEMINI_EMBED_MODEL = 'google/gemini-embedding-2';
const GEMINI_EMBED_DIMS = 768;
const VOYAGE_MODEL = 'voyageai/voyage-multimodal-3.5';
const VOYAGE_DIMS = 1024;

function readJsonl(path: string): any[] {
	return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function main() {
	const key = getOpenRouterKey();
	const vectorsPath = resolve(process.cwd(), '.temp/eval/vectors.json');
	const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'));

	const v2Results = readJsonl(resolve(process.cwd(), '.temp/eval/results/google_gemini-2_5-flash-lite--v2.jsonl'))
		.filter((r) => r.ok && r.split === 'TEST');
	console.log(`Embedding cap_v2 for ${v2Results.length} TEST photos (gemini-2.5-flash-lite v2 captions).`);
	for (const r of v2Results) {
		const id = r.cf_image_id;
		if (!vectors.photos[id]) { console.log(`SKIP ${id}: not in vectors.json photo pool`); continue; }
		if (vectors.photos[id].cap_v2) { continue; }
		try {
			const emb = await embedTextWith(key, TEXT_MODEL, r.extraction.caption, TEXT_DIMS, `${id}:cap-v2`);
			vectors.photos[id].cap_v2 = emb.vector;
			writeFileSync(vectorsPath, JSON.stringify(vectors));
			console.log(`cap_v2 OK: ${id}`);
		} catch (err: any) {
			console.log(`cap_v2 FAIL ${id}: ${err.message?.slice(0, 200)}`);
		}
	}

	const queries = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/queries-40.json'), 'utf8'));
	vectors.queries40 = vectors.queries40 ?? {};
	for (const q of queries) {
		if (vectors.queries40[q.id]?.done) continue;
		try {
			const capSpace = await embedTextWith(key, TEXT_MODEL, q.query, TEXT_DIMS, `${q.id}:text-space`);
			const geminiSpace = await embedTextWith(key, GEMINI_EMBED_MODEL, q.query, GEMINI_EMBED_DIMS, `${q.id}:gemini-space`);
			const voyageSpace = await embedTextWith(key, VOYAGE_MODEL, q.query, VOYAGE_DIMS, `${q.id}:voyage-space`);
			vectors.queries40[q.id] = { done: true, text_space: capSpace.vector, gemini_space: geminiSpace.vector, voyage_space: voyageSpace.vector };
			writeFileSync(vectorsPath, JSON.stringify(vectors));
			console.log(`query40 vector OK: ${q.id}`);
		} catch (err: any) {
			console.log(`query40 vector FAIL ${q.id}: ${err.message?.slice(0, 200)}`);
		}
	}
	console.log('done');
}
main();
