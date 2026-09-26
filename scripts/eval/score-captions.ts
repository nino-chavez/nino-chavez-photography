/**
 * Caption quality + play_type accuracy scoring, per (model, arm) result file.
 *
 * Caption metrics:
 *   - word count distribution (contract caps at 30; the June benchmark's "~21 words, formulaic"
 *     complaint is about homogeneity, not the cap itself)
 *   - opening-phrase diversity: share of captions starting with the exact 2-word phrase "A player"
 *     (the June benchmark's "74/120 start 'A player in'" finding)
 *   - number-coverage (internal): of the on-court jersey numbers THIS MODEL ITSELF detected in
 *     players[], what fraction appear as a bare number in the caption text? This is the KNOWN
 *     PROBLEM's "sightings found numbers in most, captions mention a number in only 52/120" gap,
 *     measured per model/arm rather than only for production.
 *   - number-coverage (against ground truth): of the TRUE on-court numbers in labels.json, what
 *     fraction appear in the caption? This is the retrieval-relevant number — a caption is a
 *     search document, and a true number missing from it is unfindable by caption-vector search
 *     regardless of what the sightings pipeline found.
 *
 * play_type accuracy: against labels.json's play_type (my ground truth, explicitly noted as
 * Claude-labeled, not Nino-labeled), exact match, computed only over photos where ground truth
 * has a non-null play_type OR the model predicted one (so a null-vs-null match still counts).
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const RESULTS_DIR = resolve(process.cwd(), '.temp/eval/results');
const labels: Record<string, any> = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/labels.json'), 'utf8'));

function wordCount(s: string): number {
	return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

function numbersIn(text: string): Set<string> {
	// bare 1-3 digit tokens with optional trailing letter, matching the jersey_number shape,
	// bounded by non-word chars so "30 words" doesn't get read as a jersey number heuristically
	// (best-effort; false positives here would UNDER-count the gap, i.e. be conservative).
	const out = new Set<string>();
	for (const m of text.matchAll(/(?:#\s?)?\b(\d{1,3}[A-Z]?)\b/g)) out.add(m[1]);
	return out;
}

function scoreFile(path: string) {
	const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
	const wordCounts: number[] = [];
	let startsWithAPlayer = 0;
	let total = 0;
	let internalCoverageNum = 0, internalCoverageDenom = 0;
	let gtCoverageNum = 0, gtCoverageDenom = 0;
	let playTypeCorrect = 0, playTypeTotal = 0;
	const perPhoto: any[] = [];

	for (const line of lines) {
		const row = JSON.parse(line);
		if (!row.ok) continue;
		if (row.split !== 'TEST') continue; // report numbers are TEST-only; TUNE rows may leak into a shared file from earlier smoke tests
		const gt = labels[row.cf_image_id];
		if (!gt) continue;
		total++;
		const caption: string = row.extraction.caption ?? '';
		wordCounts.push(wordCount(caption));
		if (/^a player\b/i.test(caption.trim())) startsWithAPlayer++;

		const capNumbers = numbersIn(caption);
		const modelOnCourtNumbers = (row.extraction.players ?? [])
			.filter((p: any) => p.jersey_number)
			.map((p: any) => p.jersey_number as string);
		internalCoverageDenom += modelOnCourtNumbers.length;
		internalCoverageNum += modelOnCourtNumbers.filter((n: string) => capNumbers.has(n)).length;

		const gtOnCourtNumbers = (gt.on_court_players ?? []).filter((p: any) => p.role === 'on_court').map((p: any) => p.jersey_number);
		gtCoverageDenom += gtOnCourtNumbers.length;
		gtCoverageNum += gtOnCourtNumbers.filter((n: string) => capNumbers.has(n)).length;

		const predPlay = row.extraction.play_type ?? null;
		const gtPlay = gt.play_type ?? null;
		if (predPlay !== null || gtPlay !== null) {
			playTypeTotal++;
			if (predPlay === gtPlay) playTypeCorrect++;
		}

		perPhoto.push({ cf_image_id: row.cf_image_id, caption, words: wordCount(caption), pred_play_type: predPlay, gt_play_type: gtPlay });
	}

	wordCounts.sort((a, b) => a - b);
	const median = wordCounts.length ? wordCounts[Math.floor(wordCounts.length / 2)] : null;

	return {
		total,
		median_words: median,
		starts_with_a_player_share: total ? startsWithAPlayer / total : null,
		internal_number_coverage: internalCoverageDenom ? internalCoverageNum / internalCoverageDenom : null,
		internal_coverage_denom: internalCoverageDenom,
		ground_truth_number_coverage: gtCoverageDenom ? gtCoverageNum / gtCoverageDenom : null,
		ground_truth_coverage_denom: gtCoverageDenom,
		play_type_accuracy: playTypeTotal ? playTypeCorrect / playTypeTotal : null,
		play_type_n: playTypeTotal,
		perPhoto,
	};
}

function main() {
	const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.jsonl'));
	const report: any = {};
	for (const f of files) {
		const key = f.replace('.jsonl', '');
		const s = scoreFile(resolve(RESULTS_DIR, f));
		report[key] = { ...s, perPhoto: undefined };
		report[key].perPhoto = s.perPhoto; // keep for JSON but print summary only
		console.log(`${key}: n=${s.total} median_words=${s.median_words} "A player"-share=${s.starts_with_a_player_share?.toFixed(2)} internal_num_cov=${s.internal_number_coverage?.toFixed(2)} gt_num_cov=${s.ground_truth_number_coverage?.toFixed(2)} play_type_acc=${s.play_type_accuracy?.toFixed(2)} (n=${s.play_type_n})`);
	}
	writeFileSync(resolve(process.cwd(), '.temp/eval/caption-scores.json'), JSON.stringify(report, null, 2));
}
main();
