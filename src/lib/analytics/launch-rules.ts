import { minimumSample, type Finding, type FindingEvidence, type IntelligenceSuppression } from './intelligence-contract';
import type { LaunchCoverage } from './launch-read-model.server';
import { formatDay, plural } from './launch-recap';

/**
 * Launch rules: the intelligence catalogue for a gallery whose attention arrives in the first days after an
 * album is published (docs/audits/20261006-analytics-site-rethink/README.md, "Build order" step 6).
 *
 * Every rule here is pure. It reads one stored `LaunchEvidence` value and returns findings or the reason it
 * stayed silent. Counts are compared as counts, with a rank and a median, never as a percentage. Unknown is
 * never zero: a day that is not completely recorded is left out of every total, and it never counts as quiet.
 * The words a finding shows are written here, so this file is part of the gallery interface reader contract.
 */

/** A launch is spoken about for its first 14 complete days, the window the album report covers. After that its report keeps the record. */
export const LAUNCH_FINDING_DAYS = 14;
/** Launches are compared at these ages: complete days counted from the day of first publication. */
export const LAUNCH_CHECKPOINTS = [3, 7] as const;
export type LaunchAge = (typeof LAUNCH_CHECKPOINTS)[number];
/** A launch is ranked only against at least this many earlier launches with a complete total at the same age. */
export const MIN_EARLIER_LAUNCHES = 3;
/** A launch has finished when, after its first week, its last FINISHED_QUIET_DAYS complete days hold at most FINISHED_MAX_OPENS photo opens in all. */
export const FINISHED_QUIET_DAYS = 3;
export const FINISHED_MAX_OPENS = 3;
/** A photo counts toward "seen but rarely opened" once its tile was on screen at least this many times. */
export const SEEN_MIN_EXPOSURES = minimumSample;
/** The album's typical rate needs at least this many photos seen that often. */
export const SEEN_MIN_PHOTOS = 5;
/** A photo is flagged only when the album's typical rate predicts at least this many opens for it ... */
export const SEEN_MIN_EXPECTED_OPENS = 5;
/** ... and it got at most this share of them. With several photos checked at once, a looser line would flag chance. */
export const SEEN_LOW_SHARE = 0.25;
/** At most this many photos are named per album. */
export const SEEN_MAX_FINDINGS = 3;
/** Fewest failures of one kind, in a launch's first 7 days, that make a finding. */
export const FAILURE_MIN_COUNT = 2;
/** The failure window: a launch's first week. */
export const FAILURE_WINDOW_DAYS = 7;

export const LAUNCH_RULES = ['launch_reach', 'launch_finished', 'seen_rarely_opened', 'launch_failures', 'collection_health'] as const;
export type LaunchRule = (typeof LAUNCH_RULES)[number];

/** One launch, as every other launch is compared with it: totals at the checkpoints only. */
export interface LaunchPeer {
	albumKey: string;
	firstPublishedAt: string;
	/** Photo opens over the first 3 or 7 complete days; null when that age is not reached or a day is not completely recorded. */
	day3: number | null;
	day7: number | null;
}

export interface LaunchDayEvidence {
	day: number;
	date: string;
	photoOpens: number | null;
	downloads: number | null;
	coverage: LaunchCoverage;
}

export interface LaunchAgeEvidence {
	complete: boolean;
	photoOpens: number | null;
	downloads: number | null;
}

/** Failure outcomes counted from version-2 collection, for one launch's first 7 complete days. */
export interface LaunchFailureEvidence {
	/** First Chicago day any photo load or download outcome was recorded in the gallery; null when none ever was. */
	recordedSince: string | null;
	/** The Chicago days counted: inside the first week, from `recordedSince`, complete days only. Null when no day qualifies. */
	window: { start: string; end: string } | null;
	photoLoads: number;
	photoLoadFailures: number;
	downloadRequests: number;
	downloadFailures: number;
}

