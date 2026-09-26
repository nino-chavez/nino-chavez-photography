/**
 * Generate the images Claude labels ground truth from: the production ("public" variant, full
 * res) buffer resized to <=1400px long edge (the read-guard hook's own ceiling — better to hand
 * it an already-compliant image than let it force a 1000px substitute). Saved once per photo to
 * .temp/eval/images/labels/<cf_image_id>--label.jpg.
 *
 * Also pre-generates 2x2 tiles (not read by default) for the escalation path: a labeler can Read
 * the 4 tile files for a specific photo when the label-view leaves a jersey number ambiguous.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import sharp from 'sharp';
import { fetchProductionBuffer, tileImage } from './lib/images';

const LABEL_DIR = resolve(process.cwd(), '.temp/eval/images/labels');
const TILE_DIR = resolve(process.cwd(), '.temp/eval/images/tiles');

function ensureDir(p: string) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

async function main() {
	const photos = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/photos.json'), 'utf8'));
	ensureDir(LABEL_DIR); ensureDir(TILE_DIR);
	const failed: string[] = [];
	for (const p of photos) {
		try {
			const labelPath = resolve(LABEL_DIR, `${p.cf_image_id}--label.jpg`);
			if (!existsSync(labelPath)) {
				const buf = await fetchProductionBuffer(p.cf_image_id);
				const resized = await sharp(buf).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
				writeFileSync(labelPath, resized);
			}
			const tile0 = resolve(TILE_DIR, `${p.cf_image_id}--tile0.jpg`);
			if (!existsSync(tile0)) {
				const buf = await fetchProductionBuffer(p.cf_image_id);
				const tiles = await tileImage(buf, { cols: 2, rows: 2, maxTileEdge: 1400 });
				tiles.forEach((t, i) => writeFileSync(resolve(TILE_DIR, `${p.cf_image_id}--tile${i}.jpg`), t));
			}
			console.log(`ready: ${p.cf_image_id}`);
		} catch (err: any) {
			console.error(`FAILED ${p.cf_image_id}: ${err.message}`);
			failed.push(p.cf_image_id);
		}
	}
	if (failed.length) console.log(`\n${failed.length} failed: ${failed.join(', ')}`);
}
main();
