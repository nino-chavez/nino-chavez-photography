/**
 * Retrieval replication at n=40 queries over the full 65-photo TEST corpus (up from the original
 * 15-query, 53-photo eval that first (wrongly) showed image vectors losing, then (after the
 * embedding-shape fix) showed them winning). Scores caption-current, caption-v2 (from prompt v2,
 * task A's winning model), image-gemini, image-voyage, and two hybrid fusion rules (flat average,
 * and a caption-weighted 0.35/0.65 caption/image blend) — overall AND broken out per query type,
 * since the orchestrator specifically wants to know whether image vectors win on jersey-number
 * queries too or only on scene/action (jersey queries don't reach vector search in production —
 * they route through find_photos_by_jersey — but scoring them here still answers the confound
 * question cleanly).
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { cosineSim } from './lib/embed';

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/vectors.json'), 'utf8'));
const queries = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/queries-40.json'), 'utf8'));

const photoIds = Object.keys(vectors.photos).filter((id) => vectors.photos[id].done);

type Space = 'cap_current' | 'cap_v2' | 'img_gemini' | 'img_voyage';

function rankFor(queryVec: number[], space: Space): string[] {
	return photoIds
		.filter((id) => vectors.photos[id][space])
		.map((id) => ({ id, score: cosineSim(queryVec, vectors.photos[id][space]) }))
		.sort((a, b) => b.score - a.score)
		.map((s) => s.id);
}

function hybridRank(capVec: number[], imgVec: number[], imgSpace: 'img_gemini' | 'img_voyage', capWeight: number, imgWeight: number, capSpace: 'cap_current' | 'cap_v2' = 'cap_current'): string[] {
	return photoIds
		.filter((id) => vectors.photos[id][capSpace] && vectors.photos[id][imgSpace])
		.map((id) => {
			const c = cosineSim(capVec, vectors.photos[id][capSpace]);
			const i = cosineSim(imgVec, vectors.photos[id][imgSpace]);
			return { id, score: capWeight * c + imgWeight * i };
		})
		.sort((a, b) => b.score - a.score)
		.map((s) => s.id);
}

function recallAt10AndMrr(ranked: string[], relevant: string[]): { recall10: number; mrr: number } | null {
	const relevantInPool = relevant.filter((r) => photoIds.includes(r));
	if (relevantInPool.length === 0) return null;
	const top10 = new Set(ranked.slice(0, 10));
	const hit = relevantInPool.filter((r) => top10.has(r)).length;
	const recall10 = hit / relevantInPool.length;
	let mrr = 0;
	for (let i = 0; i < ranked.length; i++) { if (relevantInPool.includes(ranked[i])) { mrr = 1 / (i + 1); break; } }
	return { recall10, mrr };
}

const ARMS = [
	'cap_current', 'cap_v2', 'img_gemini', 'img_voyage',
	'hybrid_avg_gemini', 'hybrid_avg_voyage',
	'hybrid_weighted_gemini', 'hybrid_weighted_voyage',
] as const;

function rankForArm(arm: (typeof ARMS)[number], qv: any): string[] {
	switch (arm) {
		case 'cap_current': return rankFor(qv.text_space, 'cap_current');
		case 'cap_v2': return rankFor(qv.text_space, 'cap_v2');
		case 'img_gemini': return rankFor(qv.gemini_space, 'img_gemini');
		case 'img_voyage': return rankFor(qv.voyage_space, 'img_voyage');
		case 'hybrid_avg_gemini': return hybridRank(qv.text_space, qv.gemini_space, 'img_gemini', 0.5, 0.5);
		case 'hybrid_avg_voyage': return hybridRank(qv.text_space, qv.voyage_space, 'img_voyage', 0.5, 0.5);
		case 'hybrid_weighted_gemini': return hybridRank(qv.text_space, qv.gemini_space, 'img_gemini', 0.35, 0.65);
		case 'hybrid_weighted_voyage': return hybridRank(qv.text_space, qv.voyage_space, 'img_voyage', 0.35, 0.65);
	}
}

function main() {
	const byType: Record<string, Record<string, { recall10: number[]; mrr: number[] }>> = {};
	const overall: Record<string, { recall10: number[]; mrr: number[] }> = {};
	for (const arm of ARMS) { overall[arm] = { recall10: [], mrr: [] }; }

	const perQuery: any[] = [];
	for (const q of queries) {
		const qv = vectors.queries40[q.id];
		if (!qv?.done) { console.log(`SKIP ${q.id}: no vector`); continue; }
		byType[q.type] = byType[q.type] ?? {};
		for (const arm of ARMS) byType[q.type][arm] = byType[q.type][arm] ?? { recall10: [], mrr: [] };

		const row: any = { id: q.id, query: q.query, type: q.type };
		for (const arm of ARMS) {
			const ranked = rankForArm(arm, qv);
			const scored = recallAt10AndMrr(ranked, q.relevant);
			if (scored) {
				overall[arm].recall10.push(scored.recall10); overall[arm].mrr.push(scored.mrr);
				byType[q.type][arm].recall10.push(scored.recall10); byType[q.type][arm].mrr.push(scored.mrr);
			}
			row[`${arm}_recall10`] = scored?.recall10 ?? null;
			row[`${arm}_mrr`] = scored?.mrr ?? null;
		}
		perQuery.push(row);
	}

	const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
	console.log('=== OVERALL (n=40) ===');
	const summaryOverall: any = {};
	for (const arm of ARMS) {
		summaryOverall[arm] = { n: overall[arm].recall10.length, mean_recall_at_10: avg(overall[arm].recall10), mean_mrr: avg(overall[arm].mrr) };
		console.log(`${arm}: n=${summaryOverall[arm].n} recall@10=${summaryOverall[arm].mean_recall_at_10?.toFixed(3)} MRR=${summaryOverall[arm].mean_mrr?.toFixed(3)}`);
	}

	const summaryByType: any = {};
	for (const type of Object.keys(byType)) {
		console.log(`\n=== TYPE: ${type} (n=10) ===`);
		summaryByType[type] = {};
		for (const arm of ARMS) {
			const s = byType[type][arm];
			summaryByType[type][arm] = { n: s.recall10.length, mean_recall_at_10: avg(s.recall10), mean_mrr: avg(s.mrr) };
			console.log(`  ${arm}: n=${s.recall10.length} recall@10=${summaryByType[type][arm].mean_recall_at_10?.toFixed(3)} MRR=${summaryByType[type][arm].mean_mrr?.toFixed(3)}`);
		}
	}

	writeFileSync(resolve(process.cwd(), '.temp/eval/retrieval-40-scores.json'), JSON.stringify({ overall: summaryOverall, byType: summaryByType, perQuery, corpus_size: photoIds.length }, null, 2));
}
main();
