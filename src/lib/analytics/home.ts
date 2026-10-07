import type { Launch, LaunchDay } from './launch-read-model.server';
import { chicagoDate, cumulativeOpens, daysWords, formatDay, median, ordinal, plural, recoveredTag, sumComplete, type RecapPart, type RecapSentence } from './launch-recap';
import { nameWithoutDate } from './launch-report-view';
import { NO_RECAP_DUE, nextRecapItems } from './launch-recap-list';
import type { HomeProblemTarget } from './data-anchors';
import { minimumSample } from './intelligence-rules';
import { quietSince } from './launch-rules';
import { INTELLIGENCE_REFRESH_CADENCE_SECONDS, type Finding } from './intelligence-contract';

/**
 * Home: what happened since you last looked, across both sites, from reads that already exist.
 * Pure and deterministic: the loader reads, this file decides what to say. Every sentence here is
 * reader-facing copy, so the file is a reader-contract source root.
 *
 * Rules the copy keeps, the same as the album report and the album index:
 *  - Unknown is never zero. A day that is not complete adds nothing to a total and is drawn as a gap.
 *  - Data that is stale or unavailable is said first and is never shown as a quiet day.
 *  - Today is partial and never part of a number here. Counts are browser actions, not people.
 *  - A first publication worked out afterwards from a log says so, in the same words the album report uses.
 *  - Every number says what it is compared with, or says that there is nothing to compare it with.
 *  - A recap is called due only from the clock. Nothing here says one was sent.
 */

/** A launch counts as "just finished" for this many days after its seventh. Then the gallery is quiet. */
export const JUST_FINISHED_DAYS = 3;
/** Days since the newest first publication after which Home says the gallery is quiet. */
export const QUIET_AFTER_DAYS = 7 + JUST_FINISHED_DAYS;
export const HOME_LAUNCH_CARDS = 3;
/** At most this many current findings show on Home, each beside the launch it concerns. */
export const HOME_FINDINGS = 3;
/**
 * Findings checked longer ago than this are said to be possibly out of date. The scheduler re-checks a scope every
 * 15 minutes (INTELLIGENCE_REFRESH_CADENCE_SECONDS). A normal check can be later than that by the queue (about 25
 * scopes at 4 a minute, so a few minutes) and by a failed refresh's retries (30 s doubling: 1, 2, 4, 8 minutes).
 * Four cadences, one hour, clears all of that, so a check older than an hour means the worker has stalled.
 */
export const FINDINGS_LATE_AFTER_MS = 4 * INTELLIGENCE_REFRESH_CADENCE_SECONDS * 1000;
/** The current day's counts refresh every 30 minutes; two missed runs plus slack. The same limit the intelligence evidence uses (`gallery_summary_overdue`). */
export const REFRESH_STALE_MS = 75 * 60_000;
export const SPARK_DAYS = 7;
/** Completed days whose records Home checks: the 7 days the week line counts. */
export const COMPLETED_DAYS_CHECKED = 7;

const fmt = (value: number) => value.toLocaleString('en-US');
type Piece = string | number | { b: string | number };
function sentence(...pieces: Piece[]): RecapSentence {
	return pieces.map((piece): RecapPart => {
		if (typeof piece === 'string') return { text: piece };
		if (typeof piece === 'number') return { text: fmt(piece) };
		return { text: typeof piece.b === 'number' ? fmt(piece.b) : piece.b, strong: true };
	});
}
const b = (value: string | number): { b: string | number } => ({ b: value });
export const sentenceText = (value: RecapSentence): string => value.map((part) => part.text).join('');

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** "Sep 26" for this year, "Sep 26, 2025" for another. */
function dayLabel(date: string, today: string): string {
	return date.slice(0, 4) === today.slice(0, 4) ? formatDay(date) : `${formatDay(date)}, ${date.slice(0, 4)}`;
}
/** An instant in Chicago time: "8:40 AM" for today, "Oct 5, 8:40 AM" for another day. */
export function chicagoTime(instant: string, today: string): string {
	const at = new Date(instant);
	const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(at);
	const day = chicagoDate(instant);
	return day === today ? time : `${dayLabel(day, today)}, ${time}`;
}
/** When a group of findings was last checked, said plainly; late or unknown says the findings may be out of date. */
export interface FindingsCheck { text: string; late: boolean }
export function findingsCheck(checkedAt: string | null, now: string, today: string): FindingsCheck {
	if (!checkedAt || Number.isNaN(Date.parse(checkedAt))) return { text: 'When these were last checked is not known, so they may be out of date.', late: true };
	const time = `${chicagoTime(checkedAt, today)} Chicago time`;
	if (Date.parse(now) - Date.parse(checkedAt) > FINDINGS_LATE_AFTER_MS) return { text: `Last checked ${time}, more than an hour ago. These may be out of date.`, late: true };
	return { text: `Last checked ${time}.`, late: false };
}
const inferredTag = (launch: Pick<Launch, 'basis'>) => recoveredTag(launch.basis);

