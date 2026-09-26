/**
 * Jersey-sighting precision/recall against the labels.json ground truth.
 *
 * Ground truth per photo: `on_court_players[]`, each with a `role` (on_court | bench |
 * spectator | official). ONLY role === 'on_court' entries count as true positives — a
 * bench/spectator/official entry in ground truth (e.g. fJKdsB uses none, but j0g2Hw's
 * DSC03453 #24 is explicitly role='bench') exists precisely so a model that reports that
 * number scores a FALSE POSITIVE, matching the task's rule: "bench/spectator hits count as
 * false positives." `non_player_numbers[]` (the eqYF0h charity-shirt-number case) is a second
 * false-positive trap: a printed digit that is not a jersey at all.
 *
 * Two scoring modes:
 *   - RAW: every non-null jersey_number the model reports counts (this is what production's
 *     find_photos_by_jersey RPC effectively returns today — see supabase/migrations/
 *     20260623220000_jersey_popularity_blend.sql, which filters ONLY on jersey_number).
 *   - ROLE-FILTERED: only players the model itself tagged role === 'on_court' count (only
 *     meaningful for the improved-prompt arm, which is the only one that emits a role field;
 *     this is the ceiling a new photo_jersey_sightings.role column could buy without touching
 *     the model at all).
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const RESULTS_DIR = resolve(process.cwd(), '.temp/eval/results');
const labels: Record<string, any> = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/labels.json'), 'utf8'));

interface Sighting { jersey_number: string; role?: string }

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

function scoreFile(path: string, roleFiltered: boolean) {
	const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
	let tp = 0, fpBenchOrNonPlayer = 0, fpHallucinated = 0, fnMissed = 0;
	let photosScored = 0;
	const perPhoto: any[] = [];

	for (const line of lines) {
		const row = JSON.parse(line);
		if (!row.ok) continue;
		if (row.split !== 'TEST') continue; // report numbers are TEST-only; TUNE rows may leak into a shared file from earlier smoke tests
		const gt = groundTruthFor(row.cf_image_id);
		if (!(row.cf_image_id in labels)) continue;
		photosScored++;

		let predicted: string[] = (row.extraction.players ?? [])
			.filter((p: Sighting) => p.jersey_number)
			.filter((p: Sighting) => !roleFiltered || p.role === 'on_court')
			.map((p: Sighting) => p.jersey_number);
		predicted = [...new Set(predicted)];

		const matchedGt = new Set<string>();
		let localTp = 0, localFpBench = 0, localFpHallu = 0;
		for (const num of predicted) {
			if (gt.onCourt.has(num)) { localTp++; matchedGt.add(num); }
			else if (gt.notOnCourt.has(num)) { localFpBench++; }
			else { localFpHallu++; }
		}
		const localFn = [...gt.onCourt].filter((n) => !matchedGt.has(n)).length;

		tp += localTp; fpBenchOrNonPlayer += localFpBench; fpHallucinated += localFpHallu; fnMissed += localFn;
		perPhoto.push({ cf_image_id: row.cf_image_id, predicted, gt_on_court: [...gt.onCourt], gt_not_on_court: [...gt.notOnCourt], tp: localTp, fp_bench: localFpBench, fp_hallucinated: localFpHallu, fn: localFn });
	}

	const precision = tp + fpBenchOrNonPlayer + fpHallucinated > 0 ? tp / (tp + fpBenchOrNonPlayer + fpHallucinated) : null;
	const recall = tp + fnMissed > 0 ? tp / (tp + fnMissed) : null;
	return { photosScored, tp, fpBenchOrNonPlayer, fpHallucinated, fnMissed, precision, recall, perPhoto };
}

function main() {
	const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.jsonl'));
	const report: any = {};
	for (const f of files) {
		const path = resolve(RESULTS_DIR, f);
		const key = f.replace('.jsonl', '');
		const raw = scoreFile(path, false);
		const roleFiltered = key.includes('improved') ? scoreFile(path, true) : null;
		report[key] = {
			raw: { photosScored: raw.photosScored, tp: raw.tp, fp_bench_or_nonplayer: raw.fpBenchOrNonPlayer, fp_hallucinated: raw.fpHallucinated, fn: raw.fnMissed, precision: raw.precision, recall: raw.recall },
			role_filtered: roleFiltered ? { photosScored: roleFiltered.photosScored, tp: roleFiltered.tp, fp_bench_or_nonplayer: roleFiltered.fpBenchOrNonPlayer, fp_hallucinated: roleFiltered.fpHallucinated, fn: roleFiltered.fnMissed, precision: roleFiltered.precision, recall: roleFiltered.recall } : null,
		};
		console.log(`${key}: RAW precision=${raw.precision?.toFixed(3)} recall=${raw.recall?.toFixed(3)} (tp=${raw.tp} fp_bench=${raw.fpBenchOrNonPlayer} fp_hallu=${raw.fpHallucinated} fn=${raw.fnMissed})`);
		if (roleFiltered) console.log(`${key}: ROLE-FILTERED precision=${roleFiltered.precision?.toFixed(3)} recall=${roleFiltered.recall?.toFixed(3)} (tp=${roleFiltered.tp} fp_bench=${roleFiltered.fpBenchOrNonPlayer} fp_hallu=${roleFiltered.fpHallucinated} fn=${roleFiltered.fnMissed})`);
	}
	writeFileSync(resolve(process.cwd(), '.temp/eval/sightings-scores.json'), JSON.stringify(report, null, 2));
}
main();
