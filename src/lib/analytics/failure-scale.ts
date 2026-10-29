/**
 * Scale for a "photo loads failed" note: what share of loads that is, and whether it is more than the rest of the gallery sees. Pure, and
 * reader-facing copy, so a reader-contract source root.
 *
 * "2 of 64 photo loads failed" is a count with no scale, and a count in an amber card reads as an alarm. A load can fail for reasons that
 * are nobody's fault (a dropped connection, a closed tab), so some share of loads always does. The note is compared with every other album's
 * loads over the same days, from the same recorded results, and it is a problem only when this launch's share is well above theirs.
 */

export interface LoadCounts { loads: number; failures: number }

export interface FailureScale {
	/** The finding this scale belongs to. */
	findingId: string;
	/** True when the share is within what the rest of the gallery sees, so the note is a line and not an alarm. */
	routine: boolean;
	sentence: string;
}

/** Fewest photo loads with a recorded result, across the other albums, that make a usual rate. */
export const MIN_REST_LOADS = 100;
/** The launch's share is "well above" the rest at this many times their share... */
export const WELL_ABOVE_FACTOR = 2;
/** ...and at least this much higher, as a share of loads (2 points), so 0.1% against 0.3% is not a surge. */
export const WELL_ABOVE_POINTS = 0.02;
/** ...and this many more failures than the rest of the gallery's share would give for the same number of loads, so two failures never decide it. */
export const MIN_EXCESS_FAILURES = 5;

const whole = (value: number) => value.toLocaleString('en-US');
/** "3%", or "0.3%" when a whole percent would hide it. */
export function share(part: number, of: number): string {
	const value = of > 0 ? part / of : 0;
	return value > 0 && value < 0.01 ? `${(value * 100).toFixed(1)}%` : `${Math.round(value * 100)}%`;
}

export function failureScale(findingId: string, own: LoadCounts, gallery: LoadCounts): FailureScale {
	const mine = `${whole(own.failures)} of ${whole(own.loads)} photo loads with a recorded result failed (${share(own.failures, own.loads)})`;
	const restLoads = gallery.loads - own.loads;
	const restFailures = gallery.failures - own.failures;
	if (own.loads <= 0 || restLoads < MIN_REST_LOADS || restFailures < 0) {
		return { findingId, routine: false, sentence: `${mine}. The other albums have too few recorded photo loads to say what share is usual.` };
	}
	const ownShare = own.failures / own.loads;
	const restShare = restFailures / restLoads;
	const higher = ownShare >= WELL_ABOVE_FACTOR * restShare && ownShare - restShare >= WELL_ABOVE_POINTS;
	const wellAbove = higher && own.failures - own.loads * restShare >= MIN_EXCESS_FAILURES;
	const rest = `${share(restFailures, restLoads)} (${whole(restFailures)} of ${whole(restLoads)})`;
	if (wellAbove) return { findingId, routine: false, sentence: `${mine}. Every other album, over the same days, had ${rest}, so this launch is well above it.` };
	if (higher) return { findingId, routine: true, sentence: `${mine}. Every other album, over the same days, had ${rest}. That is higher, but ${whole(own.failures)} ${own.failures === 1 ? 'failure is' : 'failures are'} too few to say this launch loads worse.` };
	return { findingId, routine: true, sentence: `${mine}. Every other album, over the same days, had ${rest}, so this is within what the gallery usually sees.` };
}
