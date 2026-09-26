/**
 * Recompute img_gemini / img_voyage for every photo in vectors.json using the CORRECTED
 * embedImageWith (content-object shape — see lib/embed.ts header for what was wrong before).
 * cap_current / cap_improved are untouched (those were always plain-text embeds of the caption
 * string, never affected by the image-shape bug).
 *
 * Images are resized to 768px long edge before embedding — semantic image search doesn't need
 * full jersey-digit resolution the way extraction does, and it keeps voyage's per-image token
 * count (which scales with resolution) in the few-hundred range instead of thousands.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import { getOpenRouterKey } from './lib/key';
import { fetchProductionBuffer } from './lib/images';
import { embedImageWith } from './lib/embed';

const GEMINI_EMBED_MODEL = 'google/gemini-embedding-2';
const GEMINI_EMBED_DIMS = 768;
const VOYAGE_MODEL = 'voyageai/voyage-multimodal-3.5';
const VOYAGE_DIMS = 1024;
const EMBED_RESIZE_LONG_EDGE = 768;

async function main() {
	const key = getOpenRouterKey();
	const vectorsPath = resolve(process.cwd(), '.temp/eval/vectors.json');
	const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'));

	const ids = Object.keys(vectors.photos);
	console.log(`Recomputing img_gemini/img_voyage for ${ids.length} photos with the corrected shape.`);

	let fixed = 0, failed = 0;
	for (const id of ids) {
		try {
			const full = await fetchProductionBuffer(id);
			const resized = await sharp(full).resize({ width: EMBED_RESIZE_LONG_EDGE, height: EMBED_RESIZE_LONG_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
			const dataUrl = `data:image/jpeg;base64,${resized.toString('base64')}`;

			const gemini = await embedImageWith(key, GEMINI_EMBED_MODEL, dataUrl, GEMINI_EMBED_DIMS, `${id}:img-gemini-fixed`);
			const voyage = await embedImageWith(key, VOYAGE_MODEL, dataUrl, VOYAGE_DIMS, `${id}:img-voyage-fixed`);

			vectors.photos[id].img_gemini = gemini.vector;
			vectors.photos[id].img_voyage = voyage.vector;
			vectors.photos[id].img_tokens_gemini = gemini.costTokens;
			vectors.photos[id].img_tokens_voyage = voyage.costTokens;
			fixed++;
			writeFileSync(vectorsPath, JSON.stringify(vectors)); // checkpoint every photo
			console.log(`fixed ${id} (gemini tokens=${gemini.costTokens}, voyage tokens=${voyage.costTokens})`);
		} catch (err: any) {
			failed++;
			console.log(`FAIL ${id}: ${err.message?.slice(0, 200)}`);
		}
	}
	console.log(`\nDone. Fixed ${fixed}, failed ${failed}.`);
}
main();