/** A launch the rules speak about. */
export interface LaunchFocus {
	albumKey: string;
	albumName: string | null;
	firstPublishedAt: string;
	basis: 'recorded' | 'inferred';
	elapsedDays: number;
	/** Complete Chicago days from day 0, at most LAUNCH_FINDING_DAYS of them. */
	series: LaunchDayEvidence[];
	day3: LaunchAgeEvidence;
	day7: LaunchAgeEvidence;
	/** Null when the failure records could not be read. */
	failures: LaunchFailureEvidence | null;
}

/** Per-photo exposure for one album's launch, from the launch read model. Only photos still listed in the album. */
export interface LaunchPhotoEvidence {
	exposureSince: string | null;
	exposureCoverage: 'none' | 'partial' | 'complete';
	window: { start: string; end: string };
	photos: Array<{ photoId: string; exposures: number; opensInExposureWindow: number }>;
}

/** Stored with every launch snapshot. Aggregate counts only: no visitor, browser, visit or event identifier. */
export interface LaunchEvidence {
	asOf: string;
	today: string;
	lastCompleteDay: string;
	/** Null for the gallery-wide scope. */
	albumKey: string | null;
	/** Every launch first published on or before as-of: the comparison set. */
	peers: LaunchPeer[];
	/** The launches this scope speaks about. */
	focus: LaunchFocus[];
	/** Album scope only. Null when it could not be read; absent for the gallery-wide scope. */
	photos?: LaunchPhotoEvidence | null;
}

export interface LaunchRuleInput {
	generatedAt: string;
	cutoff: string | null;
	launch: LaunchEvidence | null;
	/** Why `launch` is null. */
	unavailableReason?: string;
}

export interface LaunchRuleResult { findings: Finding[]; suppressions: IntelligenceSuppression[] }

/* ---------------------------------------------------------------------------------------------- */
/* Helpers                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

const fmt = (n: number) => n.toLocaleString('en-US');
function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
/** Chicago calendar date of an instant. */
function chicagoDay(instant: string): string {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
	return `${parts.year}-${parts.month}-${parts.day}`;
}
/** "Sep 25", "Sep 25–27", "Sep 29 – Oct 1". */
export function dayRange(start: string, end: string): string {
	if (start === end) return formatDay(start);
	const [a, b] = [formatDay(start), formatDay(end)];
	return a.split(' ')[0] === b.split(' ')[0] ? `${a}–${b.split(' ')[1]}` : `${a} – ${b}`;
}
function listDates(dates: string[]): string {
	const words = dates.map(formatDay);
	return words.length <= 2 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}
