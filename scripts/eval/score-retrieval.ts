/**
 * Retrieval eval: for each of the 4 vector spaces (caption/current, caption/improved,
 * image/gemini-embedding-2, image/voyage-multimodal-3.5) plus a hybrid (avg of caption/current +
 * image/gemini cosine scores, rank-fused), rank the 74-photo eval corpus by cosine similarity to
 * each query and compute recall@10 and MRR against queries.json's `relevant` sets.
 *
 * Scored ONLY over the 15 non-jersey queries (type != 'jersey+color') — production routes a
 * jersey query through find_photos_by_jersey (a structured sightings filter, see
 * supabase/migrations/20260623220000_jersey_popularity_blend.sql), never through
 * match_photos_hybrid's vector path, so scoring vectors on jersey queries would measure a path
 * the product doesn't use. The jersey-query path is scored separately by score-sightings.ts
 * (its precision/recall over on-court sightings IS the jersey-retrieval metric).
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { cosineSim } from './lib/embed';

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/vectors.json'), 'utf8'));
const queries = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/queries.json'), 'utf8')).filter((q: any) => q.type !== 'jersey+color');

const photoIds = Object.keys(vectors.photos).filter((id) => vectors.photos[id].done);

function rankFor(queryVec: number[], space: 'cap_current' | 'cap_improved' | 'img_gemini' | 'img_voyage'): string[] {
	const scored = photoIds
		.filter((id) => vectors.photos[id][space])
		.map((id) => ({ id, score: cosineSim(queryVec, vectors.photos[id][space]) }))
		.sort((a, b) => b.score - a.score);
	return scored.map((s) => s.id);
}

function hybridRank(queryVecCap: number[], queryVecImg: number[], imgSpace: 'img_gemini' | 'img_voyage' = 'img_gemini'): string[] {
	const scored = photoIds
		.filter((id) => vectors.photos[id].cap_current && vectors.photos[id][imgSpace])
		.map((id) => {
			const capScore = cosineSim(queryVecCap, vectors.photos[id].cap_current);
			const imgScore = cosineSim(queryVecImg, vectors.photos[id][imgSpace]);
			return { id, score: (capScore + imgScore) / 2 };
		})
		.sort((a, b) => b.score - a.score);
	return scored.map((s) => s.id);
}

function recallAt10AndMrr(ranked: string[], relevant: string[]): { recall10: number; mrr: number } {
	const relevantInPool = relevant.filter((r) => photoIds.includes(r));
	if (relevantInPool.length === 0) return { recall10: NaN, mrr: NaN };
	const top10 = new Set(ranked.slice(0, 10));
	const hit = relevantInPool.filter((r) => top10.has(r)).length;
	const recall10 = hit / relevantInPool.length;
	let mrr = 0;
	for (let i = 0; i < ranked.length; i++) {
		if (relevantInPool.includes(ranked[i])) { mrr = 1 / (i + 1); break; }
	}
	return { recall10, mrr };
}

function main() {
	const spaces = ['cap_current', 'cap_improved', 'img_gemini', 'img_voyage', 'hybrid', 'hybrid_voyage'] as const;
	const results: Record<string, { recall10: number[]; mrr: number[] }> = {};
	for (const s of spaces) results[s] = { recall10: [], mrr: [] };

	const perQuery: any[] = [];
	for (const q of queries) {
		const qv = vectors.queries[q.id];
		if (!qv?.done) { console.log(`SKIP ${q.id}: no query vector`); continue; }
		const row: any = { id: q.id, query: q.query, type: q.type };
		for (const s of spaces) {
			let ranked: string[];
			if (s === 'hybrid') ranked = hybridRank(qv.text_space, qv.gemini_space, 'img_gemini');
			else if (s === 'hybrid_voyage') ranked = hybridRank(qv.text_space, qv.voyage_space, 'img_voyage');
			else if (s === 'img_gemini' || s === 'img_voyage') ranked = rankFor(s === 'img_gemini' ? qv.gemini_space : qv.voyage_space, s);
			else ranked = rankFor(qv.text_space, s);
			const { recall10, mrr } = recallAt10AndMrr(ranked, q.relevant);
			if (!Number.isNaN(recall10)) { results[s].recall10.push(recall10); results[s].mrr.push(mrr); }
			row[`${s}_recall10`] = recall10;
			row[`${s}_mrr`] = mrr;
			row[`${s}_top3`] = ranked.slice(0, 3);
		}
		perQuery.push(row);
	}

	const summary: any = {};
	for (const s of spaces) {
		const rs = results[s].recall10, ms = results[s].mrr;
		summary[s] = {
			n_queries: rs.length,
			mean_recall_at_10: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
			mean_mrr: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null,
		};
		console.log(`${s}: n=${rs.length} mean_recall@10=${summary[s].mean_recall_at_10?.toFixed(3)} mean_MRR=${summary[s].mean_mrr?.toFixed(3)}`);
	}

	writeFileSync(resolve(process.cwd(), '.temp/eval/retrieval-scores.json'), JSON.stringify({ summary, perQuery, corpus_size: photoIds.length }, null, 2));
}
main();
