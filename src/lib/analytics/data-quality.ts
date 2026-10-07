import type { DataAnchor } from './data-anchors';
import { chicagoTime, openProblems, staleness, type Freshness, type HomeProblem, type ProblemInput } from './home';
import { formatDay, ordinal, plural } from './launch-recap';
import type { MeasurementHealth, RejectionDay, RejectionReading } from './measurement-health';
import { UNSTORED_REJECTION_REASONS } from './rejection-reasons';
import type { OperatorReport } from './operator-report.server';
import type { JourneyAggregate } from './posthog.types';
import type { SiteActionReport } from './site-actions';
import { providerFix } from './site-report';
import { PAGE_LOADS_UNAVAILABLE } from './site-readings';
import type { SiteTrafficResult } from './site-traffic.server';
import type { V2ReportProjection } from './v2-report-projection.server';

/**
 * Data quality: can I trust these numbers, and is collection working? Pure, and every sentence here is
 * reader-facing copy, so this file is a reader-contract source root.
 *
 * Rules the copy keeps, the same as Home:
 *  - The status comes first and uses Home's own freshness rule: the newest `reconciled_at` and the same
 *    open-problem list, so the two pages cannot disagree.
 *  - A part that could not be read says what that means and what to do. Unknown is never zero.
 *  - Browsers are not people. Unclassified traffic is counted, and is never called human.
 *  - Every list says which items it covers and why, so a count that differs from another page can be explained.
 */

const fmt = (value: number) => value.toLocaleString('en-US');
const MEASURE_NOUN: Record<string, string> = { photo_opens: 'photo open', album_opens: 'album open', downloads: 'download request', favorites: 'favorite', shares: 'share' };

/** What it means that a part is missing, and what to do. Never the word alone. */
export interface Unavailable { what: string; todo: string }

/**
 * What a visitor may be told to do about a part that is missing. Reloading is theirs to try. Server settings, the database and the
 * delivery job are the owner's, so a visitor is not handed that setup and is not told to fix what they cannot reach.
 */
export function forReader(note: Unavailable, owner: boolean): Unavailable {
	return owner ? note : { what: note.what, todo: /^Reload in a few minutes/.test(note.todo) ? 'Reload in a few minutes.' : '' };
}

/** The places on this page a status line can point at. A subset of the page's anchors. */
export type StatusAnchor = Extract<DataAnchor, 'status' | 'coverage' | 'delivery' | 'site-measures' | 'journeys' | 'counting' | 'traffic' | 'arrivals'>;

/** A part that could not be read at all, named by the section that shows its own note. */
export interface NotRead { id: string; section: StatusAnchor; name: string }

/* ---------------------------------------------------------------------------------------------- */
/* Status                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

/**
 * The worst state on the page, worst first: something needs attention; a part could not be read; a part reaches back
 * less far than the dates asked for (`limited`); nothing found. The headline says only that state, so it can never sit
 * above a part of the page that says something worse.
 */
export type StatusState = 'current' | 'limited' | 'partial' | 'attention';

export interface StatusView {
	state: StatusState;
	/** Whether the reader is the signed-in owner. Delivery and collection health are the owner's only, so a visitor's page cannot speak for them. */
	owner: boolean;
	headline: string;
	/** When the gallery counts were last refreshed and what they cover, or why that is not known, then what the numbers do not reach back to. */
	detail: string;
	/** The first sentence of `detail` alone: when the gallery counts were last refreshed, or why that is not known. */
	refreshed: string;
	problems: HomeProblem[];
	notRead: NotRead[];
	/** What the page's numbers do not reach back to, said in words; empty when every part covers the dates asked for. */
	limits: string[];
}

/**
 * A page with a part missing cannot say nothing is wrong. It says what could not be read. The owner sees every check, so for the
 * owner it can add that nothing was found in the rest; a visitor is not shown delivery and collection health, so a visitor's
 * page says that instead of an all-clear it cannot vouch for.
 */
const partialHeadline = (parts: number, owner: boolean) => `${plural(parts, 'part')} of this page could not be read. ${owner ? 'No problem was found in the rest.' : 'Collection health is shown to the owner only.'}`;

