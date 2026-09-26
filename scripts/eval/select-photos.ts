/**
 * Select the eval photo pool: 5 volleyball albums (4 indoor + 1 beach), split TUNE/TEST BY
 * ALBUM (never mixed within an album) so the improved prompt is designed on TUNE and scored
 * fresh on TEST. Re7kho (the rollout pilot) is never used — hard rule from the task brief.
 *
 * Album picks and why:
 *   - fJKdsB (HS Girls VB - JCA vs PNHS, indoor, required by brief) -> TEST
 *   - 1BlKk4 (Chicago Big Dig - North Avenue Beach, outdoor, required by brief) -> TEST
 *   - j0g2Hw (College MVB - Lewis vs Lindenwood, indoor)             -> TEST
 *   - eqYF0h (Bump Bash #5, indoor adult league gym)                 -> TUNE
 *   - Y2Er7w (HS Boys VB - PNHS vs WWSHS, indoor)                    -> TUNE
 *
 * fJKdsB, eqYF0h, 1BlKk4 already carry the current ingest-v2:google/gemini-2.5-flash-lite
 * extraction (verified via extraction_version) — that gives a FREE "today" baseline for those
 * three albums' sightings/captions/quality scores, no API spend needed to reconstruct it.
 * j0g2Hw and Y2Er7w have extraction_version NULL (never run through the current pipeline), so
 * their "today" baseline is reconstructed live by running arm=production, model=the locked
 * baseline model over them — which is one of the harness's required comparison cells anyway.
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { db } from './lib/db';

interface AlbumPick { albumKey: string; split: 'TUNE' | 'TEST'; sampleSize: number; note: string }

const PICKS: AlbumPick[] = [
	{ albumKey: 'fJKdsB', split: 'TEST', sampleSize: 20, note: 'indoor HS, required, has today-baseline' },
	{ albumKey: '1BlKk4', split: 'TEST', sampleSize: 20, note: 'beach, required, has today-baseline' },
	{ albumKey: 'j0g2Hw', split: 'TEST', sampleSize: 15, note: 'indoor college, no today-baseline (NULL extraction_version)' },
	{ albumKey: 'eqYF0h', split: 'TUNE', sampleSize: 15, note: 'indoor adult league, has today-baseline' },
	{ albumKey: 'Y2Er7w', split: 'TUNE', sampleSize: 10, note: 'indoor HS boys, no today-baseline (NULL extraction_version)' },
];

/** Deterministic pseudo-random sample (no external deps) — evenly spaced with a fixed seed offset
 * so re-running select-photos.ts reproduces the same pool. */
function sampleEvenly<T>(arr: T[], n: number): T[] {
	if (arr.length <= n) return arr;
	const step = arr.length / n;
	const out: T[] = [];
	for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
	return out;
}

async function main() {
	const pool: any[] = [];
	for (const pick of PICKS) {
		const { data: album, error: albumErr } = await db
			.from('albums')
			.select('album_key, album_name, sport, venue, event_date')
			.eq('album_key', pick.albumKey)
			.single();
		if (albumErr || !album) { console.error(`album ${pick.albumKey} not found:`, albumErr?.message); continue; }

		const { data: photos, error } = await db
			.from('photo_metadata')
			.select('photo_id, image_key, cf_image_id, album_key, photo_category, play_type, extraction_version, width, height, caption')
			.eq('album_key', pick.albumKey)
			.order('image_key');
		if (error || !photos) { console.error(`photos for ${pick.albumKey} failed:`, error?.message); continue; }

		// Stratify lightly by existing photo_category tag when present (production already tagged
		// fJKdsB/eqYF0h/1BlKk4) so the sample isn't all-action; for NULL-tagged albums (j0g2Hw,
		// Y2Er7w) this just evenly spaces by image_key order.
		const byCategory = new Map<string, any[]>();
		for (const p of photos) {
			const k = p.photo_category ?? 'untagged';
			if (!byCategory.has(k)) byCategory.set(k, []);
			byCategory.get(k)!.push(p);
		}
		const cats = [...byCategory.keys()];
		const perCat = Math.max(1, Math.ceil(pick.sampleSize / cats.length));
		let sampled: any[] = [];
		for (const c of cats) sampled.push(...sampleEvenly(byCategory.get(c)!, perCat));
		sampled = sampleEvenly(sampled, pick.sampleSize);

		const hasTodayBaseline = photos.some((p) => p.extraction_version?.startsWith('ingest-v2'));

		for (const p of sampled) {
			pool.push({
				photo_id: p.photo_id,
				image_key: p.image_key,
				cf_image_id: p.cf_image_id,
				album_key: p.album_key,
				album_name: album.album_name,
				album_sport: album.sport,
				album_venue: album.venue,
				split: pick.split,
				has_today_baseline: !!p.extraction_version?.startsWith('ingest-v2'),
				width: p.width,
				height: p.height,
				prod_photo_category: p.photo_category,
				prod_play_type: p.play_type,
				prod_caption: p.caption,
			});
		}
		console.log(`${pick.albumKey} (${pick.split}): sampled ${sampled.length}/${photos.length}, today-baseline available=${hasTodayBaseline}, note=${pick.note}`);
	}
	const outPath = resolve(process.cwd(), '.temp/eval/photos.json');
	writeFileSync(outPath, JSON.stringify(pool, null, 2));
	console.log(`\nTotal pool: ${pool.length} photos -> ${outPath}`);
	console.log(`TUNE: ${pool.filter((p) => p.split === 'TUNE').length}, TEST: ${pool.filter((p) => p.split === 'TEST').length}`);
}
main();
