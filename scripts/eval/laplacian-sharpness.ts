/**
 * Deterministic-sharpness check: does variance of the Laplacian (a classic focus-measure — see
 * Pech-Pacheco et al. 2000) agree with the model's own 0-10 sharpness score?
 *
 * Sampled from a BROADER pool than the 74-photo labeled eval set (per the task brief: "measure
 * whether sharpness can be computed deterministically from pixels ... and whether it agrees with
 * the model's sharpness" — a general question about the whole pipeline's sharpness field, not
 * just the jersey/caption eval albums). Pulls ~200 photos with sharpness IS NOT NULL from a mix
 * of volleyball albums (excluding Re7kho, the pilot).
 *
 * Method: fetch the 'large' (1600px) CF variant, grayscale, resize so the long edge is a FIXED
 * 1000px (comparing variance across different native resolutions is meaningless unless the pixel
 * grid is normalized first), convolve with the 3x3 Laplacian kernel, take stats().channels[0].stdev
 * squared (variance). Report Spearman rank correlation against photo_metadata.sharpness, plus the
 * distribution of each metric (the KNOWN PROBLEM notes sharpness is 7-8 for 112/120 photos, i.e.
 * the model's own scores barely spread — worth showing the pixel-based metric's spread too).
 *
 * Caveat surfaced in the report, not fixed here: shallow depth of field lowers whole-frame
 * Laplacian variance even on a tack-sharp shot (only the subject is sharp; the blurred background
 * dominates the variance calculation on a full-frame photo). This is a KNOWN limitation of the
 * naive whole-frame approach, not a bug.
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import { db } from './lib/db';

const SAMPLE_SIZE = 200;
const EXCLUDED_ALBUM = 'Re7kho';
const LONG_EDGE = 1000;

const LAPLACIAN_KERNEL = {
	width: 3, height: 3,
	kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
};

async function laplacianVariance(buf: Buffer): Promise<number> {
	const gray = await sharp(buf)
		.resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
		.grayscale()
		.convolve(LAPLACIAN_KERNEL)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const stats = await sharp(gray.data, { raw: gray.info }).stats();
	return stats.channels[0].stdev ** 2;
}

/** Spearman rank correlation (no external stats dep). */
function spearman(xs: number[], ys: number[]): number {
	const rank = (arr: number[]): number[] => {
		const idx = arr.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
		const ranks = new Array(arr.length);
		let i = 0;
		while (i < idx.length) {
			let j = i;
			while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
			const avgRank = (i + j) / 2 + 1;
			for (let k = i; k <= j; k++) ranks[idx[k][1]] = avgRank;
			i = j + 1;
		}
		return ranks;
	};
	const rx = rank(xs), ry = rank(ys);
	const n = xs.length;
	const meanX = rx.reduce((a, b) => a + b, 0) / n;
	const meanY = ry.reduce((a, b) => a + b, 0) / n;
	let cov = 0, vx = 0, vy = 0;
	for (let i = 0; i < n; i++) {
		cov += (rx[i] - meanX) * (ry[i] - meanY);
		vx += (rx[i] - meanX) ** 2;
		vy += (ry[i] - meanY) ** 2;
	}
	return cov / Math.sqrt(vx * vy);
}

function quantiles(arr: number[]): { min: number; p25: number; median: number; p75: number; max: number } {
	const s = [...arr].sort((a, b) => a - b);
	const q = (p: number) => s[Math.floor(p * (s.length - 1))];
	return { min: s[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: s[s.length - 1] };
}

async function main() {
	const { data, error } = await db
		.from('photo_metadata')
		.select('photo_id, cf_image_id, album_key, sharpness')
		.not('sharpness', 'is', null)
		.not('album_key', 'eq', EXCLUDED_ALBUM)
		.order('photo_id')
		.limit(2000); // over-fetch, then evenly sample SAMPLE_SIZE below
	if (error || !data) { console.error(error); return; }

	const step = Math.max(1, Math.floor(data.length / SAMPLE_SIZE));
	const sample = data.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE);
	console.log(`Sampling ${sample.length} photos (from ${data.length} candidates) for Laplacian-vs-model-sharpness check.`);

	const rows: Array<{ photo_id: string; model_sharpness: number; laplacian_variance: number }> = [];
	const CF_ACCOUNT_HASH = 'wg34HB28-JkySWVm5fW4kA';
	for (const p of sample) {
		try {
			const url = `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${p.cf_image_id}/large`;
			const res = await fetch(url);
			if (!res.ok) { console.log(`skip ${p.photo_id}: CF ${res.status}`); continue; }
			const buf = Buffer.from(await res.arrayBuffer());
			const variance = await laplacianVariance(buf);
			rows.push({ photo_id: p.photo_id, model_sharpness: p.sharpness, laplacian_variance: variance });
			if (rows.length % 20 === 0) console.log(`  ...${rows.length}/${sample.length}`);
		} catch (err: any) {
			console.log(`skip ${p.photo_id}: ${err.message}`);
		}
	}

	const rho = spearman(rows.map((r) => r.model_sharpness), rows.map((r) => r.laplacian_variance));
	const modelQ = quantiles(rows.map((r) => r.model_sharpness));
	const lapQ = quantiles(rows.map((r) => r.laplacian_variance));

	const outDir = resolve(process.cwd(), '.temp/eval');
	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	writeFileSync(resolve(outDir, 'laplacian-sharpness-results.json'), JSON.stringify({ n: rows.length, spearman_rho: rho, model_sharpness_quantiles: modelQ, laplacian_variance_quantiles: lapQ, rows }, null, 2));

	console.log(`\nn=${rows.length}`);
	console.log(`Spearman rho (model sharpness vs Laplacian variance): ${rho.toFixed(3)}`);
	console.log(`Model sharpness quantiles:`, modelQ);
	console.log(`Laplacian variance quantiles:`, lapQ);
}
main();