/* ---------------------------------------------------------------------------------------------- */
/* Launch status                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

export type LaunchPhase = 'published_today' | 'running' | 'week_reached' | 'finished';

/** In its first seven days, just past them, or long past them. `elapsedDays` is complete Chicago days since day 0. */
export function launchPhase(launch: Pick<Launch, 'elapsedDays'>): LaunchPhase {
	if (launch.elapsedDays <= 0) return 'published_today';
	if (launch.elapsedDays < 7) return 'running';
	return launch.elapsedDays < QUIET_AFTER_DAYS ? 'week_reached' : 'finished';
}

export function statusLabel(launch: Pick<Launch, 'elapsedDays'>): string {
	const phase = launchPhase(launch);
	if (phase === 'published_today') return 'Published today';
	if (phase === 'running') return `Day ${launch.elapsedDays} of 7`;
	return phase === 'week_reached' ? 'Day 7 reached' : 'Finished';
}

/** "2nd place of 7 launches", "tied for 2nd place of 7 launches". Null when the rank is not stated. */
function rankPhrase(rank: Launch['rank']['day3'], complete: boolean): string | null {
	if (!complete || rank.rank === null || rank.compared < 2) return null;
	return `${rank.tied ? 'tied for ' : ''}${ordinal(rank.rank)} place of ${rank.compared} launches`;
}
function rankAtAge(rank: Launch['rank']['day3'], complete: boolean, age: 3 | 7): string {
	if (!complete) return `No rank at day ${age}: a day in it has incomplete records`;
	if (rank.rank === null || rank.compared < 2) return `No other launch has a complete day ${age} to compare with`;
	return `${rank.tied ? 'Tied for ' : ''}${ordinal(rank.rank)} of ${rank.compared} launches at day ${age}`;
}

function earlierThan(launches: readonly Launch[], launch: Launch): Launch[] {
	const at = Date.parse(launch.firstPublishedAt);
	return launches.filter((other) => other.albumKey !== launch.albumKey && Date.parse(other.firstPublishedAt) < at);
}

/** The photo opens so far, or null when a day in it is incomplete (a short total would look like a slow launch). */
function opensSoFar(launch: Launch): number | null {
	const { total, gaps } = sumComplete(launch.series, 'photoOpens');
	return gaps.length ? null : total;
}

/* ---------------------------------------------------------------------------------------------- */
/* Opening sentence                                                                                 */
/* ---------------------------------------------------------------------------------------------- */

export type HomeState = 'unavailable' | 'stale' | 'overlapping' | 'published_today' | 'first_days' | 'running' | 'just_finished' | 'quiet' | 'no_launches';

export interface Freshness {
	/** Completed days among the last 7 whose records are not complete, oldest first. */
	incompleteDays: string[];
	/**
	 * When the current day's counts were last refreshed. Null with `checked` true means the refresh
	 * time could not be read; whether the counts are current is then unknown, which is not "current".
	 */
	refreshedAt: string | null;
	checked: boolean;
}

/** The days ending at the last complete day that are all incomplete: the numbers have stopped, they are not zero. */
export function trailingGap(incompleteDays: readonly string[], lastCompleteDay: string): string[] {
	const missing = new Set(incompleteDays);
	const run: string[] = [];
	for (let day = lastCompleteDay; missing.has(day); day = addDays(day, -1)) run.unshift(day);
	return run;
}

export type Staleness =
	| { kind: 'fresh' }
	| { kind: 'gap'; lastGood: string; firstMissing: string }
	| { kind: 'refresh_late'; refreshedAt: string }
	| { kind: 'refresh_unknown' };

