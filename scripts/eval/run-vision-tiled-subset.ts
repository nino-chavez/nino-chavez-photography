/**
 * Player-crop / higher-detail variant: run the improved prompt over 2x2 tiles (instead of the
 * single full-frame buffer) for a jersey-dense subset of TEST, to see whether more pixels-on-
 * target improves jersey legibility over the full-frame improved-prompt arm already measured.
 * Cheap enough to run on the whole photo (task brief: "if cheap") since real per-photo cost is
 * ~$0.0005-0.004 even at 4x the image tokens.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { getOpenRouterKey } from './lib/key';
import { tileImage, fetchProductionBuffer } from './lib/images';
import { runArm } from './lib/run-arm';
import type { Sport } from '../../src/lib/ai/taxonomy';

// The 15 TEST photos with the most on-court ground-truth sightings (jersey-dense subset).
const SUBSET = [
	'fJKdsB-DSC08793', 'fJKdsB-DSC09159', 'fJKdsB-DSC09162', 'fJKdsB-DSC09152', 'fJKdsB-DSC08666',
	'fJKdsB-DSC09048', 'DSC03909', 'DSC02954', 'DSC03712', '1BlKk4-DSC06976',
	'fJKdsB-DSC08931', 'fJKdsB-DSC08750', 'fJKdsB-DSC08693', 'fJKdsB-DSC08644', 'fJKdsB-DSC08697',
];

const MODELS = ['google/gemini-2.5-flash-lite', 'google/gemini-3.1-flash-lite'];

async function main() {
	const key = getOpenRouterKey();
	const photos = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/photos.json'), 'utf8'));
	const byId = new Map(photos.map((p: any) => [p.cf_image_id, p]));

	for (const model of MODELS) {
		const outPath = resolve(process.cwd(), `.temp/eval/results/${model.replace(/[/.]/g, '_')}--improved--tiled.jsonl`);
		const outDir = dirname(outPath);
		if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
		const already = new Set<string>();
		if (existsSync(outPath)) for (const line of readFileSync(outPath, 'utf8').split('\n').filter(Boolean)) { try { already.add(JSON.parse(line).cf_image_id); } catch {} }

		for (const id of SUBSET) {
			if (already.has(id)) continue;
			const p: any = byId.get(id);
			if (!p) { console.log(`SKIP ${id}: not in photos.json`); continue; }
			const t0 = Date.now();
			try {
				const full = await fetchProductionBuffer(id);
				const tiles = await tileImage(full, { cols: 2, rows: 2, maxTileEdge: 1400 });
				const result = await runArm({ model, arm: 'improved', apiKey: key, albumSport: (p.album_sport as Sport) ?? null, albumName: p.album_name, buffers: tiles, jobLabel: id });
				const ms = Date.now() - t0;
				appendFileSync(outPath, JSON.stringify({ cf_image_id: id, photo_id: p.photo_id, album_key: p.album_key, split: p.split, model, arm: 'improved', tiled: true, ok: true, ms, cost: result.cost, attempts: result.attempts, extraction: result.extraction }) + '\n');
				console.log(`OK   ${model} ${id} ${ms}ms cost=${result.cost}`);
			} catch (err: any) {
				const ms = Date.now() - t0;
				appendFileSync(outPath, JSON.stringify({ cf_image_id: id, photo_id: p.photo_id, album_key: p.album_key, split: p.split, model, arm: 'improved', tiled: true, ok: false, ms, error: err.message?.slice(0, 300) }) + '\n');
				console.log(`FAIL ${model} ${id} ${ms}ms ${err.message?.slice(0, 150)}`);
			}
		}
	}
}
main();
