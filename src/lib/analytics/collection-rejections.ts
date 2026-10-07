/**
 * Whether the collector's rejected events are at their usual rate. Pure, and reader-facing copy, so a reader-contract source root.
 *
 * The collector counts every event it receives as accepted, rejected or a duplicate, one counter row per Chicago day. A
 * rejected event is refused for one of several reasons and the collector records none of them, so this file says what
 * changed against the counters' own earlier days and never says why. The owner reads it; the counters are owner-only.
 */

/** One Chicago day of the collector's counters, the three outcomes summed over event formats. */
export interface DeliveryDay { date: string; accepted: number; rejected: number; duplicate: number }

/** Earlier complete days needed before a day can be called unusual. With fewer there is no usual rate to compare with. */
export const REJECTION_BASELINE_DAYS = 3;
/** A day is unusual at this many times the usual rate or more... */
export const REJECTION_SURGE_FACTOR = 3;
/** ...and only when it is also at least this many rejected events, so a quiet gallery's handful never counts as a surge. */
export const REJECTION_SURGE_FLOOR = 100;

export type RejectionReading =
	| { kind: 'unusual'; since: string; usualPerDay: number; recentPerDay: number; times: number | null; accepted: 'usual' | 'lower' | 'unknown'; headline: string; sentence: string }
	| { kind: 'usual'; usualPerDay: number; earlierSurge: { from: string; to: string } | null; headline: null; sentence: string }
	| { kind: 'no_baseline'; headline: null; sentence: string };

const median = (values: readonly number[]): number => {
	const sorted = [...values].sort((x, y) => x - y);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const whole = (value: number) => Math.round(value).toLocaleString('en-US');

/** "50", "7.5": a ratio said the way a reader would say it, never to the last digit. */
export function aboutTimes(ratio: number): string {
	const rounded = ratio < 10 ? Math.round(ratio * 2) / 2 : ratio < 20 ? Math.round(ratio) : ratio < 100 ? Math.round(ratio / 5) * 5 : Math.round(ratio / 10) * 10;
	return String(rounded);
}

/**
 * Days are read oldest first. A day is unusual when it is at least REJECTION_SURGE_FACTOR times the median of the days
 * before it that were not themselves unusual, and at least REJECTION_SURGE_FLOOR events. Today is partial and is never
 * counted. With fewer than REJECTION_BASELINE_DAYS earlier days there is no usual rate, and the reading says so.
 */
export function readRejections(input: { days: readonly DeliveryDay[]; lastCompleteDay: string; formatDay: (date: string) => string }): RejectionReading {
	const complete = input.days.filter((day) => day.date <= input.lastCompleteDay).sort((x, y) => x.date.localeCompare(y.date));
	const baseline: DeliveryDay[] = [];
	let surge: DeliveryDay[] = [];
	let usualAtStart = 0;
	let acceptedAtStart = 0;
	let earlierSurge: { from: string; to: string } | null = null;
	const unusual = (day: DeliveryDay, usual: number) => day.rejected >= Math.max(REJECTION_SURGE_FLOOR, REJECTION_SURGE_FACTOR * usual);
	for (const day of complete) {
		if (surge.length === 0) {
			const usual = baseline.length >= REJECTION_BASELINE_DAYS ? median(baseline.map((item) => item.rejected)) : null;
			if (usual !== null && unusual(day, usual)) {
				surge = [day];
				usualAtStart = usual;
				acceptedAtStart = median(baseline.map((item) => item.accepted));
			} else baseline.push(day);
		} else if (unusual(day, usualAtStart)) surge.push(day);
		else {
			earlierSurge = { from: surge[0].date, to: surge.at(-1)!.date };
			surge = [];
			baseline.push(day);
		}
	}
	if (complete.length <= REJECTION_BASELINE_DAYS) {
		return { kind: 'no_baseline', headline: null, sentence: `There are too few earlier days to say whether this many rejected events is usual. The collector has ${complete.length === 0 ? 'no complete day' : `${complete.length} complete ${complete.length === 1 ? 'day' : 'days'}`} on record, and a usual rate needs at least ${REJECTION_BASELINE_DAYS} before the days being judged.` };
	}
	if (surge.length === 0) {
		const usualPerDay = median(baseline.map((item) => item.rejected));
		const sentence = earlierSurge
			? `Rejected events are back to their usual rate, about ${whole(usualPerDay)} a day. They were unusually high from ${input.formatDay(earlierSurge.from)} to ${input.formatDay(earlierSurge.to)}, and the cause is not recorded.`
			: `Rejected events are at their usual rate, about ${whole(usualPerDay)} a day.`;
		return { kind: 'usual', usualPerDay, earlierSurge, headline: null, sentence };
	}
	const recentPerDay = mean(surge.map((day) => day.rejected));
	const times = usualAtStart >= 1 ? recentPerDay / usualAtStart : null;
	const acceptedNow = mean(surge.map((day) => day.accepted));
	const accepted: 'usual' | 'lower' | 'unknown' = acceptedAtStart < 1 ? 'unknown' : acceptedNow < acceptedAtStart / 2 ? 'lower' : acceptedNow <= acceptedAtStart * 2 ? 'usual' : 'unknown';
	const since = input.formatDay(surge[0].date);
	const headline = times === null
		? `Rejected events have averaged ${whole(recentPerDay)} a day since ${since}, against almost none before. The cause is not recorded yet.`
		: `Rejected events are about ${aboutTimes(times)} times their usual rate since ${since}. The cause is not recorded yet.`;
	const acceptedWords = accepted === 'usual' ? ' Accepted events are at about their usual rate.' : accepted === 'lower' ? ' Accepted events are also lower than usual.' : '';
	const sentence = times === null ? `${headline}${acceptedWords}` : `${headline} They have averaged ${whole(recentPerDay)} a day against about ${whole(usualAtStart)} before.${acceptedWords}`;
	return { kind: 'unusual', since: surge[0].date, usualPerDay: usualAtStart, recentPerDay, times, accepted, headline, sentence };
}