export function staleness(freshness: Freshness, lastCompleteDay: string, now: string): Staleness {
	const run = trailingGap(freshness.incompleteDays, lastCompleteDay);
	if (run.length) return { kind: 'gap', lastGood: addDays(run[0], -1), firstMissing: run[0] };
	if (!freshness.checked) return { kind: 'fresh' };
	if (freshness.refreshedAt === null) return { kind: 'refresh_unknown' };
	if (Date.parse(now) - Date.parse(freshness.refreshedAt) > REFRESH_STALE_MS) return { kind: 'refresh_late', refreshedAt: freshness.refreshedAt };
	return { kind: 'fresh' };
}

function staleSentence(stale: Exclude<Staleness, { kind: 'fresh' }>, today: string): RecapSentence {
	if (stale.kind === 'gap') {
		return sentence('Counts stop at ', b(dayLabel(stale.lastGood, today)), ': the days since are incomplete, so this is a gap in the records, not a quiet gallery.');
	}
	if (stale.kind === 'refresh_late') {
		return sentence('The gallery counts were last refreshed at ', b(`${chicagoTime(stale.refreshedAt, today)} Chicago time`), ', so recent activity may be missing; this is not a quiet day.');
	}
	return sentence('Whether the gallery counts are current could not be checked, so this is not a quiet day.');
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three'] as const;
function launchName(launch: Launch): string {
	return nameWithoutDate(launch.albumName ?? launch.albumKey);
}

/** One launch as a clause: where it is, with its number. "X is on day 5 of 7 with 400 photo opens so far". */
function clause(launch: Launch, withTotal: boolean): Piece[] {
	const name = b(launchName(launch));
	const phase = launchPhase(launch);
	if (phase === 'published_today') return [name, ' was published today'];
	if (phase === 'running') {
		const opens = opensSoFar(launch);
		return [name, ` is on day ${launch.elapsedDays} of 7`, ...(withTotal && opens !== null ? [' with ', b(plural(opens, 'photo open')), ' so far'] : [])];
	}
	const place = rankPhrase(launch.rank.day7, launch.totals.day7.complete);
	return [name, ' finished its first week', ...(place ? [' in ', b(place)] : [])];
}

function runningSentence(launch: Launch, all: readonly Launch[]): RecapSentence {
	const n = launch.elapsedDays;
	const name = b(launchName(launch));
	const opens = opensSoFar(launch);
	if (opens === null) return sentence(name, ` is on day ${n} of 7, but a day in it has incomplete records, so no total is shown.`);
	const lead: Piece[] = [name, ` is on day ${n} of 7 with `, b(plural(opens, 'photo open')), ' so far'];
	if (n >= 3) {
		const place = rankPhrase(launch.rank.day3, launch.totals.day3.complete);
		return sentence(...lead, place ? `, ${launch.rank.day3.tied ? 'tied for ' : ''}${ordinal(launch.rank.day3.rank!)} of ${launch.rank.day3.compared} launches at day 3.` : ', and no other launch has a complete day 3 to compare with.');
	}
	const mid = median(earlierThan(all, launch).flatMap((other) => { const v = cumulativeOpens(other, n); return v === null ? [] : [v]; }));
	return sentence(...lead, mid !== null ? `; earlier launches had a median of ${fmt(mid)} by day ${n}.` : '; no earlier launch has a complete record to compare with.');
}

/** The first 7 complete days of a launch, in words: "Sep 26 to Oct 2". Null when they are not all in the series. */
function firstWeekDays(launch: Launch): string | null {
	return launch.series.length >= 7 ? daysWords(launch.series[0].date, launch.series[6].date) : null;
}

function finishedSentence(launch: Launch): RecapSentence {
	const name = b(launchName(launch));
	const week = launch.totals.day7;
	if (!week.complete || week.photoOpens === null) return sentence(name, ' finished its first week, but a day in it has incomplete records, so no total or rank is shown.');
	const place = rankPhrase(launch.rank.day7, true);
	const days = firstWeekDays(launch);
	const dated: Piece[] = days ? [` (${days})`] : [];
	if (!place) return sentence(name, ' finished its first week with ', b(plural(week.photoOpens, 'photo open')), ...dated, '; no other launch has a complete first week to compare with.');
	return sentence(name, ' finished its first week in ', b(place), ' with ', b(plural(week.photoOpens, 'photo open')), ...dated, '.');
}

function overlappingSentence(relevant: readonly Launch[]): RecapSentence {
	const shown = relevant.slice(0, 3);
	const pieces: Piece[] = [`${NUMBER_WORDS[shown.length]} launches are in play: `];
	shown.forEach((launch, i) => {
		if (i > 0) pieces.push(i === shown.length - 1 ? ', and ' : ', ');
		pieces.push(...clause(launch, false));
	});
	const rest = relevant.length - shown.length;
	pieces.push(rest > 0 ? `, and ${plural(rest, 'more')}.` : '.');
	return sentence(...pieces);
}

/** `then` is one short line under the headline, for a state that has a second thing to say. */
export interface Opening { state: HomeState; sentence: RecapSentence; then?: RecapSentence }

/**
 * The one sentence under the page title. Precedence: unavailable, then stale, then a launch in
 * progress, then one just finished, then quiet. A stale or unavailable gallery never reads as quiet.
 */
export function openingSentence(input: { launches: readonly Launch[] | null; stale: Staleness; today: string }): Opening {
	const { launches, stale, today } = input;
	if (launches === null) return { state: 'unavailable', sentence: sentence('Launch numbers could not be read just now. This is not a quiet day.') };
	if (stale.kind !== 'fresh') return { state: 'stale', sentence: staleSentence(stale, today) };
	if (launches.length === 0) return { state: 'no_launches', sentence: sentence('No album has a launch date yet. An album gets one when it is first published.') };
	const newest = [...launches].sort((x, y) => Date.parse(y.firstPublishedAt) - Date.parse(x.firstPublishedAt));
	const running = newest.filter((launch) => launch.elapsedDays < 7);
	const recent = newest.filter((launch) => launch.elapsedDays >= 7 && launch.elapsedDays < QUIET_AFTER_DAYS);
	const relevant = newest.filter((launch) => launch.elapsedDays < QUIET_AFTER_DAYS);
	// A launch in progress with any other launch in play (running or just finished) is an overlap.
	if (running.length >= 1 && relevant.length >= 2) return { state: 'overlapping', sentence: overlappingSentence(relevant) };
	if (running.length === 1) {
		const launch = running[0];
		if (launch.elapsedDays === 0) return { state: 'published_today', sentence: sentence(b(launchName(launch)), ' was published today, and its first full day is counted tomorrow.') };
		return { state: launch.elapsedDays < 3 ? 'first_days' : 'running', sentence: runningSentence(launch, launches) };
	}
	if (recent.length) return { state: 'just_finished', sentence: finishedSentence(recent[0]) };
	const last = newest[0];
	const since = chicagoDate(last.firstPublishedAt);
	// The newest launch's own like-for-like line leads. That nothing newer exists is the second line, computed from today.
	return { state: 'quiet', sentence: finishedSentence(last), then: sentence('No new album since ', b(`${dayLabel(since, today)}${inferredTag(last)}`), `, ${plural(daysBetween(since, today), 'day')} ago.`) };
}

/* ---------------------------------------------------------------------------------------------- */
/* Gallery week against the week before                                                             */
/* ---------------------------------------------------------------------------------------------- */

export interface WeekInput {
	window: { start: string; end: string };
	previous: { start: string; end: string };
	current: number | null;
	previousTotal: number | null;
	coverage: 'complete' | 'partial' | 'unavailable';
	previousCoverage: 'complete' | 'partial' | 'unavailable';
}

export function range(window: { start: string; end: string }, today: string): string {
	return `${dayLabel(window.start, today)} – ${window.end.slice(0, 7) === window.start.slice(0, 7) ? String(Number(window.end.slice(8))) : dayLabel(window.end, today)}`;
}

/**
 * "up 12%", "down 87%", "the same as", or "against". A percentage appears only when both periods have at
 * least the sample the intelligence rules need; below that, a change of 2 to 4 is not "up 100%", so the two
 * counts are stated plainly. New activity from zero is never an infinite percentage.
 */
export function changeWords(current: number, previous: number): string {
	if (current === previous) return 'the same as';
	if (Math.min(current, previous) < minimumSample) return 'against';
	const pct = Math.round((Math.abs(current - previous) / previous) * 100);
	if (pct === 0) return `${current > previous ? 'up' : 'down'} less than 1% from`;
	return `${current > previous ? 'up' : 'down'} ${pct}% from`;
}

/** Launches whose first seven days (day 0 to day 6, Chicago days) touch the window, newest first. */
export function launchesInWindow(launches: readonly Launch[], window: { start: string; end: string }): Launch[] {
	return [...launches]
		.filter((launch) => {
			const day0 = chicagoDate(launch.firstPublishedAt);
			return day0 <= window.end && addDays(day0, 6) >= window.start;
		})
		.sort((x, y) => Date.parse(y.firstPublishedAt) - Date.parse(x.firstPublishedAt));
}

/**
 * One line, or null: the last 7 complete days of gallery photo opens against the 7 days before them.
 *
 * An album gets most of its attention in its first days, so a calendar week that holds a launch's first week
 * describes when albums were published, not how the gallery is doing. When either window holds days 0 to 6 of any
 * launch there is no line at all: Home leads with the newest launch's own like-for-like line instead. Only two windows
 * with no launch days in either get a plain comparison. If the launches could not be read, nothing says the windows
 * are alike, so no percentage.
 */
export function weekLine(week: WeekInput | null, today: string, launches: readonly Launch[] | null): RecapSentence | null {
	if (week === null) return sentence('Gallery photo opens for the last 7 days could not be read. No number is shown rather than a wrong one.');
	const head = `Gallery photo opens, ${range(week.window, today)}: `;
	if (week.coverage !== 'complete' || week.current === null) return sentence(head, b('not stated'), ': a day in it has incomplete records, so a short total is not shown.');
	if (week.previousCoverage !== 'complete' || week.previousTotal === null) {
		return sentence(head, b(week.current), `, with nothing to compare it with: the 7 days before (${range(week.previous, today)}) have incomplete records.`);
	}
	const before = `The 7 days before (${range(week.previous, today)}) had `;
	if (launches === null) return sentence(head, b(week.current), `. ${before}`, b(week.previousTotal), '. Launch dates could not be read, so no change is stated.');
	// A launch's first week in either window makes the two weeks unlike. Home then shows no calendar-week comparison.
	if (launchesInWindow(launches, week.window).length || launchesInWindow(launches, week.previous).length) return null;
	return sentence(head, b(week.current), `, ${changeWords(week.current, week.previousTotal)} ${fmt(week.previousTotal)} in the 7 days before (${range(week.previous, today)}).`);
}

/**
 * The note on the newest finished launch's card: when a photo was last opened, said only as far as the complete days show it.
 * The claim itself is `quietSince`: read from the whole series, only when every later day is complete and zero.
 */
export function lastOpenedNote(launch: Pick<Launch, 'series' | 'elapsedDays'>, lastCompleteDay: string): string | null {
	if (launch.elapsedDays < 7) return null;
	const since = quietSince(launch.series, lastCompleteDay);
	return since ? `No one has opened a photo since ${formatDay(since)} (complete days, through ${formatDay(lastCompleteDay)}).` : null;
}

/* ---------------------------------------------------------------------------------------------- */
/* Launch cards                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

export interface SparkBar {
	day: number;
	/** 'value' is a counted day, 'gap' a day with incomplete records (never drawn as zero), 'future' a day that has not happened. */
	state: 'value' | 'gap' | 'future';
	opens: number | null;
	/** 0 to 1 of the tallest counted day. */
	height: number;
}

