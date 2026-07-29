/**
 * Month boundaries for querying `photo_metadata`, built without a Date object.
 *
 * ## The bug this replaces
 *
 * Every month query built its window as `new Date(year, month - 1, 1).toISOString()`. That
 * constructor interprets its arguments in the **runtime's local timezone**, and `.toISOString()`
 * then converts to UTC — so the window silently shifts by the host's UTC offset.
 *
 * `photo_date` and `upload_date` are `timestamp WITHOUT time zone`. Postgres **discards** the
 * offset when casting such a literal (verified: `'2025-10-01T05:00:00.000Z'::timestamp` is
 * `2025-10-01 05:00:00`), so the shifted instant is compared as a shifted *wall clock* against
 * timezone-naive data. The window does not merely move — it lands on the wrong wall-clock hours.
 *
 * Ingest stamps `upload_date` at midnight, so a five-hour shift drops an entire day. Measured
 * on October 2025: 272 photos on a UTC host, 213 on a UTC-5 laptop. The 59 missing rows are
 * exactly the ones with `upload_date` in [Oct 1 00:00, Oct 1 05:00) — counted, not estimated.
 *
 * Cloudflare Workers run UTC, so production was correct and nothing was visibly broken. The
 * cost was silent: any local check of a month or timeline page disagreed with production, which
 * is the failure mode where a verification passes while measuring something else.
 *
 * ## The rule
 *
 * The column has no timezone, so neither does the bound. These are naive wall-clock strings
 * (`2025-10-01T00:00:00`) built by string arithmetic — no Date, therefore no host timezone in
 * the path at all. A `Z`-suffixed bound would also work today, but only because Postgres throws
 * the `Z` away; writing one implies an offset the column cannot carry.
 *
 * Windows are half-open, `[start, endExclusive)`. The previous code used an inclusive
 * `23:59:59` end, which drops any timestamp in the final second.
 */

/** Zero-padded to the width Postgres expects in a timestamp literal. */
function pad(n: number, width = 2): string {
	return String(n).padStart(width, '0');
}

/** Naive wall-clock midnight on the first of a month: `2025-10-01T00:00:00`. */
function firstOfMonth(year: number, month: number): string {
	return `${pad(year, 4)}-${pad(month)}-01T00:00:00`;
}

/**
 * Half-open bounds for one month, for use as `.gte(col, start).lt(col, endExclusive)`.
 *
 * @param month 1-12.
 */
export function monthWindow(year: number, month: number): { start: string; endExclusive: string } {
	const next = addMonths(year, month, 1);
	return {
		start: firstOfMonth(year, month),
		endExclusive: firstOfMonth(next.year, next.month)
	};
}

/**
 * Shift a (year, month) pair by whole months, rolling the year over.
 *
 * Replaces `date.setMonth(date.getMonth() ± 1)`, which is correct for months but drags a
 * local-time Date along for the ride — and that Date was then reused to render the month name
 * and build the query window.
 *
 * @param month 1-12.
 */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
	const zeroBased = (month - 1) + delta;
	return {
		year: year + Math.floor(zeroBased / 12),
		month: ((zeroBased % 12) + 12) % 12 + 1
	};
}

/**
 * Month names, fixed rather than derived.
 *
 * The call sites used `new Date(year, month - 1).toLocaleString('default', { month: 'long' })`.
 * `'default'` is whatever locale the runtime happens to have, so the label on a reader-facing
 * page ("October 2025") was a property of the host's ICU configuration. This site is English;
 * say so once here instead of asking each runtime.
 */
export const MONTH_NAMES = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
] as const;

/** `monthName(10)` → `'October'`. @param month 1-12. */
export function monthName(month: number): string {
	return MONTH_NAMES[month - 1] ?? '';
}
