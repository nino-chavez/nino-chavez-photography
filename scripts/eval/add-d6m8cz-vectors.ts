/** Extends vectors.json to cover D6M8cZ's 12 photos (cap_current + img_gemini/img_voyage),
 * completing the 65-photo corpus needed for the larger-n retrieval replication. cap_v2 is added
 * separately once the winning v2 model is chosen. */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import { getOpenRouterKey } from './lib/key';
import { fetchProductionBuffer } from './lib/images';
import { embedTextWith, embedImageWith } from './lib/embed';

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
	const vectorsPath = resolve(process.cwd(), '.temp/eval/vectors.json');
	const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'));

	const prodResults = readJsonl(resolve(process.cwd(), '.temp/eval/results/google_gemini-2_5-flash-lite--production.jsonl'))
		.filter((r) => r.ok && r.album_key === 'D6M8cZ');
	console.log(`Found ${prodResults.length} D6M8cZ production results to embed as cap_current.`);

	for (const r of prodResults) {
		const id = r.cf_image_id;
		if (vectors.photos[id]?.done) { console.log(`skip ${id} (already done)`); continue; }
		try {
			const capCurrent = await embedTextWith(key, TEXT_MODEL, r.extraction.caption, TEXT_DIMS, `${id}:cap-current`);
			const full = await fetchProductionBuffer(id);
			const resized = await sharp(full).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
			const dataUrl = `data:image/jpeg;base64,${resized.toString('base64')}`;
			const imgGemini = await embedImageWith(key, GEMINI_EMBED_MODEL, dataUrl, GEMINI_EMBED_DIMS, `${id}:img-gemini`);
			const imgVoyage = await embedImageWith(key, VOYAGE_MODEL, dataUrl, VOYAGE_DIMS, `${id}:img-voyage`);
			vectors.photos[id] = { done: true, cap_current: capCurrent.vector, cap_improved: null, img_gemini: imgGemini.vector, img_voyage: imgVoyage.vector };
			writeFileSync(vectorsPath, JSON.stringify(vectors));
			console.log(`added ${id}`);
		} catch (err: any) {
			console.log(`FAIL ${id}: ${err.message?.slice(0, 200)}`);
		}
	}
	console.log('done');
}
main();