export function statusView(input: {
	problems: HomeProblem[]; notRead: NotRead[]; limits?: string[]; refreshedAt: string | null; lastCompleteDay: string; today: string;
	/** A problem that has its own headline: said in full, instead of "One thing needs attention.", when it is the only problem. */
	lead?: { id: string; headline: string } | null;
	owner: boolean;
}): StatusView {
	const { problems, notRead, refreshedAt, lastCompleteDay, today, owner } = input;
	const limits = input.limits ?? [];
	const state: StatusState = problems.length ? 'attention' : notRead.length ? 'partial' : limits.length ? 'limited' : 'current';
	const headline = state === 'current'
		? 'The gallery counts are current.'
		: state === 'limited'
			? `The gallery counts are current. ${limits[0]}`
			: state === 'partial'
				? partialHeadline(notRead.length, owner)
				: problems.length === 1 ? (input.lead && problems[0].id === input.lead.id ? input.lead.headline : 'One thing needs attention.') : `${problems.length} things need attention.`;
	// A headline that is the problem's own first sentence is not said again beside it: the list carries only what the headline leaves out.
	const lead = input.lead && state === 'attention' && problems.length === 1 && problems[0].id === input.lead.id ? input.lead : null;
	const listed = lead ? problems.map((problem) => ({ ...problem, text: problem.text.startsWith(lead.headline) ? problem.text.slice(lead.headline.length).trim() || problem.text : problem.text })) : problems;
	const refreshed = refreshedAt === null
		? `When the gallery counts were last refreshed could not be read, so whether they are current is unknown. They cover complete days through ${formatDay(lastCompleteDay)}.`
		: `The gallery counts were last refreshed at ${chicagoTime(refreshedAt, today)} Chicago time and cover every complete day through ${formatDay(lastCompleteDay)}. They normally refresh every 30 minutes.`;
	// The headline of a limited page already says the first limit; the detail says the others, and every one when something worse leads.
	const rest = state === 'limited' ? limits.slice(1) : state === 'partial' || state === 'attention' ? limits : [];
	return { state, owner, headline, detail: [refreshed, ...rest].join(' '), refreshed, problems: listed, notRead, limits };
}

/**
 * The status once a part that arrives after the page could not be read. The page is first drawn with the status it knows;
 * a part that then fails must change the headline, not sit beneath a headline that says nothing is missing. Something
 * that needs attention stays the headline; otherwise the page is now partial.
 */
export function withNotRead(status: StatusView, extra: NotRead): StatusView {
	if (status.notRead.some((item) => item.id === extra.id)) return status;
	const notRead = [...status.notRead, extra];
	if (status.problems.length) return { ...status, notRead };
	return { ...status, notRead, state: 'partial', headline: partialHeadline(notRead.length, status.owner), detail: [status.refreshed, ...status.limits].join(' ') };
}

/** The detailed event counts, which arrive after the rest of the page. */
export const EVENTS_NOT_READ: NotRead = { id: 'events', section: 'counting', name: 'detailed event counts' };

/** The same problem list Home shows, from the same rule. `launchesRead` is not this page's to say, so it never adds that problem. */
export function statusProblems(input: Omit<ProblemInput, 'launchesRead'>): HomeProblem[] {
	return openProblems({ ...input, launchesRead: true });
}

/** The days among the last `checked` complete ones whose records are incomplete, the window Home checks. */
export function freshnessForStatus(freshness: Freshness, lastCompleteDay: string, checked: number): Freshness {
	const first = new Date(`${lastCompleteDay}T12:00:00Z`);
	first.setUTCDate(first.getUTCDate() - (checked - 1));
	const floor = first.toISOString().slice(0, 10);
	return { ...freshness, incompleteDays: freshness.incompleteDays.filter((day) => day >= floor) };
}

/* ---------------------------------------------------------------------------------------------- */
/* Coverage and freshness                                                                           */
/* ---------------------------------------------------------------------------------------------- */