export function sparkBars(series: readonly LaunchDay[], days = SPARK_DAYS): { bars: SparkBar[]; label: string } {
	const counted = series.slice(0, days);
	const max = Math.max(1, ...counted.map((day) => (day.coverage === 'complete' && day.photoOpens !== null ? day.photoOpens : 0)));
	const bars: SparkBar[] = Array.from({ length: days }, (_, i) => {
		const day = counted[i];
		if (!day) return { day: i + 1, state: 'future', opens: null, height: 0 };
		if (day.coverage !== 'complete' || day.photoOpens === null) return { day: i + 1, state: 'gap', opens: null, height: 0 };
		return { day: i + 1, state: 'value', opens: day.photoOpens, height: day.photoOpens / max };
	});
	if (counted.length === 0) return { bars, label: 'Daily photo opens: no complete day yet.' };
	const parts = bars.slice(0, counted.length).map((bar) => (bar.state === 'value' ? `day ${bar.day}, ${fmt(bar.opens as number)}` : `day ${bar.day}, incomplete records`));
	return { bars, label: `Daily photo opens by day since publication: ${parts.join('; ')}.` };
}

export interface HomeCard {
	albumKey: string;
	name: string;
	/** Cloudflare image id of the cover, or null when the album has none to show. */
	cover: string | null;
	published: string;
	status: string;
	phase: LaunchPhase;
	opens: string;
	comparison: string;
	bars: SparkBar[];
	sparkLabel: string;
	/** When a photo was last opened, for the newest launch once it is over; null otherwise. See `lastOpenedNote`. */
	note: string | null;
	/** Current findings about this launch, most urgent first. Empty when there are none; Home then shows nothing. */
	findings: Finding[];
	/** When those findings were last checked. Null when there are none. */
	findingsCheck: FindingsCheck | null;
}

