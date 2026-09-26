/**
 * Run one (model, prompt-arm) cell across a photo split, writing one JSON result line per photo
 * to .temp/eval/results/<model-slug>--<arm>[--tiled].jsonl (resumable: skips photo_ids already
 * present in the output file).
 *
 * Usage: npx tsx scripts/eval/run-vision.ts --split TEST --model google/gemini-2.5-flash-lite --arm production
 *        npx tsx scripts/eval/run-vision.ts --split TEST --model google/gemini-2.5-flash-lite --arm improved --tiled
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { getOpenRouterKey } from './lib/key';
import { fetchProductionBuffer, tileImage } from './lib/images';
import { runArm, type PromptArm } from './lib/run-arm';
import type { Sport } from '../../src/lib/ai/taxonomy';

interface Args { split: string; model: string; arm: PromptArm; tiled: boolean; limit?: number }

function parseArgs(): Args {
	const a: any = { tiled: false };
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const k = argv[i];
		if (k === '--split') a.split = argv[++i];
		else if (k === '--model') a.model = argv[++i];
		else if (k === '--arm') a.arm = argv[++i];
		else if (k === '--tiled') a.tiled = true;
		else if (k === '--limit') a.limit = Number(argv[++i]);
	}
	if (!a.split || !a.model || !a.arm) throw new Error('usage: --split TEST|TUNE --model <id> --arm production|improved [--tiled] [--limit N]');
	return a;
}

function slug(model: string): string {
	return model.replace(/[/.]/g, '_');
}

async function main() {
	const args = parseArgs();
	const key = getOpenRouterKey();
	const photos = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/photos.json'), 'utf8'));
	let pool = photos.filter((p: any) => p.split === args.split);
	if (args.limit) pool = pool.slice(0, args.limit);

	const outPath = resolve(process.cwd(), `.temp/eval/results/${slug(args.model)}--${args.arm}${args.tiled ? '--tiled' : ''}.jsonl`);
	const outDir = dirname(outPath);
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	const already = new Set<string>();
	if (existsSync(outPath)) {
		for (const line of readFileSync(outPath, 'utf8').split('\n').filter(Boolean)) {
			try { already.add(JSON.parse(line).cf_image_id); } catch {}
		}
	}

	console.log(`Running ${pool.length} photos (split=${args.split}) through model=${args.model} arm=${args.arm} tiled=${args.tiled}. Already done: ${already.size}. -> ${outPath}`);

	for (const p of pool) {
		if (already.has(p.cf_image_id)) continue;
		const t0 = Date.now();
		try {
			const full = await fetchProductionBuffer(p.cf_image_id);
			const buffers = args.tiled ? await tileImage(full, { cols: 2, rows: 2, maxTileEdge: 1400 }) : [full];
			const result = await runArm({
				model: args.model,
				arm: args.arm,
				apiKey: key,
				albumSport: (p.album_sport as Sport) ?? null,
				albumName: p.album_name,
				buffers,
				jobLabel: p.cf_image_id,
			});
			const ms = Date.now() - t0;
			const line = JSON.stringify({
				cf_image_id: p.cf_image_id, photo_id: p.photo_id, album_key: p.album_key, split: p.split,
				model: args.model, arm: args.arm, tiled: args.tiled,
				ok: true, ms, cost: result.cost, attempts: result.attempts,
				extraction: result.extraction,
			});
			appendFileSync(outPath, line + '\n');
			console.log(`OK   ${p.cf_image_id} ${ms}ms cost=${result.cost}`);
		} catch (err: any) {
			const ms = Date.now() - t0;
			const line = JSON.stringify({
				cf_image_id: p.cf_image_id, photo_id: p.photo_id, album_key: p.album_key, split: p.split,
				model: args.model, arm: args.arm, tiled: args.tiled,
				ok: false, ms, error: err.message?.slice(0, 300),
			});
			appendFileSync(outPath, line + '\n');
			console.log(`FAIL ${p.cf_image_id} ${ms}ms ${err.message?.slice(0, 150)}`);
			if (String(err.message).startsWith('BUDGET STOP')) { console.error('Budget stop hit, aborting run.'); process.exit(1); }
		}
	}
}
main();