const BASIS_WORDS: Record<string, string> = { event_snapshot: 'details saved when each event happened', backfill_current_catalogue: 'details filled in later from the current catalogue', mixed: 'a mix of both' };
/** "backfill_current_catalogue, event_snapshot" as words a reader can follow. */
export function basisWords(basis: string): string {
	const parts = basis.split(',').map((part) => part.trim()).filter(Boolean).map((part) => BASIS_WORDS[part] ?? part.replaceAll('_', ' '));
	return parts.length === 0 ? 'an unknown source' : parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export interface CoverageView {
	headline: string;
	incompleteDays: string[];
	refresh: string;
	lateRefresh: boolean;
	since: string | null;
	basis: string;
}

export function coverageView(input: { report: OperatorReport; days: number; refreshedAt: string | null; lastCompleteDay: string; now: string; today: string }): CoverageView | null {
	const { report, days, refreshedAt, lastCompleteDay, now, today } = input;
	if (!report.available) return null;
	const counted = report.daily.filter((day) => day.date <= lastCompleteDay);
	const incompleteDays = counted.filter((day) => day.coverage !== 'complete').map((day) => day.date).sort();
	const headline = incompleteDays.length === 0
		? `Records are complete for all ${counted.length} days (${formatDay(counted[0]?.date ?? lastCompleteDay)} – ${formatDay(lastCompleteDay)}).`
		: `Records are complete for ${counted.length - incompleteDays.length} of the last ${days} days. A total that includes an incomplete day is not shown, and a missing day is not a quiet day.`;
	const stale = staleness({ incompleteDays: [], refreshedAt, checked: true }, lastCompleteDay, now);
	const refresh = refreshedAt === null
		? 'The time of the last refresh could not be read, so whether the counts are current is unknown.'
		: `Last refreshed at ${chicagoTime(refreshedAt, today)} Chicago time. The counts normally refresh every 30 minutes${stale.kind === 'refresh_late' ? ', and this refresh is late' : ''}.`;
	return {
		headline, incompleteDays: incompleteDays.map(formatDay), refresh, lateRefresh: stale.kind === 'refresh_late',
		since: report.preservedSince ? formatDay(report.preservedSince) : null,
		basis: `Album details in these counts come from ${basisWords(report.catalogueBasis)}. Details saved when an event happened are the ones true at that moment; details filled in later are the ones known when they were filled in.`
	};
}

/* ---------------------------------------------------------------------------------------------- */
/* Traffic classes and traffic impact                                                               */
/* ---------------------------------------------------------------------------------------------- */

const COUNTED_CLASSES = new Set(['audience', 'unclassified']);
const CLASS_WORDS: Record<string, string> = {
	audience: 'Audience',
	unclassified: 'Unclassified (counted, not called human)',
	operator: 'Operator',
	test: 'Test',
	known_crawler: 'Known crawler',
	suspected_automation: 'Suspected automation'
};
export const trafficClassWords = (classification: string) => CLASS_WORDS[classification] ?? classification.replaceAll('_', ' ');

export interface ImpactRow {
	albumKey: string; name: string; all: number; counted: number; left: number;
	/** "18th to 20th" or "18th, no change": the place with all traffic, then with only the counted traffic. */
	rankChange: string;
	changed: boolean;
	/** For a row whose place changes: the move in words, with the counts behind it. */
	movement: string;
}

export interface TrafficView {
	classes: Array<{ id: string; label: string; count: number; counted: boolean }>;
	countedTotal: number;
	leftOutTotal: number;
	summary: string;
	/** What the classes mean for the numbers on the other pages, in two sentences; null when nothing is unclassified. */
	meaning: string | null;
	impact: { rows: ImpactRow[]; changed: ImpactRow[]; scope: string; changes: string | null };
}

/** How many public albums a traffic-impact list covers, and why not all of them. */
export function impactScope(listed: number, publicAlbums: number | null, measure: string): string {
	const noun = MEASURE_NOUN[measure] ?? 'action';
	if (publicAlbums === null || publicAlbums < listed) return `Lists the ${plural(listed, 'album')} that had at least one recorded ${noun} in these dates. An album with none has nothing to rank.`;
	const rest = publicAlbums - listed;
	if (rest === 0) return `Lists all ${fmt(listed)} public albums, each with at least one recorded ${noun} in these dates.`;
	return `Lists the ${fmt(listed)} of ${fmt(publicAlbums)} public albums that had at least one recorded ${noun} in these dates. The other ${fmt(rest)} had none in any traffic class, so leaving traffic out cannot change their place.`;
}

export function trafficView(input: { report: OperatorReport; names: ReadonlyMap<string, string> }): TrafficView | null {
	const { report, names } = input;
	if (!report.available) return null;
	const classes = report.traffic.map((item) => ({ id: item.classification, label: trafficClassWords(item.classification), count: item.count, counted: COUNTED_CLASSES.has(item.classification) }));
	const countedTotal = classes.filter((item) => item.counted).reduce((sum, item) => sum + item.count, 0);
	const leftOutTotal = classes.filter((item) => !item.counted).reduce((sum, item) => sum + item.count, 0);
	const rows = report.trafficImpact.map((item): ImpactRow => ({
		albumKey: item.albumKey, name: names.get(item.albumKey) ?? 'An album with no name on record', all: item.inclusive, counted: item.conservative, left: item.excluded,
			rankChange: item.inclusiveRank === item.conservativeRank ? `${ordinal(item.inclusiveRank)}, no change` : `${ordinal(item.inclusiveRank)} to ${ordinal(item.conservativeRank)}`, changed: item.inclusiveRank !== item.conservativeRank,
			movement: item.inclusiveRank === item.conservativeRank ? '' : `Goes from ${ordinal(item.inclusiveRank)} to ${ordinal(item.conservativeRank)} when the left-out traffic is removed: ${fmt(item.inclusive)} with all traffic, ${fmt(item.conservative)} counted.`
		}));
		const unclassified = classes.find((item) => item.id === 'unclassified')?.count ?? 0;
		const share = countedTotal > 0 ? Math.round((unclassified / countedTotal) * 100) : 0;
	const changed = rows.filter((row) => row.changed).length;
	return {
		classes, countedTotal, leftOutTotal,
			meaning: unclassified === 0 ? null : `${share}% of the counted actions came from browsers the gallery’s counter could not sort as audience, operator, test or automated. They are counted, and they are not called human${share >= 50 ? ', so read these totals as an upper limit on what real visitors did' : ''}.`,
		summary: `Reports count ${fmt(countedTotal)} of these ${MEASURE_NOUN[report.query.measure] ?? 'action'}s and leave out ${fmt(leftOutTotal)}. Operator, test, known crawler and suspected automated activity is left out. Unclassified activity is counted and is not called human.`,
		impact: {
			rows,
			changed: rows.filter((row) => row.changed),
			scope: impactScope(rows.length, report.albums.length, report.query.measure),
			changes: rows.length === 0 ? null : changed === 0 ? 'Leaving the excluded traffic out changes no album\'s place.' : `Leaving the excluded traffic out changes the place of ${plural(changed, 'album')}.`
		}
	};
}

/* ---------------------------------------------------------------------------------------------- */
/* Counting rules and event counts                                                                  */
/* ---------------------------------------------------------------------------------------------- */

function measureTotal(report: OperatorReport, measure: 'photo_opens' | 'album_opens' | 'downloads' | 'favorites' | 'shares'): number | null {
	const values = report.albums.map((album) => album.measures[measure]);
	return values.some((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export interface CountingView {
	rule: string;
	totals: Array<{ label: string; value: string }>;
	/** The estimate of distinct browsers with any recorded action in these dates, with the limit that comes with it. A browser is not a person. */
	browsers: { value: string | null; limit: string };
}

export function countingView(input: { report: OperatorReport }): CountingView | null {
	const { report } = input;
	if (!report.available) return null;
	const word = (value: number | null) => (value === null ? 'Not shown: a day in these dates has incomplete records' : `${fmt(value)}${report.coverage === 'complete' ? '' : ' recorded'}`);
	const engagement = (['downloads', 'favorites', 'shares'] as const).map((measure) => measureTotal(report, measure));
	return {
		rule: 'A browser\'s repeated action on the same photo or album is counted once per day. These totals cannot say which steps someone followed, and a count is browser actions, not people.',
		totals: [
			{ label: 'Photo opens', value: word(measureTotal(report, 'photo_opens')) },
			{ label: 'Album opens', value: word(measureTotal(report, 'album_opens')) },
			{ label: 'Download requests, favorites and shares together', value: word(engagement.some((value) => value === null) ? null : engagement.reduce<number>((sum, value) => sum + (value ?? 0), 0)) }
		],
		browsers: { value: report.visitorEstimate.value === null ? null : fmt(report.visitorEstimate.value), limit: report.visitorEstimate.limit }
	};
}

export interface EventsView {
	available: boolean;
	label: string;
	/** Null when they could not be read; never a list of zeros. */
	counts: Array<{ label: string; count: number }> | null;
	/** What it means that they are missing, and what to do; null when they are shown. */
	down: Unavailable | null;
}

/**
 * Where the detailed event counts start, in the date format the rest of this page uses ("Sep 29", never "2026-09-29"). The projection's own label
 * carries ISO dates for the public report; this page reads the same bounds in its own words. With no bound recorded the projection's sentence stands.
 */
export function eventsLabel(coverage: V2ReportProjection['coverage']): string {
	if (!coverage.firstRecordedAt) return coverage.label;
	const day = (iso: string) => formatDay(iso.slice(0, 10));
	const raw = coverage.rawRetainedFrom ? ` Raw retained observations begin ${day(coverage.rawRetainedFrom)}.` : '';
	const archive = coverage.archivedFrom && coverage.archivedThrough ? ` Archived aggregate snapshots cover ${day(coverage.archivedFrom)} through ${day(coverage.archivedThrough)}.` : '';
	return `Detailed event counts begin ${day(coverage.firstRecordedAt)}.${raw}${archive} Counts are observations, not people or a conversion funnel.`;
}

/** The recorded event counts. They are read after the page is drawn, so a slow read never holds the rest back. */
export function eventsView(v2: V2ReportProjection | null, owner: boolean): EventsView {
	if (v2 && v2.available) return { available: true, label: eventsLabel(v2.coverage), counts: v2.counts.map((item) => ({ label: item.label, count: item.count })), down: null };
	return { available: false, label: v2?.coverage.label ?? 'Detailed event counts were not read.', counts: null, down: notReadNote('events', owner) };
}

/* ---------------------------------------------------------------------------------------------- */
/* Tagged arrivals and open locations                                                               */
/* ---------------------------------------------------------------------------------------------- */

export interface OpenLocationsView {
	total: number;
	photoOpens: number | null;
	albumOpens: number | null;
	/** True when the photo and album opens add up to the total, so the split is a statement of fact. */
	splits: boolean;
	sentence: string;
}

/**
 * Open locations count album opens and photo opens together. The split is stated only when the two
 * add up to the total in the same dates and filters; otherwise both numbers are given and the page
 * says they do not add up, rather than presenting one as a subtotal of the other.
 */
export function openLocationsView(openLocations: ReadonlyArray<{ source: string; count: number }>, report: Pick<OperatorReport, 'albums' | 'coverage'>): OpenLocationsView {
	const total = openLocations.reduce((sum, item) => sum + item.count, 0);
	const photo = measureTotal(report as OperatorReport, 'photo_opens');
	const album = measureTotal(report as OperatorReport, 'album_opens');
	if (photo === null || album === null) {
		return { total, photoOpens: photo, albumOpens: album, splits: false, sentence: `These ${fmt(total)} opens are album opens and photo opens together. They cannot be split here because a day in these dates has incomplete records.` };
	}
	if (photo + album === total) {
		return { total, photoOpens: photo, albumOpens: album, splits: true, sentence: `These ${fmt(total)} opens are album opens and photo opens together: ${plural(photo, 'photo open')} and ${plural(album, 'album open')}. Home and Albums count only the ${fmt(photo)} photo opens.` };
	}
	return {
		total, photoOpens: photo, albumOpens: album, splits: false,
		sentence: `These ${fmt(total)} opens are album opens and photo opens together. In the same dates the gallery counted ${plural(photo, 'photo open')} and ${plural(album, 'album open')}, which do not add up to ${fmt(total)}, so use the locations as a guide to where opens happen, not as a count.`
	};
}

/* ---------------------------------------------------------------------------------------------- */
/* Site measures                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

export interface SiteMeasuresView {
	crossCheck: string;
	cloudflare: { value: string | null; detail: string };
	firstParty: { value: string | null; detail: string };
	devices: Array<{ name: string; pageLoads: number }> | null;
	devicesNote: string | null;
	sampling: string;
}

const UTC_DAY = 86_400_000;
const daysThrough = (first: string, end: string) => Math.max(0, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / UTC_DAY) + 1);

export function siteMeasuresView(input: { traffic: SiteTrafficResult | null; actions: SiteActionReport | null; days: number; owner: boolean }): SiteMeasuresView {
	const { traffic, actions, days, owner } = input;
	const sampling = 'Cloudflare adapts how much it samples to the size of the question, so page loads can be estimates, and the same page can be rounded differently in two questions. Treat small differences as noise.';
	const cf = traffic && traffic.available
		? { value: fmt(traffic.pageviews), detail: `${formatDay(traffic.start)} – ${formatDay(traffic.end)}, complete UTC days, known bots removed.` }
		: { value: null, detail: `${owner ? (traffic ? traffic.reason : 'Cloudflare Web Analytics could not be read. No traffic total is shown.') : PAGE_LOADS_UNAVAILABLE} ${providerFix(traffic ? traffic.reason : 'could not be read', owner)}`.trim() };
	let first: SiteMeasuresView['firstParty'];
	if (actions === null) first = { value: null, detail: 'The site\'s own page-view count could not be read. This is not zero. Reload in a few minutes.' };
	else if (!actions.available) first = { value: null, detail: `${actions.reason} This is not zero. Reload in a few minutes.` };
	else if (!actions.firstRecordedAt) first = { value: null, detail: 'The site\'s own counter has not recorded a page view yet. This is not zero.' };
	else {
		const since = actions.firstRecordedAt.slice(0, 10);
		const covered = Math.min(days, daysThrough(since > actions.start ? since : actions.start, actions.end));
		first = { value: fmt(actions.totals.page_views ?? 0), detail: `${formatDay(since > actions.start ? since : actions.start)} – ${formatDay(actions.end)}. The site's own counter began ${formatDay(since)}, so it covers ${covered} of the last ${days} days.` };
	}
	const crossCheck = cf.value !== null && first.value !== null
		? `Cloudflare counted ${cf.value} page loads. The site's own counter recorded ${first.value} page views. They use different definitions and different days, so they are not expected to match and neither one checks the other.`
		: 'Cloudflare\'s page loads and the site\'s own page views are two different measures with different days, so they are not expected to match. At least one could not be read here, so they are not compared.';
	const devices = traffic && traffic.available ? traffic.devices.map((item) => ({ name: item.name, pageLoads: item.pageviews })) : null;
	return { crossCheck, cloudflare: cf, firstParty: first, devices, devicesNote: devices ? 'Page loads by device type, all sections.' : null, sampling };
}

/* ---------------------------------------------------------------------------------------------- */
/* Delivery, volume, journeys                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export interface DeliveryView {
	rows: Array<{ label: string; value: string }> | null;
	/** What each word in the rows means, in the order it appears. Empty when there are no rows. */
	terms: Array<{ term: string; means: string }>;
	volume: string | null;
	volumeLimit: string;
	provider: string;
	quota: string;
}

function instant(value: string | null, today: string): string {
	return value ? `${chicagoTime(value, today)} Chicago time` : 'none recorded';
}

/** The words in the delivery rows, said once where they appear. */
export const DELIVERY_TERMS: DeliveryView['terms'] = [
	{ term: 'Accepted', means: 'the gallery’s counter stored the event as a counted action.' },
	{ term: 'Rejected', means: 'the gallery’s counter refused the event: it came from a known crawler, was not valid, named an album or photo that does not exist, or could not be stored. Crawlers are rejected on purpose. An event that could not be stored is lost unless the browser\'s one retry worked.' },
	{ term: 'Duplicate', means: 'a repeat of an action already stored, so it was not stored again.' },
	{ term: 'Usual', means: 'a quiet day among the 14 complete days before: a quarter of those days had fewer rejections. A surge that lasts several days does not become the usual.' },
	{ term: 'Pending', means: 'stored, and waiting to be sent to PostHog.' },
	{ term: 'Submitted', means: 'sent to PostHog, and waiting for PostHog to confirm it.' },
	{ term: 'Confirmed', means: 'PostHog confirmed it received the event.' },
	{ term: 'Failed', means: 'sending to PostHog did not work.' },
	{ term: 'Classification changes waiting', means: 'changes you made to how an action is classed that have not reached PostHog yet.' }
];

export const PROVIDER_NOTE = 'Results about what visitors did after arriving show when PostHog was last asked a question. That is not confirmation that events were delivered; the counts above are.';

/** Rejections grouped by what a reader can act on, largest first. */
const REJECTION_GROUPS: Array<{ words: string; match: (reason: string) => boolean }> = [
	{ words: 'from known crawlers', match: (reason) => reason === 'known_crawler' },
	{ words: 'could not be stored', match: (reason) => UNSTORED_REJECTION_REASONS.has(reason) },
	{ words: 'not valid', match: (reason) => reason === 'invalid_json' || reason === 'invalid_event' },
	{ words: 'album or photo not found', match: (reason) => reason === 'unknown_target' },
	{ words: 'counted before reasons were kept', match: (reason) => reason === 'not_recorded' }
];

export function rejectionSplit(days: RejectionDay[] | null): string {
	if (days === null) return 'Not recorded yet. Reasons are kept from the day the counting update is installed.';
	const groups = REJECTION_GROUPS.map((group) => ({ words: group.words, count: days.filter((row) => group.match(row.reason)).reduce((total, row) => total + row.count, 0) }))
		.filter((group) => group.count > 0).sort((a, b) => b.count - a.count);
	return groups.length ? groups.map((group) => `${fmt(group.count)} ${group.words}`).join(' · ') : 'None rejected';
}

export function rejectedOnDay(reading: RejectionReading | null, days: RejectionDay[] | null, lastCompleteDay: string): { label: string; value: string } {
	const label = `Rejected on ${formatDay(lastCompleteDay)}`;
	if (days === null) return { label, value: 'Not recorded yet' };
	if (reading === null) return { label, value: 'None' };
	// A short value: whether it is a surge, and what it was, is the status line's to say.
	return { label, value: `${fmt(reading.count)} (${reading.usual === null ? 'usual not known yet' : `usual ${fmt(reading.usual)} a day`})` };
}

export function deliveryView(health: MeasurementHealth | null, today: string, rejections: RejectionReading | null, lastCompleteDay: string): DeliveryView {
	const quota = 'Quota and billing state: unknown. This page does not infer a quota, spend or approval from delivery counts.';
	if (!health || !health.available) return { rows: null, terms: [], volume: null, volumeLimit: '', provider: PROVIDER_NOTE, quota };
	const n = (value: number | null) => (value === null ? 'not read' : fmt(value));
	return {
		rows: [
			{ label: 'Collection, last 30 days', value: `${n(health.accepted)} accepted · ${n(health.rejected)} rejected · ${n(health.duplicate)} duplicate` },
			{ label: 'Why events were rejected, last 30 days', value: rejectionSplit(health.rejectedDays) },
			rejectedOnDay(rejections, health.rejectedDays, lastCompleteDay),
			{ label: 'Waiting to be sent', value: `${n(health.pending)} pending · ${n(health.submitted)} submitted · ${n(health.confirmed)} confirmed · ${n(health.failed)} failed` },
			{ label: 'Event format and your classification changes', value: `Event format ${health.schemaVersion ?? 'not read'} · ${n(health.controlPending)} classification changes waiting to reach PostHog` },
			{ label: 'Oldest event waiting', value: health.pending === 0 && health.failed === 0 ? 'None waiting' : instant(health.oldestPendingAt, today) },
			{ label: 'Oldest event awaiting confirmation', value: health.submitted === 0 ? 'None' : instant(health.oldestSubmittedAt, today) },
			{ label: 'Most recent confirmed event', value: instant(health.confirmedWatermark, today) }
		],
		terms: DELIVERY_TERMS,
		volume: health.forecast30Days === null ? null : `About ${fmt(health.forecast30Days)} eligible observations in a future 30-day period at the measured rate.`,
		volumeLimit: `${health.forecastLimit} It is an event-volume estimate, not people, provider quota, cost or spend approval.`,
		provider: PROVIDER_NOTE,
		quota
	};
}

export interface EvidenceView {
	rows: Array<{ path: string; status: string; recorded: string; results: string; errors: string; latest: string }>;
	label: string;
	failed: boolean;
	note: string;
}

/** Search and download evidence: what was recorded when a search or download was attempted. Downloads record requests and failures, never completed transfers. */
export function evidenceView(report: OperatorReport, today: string): EvidenceView | null {
	if (!report.available) return null;
	return {
		rows: report.diagnostics.map((item) => ({
			path: item.type.replaceAll('_', ' '), status: item.status, recorded: fmt(item.count), results: item.resultCount === null ? 'none counted' : fmt(item.resultCount),
			errors: item.errorCodes.length ? item.errorCodes.join(', ') : 'none', latest: item.latestAt ? chicagoTime(item.latestAt, today) : 'none recorded'
		})),
		label: report.diagnosticsCoverage.label,
		failed: !!report.diagnosticsCoverage.error,
		note: 'Results is how many results a search returned. A "requested" row is written before any result exists, so it reads "none counted"; the search\'s count is on its "accepted" row. A download has no result count. Search text and visitor identifiers are never shown. Browser downloads record requests and failures, not completed transfers. A missing row is not evidence that nothing happened.'
	};
}

const JOURNEY_NAMES: Record<string, string> = {
	discovery: 'Discovery', album_use: 'Album use', search_usefulness: 'Search usefulness', download_reliability: 'Download reliability',
	photo_response: 'Photo response', sources_return: 'Tagged arrivals and return visits', experiments: 'Experiments'
};
export const journeyName = (report: string) => JOURNEY_NAMES[report] ?? report.replaceAll('_', ' ');

export interface JourneysView {
	available: JourneyAggregate[];
	/** One sentence for the reports that could not be read, with what to do, instead of a box for each. */
	unavailable: Unavailable | null;
}

export function journeysView(journeys: readonly JourneyAggregate[] | null, owner: boolean): JourneysView {
	if (journeys === null) {
		return { available: [], unavailable: forReader({ what: 'The reports on what visitors did after arriving could not be read, so no such figure is shown. This is not zero.', todo: 'Reload in a few minutes. If it keeps failing, check the PostHog query settings in the site\'s server settings.' }, owner) };
	}
	const available = journeys.filter((item) => item.available);
	const missing = journeys.filter((item) => !item.available);
	if (missing.length === 0) return { available, unavailable: null };
	const names = missing.map((item) => journeyName(item.report)).join(', ');
	const unconfigured = missing.every((item) => item.error === 'provider_unavailable');
	const pending = missing.some((item) => item.error === 'provider_query_pending');
	return {
		available,
		unavailable: forReader(unconfigured
			? { what: `${missing.length === journeys.length ? 'All' : `${missing.length} of ${journeys.length}`} reports on what visitors did after arriving need PostHog, which is not connected here (${names}). No figure is shown, and that is not zero.`, todo: 'Add the PostHog query settings to the site\'s server settings. Nothing needs fixing on the public site.' }
			: { what: `${missing.length === journeys.length ? 'All' : `${missing.length} of ${journeys.length}`} reports on what visitors did after arriving could not be read (${names}). No figure is shown for them, and that is not zero.${pending ? ' Some were still being calculated when the page loaded.' : ''}`, todo: 'Reload in a few minutes. If it keeps failing, check the PostHog query settings in the site\'s server settings.' }, owner)
	};
}

/** What a site-journey read that could not be taken means, in this page's words, not the loader's. */
export function siteJourneyNote(reason: string, owner: boolean): Unavailable {
	return forReader(siteJourneyText(reason), owner);
}
function siteJourneyText(reason: string): Unavailable {
	if (/not configured/i.test(reason)) return { what: 'PostHog is not connected here, so no figure for what visitors did after arriving is shown for the site. This is not zero.', todo: 'See the section on what visitors did after arriving below for what to add.' };
	if (/pending/i.test(reason)) return { what: 'PostHog was still calculating when the page loaded, so no figure for what visitors did after arriving is shown for the site. This is not zero.', todo: 'Reload in a few minutes.' };
	return notReadText('posthog');
}

/** The home of each part that can fail, so the status line can point at it. */
export function notReadNote(kind: NotReadKind, owner: boolean): Unavailable {
	return forReader(notReadText(kind), owner);
}
type NotReadKind = 'cloudflare' | 'posthog' | 'events' | 'report' | 'delivery';
function notReadText(kind: NotReadKind): Unavailable {
	switch (kind) {
		case 'report': return { what: 'The gallery\'s daily summary could not be read, so none of the gallery counts on this page are shown. This is not a report of zero.', todo: 'Reload in a few minutes. If it keeps failing, the database is the thing to check.' };
		case 'events': return { what: 'The detailed event counts could not be read, so none is shown. This is not zero.', todo: 'Reload in a few minutes.' };
		case 'delivery': return { what: 'Delivery to the analytics provider could not be checked, so no delivery count is shown. This is not a healthy result.', todo: 'Reload in a few minutes. If it keeps failing, check the delivery job.' };
		case 'cloudflare': return { what: 'Cloudflare\'s page loads could not be read, so no page-load figure is shown. This is not zero.', todo: 'Reload in a few minutes. If it keeps failing, check the Cloudflare analytics token in the site\'s server settings.' };
		case 'posthog': return { what: 'PostHog could not be read, so no figure for what visitors did after arriving is shown. This is not zero.', todo: 'Reload in a few minutes. If it keeps failing, check the PostHog query settings in the site\'s server settings.' };
	}
}


/* ---------------------------------------------------------------------------------------------- */
/* The whole page                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

export type DeliveryState = 'shown' | 'owner_only' | 'failed';

export interface DataInput {
	asOf: string;
	today: string;
	lastCompleteDay: string;
	days: 7 | 30 | 90;
	owner: boolean;
	report: OperatorReport | null;
	/** Names of the public albums, to label the traffic-impact table. */
	names: ReadonlyMap<string, string>;
	/** Parsed delivery health. Read only for the signed-in owner; null otherwise. */
	health: MeasurementHealth | null;
	refreshedAt: string | null;
	incidents: string[] | null;
	diagnostics: ProblemInput['diagnostics'];
	rejections: ProblemInput['rejections'];
	traffic: SiteTrafficResult | null;
	actions: SiteActionReport | null;
	/** False when PostHog queries are not set up at all, which is known before any journey is asked for. */
	posthogConfigured: boolean;
}

export interface DataView {
	days: 7 | 30 | 90;
	window: { start: string; end: string; label: string };
	today: string;
	lastCompleteDay: string;
	owner: boolean;
	status: StatusView;
	coverage: CoverageView | null;
	traffic: TrafficView | null;
	counting: CountingView | null;
	arrivals: { tagged: Array<{ source: string; count: number }>; openLocations: Array<{ source: string; count: number }>; withoutSource: number; open: OpenLocationsView } | null;
	reportDown: Unavailable | null;
	site: SiteMeasuresView;
	delivery: DeliveryView;
	evidence: EvidenceView | null;
	deliveryState: DeliveryState;
	deliveryNote: string | null;
}

/**
 * What a part of this page does not reach back to: the dates asked for begin before the part's records do.
 * Nothing here is a fault. It is what "recorded" and "not recorded" mean for these dates, said once, first.
 */
export function reachLimits(report: OperatorReport | null, start: string): string[] {
	if (!report || !report.available) return [];
	const limits: string[] = [];
	const { availableFrom, error } = report.diagnosticsCoverage;
	if (!error) {
		if (availableFrom === null) limits.push('No search or download attempt has been recorded yet.');
		else {
			// The same day the evidence line below the table names: the date part of the first recorded instant.
			const from = new Date(availableFrom).toISOString().slice(0, 10);
			if (from > start) limits.push(`Search and download evidence starts on ${formatDay(from)}; earlier days have no record.`);
		}
	}
	if (report.preservedSince && report.preservedSince > start) limits.push(`History is kept since ${formatDay(report.preservedSince)}; earlier days have no record.`);
	return limits;
}

export function buildDataView(input: DataInput): DataView {
	const { report, today, lastCompleteDay, days } = input;
	const start = report && report.available ? report.query.start : addDays(lastCompleteDay, -(days - 1));
	const freshness: Freshness = { incompleteDays: report && report.available ? report.daily.filter((day) => day.date <= lastCompleteDay && day.coverage !== 'complete').map((day) => day.date).sort() : [], refreshedAt: input.refreshedAt, checked: true };
	const problems = statusProblems({
		freshness: freshnessForStatus(freshness, lastCompleteDay, 7), lastCompleteDay, now: input.asOf, today,
		weekRead: !!report && report.available, incidents: input.incidents, diagnostics: input.diagnostics, rejections: input.rejections,
		siteActionsStale: input.actions && input.actions.available && input.actions.freshness.status === 'stale' ? { refreshedAt: input.actions.freshness.refreshedAt } : null
	});
	// When a collection surge is the only problem, the headline says what it is instead of "One thing needs attention.".
	const surge = problems.find((problem) => problem.id === 'collection-surge');
	const notRead: NotRead[] = [];
	if (!input.traffic || !input.traffic.available) notRead.push({ id: 'cloudflare', section: 'site-measures', name: 'Cloudflare page loads' });
	if (!input.actions || !input.actions.available) notRead.push({ id: 'site-actions', section: 'site-measures', name: 'the site\'s own page views' });
	if (!input.posthogConfigured) notRead.push({ id: 'posthog', section: 'journeys', name: 'what visitors did after arriving (PostHog)' });
	if (report && report.available && report.diagnosticsCoverage.error) notRead.push({ id: 'evidence', section: 'delivery', name: 'search and download evidence' });
	const limits = reachLimits(report, start);

	const deliveryState: DeliveryState = !input.owner ? 'owner_only' : input.health && input.health.available ? 'shown' : 'failed';
	const arrivals = report && report.available
		? { tagged: report.sources.arrivals, openLocations: report.sources.openLocations, withoutSource: report.sources.unknown, open: openLocationsView(report.sources.openLocations, report) }
		: null;
	return {
		days, window: { start, end: lastCompleteDay, label: `${formatDay(start)} – ${formatDay(lastCompleteDay)}` }, today, lastCompleteDay, owner: input.owner,
		status: statusView({ problems, notRead, limits, refreshedAt: input.refreshedAt, lastCompleteDay, today, lead: surge ? { id: surge.id, headline: surge.text.split(/(?<=\.)\s/)[0] } : null, owner: input.owner }),
		coverage: report ? coverageView({ report, days, refreshedAt: input.refreshedAt, lastCompleteDay, now: input.asOf, today }) : null,
		traffic: report ? trafficView({ report, names: input.names }) : null,
		counting: report ? countingView({ report }) : null,
		arrivals,
		reportDown: report && report.available ? null : notReadNote('report', input.owner),
		site: siteMeasuresView({ traffic: input.traffic, actions: input.actions, days, owner: input.owner }),
		delivery: deliveryView(deliveryState === 'shown' ? input.health : null, today, input.rejections, lastCompleteDay),
		evidence: report ? evidenceView(report, today) : null,
		deliveryState,
		deliveryNote: deliveryState === 'owner_only'
			? 'The counts of events accepted, rejected, waiting, sent and confirmed are shown when you are signed in. Whether delivery to the analytics provider has failed or is late is already in the status above.'
			: deliveryState === 'failed' ? notReadNote('delivery', true).what + ' ' + notReadNote('delivery', true).todo : null
	};
}

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
