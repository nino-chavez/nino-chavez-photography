/**
 * Cost / latency / JSON-validity summary per (model, arm), TEST split only. Complements
 * score-sightings.ts and score-captions.ts (accuracy) with the operational numbers needed for
 * the $/photo and re-run-the-library projections in the report.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const RESULTS_DIR = resolve(process.cwd(), '.temp/eval/results');
const LIBRARY_SIZE = 22674; // actual photo_metadata row count, verified via db count (not the "~20K" approximation)

function main() {
	const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.jsonl'));
	const report: any = {};
	for (const f of files) {
		const key = f.replace('.jsonl', '');
		const lines = readFileSync(resolve(RESULTS_DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.split === 'TEST');
		const n = lines.length;
		const ok = lines.filter((r) => r.ok);
		const okRate = n ? ok.length / n : null;
		const costs = ok.map((r) => r.cost).filter((c) => c != null) as number[];
		const totalCost = costs.reduce((a, b) => a + b, 0);
		const avgCost = costs.length ? totalCost / costs.length : null;
		const latencies = ok.map((r) => r.ms);
		latencies.sort((a, b) => a - b);
		const medLatency = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
		const avgAttempts = ok.length ? ok.reduce((a, r) => a + (r.attempts ?? 1), 0) / ok.length : null;
		report[key] = {
			n, ok: ok.length, ok_rate: okRate,
			avg_cost_per_photo: avgCost,
			median_latency_ms: medLatency,
			avg_attempts: avgAttempts,
			projected_full_library_cost: avgCost != null ? avgCost * LIBRARY_SIZE : null,
		};
		console.log(`${key}: n=${n} ok_rate=${okRate?.toFixed(2)} avg_cost=$${avgCost?.toFixed(5)} median_latency=${medLatency}ms avg_attempts=${avgAttempts?.toFixed(2)} proj_full_lib=$${report[key].projected_full_library_cost?.toFixed(2)}`);
	}
	writeFileSync(resolve(process.cwd(), '.temp/eval/run-summary.json'), JSON.stringify(report, null, 2));
}
main();
