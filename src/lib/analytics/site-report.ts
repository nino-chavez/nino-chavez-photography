import { chicagoTime, range, siteFigure, SITE_CONTACT_LABEL, SITE_REACH_LABEL, type SiteFigure, type SiteReading } from './home';
import { clickReading, reachReading } from './site-readings';
import type { SiteActionReport } from './site-actions';
import { SITE_SECTIONS, type SitePeriod, type SiteSection } from './site-traffic';
import type { SiteTrafficReport, SiteTrafficResult } from './site-traffic.server';

/**
 * The site report: is anyone looking at my profile and work, and did anyone reach out? Pure, and every
 * sentence here is reader-facing copy, so this file is a reader-contract source root.
 *
 * Rules the copy keeps, the same as Home:
 *  - One reach measure, named: Cloudflare page loads. The site's own page-view count is a second
 *    measure with another window; it is on the data quality page, not here.
 *  - Every number says what it is compared with, or says that there is nothing to compare it with.
 *  - A count that does not exist yet is never zero. It says since when counting began.
 *  - Browsers are not people, and a link opened is not a message sent.
 *  - Photography is not measured here. The gallery is one app page, so its page loads undercount
 *    what people do in it; Home and Albums have the real gallery numbers.
 */

export const SITE_OUTBOUND_LABEL = 'Outbound links clicked';
export const SITE_PERIODS: readonly SitePeriod[] = [7, 30, 90];

export type SiteFilter = SiteSection | 'all';

export function sectionLabel(section: SiteFilter): string {
	return section === 'all' ? 'All sections' : SITE_SECTIONS.find((item) => item.key === section)?.label ?? 'All sections';
}

/** What to do about a reading that could not be taken, said once, in plain words. */
export function providerFix(reason: string): string {
	return /not configured/i.test(reason)
		? 'This report has no Cloudflare access set up here, so there is nothing to retry. Add the Cloudflare analytics settings to the site\'s server settings.'
		: 'This is not zero. Reload in a few minutes. If it keeps failing, check the Cloudflare analytics token in the site\'s server settings.';
}

export interface SiteFigures { reach: SiteFigure; contacts: SiteFigure; outbound: SiteFigure }

/** The three lead figures. Clicks follow the section; reach is for the whole site, and photography has no reach figure here. */
export function siteLead(input: {
	traffic: SiteTrafficResult | null;
	actions: SiteActionReport | null;
	period: SitePeriod;
	section: SiteFilter;
	today: string;
}): SiteFigures {
	const { traffic, actions, period, section, today } = input;
	return {
		reach: reachFigure(traffic, period, section, today),
		contacts: clickFigure(SITE_CONTACT_LABEL, actions, 'contact_clicks', period, today, ' These are links opened, not messages sent.'),
		outbound: clickFigure(SITE_OUTBOUND_LABEL, actions, 'external_clicks', period, today, ' These are links opened, not visits that happened.')
	};
}

function reachFigure(traffic: SiteTrafficResult | null, period: SitePeriod, section: SiteFilter, today: string): SiteFigure {
	if (section === 'photography') {
		return { label: SITE_REACH_LABEL, value: null, detail: 'Not shown for photography. The gallery is one app page, so page loads undercount what people do in it. Home and Albums count the gallery itself.' };
	}
	const reading = reachReading(traffic);
	if (!reading.available) return { label: SITE_REACH_LABEL, value: null, detail: `${reading.reason} ${providerFix(reading.reason)}` };
	if (section === 'all' || !traffic || !traffic.available) return { ...siteFigure(SITE_REACH_LABEL, reading, today, ' Includes the photography pages; gallery activity is counted on Home and Albums.', period) };
	const picked = traffic.sections.find((item) => item.key === section);
	if (!picked) return { label: SITE_REACH_LABEL, value: null, detail: 'This section was not in the report. This is not zero.' };
	const dates = range({ start: traffic.start, end: traffic.end }, today);
	return { label: SITE_REACH_LABEL, value: picked.pageviews.toLocaleString('en-US'), detail: `${dates}, ${sectionLabel(section)} only. The ${period} days before are measured for the whole site, so this section has nothing to compare it with.` };
}

