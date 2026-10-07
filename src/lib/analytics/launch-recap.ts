import type { DatedLaunchAlbum, Launch, LaunchAgeRank, LaunchDay, LaunchPhoto, LaunchReadModel, UndatedLaunchAlbum } from './launch-read-model.server';

/**
 * The album launch recap: a headline and a few short sentences built from one launch read
 * model, with the numbers inline. Pure and deterministic, so the report page and the later
 * day 3 and day 7 recap email can print the same words from the same data.
 *
 * Rules the sentences keep:
 *  - Null is unknown, never zero. A day that is not complete adds nothing to a total.
 *  - Today is partial and is reported apart. It never enters a total, a rank or a median.
 *  - A rank is the read model's own rank. This file only names the launch it trails.
 *  - Browsers and arrivals are not people; download actions are requests, not saved files.
 *  - A date that was recovered afterwards from a log says so.
 */

/** A run of text. `strong` marks a number the page may emphasise, so no HTML is ever built here. */
export interface RecapPart { text: string; strong?: boolean }
export type RecapSentence = RecapPart[];

export type RecapState =
	| 'no_launch_date'
	| 'not_published'
	| 'just_published'
	| 'early'
	| 'in_progress'
	| 'finished'
	| 'finished_gap';

export interface ArrivalRow { source: string; count: number }

export interface Recap {
	state: RecapState;
	/** Short label above the album name, for example "Week 1 recap". */
	eyebrow: string;
	/** "Published Sep 25." for a dated launch, with a note when the date was recovered from a log; null otherwise. */
	published: RecapSentence | null;
	headline: RecapSentence;
	/** Two to four short sentences. */
	sentences: RecapSentence[];
	/** Which days the numbers cover, and what was left out. */
	window: RecapSentence;
	downloads: RecapSentence | null;
	arrivals: RecapSentence | null;
	/** What this report cannot tell the reader. */
	limits: string[];
}

export interface RecapInput {
	model: LaunchReadModel;
	/** Tagged arrivals over the launch window, or null when they could not be read. */
	arrivals: ArrivalRow[] | null;
	/** The photos the grid lists. Its size is the one photo total used everywhere on the page. */
	photoIds: ReadonlySet<string>;
	/**
	 * The text will be stored and read away from the page (a recap in the dashboard list or an email). It leaves out
	 * today's partial count, which stops meaning anything after the morning it was written and must not change with
	 * how late the run was, and it points to the report where the page says "below".
	 */
	stored?: boolean;
}

type Piece = string | number | { b: string | number };
const fmt = (value: number) => value.toLocaleString('en-US');
const b = (value: string | number): { b: string | number } => ({ b: value });
function sentence(...pieces: Piece[]): RecapSentence {
	return pieces.map((piece) => {
		if (typeof piece === 'string') return { text: piece };
		if (typeof piece === 'number') return { text: fmt(piece) };
		return { text: typeof piece.b === 'number' ? fmt(piece.b) : piece.b, strong: true };
	});
}
export function recapToPlain(value: RecapSentence | RecapSentence[]): string {
	const list = Array.isArray(value[0]) || value.length === 0 ? (value as RecapSentence[]) : [value as RecapSentence];
	return list.map((s) => s.map((part) => part.text).join('')).join(' ');
}

export const plural = (count: number, one: string, many = `${one}s`) => `${fmt(count)} ${count === 1 ? one : many}`;
/** "At the same age, the 5 earlier launches had a median of 124 photo opens." One earlier launch is "had 10 photo opens": a median of one is not a median. */
function earlierHad(count: number, value: string): RecapSentence {
	return count === 1
		? sentence('At the same age, the ', b('1 earlier launch'), ' had ', b(value), '.')
		: sentence('At the same age, the ', b(plural(count, 'earlier launch', 'earlier launches')), ' had a median of ', b(value), '.');
}
export function ordinal(n: number): string {
	const rest = n % 100;
	if (rest >= 11 && rest <= 13) return `${n}th`;
	return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}
