/**
 * Pick a non-black default thumbnail for a Cloudflare Stream video.
 *
 * Stream's default thumbnail is captured at ~t=0. Every video ingested through
 * this pipeline is a highlight reel produced by flickdaymedia's batch editor
 * (apps/flickdaymedia/scripts/edit-reel.sh), which always fades in from black
 * at the start (and out to black at the end) — so the t=0 default is
 * guaranteed to be a solid black frame, not a representative one.
 *
 * There's no frame-accurate scene-detection API on Stream, but there doesn't
 * need to be: sample a handful of frames from the middle of the clip (skipping
 * the fade zones at both ends) via Stream's dynamic `?time=` thumbnail param,
 * decode each with sharp (already a project dependency), and pick whichever
 * has the highest mean pixel brightness. A near-black fade frame scores near
 * zero; real footage — grass, sky, jerseys — scores far higher. Cheap, no ML,
 * no new dependency.
 */
import sharp from 'sharp';

// Mean of R/G/B channel means, 0-255. Fade frames measured well under 10;
// anything above this is unambiguously "not a black frame".
const BLACK_THRESHOLD = 25;
// Bright enough that sampling more candidates wouldn't change the decision —
// lets the middle-out search short-circuit instead of always fetching all 5.
const CONFIDENT_THRESHOLD = BLACK_THRESHOLD * 3;
// Fractions of clip duration to sample, middle-out (most likely to already be
// clear of both the intro and outro fade before falling back to the edges).
const CANDIDATE_FRACTIONS = [0.5, 0.35, 0.65, 0.25, 0.75];

export interface ThumbnailPick {
	time: number; // seconds into the clip
	pct: number; // 0-1, for Stream's thumbnailTimestampPct
	meanBrightness: number;
}

function thumbnailUrl(uid: string, subdomain: string, timeSec?: number): string {
	const base = `https://customer-${subdomain}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;
	return timeSec === undefined ? base : `${base}?time=${timeSec.toFixed(2)}s`;
}

export async function fetchThumbnailBuffer(uid: string, subdomain: string, timeSec?: number): Promise<Buffer> {
	const res = await fetch(thumbnailUrl(uid, subdomain, timeSec));
	if (!res.ok) throw new Error(`thumbnail fetch ${res.status} (${uid}${timeSec !== undefined ? ` @${timeSec}s` : ''})`);
	return Buffer.from(await res.arrayBuffer());
}

export async function meanBrightness(buf: Buffer): Promise<number> {
	const { channels } = await sharp(buf).stats();
	const rgb = channels.slice(0, 3);
	return rgb.reduce((sum, c) => sum + c.mean, 0) / rgb.length;
}

export function isNearBlack(brightness: number): boolean {
	return brightness < BLACK_THRESHOLD;
}

/** Sample candidate frames and return the brightest — the pick to persist. */
export async function pickBestThumbnail(
	uid: string,
	durationSeconds: number,
	subdomain: string
): Promise<ThumbnailPick> {
	const duration = Math.max(durationSeconds, 1);
	let best: ThumbnailPick | null = null;

	for (const frac of CANDIDATE_FRACTIONS) {
		const timeSec = Math.min(Math.max(frac * duration, 0.5), Math.max(duration - 0.3, 0.5));
		try {
			const buf = await fetchThumbnailBuffer(uid, subdomain, timeSec);
			const brightness = await meanBrightness(buf);
			if (!best || brightness > best.meanBrightness) {
				best = { time: timeSec, pct: timeSec / duration, meanBrightness: brightness };
			}
			if (brightness >= CONFIDENT_THRESHOLD) break;
		} catch {
			// One candidate timestamp failing (Stream still rendering it) shouldn't
			// sink the whole pick — the remaining candidates carry it.
		}
	}

	if (!best) throw new Error(`No thumbnail candidate succeeded for ${uid}`);
	return best;
}

/** Persist the chosen frame as Stream's own default thumbnail (Update Video API). */
export async function setStreamThumbnail(
	uid: string,
	pct: number,
	accountId: string,
	token: string
): Promise<void> {
	const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ thumbnailTimestampPct: pct }),
	});
	if (!res.ok) throw new Error(`Stream thumbnail update ${res.status}: ${await res.text()}`);
}

/**
 * Full fix for one video: sample, pick, persist. Call right after a Stream
 * upload reaches readyToStream (new ingests), or against an already-live
 * video whose stored thumbnail turned out to be black (backfill).
 */
export async function fixThumbnail(
	uid: string,
	durationSeconds: number,
	subdomain: string,
	accountId: string,
	token: string
): Promise<ThumbnailPick> {
	const pick = await pickBestThumbnail(uid, durationSeconds, subdomain);
	await setStreamThumbnail(uid, pick.pct, accountId, token);
	return pick;
}
