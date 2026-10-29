import type { SiteReading } from './home';
import { formatDay } from './launch-recap';
import type { SiteActionReport } from './site-actions';
import type { SiteTrafficResult } from './site-traffic.server';

/**
 * How the site's headline numbers are read, shared by Home and the site report so the two cannot
 * disagree. Pure: the loaders read, this file decides what a reading is.
 *
 * The rule for clicks: the site counts them only since collection began. A window that starts
 * before that is not a full window, so no total is shown for it and the page says since when the
 * count exists. A missing count is never shown as zero.
 */

export type ClickMetric = 'contact_clicks' | 'external_clicks';

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/**
 * One click measure over a window of `days` complete UTC days. The window before it is compared only
 * when collection began before that window too.
 */
export function clickReading(report: SiteActionReport, metric: ClickMetric, days: number): SiteReading {
	if (!report.available) return { available: false, reason: report.reason };
	const first = report.firstRecordedAt?.slice(0, 10) ?? null;
	if (!first || first > report.start || report.recordedSections.length === 0) {
		return { available: false, reason: first ? `Link clicks have been counted since ${formatDay(first)}, so there is no full ${days} days to count yet.` : 'Link clicks have not been counted yet, so there is nothing to show. This is not zero.' };
	}
	const hasPrevious = first <= addDays(report.start, -days);
	return { available: true, start: report.start, end: report.end, current: report.totals[metric] ?? 0, previous: hasPrevious ? report.previousTotals[metric] ?? 0 : null };
}

/** What a visitor reads when page loads cannot be shown. They cannot set anything up, so they are told the plain fact and nothing else. */
export const PAGE_LOADS_UNAVAILABLE = 'Page loads are not available right now.';

/**
 * Cloudflare page loads over the same window. The owner reads why they could not be read, in the page's words; a visitor reads only
 * that they are not available.
 */
export function reachReading(result: SiteTrafficResult | null, owner: boolean): SiteReading {
	if (result === null) return { available: false, reason: owner ? 'Cloudflare Web Analytics could not be read. No traffic total is shown.' : PAGE_LOADS_UNAVAILABLE };
	if (!result.available) return { available: false, reason: owner ? result.reason : PAGE_LOADS_UNAVAILABLE };
	return { available: true, start: result.start, end: result.end, current: result.pageviews, previous: result.previousPageviews };
}