export function formatDay(date: string): string {
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
/** "Sep 25" for one day, "Sep 25 to Oct 1" for a run of days. */
export function daysWords(first: string, last: string): string {
	return first === last ? formatDay(first) : `${formatDay(first)} to ${formatDay(last)}`;
}
function dayPhrase(day: number): string {
	return day === 0 ? 'the day it was published' : day === 1 ? 'the day after it was published' : `day ${day}`;
}

/** Complete days only. A partial or unavailable day is unknown, so it is never summed. */
function completeCount(day: LaunchDay, key: 'photoOpens' | 'downloads'): number | null {
	return day.coverage === 'complete' ? day[key] : null;
}
export function sumComplete(series: LaunchDay[], key: 'photoOpens' | 'downloads'): { total: number; gaps: number[] } {
	let total = 0;
	const gaps: number[] = [];
	series.forEach((day, i) => {
		const value = completeCount(day, key);
		if (value === null) gaps.push(day.day ?? i);
		else total += value;
	});
	return { total, gaps };
}

/** Opens or downloads added up over the first `days` complete days; null when the age is not reached or a day is not complete. */
export function cumulativeCount(launch: Pick<Launch, 'series'>, days: number, key: 'photoOpens' | 'downloads'): number | null {
	if (days < 1 || launch.series.length < days) return null;
	let total = 0;
	for (let i = 0; i < days; i += 1) {
		const value = completeCount(launch.series[i], key);
		if (value === null) return null;
		total += value;
	}
	return total;
}
export const cumulativeOpens = (launch: Pick<Launch, 'series'>, days: number) => cumulativeCount(launch, days, 'photoOpens');

/** Launches published before this one, leaving this album out. They are the comparison for any age. */
export function earlierLaunches(model: LaunchReadModel, album: Pick<Launch, 'albumKey' | 'firstPublishedAt'>): Launch[] {
	const at = Date.parse(album.firstPublishedAt);
	return model.launches.filter((launch) => launch.albumKey !== album.albumKey && Date.parse(launch.firstPublishedAt) < at);
}
export function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((x, y) => x - y);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * The launch immediately ahead of this one at day 3 or day 7: the smallest total that beats it,
 * newest first on a tie. Null when this album is first, is not ranked, or nothing beats it.
 */
export function launchAhead(model: LaunchReadModel, album: DatedLaunchAlbum, age: 'day3' | 'day7'): { name: string; total: number } | null {
	const mine = album.totals[age];
	if (!mine.complete || mine.photoOpens === null || album.rank[age].rank === null) return null;
	let best: Launch | null = null;
	for (const launch of model.launches) {
		const total = launch.totals[age];
		if (launch.albumKey === album.albumKey || !total.complete || total.photoOpens === null || total.photoOpens <= mine.photoOpens) continue;
		if (!best || total.photoOpens < best.totals[age].photoOpens!) best = launch;
	}
	return best ? { name: best.albumName ?? best.albumKey, total: best.totals[age].photoOpens! } : null;
}

function rankSentence(model: LaunchReadModel, album: DatedLaunchAlbum, age: 'day3' | 'day7', withTotal = false): RecapSentence | null {
	const rank: LaunchAgeRank = album.rank[age];
	const total = album.totals[age].photoOpens;
	if (rank.rank === null || total === null) return null;
	const days = age === 'day7' ? 7 : 3;
	const label = age === 'day7' ? 'a week-1 total' : 'a day-3 total';
	// Name the days the total covers and the date the ranking was made: launches published since can move a rank.
	const span = album.series.length >= days ? ` (${daysWords(album.series[0].date, album.series[days - 1].date)})` : '';
	const asOf = formatDay(model.today);
	const lead: Piece[] = withTotal ? [`In its first 3 days${span} it had `, b(plural(total, 'photo open')), ', '] : [`As of ${asOf}, over its first ${days} days${span} it is `];
	const tail = withTotal ? ` as of ${asOf}` : '';
	if (rank.compared <= 1) return sentence(...lead, 'the only launch with ', label, `${tail}, so there is nothing to rank it against yet.`);
	const place = rank.rank === 1
		? (rank.tied ? 'tied for first' : 'first')
		: `${rank.tied ? 'tied for ' : ''}${ordinal(rank.rank)}`;
	const ahead = rank.rank > 1 ? launchAhead(model, album, age) : null;
	return sentence(...lead, b(place), ' of the ', b(rank.compared), ' launches with ', label, tail, ahead ? `, behind ${ahead.name} (${fmt(ahead.total)}).` : '.');
}

function peakSentence(series: LaunchDay[], total: number, launchDated: boolean, ofWhat = 'the total'): RecapSentence | null {
	const counted = series.filter((day) => completeCount(day, 'photoOpens') !== null);
	// A day's share of a handful of opens says nothing, so small totals get no peak sentence.
	if (counted.length < 2 || total < 10) return null;
	const top = Math.max(...counted.map((day) => day.photoOpens as number));
	if (top <= 0) return null;
	const winners = counted.filter((day) => day.photoOpens === top);
	if (winners.length > 3) return sentence('No single day stood out: ', b(plural(winners.length, 'day')), ' tied at ', b(plural(top, 'open')), '.');
	const dates = winners.map((day) => formatDay(day.date));
	const share = Math.round((top / total) * 100);
	if (winners.length > 1) return sentence('The busiest days were ', dates.join(' and '), ', with ', b(plural(top, 'open')), ' each.');
	const day = winners[0];
	const when = launchDated && day.day !== null ? `, ${dayPhrase(day.day)}` : '';
	if (share >= 50) return sentence('Most of it came at once: ', b(plural(top, 'open')), ' on ', formatDay(day.date), when, ' (', b(`${share}%`), ` of ${ofWhat}).`);
	return sentence('The busiest day was ', formatDay(day.date), when, ', with ', b(plural(top, 'open')), '.');
}

type Photos = { list: LaunchPhoto[]; total: number; cut: boolean };
function photosOf(album: DatedLaunchAlbum | UndatedLaunchAlbum, ids: ReadonlySet<string>): Photos {
	// The activity list is cut at the read limit; counting from a cut list would understate it.
	return { list: album.photos.filter((photo) => ids.has(photo.photoId)), total: ids.size, cut: album.photos.length < album.photosWithActivity };
}

function openedSentence(photos: Photos): RecapSentence | null {
	const photoTotal = photos.total;
	if (photoTotal <= 0 || photos.cut) return null;
	const opened = photos.list.filter((photo) => photo.opens > 0).length;
	if (opened === 0) return sentence('None of the ', b(photoTotal), ' photos was opened.');
	if (opened >= photoTotal) return sentence('Every one of the ', b(photoTotal), ' photos was opened at least once.');
	return sentence(b(`${fmt(opened)} of the ${fmt(photoTotal)}`), opened === 1 ? ' photos was opened at least once.' : ' photos were opened at least once.');
}

/** Download requests in the first week (or so far), against the median of earlier launches at the same age. */
function downloadComparison(model: LaunchReadModel, launch: DatedLaunchAlbum): RecapSentence | null {
	const n = launch.series.length;
	if (n === 0) return null;
	const k = Math.min(n, 7);
	const mine = cumulativeCount(launch, k, 'downloads');
	if (mine === null) return null;
	const others = earlierLaunches(model, launch).flatMap((other) => { const value = cumulativeCount(other, k, 'downloads'); return value === null ? [] : [value]; });
	const mid = median(others);
	if (mid === null) return null;
	const count = plural(others.length, 'earlier launch', 'earlier launches');
	if (others.length === 1 && !(n > 7 && k === 7)) return earlierHad(1, String(mid));
	return n > 7 && k === 7
		? sentence(`In week 1 (${daysWords(launch.series[0].date, launch.series[6].date)}) that was `, b(mine), ', against a median of ', b(mid), ' for the ', count, '.')
		: sentence('At the same age, the ', count, ' had a median of ', b(mid), '.');
}

function downloadsLine(album: DatedLaunchAlbum | UndatedLaunchAlbum, photos: Photos, compare: RecapSentence | null = null, stored = false): RecapSentence | null {
	const { total, gaps } = sumComplete(album.series, 'downloads');
	if (!album.series.length) return null;
	// The days the count covers: every full day on the page, which is more than week 1 once the launch is older than a week.
	const span = daysWords(album.series[0].date, album.series.at(-1)!.date);
	const photoSum = photos.cut ? null : photos.list.reduce((sum, photo) => sum + photo.downloads, 0);
	const top = photos.cut ? null : Math.max(0, ...photos.list.map((photo) => photo.downloads));
	const compared: Piece[] = !gaps.length && compare ? [' ', ...compare.map((part): Piece => (part.strong ? { b: part.text } : part.text))] : [];
	if (total === 0 && !gaps.length) return sentence(`No download requests were made over ${span}.`, ...compared);
	const parts: Piece[] = [`Over ${span}, `, gaps.length ? 'at least ' : '', b(plural(total, 'download request')), ' ', gaps.length ? 'were counted on days with complete records. ' : 'were made.', ...compared, ' '];
	if (photoSum !== null && !gaps.length && total > photoSum) parts.push(`${fmt(photoSum)} named a photo and ${fmt(total - photoSum)} asked for the whole album. `);
	if (top === 0) parts.push('No single photo was requested, so there is no photo order to show.');
	else if (top !== null && top <= 3) parts.push('No single photo was requested more than ', b(plural(top, 'time')), ', so there are too few requests to tell which photos people want most.');
	else if (top !== null) parts.push(stored ? 'The album report lists the photos requested most.' : 'The photos below were requested most.');
	return sentence(...parts.filter((part) => part !== ''));
}

/** The days a series covers, in words. Arrivals are read over the same days as the series. */
function seriesSpan(series: LaunchDay[]): string {
	return series.length ? daysWords(series[0].date, series.at(-1)!.date) : 'the days counted';
}

function arrivalsLine(arrivals: ArrivalRow[] | null, span: string): RecapSentence | null {
	if (!arrivals) return null;
	const rows = arrivals.filter((row) => row.count > 0).sort((x, y) => y.count - x.count || x.source.localeCompare(y.source));
	if (!rows.length) return null;
	const total = rows.reduce((sum, row) => sum + row.count, 0);
	// Other launches' arrivals are not in the launch read model, so the only comparison is between this album's own tags.
	if (rows.length === 1) return sentence(`Over ${span}, `, b(plural(total, 'arrival')), ' came through tagged links, all from the tag "', rows[0].source, '". Arrivals that did not use a tagged link cannot be traced to a source.');
	const named = rows.slice(0, 3).map((row) => `${row.source} ${fmt(row.count)} (${Math.round((row.count / total) * 100)}%)`).join(', ');
	const more = rows.length > 3 ? `, and ${rows.length - 3} more` : '';
	return sentence(`Over ${span}, `, b(plural(total, 'arrival')), ' came through tagged links: ', named, more, '. Arrivals that did not use a tagged link cannot be traced to a source.');
}

function windowLine(series: LaunchDay[], currentDay: LaunchDay | null, today: string, weekFigures = false, omitToday = false): RecapSentence {
	const first = series[0]?.date;
	const last = series.at(-1)?.date;
	const week = series[6]?.date;
	const counted = first && last
		? weekFigures && week && week !== last
			? sentence('Week-1 figures use ', b('7 full days'), ', ', formatDay(first), ' to ', formatDay(week), '. The chart, downloads and photo counts use all ', b(plural(series.length, 'full day')), ', to ', formatDay(last), '. ')
			: sentence('Counts cover ', b(plural(series.length, 'full day')), ', ', first === last ? formatDay(first) : `${formatDay(first)} to ${formatDay(last)}`, '. ')
		: sentence('No full day is counted yet. ');
	if (omitToday) return counted.map((part, i) => (i === counted.length - 1 ? { ...part, text: part.text.trimEnd() } : part));
	const todayPart = currentDay
		? currentDay.photoOpens === null
			? sentence(`Today, ${formatDay(today)}, is still being recorded and is left out.`)
			: sentence(`Today, ${formatDay(today)}, is partial and left out: `, b(plural(currentDay.photoOpens, 'photo open')), ' so far.')
		: sentence(`Today, ${formatDay(today)}, is left out.`);
	return [...counted, ...todayPart];
}

function exposureLimit(album: DatedLaunchAlbum | UndatedLaunchAlbum): string {
	const { since, coverage } = album.exposure;
	if (coverage === 'none') {
		return since
			? `Which photos people saw but did not open was not recorded until ${formatDay(since)}, after these days.`
			: 'Which photos people saw but did not open has not been recorded.';
	}
	if (coverage === 'partial' && since) return `Which photos people saw but did not open is recorded only from ${formatDay(since)}.`;
	return '';
}

/** The Chicago calendar day (YYYY-MM-DD) of an instant. Day 0 of a launch is this day, not the UTC day. */
export function chicagoDate(instant: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}
/** The words every page uses for a first-publication date that was worked out afterwards from server logs, not recorded when the album was published. */
export const RECOVERED_DATE_WORDS = 'date recovered afterwards from a log';
export const recoveredTag = (basis: 'recorded' | 'inferred' | boolean): string => (basis === 'inferred' || basis === true ? ` (${RECOVERED_DATE_WORDS})` : '');
function publishedPhrase(album: Pick<Launch, 'firstPublishedAt' | 'basis'>): string {
	return `${formatDay(chicagoDate(album.firstPublishedAt))}${recoveredTag(album.basis)}`;
}

export function undatedReason(code: 'unobserved' | 'not_published' | 'no_record'): string {
	if (code === 'not_published') return 'This album is not published yet.';
	if (code === 'unobserved') return 'Its first publication was never observed, so there is no launch date.';
	return 'It was already public before records began, so there is no launch date.';
}

export function buildRecap(input: RecapInput): Recap {
	const { model, arrivals } = input;
	const album = model.album;
	const photos = photosOf(album, input.photoIds);
	const limits: string[] = [];
	const exposure = exposureLimit(album);
	if (exposure) limits.push(exposure);
	if (!arrivals?.some((row) => row.count > 0)) limits.push('Where people came from is only known for tagged links, and none were recorded.');
	limits.push('Counts are browser actions, not people.');

	if (album.status === 'no_launch_date') {
		const reason = undatedReason(album.reason.code);
		const { total, gaps } = sumComplete(album.series, 'photoOpens');
		const windowSentence = windowLine(album.series, album.currentDay, model.today, false, input.stored);
		if (album.reason.code === 'not_published') {
			return { state: 'not_published', eyebrow: 'Not published', published: null, headline: sentence(reason), sentences: [sentence('It gets a launch date when it is first published, and its first week is compared with earlier launches then.'), sentence('Only the signed-in owner can open this page for an album that is not published.')], window: windowSentence, downloads: null, arrivals: null, limits };
		}
		const sentences: RecapSentence[] = [];
		const headline = album.series.length && !gaps.length
			? sentence(b(plural(total, 'photo open')), ` in the last ${plural(album.series.length, 'full day')}. ${reason}`)
			: sentence(reason);
		sentences.push(sentence('With no launch date there is no earlier launch to compare it with.'));
		if (gaps.length) sentences.push(sentence('Records are incomplete for ', b(plural(gaps.length, 'day')), ', so no total is stated.'));
		const peak = peakSentence(album.series, total, false);
		if (peak && !gaps.length) sentences.push(peak);
		const opened = openedSentence(photos);
		if (opened) sentences.push(opened);
		return { state: 'no_launch_date', eyebrow: 'No launch date', published: null, headline, sentences: sentences.slice(0, 4), window: windowSentence, downloads: downloadsLine(album, photos, null, input.stored), arrivals: arrivalsLine(arrivals, seriesSpan(album.series)), limits };
	}

	const launch = album;
	const n = launch.series.length;
	const published = sentence(`Published ${publishedPhrase(launch)}.`);
	const weekFigures = launch.elapsedDays >= 7;
	const windowSentence = windowLine(launch.series, launch.currentDay, model.today, weekFigures, input.stored);
	const { total: opens, gaps } = sumComplete(launch.series, 'photoOpens');
	const earlier = earlierLaunches(model, launch);

	if (n === 0) {
		return {
			state: 'just_published', eyebrow: 'Published today', published,
			headline: sentence('No full day has passed, so there is nothing to compare yet.'),
			sentences: [sentence('The first full day closes at midnight, Chicago time.'), sentence('Photo opens counted today stay out of every total until the day is complete.')],
			window: windowSentence, downloads: null, arrivals: arrivalsLine(arrivals, seriesSpan(launch.series)), limits
		};
	}

	const sentences: RecapSentence[] = [];
	let state: RecapState;
	let eyebrow: string;
	let headline: RecapSentence;

	if (launch.elapsedDays < 7) {
		const midLaunch = n >= 3;
		state = midLaunch ? 'in_progress' : 'early';
		eyebrow = `Launch so far, day ${n}`;
		if (gaps.length) {
			headline = sentence('Records are incomplete for ', b(plural(gaps.length, 'day')), ', so the total so far is not stated.');
		} else {
			headline = sentence(b(plural(opens, 'photo open')), n === 1 ? ' in its first full day.' : ` in its first ${n} full days.`);
		}
		const atAge = gaps.length ? [] : earlier.flatMap((l) => { const v = cumulativeOpens(l, n); return v === null ? [] : [v]; });
		const mid = median(atAge);
		const rank = midLaunch && launch.totals.day3.complete ? rankSentence(model, launch, 'day3', n > 3) : null;
		if (!gaps.length) {
			if (mid !== null) sentences.push(earlierHad(atAge.length, plural(mid, 'photo open')));
			// A rank sentence that says there is nothing to compare with already says it; one is enough.
			else if (!rank) sentences.push(sentence(`No earlier launch has ${n === 1 ? 'a full day' : `${n} full days`} of complete records to compare with.`));
		}
		if (rank) sentences.push(rank);
	} else if (launch.totals.day7.complete) {
		state = 'finished';
		eyebrow = 'Week 1 recap';
		headline = sentence(b(plural(launch.totals.day7.photoOpens as number, 'photo open')), ' in its first week.');
		const atAge = earlier.flatMap((l) => { const v = cumulativeOpens(l, 7); return v === null ? [] : [v]; });
		const mid = median(atAge);
		const rank = rankSentence(model, launch, 'day7');
		if (mid !== null) sentences.push(earlierHad(atAge.length, plural(mid, 'photo open')));
		if (rank) sentences.push(rank);
	} else {
		state = 'finished_gap';
		eyebrow = 'Week 1 recap, incomplete records';
		const week = launch.series.slice(0, 7);
		const weekGaps = sumComplete(week, 'photoOpens').gaps;
		headline = sentence('The week-1 total cannot be stated: records are incomplete for ', b(plural(weekGaps.length, 'day')), '.');
		sentences.push(sentence('The complete days add up to ', b(plural(sumComplete(week, 'photoOpens').total, 'photo open')), ', which is less than the week.'));
		sentences.push(sentence('This launch is left out of the week-1 ranking, because a short total would look like a slow week.'));
	}

	if (state === 'finished') {
		const week = launch.series.slice(0, 7);
		const peak = peakSentence(week, launch.totals.day7.photoOpens as number, true, 'the week');
		if (peak) sentences.push(peak);
	} else if (state !== 'finished_gap' && !gaps.length) {
		const peak = peakSentence(launch.series, opens, true, input.stored ? `its first ${n} days` : 'the total so far');
		if (peak) sentences.push(peak);
	}
	const opened = openedSentence(photos);
	if (opened) sentences.push(opened);

	return { state, eyebrow, published, headline, sentences: sentences.slice(0, 4), window: windowSentence, downloads: downloadsLine(launch, photos, downloadComparison(model, launch), input.stored), arrivals: arrivalsLine(arrivals, seriesSpan(launch.series)), limits };
}