function exactMedian(values: number[]): number {
	const sorted = [...values].sort((x, y) => x - y);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/** A median of an even count can fall on a half; it is shown rounded and said to be rounded. */
function medianWords(value: number): string {
	return Number.isInteger(value) ? fmt(value) : `about ${fmt(Math.round(value))}`;
}
const nameOf = (focus: Pick<LaunchFocus, 'albumName' | 'albumKey'>) => focus.albumName ?? focus.albumKey;
const albumReport = (albumKey: string, anchor = '') => `/analytics/albums/${encodeURIComponent(albumKey)}${anchor}`;
const ageTotal = (focus: LaunchFocus, age: LaunchAge) => (age === 3 ? focus.day3 : focus.day7);
const peerTotal = (peer: LaunchPeer, age: LaunchAge) => (age === 3 ? peer.day3 : peer.day7);
const recordedOnly = 'Counts are photo opens, not people. One person opening ten photos counts ten times.';

function suppress(result: LaunchRuleResult, rule: LaunchRule, reason: string, albumKey?: string): void {
	result.suppressions.push({ rule, reason, ...(albumKey ? { target: { kind: 'album' as const, albumKey } } : {}) });
}

interface Draft {
	rule: LaunchRule;
	id: string;
	severity: NonNullable<Finding['severity']>;
	target: Finding['target'];
	title: string;
	explanation: string;
	why: string;
	evidenceText: string;
	limits: Array<string | null | false>;
	action: string;
	evidence: Omit<FindingEvidence, 'cutoff' | 'coverage'>;
	reportHref: string;
	evidenceLinks?: string[];
}
function finding(input: LaunchRuleInput, draft: Draft): Finding {
	return {
		id: draft.id, rule: draft.rule, severity: draft.severity, target: draft.target,
		title: draft.title, explanation: draft.explanation, why: draft.why, evidenceText: draft.evidenceText,
		limits: draft.limits.filter((item): item is string => typeof item === 'string' && item.length > 0),
		action: draft.action,
		evidence: { ...draft.evidence, cutoff: input.cutoff, coverage: 'complete', previousCoverage: null },
		reportHref: draft.reportHref,
		...(draft.evidenceLinks?.length ? { evidenceLinks: [...new Set(draft.evidenceLinks)] } : {}),
		status: 'open'
	};
}

/* ---------------------------------------------------------------------------------------------- */
/* Comparison at an age                                                                             */
/* ---------------------------------------------------------------------------------------------- */

export type AgeComparison =
	| { ok: true; age: LaunchAge; own: number; rank: number; launches: number; tied: boolean; tiedCount: number; median: number; lowest: number; highest: number; earlier: number; excluded: number }
	| { ok: false; reason: string };

/**
 * This launch against the launches first published before it, at the same age. Competition rank: ties share a
 * rank, and only a strictly larger total ranks ahead. The median and range are of the earlier launches alone.
 * A later launch is never in the set, even when it has reached the same age by now.
 */
export function compareAtAge(focus: LaunchFocus, peers: readonly LaunchPeer[], age: LaunchAge): AgeComparison {
	const total = ageTotal(focus, age);
	const days = focus.series.slice(0, age);
	if (focus.elapsedDays < age) return { ok: false, reason: `The first ${age} complete days end on ${formatDay(addDays(chicagoDay(focus.firstPublishedAt), age - 1))}. A launch is not compared before then.` };
	if (!total.complete || total.photoOpens === null) {
		const missing = days.filter((day) => day.coverage !== 'complete').map((day) => day.date);
		return { ok: false, reason: missing.length ? `The day-${age} total is not shown because ${listDates(missing)} ${missing.length === 1 ? 'is' : 'are'} not completely recorded.` : `The day-${age} total is not available.` };
	}
	const own = total.photoOpens;
	if (own < minimumSample) return { ok: false, reason: `${plural(own, 'photo open')} in the first ${age} days. A launch needs at least ${minimumSample} before it is ranked.` };
	const at = Date.parse(focus.firstPublishedAt);
	const earlier = peers.filter((peer) => peer.albumKey !== focus.albumKey && Date.parse(peer.firstPublishedAt) < at);
	const counted = earlier.flatMap((peer) => { const value = peerTotal(peer, age); return value === null ? [] : [value]; });
	const excluded = earlier.length - counted.length;
	if (counted.length < MIN_EARLIER_LAUNCHES) {
		return { ok: false, reason: `Only ${plural(counted.length, 'earlier launch', 'earlier launches')} ${counted.length === 1 ? 'has' : 'have'} a complete day-${age} total. At least ${MIN_EARLIER_LAUNCHES} are needed to compare.` };
	}
	return {
		ok: true, age, own, rank: 1 + counted.filter((value) => value > own).length, launches: counted.length + 1,
		tied: counted.includes(own), tiedCount: counted.filter((value) => value === own).length, median: exactMedian(counted), lowest: Math.min(...counted), highest: Math.max(...counted),
		earlier: counted.length, excluded
	};
}

/**
 * The rank said as the launches ahead of this one, among those before it. Home's launch card states a rank among
 * every launch at that age, later ones included; saying "N of the launches before it had more" keeps the two from
 * reading as a contradiction on one screen. The rank itself is stored in the evidence.
 */
function aheadWords(c: Extract<AgeComparison, { ok: true }>, age: LaunchAge): string {
	const ahead = c.rank - 1;
	const lead = `${ahead === 0 ? 'None' : fmt(ahead)} of the ${plural(c.earlier, 'launch', 'launches')} before it had more photo opens by day ${age}`;
	return c.tiedCount ? `${lead}, and ${fmt(c.tiedCount)} had the same number` : lead;
}
function comparisonEvidence(c: Extract<AgeComparison, { ok: true }>): NonNullable<FindingEvidence['comparison']> {
	return { age: c.age, rank: c.rank, launches: c.launches, tied: c.tied, median: c.median, lowest: c.lowest, highest: c.highest, excluded: c.excluded };
}
function excludedLimit(c: Extract<AgeComparison, { ok: true }>): string | null {
	return c.excluded ? `${plural(c.excluded, 'earlier launch', 'earlier launches')} ${c.excluded === 1 ? 'is' : 'are'} left out because a day in ${c.excluded === 1 ? 'its' : 'their'} first ${c.age} days was not completely recorded.` : null;
}
function inferredLimit(focus: LaunchFocus): string | null {
	return focus.basis === 'inferred' ? 'The first publication time was worked out from server logs, not recorded when the album was published.' : null;
}

/* ---------------------------------------------------------------------------------------------- */
/* Rules                                                                                            */
/* ---------------------------------------------------------------------------------------------- */

/** Days of the launch window that are not completely recorded: one finding per launch, before any total is read. */
function collectionGap(input: LaunchRuleInput, focus: LaunchFocus, result: LaunchRuleResult): void {
	const gaps = focus.series.filter((day) => day.coverage !== 'complete');
	if (!gaps.length) { suppress(result, 'collection_health', 'Every day of this launch so far is completely recorded.', focus.albumKey); return; }
	const dates = gaps.map((day) => day.date);
	result.findings.push(finding(input, {
		rule: 'collection_health', id: `collection-gap-${focus.albumKey}`, severity: 'high', target: { kind: 'album', albumKey: focus.albumKey },
		title: `${plural(gaps.length, 'day')} of this launch ${gaps.length === 1 ? 'is' : 'are'} not completely recorded`,
		explanation: `${listDates(dates)} ${gaps.length === 1 ? 'has' : 'have'} no complete record of opens and downloads for ${nameOf(focus)}.`,
		why: 'Those days are left out of every total and rank, and a quiet day cannot be told apart from a missing one.',
		evidenceText: `${plural(gaps.length, 'day')} of the ${plural(focus.series.length, 'complete day')} since first publication ${gaps.length === 1 ? 'is' : 'are'} partial or missing in the daily record.`,
		limits: ['This says the record is incomplete. It does not say how much activity is missing.'],
		action: 'Check data collection for those days before reading this launch’s numbers.',
		evidence: { windows: { current: { start: dates[0], end: dates.at(-1)! }, previous: null }, units: 'days not completely recorded', numerator: gaps.length, denominator: focus.series.length, strength: 'strong' },
		reportHref: albumReport(focus.albumKey, '#launch-chart')
	}));
}

function launchFinished(input: LaunchRuleInput, focus: LaunchFocus, peers: readonly LaunchPeer[], result: LaunchRuleResult): boolean {
	if (focus.elapsedDays < 7) { suppress(result, 'launch_finished', 'The first 7 days are not over yet.', focus.albumKey); return false; }
	const last = focus.series.slice(-FINISHED_QUIET_DAYS);
	if (last.length < FINISHED_QUIET_DAYS || last.some((day) => day.coverage !== 'complete' || day.photoOpens === null)) {
		suppress(result, 'launch_finished', `The last ${FINISHED_QUIET_DAYS} days are not all completely recorded, so a quiet stretch cannot be told apart from missing data.`, focus.albumKey);
		return false;
	}
	const recent = last.reduce((sum, day) => sum + (day.photoOpens ?? 0), 0);
	if (recent > FINISHED_MAX_OPENS) { suppress(result, 'launch_finished', `Still active: ${plural(recent, 'photo open')} in the last ${FINISHED_QUIET_DAYS} complete days.`, focus.albumKey); return false; }
	const week = focus.day7;
	if (!week.complete || week.photoOpens === null) { suppress(result, 'launch_finished', 'The first-week total is not available because a day in it is not completely recorded.', focus.albumKey); return false; }
	if (week.photoOpens < minimumSample) { suppress(result, 'launch_finished', `${plural(week.photoOpens, 'photo open')} in the first 7 days is too little activity to recap.`, focus.albumKey); return false; }
	const c = compareAtAge(focus, peers, 7);
	const downloads = week.downloads ?? 0;
	const first = focus.series[0].date;
	result.findings.push(finding(input, {
		rule: 'launch_finished', id: `launch-finished-${focus.albumKey}`, severity: 'low', target: { kind: 'album', albumKey: focus.albumKey },
		title: 'The launch is over',
		explanation: `Photo opens fell to ${fmt(recent)} over ${dayRange(last[0].date, last.at(-1)!.date)}. In its first 7 days it had ${plural(week.photoOpens, 'photo open')} and ${plural(downloads, 'download request')}.${c.ok ? ` ${aheadWords(c, 7)}; their median was ${medianWords(c.median)}.` : ''}`,
		why: 'Most of an album’s attention arrives in its first days. The photos people asked to download are the clearest sign of which ones mattered to them.',
		evidenceText: `${plural(week.photoOpens, 'photo open')} and ${plural(downloads, 'download request')} on ${dayRange(first, addDays(first, 6))}; ${plural(recent, 'photo open')} on ${dayRange(last[0].date, last.at(-1)!.date)}. Complete Chicago days only.`,
		limits: [recordedOnly, 'A download request is a request, not a confirmed saved file.', 'Quiet means nearly no photo opens. A later share can bring an album back.', c.ok ? excludedLimit(c) : null, inferredLimit(focus)],
		action: 'Look at the photos people asked to download before choosing what to feature or share again.',
		evidence: { windows: { current: { start: first, end: addDays(first, 6) }, previous: { start: last[0].date, end: last.at(-1)!.date } }, units: 'photo opens', current: week.photoOpens, previous: recent, strength: 'limited', ...(c.ok ? { comparison: comparisonEvidence(c) } : {}) },
		reportHref: albumReport(focus.albumKey, '#downloads-title'),
		evidenceLinks: [albumReport(focus.albumKey, '#downloads-title'), albumReport(focus.albumKey, '#compare-title')]
	}));
	return true;
}

function launchReach(input: LaunchRuleInput, focus: LaunchFocus, peers: readonly LaunchPeer[], result: LaunchRuleResult): void {
	const age: LaunchAge | null = focus.elapsedDays >= 7 ? 7 : focus.elapsedDays >= 3 ? 3 : null;
	const c = compareAtAge(focus, peers, age ?? 3);
	if (!c.ok || age === null) { suppress(result, 'launch_reach', c.ok ? 'The first 3 complete days are not over yet.' : c.reason, focus.albumKey); return; }
	const first = focus.series[0].date;
	const above = c.own > c.median;
	const position = above ? 'above' : c.own < c.median ? 'below' : 'at';
	result.findings.push(finding(input, {
		rule: 'launch_reach', id: `launch-reach-day${age}-${focus.albumKey}`, severity: 'medium', target: { kind: 'album', albumKey: focus.albumKey },
		title: `${plural(c.own, 'photo open')} in its first ${age} days`,
		explanation: `${aheadWords(c, age)}. Their median was ${medianWords(c.median)}${position === 'at' ? ', the same as this launch' : `, so this launch is ${position} it`}.`,
		why: 'An album gets most of its attention in its first days, so launches are compared at the same age, not by calendar month.',
		evidenceText: `${plural(c.own, 'photo open')} on ${dayRange(first, addDays(first, age - 1))}, complete Chicago days. The ${plural(c.earlier, 'earlier launch', 'earlier launches')} had between ${fmt(c.lowest)} and ${fmt(c.highest)} by day ${age}.`,
		limits: [recordedOnly, 'The rank says how this launch compares, not why.', excludedLimit(c), inferredLimit(focus)],
		action: above
			? (age === 3 ? 'See which photos people are opening and downloading while attention is still arriving.' : 'Open the album report to see which photos people asked to download.')
			: 'Check where the album was shared, and whether the people in it have the link.',
		evidence: { windows: { current: { start: first, end: addDays(first, age - 1) }, previous: null }, units: 'photo opens', current: c.own, strength: c.earlier >= 5 ? 'exploratory' : 'limited', comparison: comparisonEvidence(c) },
		reportHref: albumReport(focus.albumKey, '#compare-title'),
		evidenceLinks: [albumReport(focus.albumKey, '#compare-title')]
	}));
}

function launchFailures(input: LaunchRuleInput, focus: LaunchFocus, result: LaunchRuleResult): void {
	const f = focus.failures;
	if (f === null) { suppress(result, 'launch_failures', 'Failure records could not be read. This is not a report of zero failures.', focus.albumKey); return; }
	const first = focus.series[0]?.date ?? chicagoDay(focus.firstPublishedAt);
	if (!f.window) {
		const reason = !f.recordedSince ? 'Photo load and download results were not recorded during this launch.'
			: f.recordedSince > addDays(first, FAILURE_WINDOW_DAYS - 1) ? `Photo load and download results were first recorded on ${formatDay(f.recordedSince)}, after this launch’s first week.`
			: `Photo load and download results are recorded from ${formatDay(f.recordedSince)}. No complete day of this launch since then has passed yet.`;
		suppress(result, 'launch_failures', reason, focus.albumKey);
		return;
	}
	const startDay = Math.round((Date.parse(`${f.window.start}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000);
	const lateStart = startDay > 0 ? `Results were recorded from ${formatDay(f.window.start)}, day ${startDay} of this launch. Earlier days are not in these counts.` : null;
	const relabel = 'Counted as the collector labeled each visit when it arrived. Later traffic corrections are not applied to failures.';
	let found = false;
	if (f.photoLoadFailures >= FAILURE_MIN_COUNT) {
		found = true;
		result.findings.push(finding(input, {
			rule: 'launch_failures', id: `launch-photo-failures-${focus.albumKey}`, severity: 'high', target: { kind: 'album', albumKey: focus.albumKey },
			title: `${plural(f.photoLoadFailures, 'photo load')} failed during the launch`,
			explanation: `${fmt(f.photoLoadFailures)} of the ${plural(f.photoLoads, 'photo load')} with a recorded result failed, on ${dayRange(f.window.start, f.window.end)}.`,
			why: 'A failure in the first days reaches the most visitors, because that is when most of them arrive.',
			evidenceText: `${fmt(f.photoLoadFailures)} failed and ${fmt(f.photoLoads - f.photoLoadFailures)} loaded, ${dayRange(f.window.start, f.window.end)}, complete Chicago days.`,
			limits: ['A failed load can work on a retry. This counts failures, not visitors.', f.photoLoads < minimumSample ? `Only ${plural(f.photoLoads, 'photo load')} had a recorded result, so this is a small sample.` : null, lateStart, relabel],
			action: 'Open the album on a phone and a computer and check that its photos load.',
			evidence: { windows: { current: { start: f.window.start, end: f.window.end }, previous: null }, units: 'photo loads with a recorded result', numerator: f.photoLoadFailures, denominator: f.photoLoads, strength: f.photoLoads >= minimumSample ? 'exploratory' : 'limited' },
			reportHref: albumReport(focus.albumKey, '#photos')
		}));
	}
	if (f.downloadFailures >= FAILURE_MIN_COUNT) {
		found = true;
		result.findings.push(finding(input, {
			rule: 'launch_failures', id: `launch-download-failures-${focus.albumKey}`, severity: 'high', target: { kind: 'album', albumKey: focus.albumKey },
			title: `${plural(f.downloadFailures, 'download')} failed during the launch`,
			explanation: `${fmt(f.downloadFailures)} of the ${plural(f.downloadRequests, 'download request')} failed, on ${dayRange(f.window.start, f.window.end)}.`,
			why: 'Someone who asks for a photo and does not get it has hit a broken step, at the moment the album matters most.',
			evidenceText: `${fmt(f.downloadFailures)} failed of ${fmt(f.downloadRequests)} requested, ${dayRange(f.window.start, f.window.end)}, complete Chicago days.`,
			limits: ['A failed download can work on a retry. This counts failures, not visitors.', lateStart, relabel],
			action: 'Download a photo from the album yourself, on a phone and a computer, and check that it saves.',
			evidence: { windows: { current: { start: f.window.start, end: f.window.end }, previous: null }, units: 'download requests', numerator: f.downloadFailures, denominator: f.downloadRequests, strength: f.downloadRequests >= minimumSample ? 'exploratory' : 'limited' },
			reportHref: albumReport(focus.albumKey, '#downloads-title')
		}));
	}
	if (!found) suppress(result, 'launch_failures', `${plural(f.photoLoadFailures, 'photo load failure')} and ${plural(f.downloadFailures, 'download failure')} on ${dayRange(f.window.start, f.window.end)}. A finding needs at least ${FAILURE_MIN_COUNT} of one kind.`, focus.albumKey);
}

/** Photos seen often in the gallery grid but opened far less than the album's typical photo. A prompt to look, never a verdict. */
function seenRarelyOpened(input: LaunchRuleInput, focus: LaunchFocus, photos: LaunchPhotoEvidence | null | undefined, result: LaunchRuleResult): void {
	if (!photos) { suppress(result, 'seen_rarely_opened', 'Photo exposure could not be read. This is not a report that no photo was seen.', focus.albumKey); return; }
	const first = focus.series[0]?.date ?? chicagoDay(focus.firstPublishedAt);
	const weekEnd = addDays(first, 6);
	if (photos.exposureCoverage === 'none' || !photos.exposureSince || photos.exposureSince > weekEnd) {
		const reason = !photos.exposureSince ? 'Photos on screen were not recorded during this launch.'
			: photos.exposureSince > weekEnd ? `Photos on screen were first recorded on ${formatDay(photos.exposureSince)}, after this launch’s first week.`
			: `Photos on screen are recorded from ${formatDay(photos.exposureSince)}. No complete day of this launch since then has passed yet.`;
		suppress(result, 'seen_rarely_opened', reason, focus.albumKey);
		return;
	}
	const eligible = photos.photos.filter((photo) => photo.exposures >= SEEN_MIN_EXPOSURES);
	const most = photos.photos.reduce((max, photo) => Math.max(max, photo.exposures), 0);
	if (eligible.length < SEEN_MIN_PHOTOS) {
		suppress(result, 'seen_rarely_opened', `${plural(eligible.length, 'photo')} ${eligible.length === 1 ? 'was' : 'were'} on screen at least ${SEEN_MIN_EXPOSURES} times; at least ${SEEN_MIN_PHOTOS} are needed to find this album’s typical photo. The most any photo was on screen is ${plural(most, 'time')}.`, focus.albumKey);
		return;
	}
	const rate = exactMedian(eligible.map((photo) => photo.opensInExposureWindow / photo.exposures));
	if (rate === 0) { suppress(result, 'seen_rarely_opened', 'The album’s typical photo was seen but not opened, so no one photo stands out.', focus.albumKey); return; }
	const flagged = eligible
		.map((photo) => ({ ...photo, expected: photo.exposures * rate }))
		.filter((photo) => photo.expected >= SEEN_MIN_EXPECTED_OPENS && photo.opensInExposureWindow <= photo.expected * SEEN_LOW_SHARE)
		.sort((a, b) => (b.expected - b.opensInExposureWindow) - (a.expected - a.opensInExposureWindow) || a.photoId.localeCompare(b.photoId));
	if (!flagged.length) { suppress(result, 'seen_rarely_opened', `No photo on screen at least ${SEEN_MIN_EXPOSURES} times was opened far less than this album’s typical photo.`, focus.albumKey); return; }
	const sinceDay = Math.round((Date.parse(`${photos.exposureSince}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000);
	const start = photos.exposureSince > photos.window.start ? photos.exposureSince : photos.window.start;
	for (const photo of flagged.slice(0, SEEN_MAX_FINDINGS)) {
		result.findings.push(finding(input, {
			rule: 'seen_rarely_opened', id: `seen-rarely-opened-${photo.photoId}`, severity: 'low', target: { kind: 'photo', id: photo.photoId, albumKey: focus.albumKey },
			title: 'A photo people scrolled past but rarely opened',
			explanation: `Its tile was on screen ${plural(photo.exposures, 'time')} in the gallery grid, and it was opened ${plural(photo.opensInExposureWindow, 'time')} on those days. Photos in this album seen as often were typically opened about ${plural(Math.round(photo.expected), 'time')}.`,
			why: 'This is a prompt to look at the photo and its thumbnail, not a verdict on the photo.',
			evidenceText: `${fmt(photo.exposures)} times on screen, ${fmt(photo.opensInExposureWindow)} opens, ${dayRange(start, photos.window.end)}. The typical photo is the median of the ${plural(eligible.length, 'photo')} on screen at least ${SEEN_MIN_EXPOSURES} times.`,
			limits: ['An open can also come from a direct link, without the tile ever being on screen.', `${plural(eligible.length, 'photo')} ${eligible.length === 1 ? 'was' : 'were'} checked at once, so one low count can be chance.`, sinceDay > 0 ? `Photos on screen were recorded from ${formatDay(photos.exposureSince)}, day ${sinceDay} of this launch. Its first days are not in these counts.` : null],
			action: 'Look at this photo’s thumbnail next to the album’s most opened photos.',
			evidence: { windows: { current: { start, end: photos.window.end }, previous: null }, units: 'times on screen', numerator: photo.opensInExposureWindow, denominator: photo.exposures, strength: 'exploratory' },
			reportHref: albumReport(focus.albumKey, '#photos'),
			evidenceLinks: [`/photo/${encodeURIComponent(photo.photoId)}`]
		}));
	}
}

/** The launch catalogue for one stored evidence value. Same input, same output. */
export function evaluateLaunchRules(input: LaunchRuleInput): LaunchRuleResult {
	const result: LaunchRuleResult = { findings: [], suppressions: [] };
	const launch = input.launch;
	if (!launch) {
		for (const rule of LAUNCH_RULES) suppress(result, rule, input.unavailableReason ?? 'Launch data could not be read. This is not a quiet launch.');
		return result;
	}
	if (!launch.focus.length) {
		suppress(result, 'launch_reach', launch.albumKey ? 'This album has no first publication on or before this date, so it has no launch to report.' : `No album was first published in the last ${LAUNCH_FINDING_DAYS} days.`, launch.albumKey ?? undefined);
		return result;
	}
	for (const focus of launch.focus) {
		if (focus.elapsedDays > LAUNCH_FINDING_DAYS) {
			for (const rule of LAUNCH_RULES) suppress(result, rule, `This launch is past its first ${LAUNCH_FINDING_DAYS} days. Its report keeps the full record.`, focus.albumKey);
			continue;
		}
		if (focus.elapsedDays === 0 || !focus.series.length) {
			suppress(result, 'launch_reach', 'No complete day has passed since first publication.', focus.albumKey);
			continue;
		}
		collectionGap(input, focus, result);
		const finished = launchFinished(input, focus, launch.peers, result);
		if (finished) suppress(result, 'launch_reach', 'The launch is over; its recap replaces the reach comparison.', focus.albumKey);
		else launchReach(input, focus, launch.peers, result);
		launchFailures(input, focus, result);
		if (launch.albumKey === focus.albumKey) seenRarelyOpened(input, focus, launch.photos, result);
	}
	const rank = { high: 0, medium: 1, low: 2 };
	result.findings.sort((a, b) => rank[a.severity ?? 'low'] - rank[b.severity ?? 'low'] || a.id.localeCompare(b.id));
	return result;
}
