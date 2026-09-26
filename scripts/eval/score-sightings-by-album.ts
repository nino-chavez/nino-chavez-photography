/**
 * Per-album breakdown of jersey-sighting false positives, split by cause (bench/spectator/
 * non-player-number vs pure hallucination). Complements score-sightings.ts's pooled numbers with
 * the album-level view the orchestrator asked for — does bench/spectator pollution rate differ
 * by venue type (HS gym with sideline bench in frame vs beach/charity albums with few/no jerseys
 * at all)?
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const RESULTS_DIR = resolve(process.cwd(), '.temp/eval/results');
const labels: Record<string, any> = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/labels.json'), 'utf8'));

function groundTruthFor(cfImageId: string): { onCourt: Set<string>; notOnCourt: Set<string> } {
	const l = labels[cfImageId];
	if (!l) return { onCourt: new Set(), notOnCourt: new Set() };
	const onCourt = new Set<string>();
	const notOnCourt = new Set<string>();
	for (const p of l.on_court_players ?? []) {
		if (p.role === 'on_court') onCourt.add(p.jersey_number);
		else notOnCourt.add(p.jersey_number);
	}
	for (const n of l.non_player_numbers ?? []) notOnCourt.add(n.text);
	return { onCourt, notOnCourt };
}

function scoreFileByAlbum(path: string) {
	const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
	const byAlbum: Record<string, { photos: number; tp: number; fpBench: number; fpHallu: number; fn: number }> = {};

	for (const line of lines) {
		const row = JSON.parse(line);
		if (!row.ok || row.split !== 'TEST') continue;
		if (!(row.cf_image_id in labels)) continue;
		const gt = groundTruthFor(row.cf_image_id);
		const album = row.album_key;
		if (!byAlbum[album]) byAlbum[album] = { photos: 0, tp: 0, fpBench: 0, fpHallu: 0, fn: 0 };
		byAlbum[album].photos++;

		let predicted: string[] = (row.extraction.players ?? []).filter((p: any) => p.jersey_number).map((p: any) => p.jersey_number);
		predicted = [...new Set(predicted)];
		const matchedGt = new Set<string>();
		for (const num of predicted) {
			if (gt.onCourt.has(num)) { byAlbum[album].tp++; matchedGt.add(num); }
			else if (gt.notOnCourt.has(num)) { byAlbum[album].fpBench++; }
			else { byAlbum[album].fpHallu++; }
		}
		byAlbum[album].fn += [...gt.onCourt].filter((n) => !matchedGt.has(n)).length;
	}
	return byAlbum;
}

function main() {
	const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.jsonl'));
	const report: any = {};
	for (const f of files) {
		const key = f.replace('.jsonl', '');
		const byAlbum = scoreFileByAlbum(resolve(RESULTS_DIR, f));
		report[key] = byAlbum;
		console.log(`\n${key}:`);
		for (const [album, s] of Object.entries(byAlbum)) {
			const totalFp = s.fpBench + s.fpHallu;
			const benchShare = totalFp > 0 ? (s.fpBench / totalFp) : null;
			console.log(`  ${album}: n=${s.photos} tp=${s.tp} fp_bench=${s.fpBench} fp_hallu=${s.fpHallu} fn=${s.fn} bench_share_of_fp=${benchShare?.toFixed(2) ?? 'n/a'}`);
		}
	}
	writeFileSync(resolve(process.cwd(), '.temp/eval/sightings-by-album.json'), JSON.stringify(report, null, 2));
}
main();
