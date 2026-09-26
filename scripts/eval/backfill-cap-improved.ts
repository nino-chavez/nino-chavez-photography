/** One-off backfill: compute-vectors.ts ran before the improved-arm file had all 53 rows flushed,
 * so 34/53 photos were checkpointed with cap_improved=null. Recompute just those. */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getOpenRouterKey } from './lib/key';
import { embedTextWith } from './lib/embed';

const TEXT_MODEL = 'openai/text-embedding-3-large';
const TEXT_DIMS = 768;

function readJsonl(path: string): any[] {
	return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function main() {
	const key = getOpenRouterKey();
	const vectorsPath = resolve(process.cwd(), '.temp/eval/vectors.json');
	const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'));
	const improvedResults = readJsonl(resolve(process.cwd(), '.temp/eval/results/google_gemini-2_5-flash-lite--improved.jsonl'))
		.filter((r) => r.ok && r.split === 'TEST');
	const improvedByPhoto = new Map(improvedResults.map((r) => [r.cf_image_id, r]));

	let fixed = 0;
	for (const [id, v] of Object.entries(vectors.photos) as [string, any][]) {
		if (v.cap_improved) continue;
		const improved = improvedByPhoto.get(id);
		if (!improved) { console.log(`no improved result for ${id}, leaving null`); continue; }
		try {
			const emb = await embedTextWith(key, TEXT_MODEL, improved.extraction.caption, TEXT_DIMS, `${id}:cap-improved-backfill`);
			v.cap_improved = emb.vector;
			fixed++;
			writeFileSync(vectorsPath, JSON.stringify(vectors));
			console.log(`fixed ${id}`);
		} catch (err: any) {
			console.log(`FAIL ${id}: ${err.message}`);
		}
	}
	console.log(`Backfilled ${fixed} cap_improved vectors.`);
}
main();
