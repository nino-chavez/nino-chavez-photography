/**
 * Run prompt v2 (caption-only change, players[] unchanged from production) across a photo split.
 * Usage: npx tsx scripts/eval/run-v2.ts --split TEST --model google/gemini-2.5-flash-lite
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { getOpenRouterKey } from './lib/key';
import { fetchProductionBuffer } from './lib/images';
import { extractOneV2 } from './lib/v2-extraction';
import { logSpend, checkBudgetOrThrow } from './lib/spend';
import type { Sport } from '../../src/lib/ai/taxonomy';

function parseArgs() {
	const a: any = { limit: undefined };
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const k = argv[i];
		if (k === '--split') a.split = argv[++i];
		else if (k === '--model') a.model = argv[++i];
		else if (k === '--limit') a.limit = Number(argv[++i]);
	}
	if (!a.split || !a.model) throw new Error('usage: --split TEST|TUNE --model <id> [--limit N]');
	return a;
}
const slug = (m: string) => m.replace(/[/.]/g, '_');

async function main() {
	const args = parseArgs();
	const key = getOpenRouterKey();
	const photos = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/photos.json'), 'utf8'));
	let pool = photos.filter((p: any) => p.split === args.split);
	if (args.limit) pool = pool.slice(0, args.limit);

	const outPath = resolve(process.cwd(), `.temp/eval/results/${slug(args.model)}--v2.jsonl`);
	const outDir = dirname(outPath);
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	const already = new Set<string>();
	if (existsSync(outPath)) for (const line of readFileSync(outPath, 'utf8').split('\n').filter(Boolean)) { try { already.add(JSON.parse(line).cf_image_id); } catch {} }

	console.log(`Running ${pool.length} photos (split=${args.split}) through model=${args.model} arm=v2. Already done: ${already.size}. -> ${outPath}`);

	for (const p of pool) {
		if (already.has(p.cf_image_id)) continue;
		checkBudgetOrThrow();
		const t0 = Date.now();
		try {
			const buf = await fetchProductionBuffer(p.cf_image_id);
			let result;
			for (let attempt = 0; ; attempt++) {
				try {
					result = await extractOneV2(buf, { apiKey: key, model: args.model, albumSport: (p.album_sport as Sport) ?? null, albumName: p.album_name });
					break;
				} catch (err: any) {
					if (String(err.message).startsWith('RETRY:') && attempt < 4) {
						await new Promise((r) => setTimeout(r, Math.min(30000, 1000 * 2 ** attempt)));
						continue;
					}
					throw err;
				}
			}
			logSpend({ job: `v2:${args.model}:${p.cf_image_id}`, model: args.model, cost: result!.cost });
			const ms = Date.now() - t0;
			appendFileSync(outPath, JSON.stringify({ cf_image_id: p.cf_image_id, photo_id: p.photo_id, album_key: p.album_key, split: p.split, model: args.model, arm: 'v2', ok: true, ms, cost: result!.cost, extraction: result!.extraction }) + '\n');
			console.log(`OK   ${p.cf_image_id} ${ms}ms cost=${result!.cost}`);
		} catch (err: any) {
			const ms = Date.now() - t0;
			logSpend({ job: `v2:${args.model}:${p.cf_image_id}:FAILED`, model: args.model, cost: 0 });
			appendFileSync(outPath, JSON.stringify({ cf_image_id: p.cf_image_id, photo_id: p.photo_id, album_key: p.album_key, split: p.split, model: args.model, arm: 'v2', ok: false, ms, error: err.message?.slice(0, 300) }) + '\n');
			console.log(`FAIL ${p.cf_image_id} ${ms}ms ${err.message?.slice(0, 150)}`);
			if (String(err.message).startsWith('BUDGET STOP')) { console.error('Budget stop, aborting.'); process.exit(1); }
		}
	}
}
main();