export function launchCard(launch: Launch, all: readonly Launch[], today: string, cover: string | null): HomeCard {
	const phase = launchPhase(launch);
	const n = launch.elapsedDays;
	const spark = sparkBars(launch.series);
	let opens: string;
	let comparison: string;
	if (phase === 'published_today') {
		opens = 'No complete day yet';
		comparison = 'Its first full day is counted tomorrow.';
	} else if (phase === 'running') {
		const so = opensSoFar(launch);
		opens = so === null ? 'Total so far not shown: a day has incomplete records' : `${plural(so, 'photo open')} so far`;
		if (n < 3) {
			const mid = so === null ? null : median(earlierThan(all, launch).flatMap((other) => { const v = cumulativeOpens(other, n); return v === null ? [] : [v]; }));
			comparison = mid === null ? 'No earlier launch has a complete record at this age to compare with.' : `Earlier launches had a median of ${fmt(mid)} by day ${n}.`;
		} else {
			comparison = `${rankAtAge(launch.rank.day3, launch.totals.day3.complete, 3)}.`;
		}
	} else {
		const week = launch.totals.day7;
		opens = week.complete && week.photoOpens !== null ? `${plural(week.photoOpens, 'photo open')} in week 1` : 'Week 1 total not shown: a day has incomplete records';
		comparison = `${rankAtAge(launch.rank.day7, week.complete, 7)}.`;
	}
	return {
		albumKey: launch.albumKey, name: launch.albumName ?? launch.albumKey, cover,
		published: `First published ${dayLabel(chicagoDate(launch.firstPublishedAt), today)}${inferredTag(launch)}`,
		status: statusLabel(launch), phase, opens, comparison, bars: spark.bars, sparkLabel: spark.label, note: null, findings: [], findingsCheck: null
	};
}