function clickFigure(label: string, actions: SiteActionReport | null, metric: 'contact_clicks' | 'external_clicks', period: SitePeriod, today: string, unit: string): SiteFigure {
	if (actions === null) return { label, value: null, detail: 'Link clicks could not be read. This is not a report of zero. Reload in a few minutes.' };
	const reading: SiteReading = clickReading(actions, metric, period);
	if (!reading.available) {
		const counting = /^Link clicks have been counted since/.test(reading.reason);
		return { label, value: null, detail: counting && period > 7 ? `${reading.reason} Choose 7 days to see them.` : reading.reason };
	}
	const base = siteFigure(label, reading, today, unit, period);
	return actions.available && actions.freshness.status === 'stale' ? { ...base, detail: `${base.detail} The counts are catching up, so the last hours may be missing.` } : base;
}

/** Pages worth showing in a section. Photography pages are left out of every list; their number is on Home and Albums. */
export function pagesFor(report: SiteTrafficReport, section: SiteFilter): SiteTrafficReport['topPages'] {
	if (section === 'photography') return [];
	if (section === 'all') return report.topPages.filter((page) => page.section !== 'photography');
	return report.sections.find((item) => item.key === section)?.topPages ?? [];
}

/** Where visits entered from, by section. For all sections the photography pages are left out, like the page list. */
export function referrersFor(report: SiteTrafficReport, section: SiteFilter, limit = 6): Array<{ host: string; entryVisits: number }> {
	if (section === 'photography') return [];
	const merged = new Map<string, number>();
	const sections = section === 'all' ? report.sections.filter((item) => item.key !== 'photography') : report.sections.filter((item) => item.key === section);
	for (const item of sections) for (const ref of item.referrers) merged.set(ref.host, (merged.get(ref.host) ?? 0) + ref.entryVisits);
	return [...merged].filter(([host, visits]) => visits > 0 && host !== 'ninochavez.co').map(([host, entryVisits]) => ({ host, entryVisits })).sort((a, b) => b.entryVisits - a.entryVisits || a.host.localeCompare(b.host)).slice(0, limit);
}

export interface SectionCard { key: SiteSection; label: string; pageLoads: number | null; entryVisits: number | null; pointsToGallery: boolean }

/** One card per section. Photography has no figure, only a pointer to the pages that count it properly. */
export function sectionCards(report: SiteTrafficReport): SectionCard[] {
	return SITE_SECTIONS.map(({ key, label }) => {
		if (key === 'photography') return { key, label, pageLoads: null, entryVisits: null, pointsToGallery: true };
		const item = report.sections.find((section) => section.key === key);
		return { key, label, pageLoads: item?.pageviews ?? 0, entryVisits: item?.entryVisits ?? 0, pointsToGallery: false };
	});
}

/** A page's path as words: "/blog/my-post" becomes "blog / my post". */
export function pageLabel(path: string): string {
	if (path === '/') return 'Home';
	try {
		return decodeURIComponent(path).split('/').filter(Boolean).map((part) => part.replaceAll('-', ' ')).join(' / ');
	} catch { return path; }
}

/** The line under the figures: which days, how they were counted, and what the lists below leave out. */
export function windowNote(traffic: SiteTrafficResult | null, period: SitePeriod, today: string): string {
	if (!traffic || !traffic.available) return `The last ${period} complete UTC days.`;
	return `${range({ start: traffic.start, end: traffic.end }, today)}, complete UTC days. Page loads are Cloudflare's count with known bots removed. The lists below leave out the photography pages; the total above includes them.`;
}

/**
 * Today's clicks so far, as one line kept apart from every total. The day is not complete, so it is never
 * added to a figure above and never compared. Null when there is no honest thing to say: the summary has
 * no reading for today, or counting has not started.
 */
export function todayLine(actions: SiteActionReport | null, today: string): string | null {
	if (!actions || !actions.available || !actions.freshness.todayAvailable || !actions.firstRecordedAt || actions.recordedSections.length === 0) return null;
	const contact = actions.todayTotals.contact_clicks ?? 0;
	const outbound = actions.todayTotals.external_clicks ?? 0;
	const part = (count: number, one: string, many: string) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
	return `Today so far, kept apart from every number above: ${part(contact, 'contact link', 'contact links')} and ${part(outbound, 'outbound link', 'outbound links')} clicked, through ${chicagoTime(actions.freshness.summaryCutoffAt, today)} Chicago time.`;
}
