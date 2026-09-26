/** Appends the D6M8cZ (2024 PNHS vs PEHS, HS indoor) sample to photos.json as an additional TEST
 * album, added per orchestrator request to test bench/spectator-in-frame HS gym photos not
 * represented by the original TEST album mix (fJKdsB had zero bench-visible frames; 1BlKk4 is
 * mostly unnumbered beach doubles; j0g2Hw had exactly one bench case). Labeled BEFORE any model
 * is scored on it — see labels.json entries added alongside this script's run. */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { db } from './lib/db';

const SAMPLE_IDS = ['39CL4vC', '8TH7rtJ', 'FHKLpf9', 'JChXN3b', 'LNQz9Jd', 'PsrCFGx', 'sfBfp4x', 'WWQV6dC', '3gskq4P', 'cXHvxLQ', 'mWdXdxc', 'sKJ9z9L'];

async function main() {
	const photosPath = resolve(process.cwd(), '.temp/eval/photos.json');
	const photos = JSON.parse(readFileSync(photosPath, 'utf8'));
	if (photos.some((p: any) => p.album_key === 'D6M8cZ')) { console.log('already added'); return; }

	const { data: album } = await db.from('albums').select('album_key, album_name, sport, venue').eq('album_key', 'D6M8cZ').single();
	const { data: rows } = await db.from('photo_metadata')
		.select('photo_id, image_key, cf_image_id, album_key, photo_category, play_type, extraction_version, width, height, caption')
		.eq('album_key', 'D6M8cZ')
		.in('image_key', SAMPLE_IDS);

	for (const p of rows ?? []) {
		photos.push({
			photo_id: p.photo_id, image_key: p.image_key, cf_image_id: p.cf_image_id, album_key: p.album_key,
			album_name: album!.album_name, album_sport: album!.sport, album_venue: album!.venue,
			split: 'TEST', has_today_baseline: !!p.extraction_version, width: p.width, height: p.height,
			prod_photo_category: p.photo_category, prod_play_type: p.play_type, prod_caption: p.caption,
		});
	}
	writeFileSync(photosPath, JSON.stringify(photos, null, 2));
	console.log(`Added ${rows?.length} photos from D6M8cZ. New total: ${photos.length}`);
}
main();