/* ---------------------------------------------------------------------------------------------- */
/* Next                                                                                             */
/* ---------------------------------------------------------------------------------------------- */

/**
 * What is due: the day 3 and day 7 recap of each launch whose due time has not come, soonest first. The dates come from the
 * recap schedule (08:00 Chicago on the morning after the day completes), so this line and the scheduler cannot disagree.
 * A recap whose time has come is read on its album report; Home does not list it.
 */
export function nextRecaps(launches: readonly Launch[], now: Date): { text: string; items: string[] } {
	const items = nextRecapItems({ launches, now }, (launch) => nameWithoutDate(launch.albumName ?? launch.albumKey));
	return items.length ? { text: 'Due next', items: items.map((item) => item.text) } : { text: NO_RECAP_DUE, items: [] };
}

/* ---------------------------------------------------------------------------------------------- */
/* Site line                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export type SiteReading =
	| { available: true; start: string; end: string; current: number; previous: number | null }
	| { available: false; reason: string };

export interface SiteFigure { label: string; value: string | null; detail: string }

export const SITE_REACH_LABEL = 'Page loads on ninochavez.co (Cloudflare)';
export const SITE_CONTACT_LABEL = 'Contact links clicked';

/** One site figure: the number, the dates it covers, and what it is compared with. `days` is the length of both windows. */
export function siteFigure(label: string, reading: SiteReading, today: string, unit: string, days = 7): SiteFigure {
	if (!reading.available) return { label, value: null, detail: reading.reason };
	const dates = range({ start: reading.start, end: reading.end }, today);
	if (reading.previous === null) return { label, value: fmt(reading.current), detail: `${dates}. The ${days} days before could not be read, so there is nothing to compare it with.${unit}` };
	return { label, value: fmt(reading.current), detail: `${dates}, ${changeWords(reading.current, reading.previous)} ${fmt(reading.previous)} in the ${days} days before.${unit}` };
}

export function siteFigures(reach: SiteReading, contacts: SiteReading, today: string): { reach: SiteFigure; contacts: SiteFigure } {
	return {
		reach: siteFigure(SITE_REACH_LABEL, reach, today, ''),
		contacts: siteFigure(SITE_CONTACT_LABEL, contacts, today, ' These are links opened, not messages sent.')
	};
}

/* ---------------------------------------------------------------------------------------------- */
/* Open problems                                                                                    */
/* ---------------------------------------------------------------------------------------------- */

export interface HomeProblem {
	id: string;
	text: string;
	/** The place on the data quality page that explains it. Never an album or photo. */
	href: HomeProblemTarget;
	linkText: string;
}

export interface ProblemInput {
	freshness: Freshness;
	lastCompleteDay: string;
	now: string;
	today: string;
	launchesRead: boolean;
	weekRead: boolean;
	/** Finding ids of open incidents, or null when they could not be read. */
	incidents: string[] | null;
	/** Collection diagnostics from the delivery health check, or null when the check could not run. */
	diagnostics: Array<{ type: string; status: string; count: number }> | null;
	siteActionsStale: { refreshedAt: string } | null;
}

/** A finding id says what kind of incident it is. The words never include an album or photo name. */
export function incidentWords(findingId: string): string {
	if (findingId.startsWith('collection-health')) return 'A data collection check is failing';
	if (findingId.includes('download')) return 'Download requests are failing for visitors';
	if (findingId.includes('render')) return 'Photos are failing to load for visitors';
	if (findingId.includes('search')) return 'Gallery searches are failing for visitors';
	return 'An analytics incident is open';
}

export function openProblems(input: ProblemInput): HomeProblem[] {
	const problems: HomeProblem[] = [];
	const { freshness, today } = input;
	const stale = staleness(freshness, input.lastCompleteDay, input.now);
	if (!input.launchesRead) problems.push({ id: 'launches-unreadable', text: 'Launch numbers could not be read. Nothing on this page says whether anything is happening.', href: 'status', linkText: 'Check data collection' });
	if (!input.weekRead) problems.push({ id: 'week-unreadable', text: 'The gallery daily summary could not be read.', href: 'status', linkText: 'Check data collection' });
	if (freshness.incompleteDays.length) {
		const list = freshness.incompleteDays.slice(-4).map(formatDay).join(', ');
		const more = freshness.incompleteDays.length > 4 ? ` and ${freshness.incompleteDays.length - 4} earlier` : '';
		problems.push({ id: 'coverage', text: `Records are incomplete for ${plural(freshness.incompleteDays.length, 'completed day')} of the last ${COMPLETED_DAYS_CHECKED} (${list}${more}). A total that includes one is not shown.`, href: 'coverage', linkText: 'See what was recorded' });
	}
	if (stale.kind === 'refresh_late') problems.push({ id: 'refresh-late', text: 'The gallery counts normally refresh every 30 minutes, and the last refresh is late.', href: 'coverage', linkText: 'Check the refresh' });
	if (stale.kind === 'refresh_unknown') problems.push({ id: 'refresh-unknown', text: 'The time of the last gallery refresh could not be read, so whether the counts are current is unknown.', href: 'coverage', linkText: 'Check the refresh' });
	if (input.siteActionsStale) problems.push({ id: 'site-actions-stale', text: `Site action counts were last refreshed at ${chicagoTime(input.siteActionsStale.refreshedAt, today)} Chicago time, so recent clicks may be missing.`, href: 'site-measures', linkText: 'Check the site counts' });
	if (input.incidents === null) problems.push({ id: 'incidents-unreadable', text: 'Open incidents could not be checked, so none is shown here.', href: 'status', linkText: 'Check data collection' });
	else for (const id of input.incidents.slice(0, 3)) problems.push({ id: `incident-${id}`, text: `${incidentWords(id)}. This incident is open.`, href: 'status', linkText: 'Investigate' });
	if (input.incidents && input.incidents.length > 3) problems.push({ id: 'incident-more', text: `${plural(input.incidents.length - 3, 'more open incident')}.`, href: 'status', linkText: 'Investigate' });
	if (input.diagnostics === null) problems.push({ id: 'delivery-unknown', text: 'Delivery to the analytics provider could not be checked.', href: 'delivery', linkText: 'Check delivery' });
	else for (const diagnostic of input.diagnostics.filter((item) => item.status === 'failed')) {
		if (diagnostic.type === 'delivery_health_unavailable') problems.push({ id: 'delivery-unknown', text: 'Delivery to the analytics provider could not be checked.', href: 'delivery', linkText: 'Check delivery' });
		else if (diagnostic.type === 'provider_delivery_failures') problems.push({ id: 'delivery-failed', text: `${plural(diagnostic.count, 'event')} could not be delivered to the analytics provider.`, href: 'delivery', linkText: 'Check delivery' });
		else if (diagnostic.type === 'provider_delivery_overdue') problems.push({ id: 'delivery-late', text: `${plural(diagnostic.count, 'event')} are waiting for delivery to the analytics provider, longer than expected.`, href: 'delivery', linkText: 'Check delivery' });
	}
	// One problem per cause: two checks reaching the same words must not show twice.
	return problems.filter((problem, i) => problems.findIndex((other) => other.id === problem.id) === i);
}

/* ---------------------------------------------------------------------------------------------- */
/* The whole page                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

export interface HomeInput {
	asOf: string;
	today: string;
	lastCompleteDay: string;
	/** Newest first, as `fetchLaunches` returns them; null when the read failed. */
	launches: readonly Launch[] | null;
	covers: ReadonlyMap<string, string>;
	week: WeekInput | null;
	freshness: Freshness;
	siteReach: SiteReading;
	siteContacts: SiteReading;
	siteActionsStale: { refreshedAt: string } | null;
	incidents: string[] | null;
	diagnostics: ProblemInput['diagnostics'];
	/** Findings from the gallery-wide launch scope, most urgent first, already checked for visibility. */
	findings: readonly Finding[];
	/** When the scheduler last checked them; null when unknown. */
	findingsCheckedAt: string | null;
}

/**
 * Up to HOME_FINDINGS findings, each placed on the card of the launch it concerns. A finding about a launch with
 * no card stays on that album's report; Home does not list it apart from its launch.
 */
export function placeFindings(cards: HomeCard[], findings: readonly Finding[], check: FindingsCheck | null = null): HomeCard[] {
	const onCards = new Set(cards.map((card) => card.albumKey));
	// "The launch is over" is not shown as a finding here. The newest launch's card says it in its own line (`lastOpenedNote`),
	// computed from the days; a stored finding repeated under every finished launch said it once per card.
	const shown = findings.filter((finding) => finding.rule !== 'launch_finished' && finding.target.albumKey && onCards.has(finding.target.albumKey)).slice(0, HOME_FINDINGS);
	return cards.map((card) => {
		const mine = shown.filter((finding) => finding.target.albumKey === card.albumKey);
		return { ...card, findings: mine, findingsCheck: mine.length ? check : null };
	});
}

export interface HomeView {
	state: HomeState;
	asOf: string;
	today: string;
	lastCompleteDay: string;
	opening: RecapSentence;
	/** One short line under the headline, for the states that have a second thing to say. */
	then: RecapSentence | null;
	/** The calendar-week line, or null when it would compare unlike weeks. See `weekLine`. */
	week: RecapSentence | null;
	cards: HomeCard[];
	/** Launches beyond the cards, for the "see all" link. */
	moreLaunches: number;
	totalLaunches: number;
	next: { text: string; items: string[] };
	site: { reach: SiteFigure; contacts: SiteFigure };
	problems: HomeProblem[];
}

export function buildHome(input: HomeInput): HomeView {
	const { today } = input;
	const launches = input.launches;
	const stale = staleness(input.freshness, input.lastCompleteDay, input.asOf);
	const opening = openingSentence({ launches, stale, today });
	const newest = launches ? [...launches].sort((x, y) => Date.parse(y.firstPublishedAt) - Date.parse(x.firstPublishedAt)) : [];
	const cards = placeFindings(newest.slice(0, HOME_LAUNCH_CARDS).map((launch, i) => ({ ...launchCard(launch, newest, today, input.covers.get(launch.albumKey) ?? null), note: i === 0 ? lastOpenedNote(launch, input.lastCompleteDay) : null })), input.findings, findingsCheck(input.findingsCheckedAt, input.asOf, today));
	return {
		state: opening.state, asOf: input.asOf, today, lastCompleteDay: input.lastCompleteDay,
		opening: opening.sentence, then: opening.then ?? null, week: weekLine(input.week, today, input.launches),
		cards, moreLaunches: Math.max(0, newest.length - cards.length), totalLaunches: newest.length,
		next: launches === null ? { text: 'What is due cannot be said while the launch numbers are unavailable.', items: [] } : nextRecaps(launches, new Date(input.asOf)),
		site: siteFigures(input.siteReach, input.siteContacts, today),
		problems: openProblems({
			freshness: input.freshness, lastCompleteDay: input.lastCompleteDay, now: input.asOf, today, launchesRead: launches !== null, weekRead: input.week !== null,
			incidents: input.incidents, diagnostics: input.diagnostics, siteActionsStale: input.siteActionsStale
		})
	};
}
