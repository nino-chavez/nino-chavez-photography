import assert from 'node:assert/strict';
import test from 'node:test';
import type { Launch, LaunchAgeTotals, LaunchDay } from './launch-read-model.server';
import { surgeWords,
	buildHome, changeWords, lastOpenedNote, chicagoTime, COMPLETED_DAYS_CHECKED, HOME_LAUNCH_CARDS, incidentWords, JUST_FINISHED_DAYS, launchCard, launchPhase, nextRecaps,
	openingSentence, openProblems, QUIET_AFTER_DAYS, REFRESH_STALE_MS, sentenceText, siteFigures, sparkBars, sparkCaption, staleness, statusLabel, trailingGap, unsortedLine, weekLine,
	type Freshness, type HomeInput, type ProblemInput, type SiteReading, type WeekInput
} from './home';
import { minimumSample } from './intelligence-rules';
import { RECOVERED_ALL_NOTE, RECOVERED_NOTE } from './launch-recap';
import { NO_RECAP_DUE } from './launch-recap-list';
import { DATA_ANCHORS } from './data-anchors';

/*
 * Fixtures follow production on 2026-10-06 (read-only analytics_read_launch, conservative traffic): the daily
 * photo opens of seven launches, Chicago days from first publication. Re7kho (HS Girls VB - JCA at ACC,
 * inferred first publication Sep 25) opened 103 575 126 23 98 1 5 in week 1.
 */
const D = {
	fJKdsB: [749, 369, 49, 8, 61, 11, 11, 4, 3, 2, 1, 2, 1, 0],
	Re7kho: [103, 575, 126, 23, 98, 1, 5, 80, 5, 2, 1, 1, 3, 2],
	dKe567: [8, 5, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
	Big: [150, 300, 90, 40, 30, 15, 11, 2, 2, 0, 0, 0, 0, 0],
	DWdCET: [90, 106, 40, 12, 9, 6, 3, 2, 1, 0, 0, 0, 0, 0],
	Bump: [60, 30, 15, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0],
	jq1Rp7: [2, 3, 4, 5, 12, 6, 5, 1, 1, 0, 0, 0, 0, 0]
} as const;
type Key = keyof typeof D;
const START: Record<Key, string> = { fJKdsB: '2026-08-28', dKe567: '2026-08-25', Big: '2026-09-05', Bump: '2026-08-22', jq1Rp7: '2026-07-19', DWdCET: '2026-09-26', Re7kho: '2026-09-25' };
const NAMES: Record<Key, string> = {
	fJKdsB: 'HS Girls VB - JCA vs PNHS - 08-25-2026', Re7kho: 'HS Girls VB - JCA at ACC - 09-22-2026', dKe567: 'Fall Showcase', Big: 'Chicago Big Dig 2026',
	DWdCET: 'College Women\'s VB - Millikin at North Central - 09-23-2026', Bump: 'Bump Bash #5', jq1Rp7: 'Summer Open'
};

const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const gap = (cut: number[] | undefined, i: number) => (cut?.includes(i) ? 'partial' : 'complete') as LaunchDay['coverage'];

interface Cut { [key: string]: number[] }
/** Every launch in `keys` as the read model returns it on `asOfDay`: complete days only, ranks over launches that have a complete total at the age. */
function world(asOfDay: string, keys: readonly Key[], cut: Cut = {}, inferred: readonly Key[] = keys): Launch[] {
	const built = keys.filter((key) => START[key] <= asOfDay).map((key) => {
		const elapsed = Math.round((Date.parse(`${asOfDay}T12:00:00Z`) - Date.parse(`${START[key]}T12:00:00Z`)) / 86_400_000);
		const series: LaunchDay[] = D[key].slice(0, Math.min(14, elapsed)).map((opens, i) => {
			const coverage = gap(cut[key], i);
			return { day: i, date: addDays(START[key], i), photoOpens: coverage === 'complete' ? opens : null, downloads: coverage === 'complete' ? 1 : null, albumOpens: coverage === 'complete' ? 1 : null, coverage };
		});
		const totals = (n: number): LaunchAgeTotals => {
			const reached = series.length >= n;
			const complete = reached && series.slice(0, n).every((day) => day.coverage === 'complete');
			return { reached, complete, photoOpens: complete ? series.slice(0, n).reduce((s, day) => s + (day.photoOpens as number), 0) : null, downloads: complete ? 1 : null, albumOpens: complete ? 1 : null };
		};
		return { key, elapsed, series, day3: totals(3), day7: totals(7) };
	});
	const rank = (pick: 'day3' | 'day7', mine: number | null) => {
		const have = built.map((x) => x[pick].photoOpens).filter((v): v is number => v !== null);
		if (mine === null) return { rank: null, compared: have.length, tied: false };
		return { rank: 1 + have.filter((v) => v > mine).length, compared: have.length, tied: have.filter((v) => v === mine).length > 1 };
	};
	return built.map((x): Launch => ({
		albumKey: x.key, albumName: NAMES[x.key], firstPublishedAt: `${START[x.key]}T20:00:00Z`, basis: inferred.includes(x.key) ? 'inferred' : 'recorded',
		status: x.elapsed >= 7 ? 'finished' : 'in_progress', elapsedDays: x.elapsed, series: x.series, currentDay: null,
		totals: { day3: x.day3, day7: x.day7 }, rank: { day3: rank('day3', x.day3.photoOpens), day7: rank('day7', x.day7.photoOpens) }
	})).sort((x, y) => Date.parse(y.firstPublishedAt) - Date.parse(x.firstPublishedAt));
}
const ALL: readonly Key[] = ['fJKdsB', 'Re7kho', 'dKe567', 'Big', 'DWdCET', 'Bump', 'jq1Rp7'];
const NO_LAUNCHES: Launch[] = [];
const FRESH: Freshness = { incompleteDays: [], refreshedAt: null, checked: false };
const open = (launches: Launch[] | null, today: string, stale = staleness(FRESH, addDays(today, -1), `${today}T15:00:00Z`)) => openingSentence({ launches, stale, today });
const text = (value: ReturnType<typeof openingSentence>) => sentenceText(value.sentence);

test('production on October 6: the newest launch leads with its measure and its median, then that no new album came since Sep 26, the recovered date marked', () => {
	const launches = world('2026-10-06', ALL);
	const opening = open(launches, '2026-10-06');
	assert.equal(opening.state, 'quiet');
	// The like-for-like line of the newest launch, with the days its week covers.
	// The place, what it is a place in, and how far from the middle: a rank alone ("4th of 7") sounds mid-pack, and 266 is below the median of 381.
	assert.equal(text(opening), 'College Women\'s VB - Millikin at North Central finished its first week 4th of 7 launches, with 266 photo opens, below the usual 381 for earlier launches.');
	assert.equal(sentenceText(opening.then!), 'No new album since Sep 26*, 10 days ago.');
	// A recorded date carries no mark.
	assert.equal(sentenceText(open(world('2026-10-06', ALL, {}, []), '2026-10-06').then!), 'No new album since Sep 26, 10 days ago.');
	// The "days ago" count is computed from today, not from the window: a week later it says 17.
	assert.equal(sentenceText(open(world('2026-10-13', ALL), '2026-10-13').then!), 'No new album since Sep 26*, 17 days ago.');
});

test('a launch published today waits for its first full day', () => {
	const opening = open(world('2026-09-26', ['Big', 'DWdCET']), '2026-09-26');
	assert.equal(opening.state, 'published_today');
	assert.equal(text(opening), 'College Women\'s VB - Millikin at North Central was published today, and its first full day is counted tomorrow.');
});

test('a launch in its first 3 days: its opens so far, against what earlier launches had at the same age', () => {
	const launches = world('2026-09-27', ['fJKdsB', 'Re7kho', 'dKe567', 'Big', 'Bump', 'jq1Rp7']);
	const opening = open(launches, '2026-09-27');
	assert.equal(opening.state, 'first_days');
	// Re7kho has 2 complete days (103 + 575 = 678). Earlier launches at day 2: 1118, 13, 450, 90, 5 -> median 90.
	assert.equal(text(opening), 'HS Girls VB - JCA at ACC is on day 2 of 7 with 678 photo opens so far; earlier launches had a median of 90 by day 2.');
	// A gap day gives no total and says so, instead of a short number.
	const gapped = open(world('2026-09-27', ['fJKdsB', 'Re7kho'], { Re7kho: [1] }), '2026-09-27');
	assert.equal(text(gapped), 'HS Girls VB - JCA at ACC is on day 2 of 7, but a day in it has incomplete records, so no total is shown.');
	// With no earlier launch that has a complete record, it says there is nothing to compare with.
	assert.match(text(open(world('2026-09-27', ['Re7kho']), '2026-09-27')), /no earlier launch has a complete record to compare with\.$/);
});

test('a launch between day 3 and day 7: its total so far and its rank at day 3', () => {
	const launches = world('2026-09-29', ['fJKdsB', 'Re7kho', 'dKe567', 'Big', 'Bump', 'jq1Rp7']);
	const opening = open(launches, '2026-09-29');
	assert.equal(opening.state, 'running');
	// Re7kho: 4 complete days = 103+575+126+23 = 827. Day 3 total 804; the earlier launches' day 3 totals are 1167, 16, 540, 105, 9.
	assert.equal(text(opening), 'HS Girls VB - JCA at ACC is on day 4 of 7 with 827 photo opens so far, 2nd of 6 launches at day 3.');
});

test('a launch that just finished: its rank at day 7', () => {
	const launches = world('2026-10-02', ['fJKdsB', 'Re7kho', 'dKe567', 'Big', 'Bump', 'jq1Rp7']);
	const opening = open(launches, '2026-10-02');
	assert.equal(opening.state, 'just_finished');
	assert.equal(text(opening), 'HS Girls VB - JCA at ACC finished its first week 2nd of 6 launches, with 931 photo opens, above the usual 125 for earlier launches.');
	// Alone with a week, there is no rank to state.
	assert.equal(text(open(world('2026-10-02', ['Re7kho']), '2026-10-02')), 'HS Girls VB - JCA at ACC finished its first week; no other launch has a complete first week to compare with.');
	// A tie says tie.
	const tied = world('2026-10-02', ['Re7kho', 'Big']).map((launch) => ({ ...launch, rank: { ...launch.rank, day7: { rank: 1, compared: 2, tied: true } } }));
	assert.match(text(open(tied, '2026-10-02')), /finished its first week tied for 1st of 2 launches, with \d+ photo opens, (above|below|level with) the \d+ of the 1 earlier launch\.$/);
});

test('a launch that finished with a day missing says so and states no total or rank', () => {
	const opening = open(world('2026-10-02', ['fJKdsB', 'Re7kho'], { Re7kho: [3] }), '2026-10-02');
	assert.equal(opening.state, 'just_finished');
	assert.equal(text(opening), 'HS Girls VB - JCA at ACC finished its first week, but a day in it has incomplete records, so no total or rank is shown.');
});

test('two launches overlapping: October 2, one finished its week and one is on day 6', () => {
	const opening = open(world('2026-10-02', ALL), '2026-10-02');
	assert.equal(opening.state, 'overlapping');
	// DWdCET: 6 complete days = 90+106+40+12+9+6 = 263.
	assert.equal(text(opening), 'Two launches are in play: College Women\'s VB - Millikin at North Central is on day 6 of 7, and HS Girls VB - JCA at ACC finished its first week in 2nd place of 6 launches.');
	// Two in progress at once.
	const both = open(world('2026-09-28', ['Re7kho', 'DWdCET']), '2026-09-28');
	assert.equal(both.state, 'overlapping');
	assert.match(text(both), /is on day 2 of 7, and .* is on day 3 of 7\.$/);
	// A launch just past its week does not overlap with an older quiet one.
	assert.equal(open(world('2026-10-02', ['Re7kho', 'fJKdsB']), '2026-10-02').state, 'just_finished');
});

test('quiet or finished: the edge is the QUIET_AFTER_DAYS constant, and the card status follows the same one', () => {
	assert.equal(QUIET_AFTER_DAYS, 7 + JUST_FINISHED_DAYS);
	for (const [asOf, expected] of [['2026-10-04', 'just_finished'], ['2026-10-05', 'just_finished'], ['2026-10-06', 'quiet']] as const) {
		// Re7kho's first publication is Sep 25, so these are days 9, 10 and 11... check by the launch itself.
		const launches = world(asOf, ['Re7kho', 'fJKdsB']);
		const re = launches.find((launch) => launch.albumKey === 'Re7kho')!;
		assert.equal(open(launches, asOf).state, re.elapsedDays < QUIET_AFTER_DAYS ? 'just_finished' : 'quiet', `${asOf} (elapsed ${re.elapsedDays})`);
		if (asOf === '2026-10-06') assert.equal(expected, 'quiet');
	}
	const at = (elapsedDays: number) => ({ elapsedDays });
	assert.deepEqual([0, 1, 6, 7, 9, 10, 40].map((n) => statusLabel(at(n))), ['Published today', 'Day 1 of 7', 'Day 6 of 7', 'Day 7 reached', 'Day 7 reached', 'Finished', 'Finished']);
	assert.deepEqual([0, 1, 6, 7, 9, 10].map((n) => launchPhase(at(n))), ['published_today', 'running', 'running', 'week_reached', 'week_reached', 'finished']);
	// The sentence state and the card status agree on the last day of "just finished" and the first day of "quiet".
	const last = QUIET_AFTER_DAYS - 1;
	assert.equal(statusLabel(at(last)), 'Day 7 reached');
	assert.equal(statusLabel(at(QUIET_AFTER_DAYS)), 'Finished');
});

test('no launch ever, and an empty gallery that is also unreadable', () => {
	assert.equal(text(open([], '2026-10-06')), 'No album has a launch date yet. An album gets one when it is first published.');
	assert.equal(open([], '2026-10-06').state, 'no_launches');
});

test('unavailable data is said first and is not a quiet day', () => {
	const opening = open(null, '2026-10-06');
	assert.equal(opening.state, 'unavailable');
	assert.equal(text(opening), 'Launch numbers could not be read just now. This is not a quiet day.');
});

test('stale data leads the sentence and never reads as quiet, whatever the launches say', () => {
	const today = '2026-10-06';
	const launches = world(today, ALL);
	// The last complete day, Oct 5, and the day before it are incomplete: numbers stop at Oct 3.
	const gapStale = staleness({ incompleteDays: ['2026-10-04', '2026-10-05'], refreshedAt: null, checked: false }, '2026-10-05', `${today}T15:00:00Z`);
	assert.deepEqual(gapStale, { kind: 'gap', lastGood: '2026-10-03', firstMissing: '2026-10-04' });
	const a = open(launches, today, gapStale);
	assert.equal(a.state, 'stale');
	assert.equal(text(a), 'Counts stop at Oct 3: the days since are incomplete, so this is a gap in the records, not a quiet gallery.');
	// A late refresh of the current day.
	const late = staleness({ incompleteDays: [], refreshedAt: '2026-10-06T12:00:00Z', checked: true }, '2026-10-05', '2026-10-06T14:00:00Z');
	assert.equal(late.kind, 'refresh_late');
	assert.equal(text(open(launches, today, late)), 'The gallery counts were last refreshed at 7:00 AM Chicago time, so recent activity may be missing; this is not a quiet day.');
	// A refresh time that cannot be read is unknown, not current.
	const unknown = staleness({ incompleteDays: [], refreshedAt: null, checked: true }, '2026-10-05', '2026-10-06T14:00:00Z');
	assert.equal(unknown.kind, 'refresh_unknown');
	assert.equal(text(open(launches, today, unknown)), 'Whether the gallery counts are current could not be checked, so this is not a quiet day.');
	// Staleness beats a launch in progress as well.
	const running = world('2026-09-29', ['fJKdsB', 'Re7kho']);
	for (const stale of [gapStale, late, unknown]) {
		const opening = open(running, '2026-09-29', stale);
		assert.equal(opening.state, 'stale');
		assert.doesNotMatch(text(opening), /No new album|nothing else is moving|is on day/i);
	}
	// Unavailable beats stale.
	assert.equal(openingSentence({ launches: null, stale: gapStale, today }).state, 'unavailable');
});

test('a refresh is late only past the limit; an old incomplete day that is not the latest is not a stop', () => {
	const now = '2026-10-06T15:00:00Z';
	const at = (ms: number) => new Date(Date.parse(now) - ms).toISOString();
	assert.equal(staleness({ incompleteDays: [], refreshedAt: at(REFRESH_STALE_MS), checked: true }, '2026-10-05', now).kind, 'fresh');
	assert.equal(staleness({ incompleteDays: [], refreshedAt: at(REFRESH_STALE_MS + 1000), checked: true }, '2026-10-05', now).kind, 'refresh_late');
	assert.equal(staleness({ incompleteDays: ['2026-10-02'], refreshedAt: at(60_000), checked: true }, '2026-10-05', now).kind, 'fresh');
	// 00:10 Chicago on Oct 6 (05:10Z): the last refresh was 23:30 on Oct 5 (04:30Z), 40 minutes ago. The new day having no refresh yet is not staleness.
	assert.equal(staleness({ incompleteDays: [], refreshedAt: '2026-10-06T04:30:00Z', checked: true }, '2026-10-05', '2026-10-06T05:10:00Z').kind, 'fresh');
	assert.equal(staleness({ incompleteDays: [], refreshedAt: '2026-10-06T04:30:00Z', checked: true }, '2026-10-05', '2026-10-06T06:10:00Z').kind, 'refresh_late');
	assert.deepEqual(trailingGap(['2026-10-02', '2026-10-04', '2026-10-05'], '2026-10-05'), ['2026-10-04', '2026-10-05']);
	assert.deepEqual(trailingGap(['2026-10-02'], '2026-10-05'), []);
});

test('no sentence on Home claims a recap was sent, emailed or delivered; the opening and cards do not mention recaps at all', () => {
	const sentences: string[] = [];
	for (const asOf of ['2026-09-26', '2026-09-27', '2026-09-29', '2026-10-02', '2026-10-06']) sentences.push(text(open(world(asOf, ALL), asOf)));
	for (const line of sentences) assert.doesNotMatch(line, /recap|sent|ready|delivered/i, line);
	for (const asOf of ['2026-09-26', '2026-09-27', '2026-09-30', '2026-10-02']) {
		const next = nextRecaps(world(asOf, ALL), new Date(`${asOf}T15:00:00Z`));
		for (const line of [next.text, ...next.items]) assert.doesNotMatch(line, /\b(sent|emailed|delivered|ready|stored)\b/i, line);
	}
});

test('the week line compares the last 7 complete days with the 7 before, and says when it cannot', () => {
	const week: WeekInput = { window: { start: '2026-09-29', end: '2026-10-05' }, previous: { start: '2026-09-22', end: '2026-09-28' }, current: 396, previousTotal: 3102, coverage: 'complete', previousCoverage: 'complete' };
	assert.equal(sentenceText(weekLine(week, '2026-10-06', NO_LAUNCHES)!), 'Gallery photo opens, Sep 29 – Oct 5: 396, down 87% from 3,102 in the 7 days before (Sep 22 – 28).');
	assert.equal(sentenceText(weekLine({ ...week, current: 100, previousTotal: 0 }, '2026-10-06', NO_LAUNCHES)!), 'Gallery photo opens, Sep 29 – Oct 5: 100, against 0 in the 7 days before (Sep 22 – 28).');
	assert.equal(sentenceText(weekLine({ ...week, current: 5, previousTotal: 5 }, '2026-10-06', NO_LAUNCHES)!), 'Gallery photo opens, Sep 29 – Oct 5: 5, the same as 5 in the 7 days before (Sep 22 – 28).');
	assert.equal(sentenceText(weekLine({ ...week, previousCoverage: 'partial', previousTotal: null }, '2026-10-06', NO_LAUNCHES)!), 'Gallery photo opens, Sep 29 – Oct 5: 396, with nothing to compare it with: the 7 days before (Sep 22 – 28) have incomplete records.');
	assert.equal(sentenceText(weekLine({ ...week, coverage: 'partial', current: null }, '2026-10-06', NO_LAUNCHES)!), 'Gallery photo opens, Sep 29 – Oct 5: not stated: a day in it has incomplete records, so a short total is not shown.');
	assert.match(sentenceText(weekLine(null, '2026-10-06', NO_LAUNCHES)!), /could not be read\. No number is shown rather than a wrong one\.$/);
	assert.equal(changeWords(1001, 1000), 'up less than 1% from');
	// Below the intelligence rules' sample of 20 in either period, two plain counts, never a percentage.
	assert.equal(minimumSample, 20);
	assert.equal(changeWords(10, 4), 'against');
	assert.equal(changeWords(4, 2), 'against');
	assert.equal(changeWords(19, 40), 'against');
	assert.equal(changeWords(40, 19), 'against');
	assert.equal(changeWords(2, 0), 'against');
	assert.equal(changeWords(20, 40), 'down 50% from');
	assert.equal(changeWords(40, 20), 'up 100% from');
	assert.equal(changeWords(5, 5), 'the same as');
});

test('a card says what it is, and each number says what it is compared with', () => {
	const launches = world('2026-10-02', ALL);
	const day7 = launchCard(launches.find((l) => l.albumKey === 'Re7kho')!, launches, '2026-10-02', 'cf-id');
	assert.equal(day7.status, 'Day 7 reached');
	assert.equal(day7.published, 'First published Sep 25*');
	assert.equal(day7.opens, '931 photo opens in week 1');
	assert.equal(day7.comparison, '2nd of 6 launches at day 7.');
	assert.equal(day7.cover, 'cf-id');
	const day6 = launchCard(launches.find((l) => l.albumKey === 'DWdCET')!, launches, '2026-10-02', null);
	assert.equal(day6.status, 'Day 6 of 7');
	assert.equal(day6.opens, '263 photo opens so far');
	assert.equal(day6.comparison, '4th of 7 launches at day 3.');
	assert.equal(day6.cover, null);
	const early = world('2026-09-27', ['fJKdsB', 'Re7kho']);
	const day2 = launchCard(early.find((l) => l.albumKey === 'Re7kho')!, early, '2026-09-27', null);
	assert.equal(day2.comparison, 'Earlier launches had a median of 1,118 by day 2.');
	const today = world('2026-09-26', ['DWdCET']);
	assert.deepEqual([launchCard(today[0], today, '2026-09-26', null).status, launchCard(today[0], today, '2026-09-26', null).opens], ['Published today', 'No complete day yet']);
	// A week with a gap states neither a total nor a rank.
	const holed = world('2026-10-02', ['fJKdsB', 'Re7kho'], { Re7kho: [3] });
	const card = launchCard(holed.find((l) => l.albumKey === 'Re7kho')!, holed, '2026-10-02', null);
	assert.equal(card.opens, 'Week 1 total not shown: a day has incomplete records');
	assert.equal(card.comparison, 'No rank at day 7: a day in it has incomplete records.');
});

test('the sparkline draws a day with incomplete records as a gap, never a zero, and has a text name', () => {
	const launches = world('2026-10-02', ['Re7kho'], { Re7kho: [3] });
	const { bars, label } = sparkBars(launches[0].series);
	assert.equal(bars.length, 7);
	assert.deepEqual(bars.map((bar) => bar.state), ['value', 'value', 'value', 'gap', 'value', 'value', 'value']);
	assert.equal(bars[3].opens, null);
	assert.equal(bars[3].height, 0);
	assert.equal(bars[1].height, 1);
	assert.match(label, /day 4, incomplete records/);
	assert.match(label, /day 2, 575/);
	// A genuine zero is a value, not a gap.
	const zero = sparkBars([{ day: 0, date: '2026-10-01', photoOpens: 0, downloads: 0, albumOpens: 0, coverage: 'complete' }]);
	assert.equal(zero.bars[0].state, 'value');
	assert.equal(zero.bars[0].opens, 0);
	// Days that have not happened are not counted.
	const young = sparkBars(world('2026-09-28', ['Re7kho'])[0].series);
	assert.deepEqual(young.bars.map((bar) => bar.state), ['value', 'value', 'value', 'future', 'future', 'future', 'future']);
	assert.equal(sparkBars([]).label, 'Daily photo opens: no complete day yet.');
});

const at = (asOfDay: string, time = '15:00:00Z') => new Date(`${asOfDay}T${time}`);

test('next: each launch\'s day 3 and day 7 recap with the date and 8:00 AM Chicago time they are due, soonest first', () => {
	// Re7kho first published Sep 25 (Chicago): day 3 is due Sep 28, day 7 Oct 2. DWdCET: Sep 29 and Oct 3.
	const early = nextRecaps(world('2026-09-27', ['Re7kho', 'DWdCET']), at('2026-09-27'));
	assert.equal(early.text, 'Due next');
	assert.deepEqual(early.items, [
		'HS Girls VB - JCA at ACC: day 3 recap is due Mon, Sep 28 at 8:00 AM Chicago time.',
		'College Women\'s VB - Millikin at North Central: day 3 recap is due Tue, Sep 29 at 8:00 AM Chicago time.',
		'HS Girls VB - JCA at ACC: day 7 recap is due Fri, Oct 2 at 8:00 AM Chicago time.',
		'College Women\'s VB - Millikin at North Central: day 7 recap is due Sat, Oct 3 at 8:00 AM Chicago time.'
	]);
	// A recap whose time has come is read on its album report, so it drops off this line; the later one stays.
	const mid = nextRecaps(world('2026-09-29', ['Re7kho']), at('2026-09-29'));
	assert.deepEqual(mid.items, ['HS Girls VB - JCA at ACC: day 7 recap is due Fri, Oct 2 at 8:00 AM Chicago time.']);
});

test('next: nothing to come says so, and never tells a visitor about a recap that is due and not there', () => {
	assert.deepEqual(nextRecaps(world('2026-10-06', ALL), at('2026-10-06')), { text: NO_RECAP_DUE, items: [] });
	assert.equal(NO_RECAP_DUE, 'No recap is due. Publishing an album schedules its day 3 and day 7 recaps.');
	assert.deepEqual(nextRecaps(world('2026-10-06', ['Re7kho']), at('2026-10-06')).items, []);
	// Day 3's 08:00 has passed on Sep 28 at 09:00; only day 7 is still to come.
	assert.deepEqual(nextRecaps(world('2026-09-28', ['Re7kho']), at('2026-09-28', '14:00:00Z')).items.length, 1);
});

test('the site line names its measures, compares each with the 7 days before, and keeps one failure to itself', () => {
	const reach: SiteReading = { available: true, start: '2026-09-29', end: '2026-10-05', current: 730, previous: 658 };
	const contacts: SiteReading = { available: true, start: '2026-09-29', end: '2026-10-05', current: 0, previous: 2 };
	const both = siteFigures(reach, contacts, '2026-10-06');
	assert.equal(both.reach.label, 'Page loads on ninochavez.co (Cloudflare)');
	assert.equal(both.reach.value, '730');
	assert.equal(both.reach.detail, 'Sep 29 – Oct 5, up 11% from 658 in the 7 days before.');
	assert.equal(both.contacts.label, 'Contact links clicked');
	assert.equal(both.contacts.detail, 'Sep 29 – Oct 5, against 2 in the 7 days before. These are links opened, not messages sent.');
	// A provider that is unavailable says so in its own figure; the other is untouched.
	const down = siteFigures({ available: false, reason: 'Cloudflare Web Analytics could not be read. No traffic total is shown.' }, contacts, '2026-10-06');
	assert.equal(down.reach.value, null);
	assert.equal(down.reach.detail, 'Cloudflare Web Analytics could not be read. No traffic total is shown.');
	assert.equal(down.contacts.value, '0');
	// No comparison is invented when the week before could not be read.
	assert.match(siteFigures({ ...reach, previous: null }, contacts, '2026-10-06').reach.detail, /nothing to compare it with\.$/);
});

test('open problems: none when everything is current, and each cause links to where it can be looked into', () => {
	const base: ProblemInput = { freshness: { incompleteDays: [], refreshedAt: '2026-10-06T14:40:00Z', checked: true }, lastCompleteDay: '2026-10-05', now: '2026-10-06T15:00:00Z', today: '2026-10-06', launchesRead: true, weekRead: true, incidents: [], diagnostics: [], siteActionsStale: null, rejections: null };
	assert.deepEqual(openProblems(base), []);
	const coverage = openProblems({ ...base, freshness: { ...base.freshness, incompleteDays: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'] } });
	assert.equal(coverage.length, 1);
	assert.equal(coverage[0].href, 'coverage');
	assert.match(coverage[0].text, /^Records are incomplete for 5 completed days of the last 7 \(Oct 2, Oct 3, Oct 4, Oct 5 and 1 earlier\)\./);
	assert.equal(COMPLETED_DAYS_CHECKED, 7);
	const late = openProblems({ ...base, freshness: { ...base.freshness, refreshedAt: '2026-10-06T12:00:00Z' } });
	assert.deepEqual(late.map((p) => p.id), ['refresh-late']);
	assert.equal(late[0].href, 'coverage');
	// The opening sentence already gives the refresh time; the problem says only what it adds.
	assert.equal(late[0].text, 'The gallery counts normally refresh every 30 minutes, and the last refresh is late.');
	assert.doesNotMatch(late[0].text, /Chicago time/);
	const incidents = openProblems({ ...base, incidents: ['collection-health-provider_delivery_failures', 'search-failures', 'download-failed', 'render-x', 'odd'] });
	assert.deepEqual(incidents.map((p) => p.text), [
		'A data collection check is failing. This incident is open.',
		'Gallery searches are failing for visitors. This incident is open.',
		'Download requests are failing for visitors. This incident is open.',
		'2 more open incidents.'
	]);
	assert.ok(incidents.every((p) => p.href === 'status'));
	// A check that could not run is a problem of its own, never an absent one.
	assert.deepEqual(openProblems({ ...base, incidents: null }).map((p) => p.id), ['incidents-unreadable']);
	assert.deepEqual(openProblems({ ...base, diagnostics: null }).map((p) => p.id), ['delivery-unknown']);
	assert.deepEqual(openProblems({ ...base, diagnostics: [{ type: 'delivery_health_unavailable', status: 'failed', count: 1 }] }).map((p) => p.id), ['delivery-unknown']);
	assert.deepEqual(openProblems({ ...base, diagnostics: [{ type: 'provider_delivery_failures', status: 'failed', count: 3 }, { type: 'provider_delivery_overdue', status: 'failed', count: 12 }] }).map((p) => p.text), [
		'3 events could not be delivered to the analytics provider.',
		'12 events are waiting for delivery to the analytics provider, longer than expected.'
	]);
	assert.deepEqual(openProblems({ ...base, launchesRead: false, weekRead: false }).map((p) => p.id), ['launches-unreadable', 'week-unreadable']);
	const site = openProblems({ ...base, siteActionsStale: { refreshedAt: '2026-10-05T03:00:00Z' } });
	assert.equal(site[0].href, 'site-measures');
	assert.equal(site[0].text, 'Site action counts were last refreshed at Oct 4, 10:00 PM Chicago time, so recent clicks may be missing.');
	// The words for an incident never come from the finding's own text, so no album name can reach the page.
	assert.equal(incidentWords('download-failed-for-Re7kho'), 'Download requests are failing for visitors');
});

test('a refusal surge is a problem, said by what the refusals were; events that could not be stored are their own', () => {
	const base: ProblemInput = { freshness: { incompleteDays: [], refreshedAt: '2026-10-06T14:40:00Z', checked: true }, lastCompleteDay: '2026-10-05', now: '2026-10-06T15:00:00Z', today: '2026-10-06', launchesRead: true, weekRead: true, incidents: [], diagnostics: [], siteActionsStale: null, rejections: null };
	const reading = { day: '2026-10-05', count: 20528, usual: 412, surge: true, crawler: 0, unstored: 0, notRecorded: 20528, other: 0 };
	// The real Oct 5: counted before reasons were kept.
	const before = openProblems({ ...base, rejections: reading });
	assert.deepEqual(before.map((p) => [p.id, p.href]), [['collection-surge', 'delivery']]);
	assert.equal(before[0].text, 'The gallery’s counter rejected 20,528 events on Oct 5, 50 times its usual 412 a day. Their reasons were not recorded, because they were counted before reasons were kept.');
	// Some counted before reasons were kept, the rest with a reason.
	assert.equal(surgeWords({ ...reading, crawler: 20000, notRecorded: 528 }), 'The gallery’s counter rejected 20,528 events on Oct 5, 50 times its usual 412 a day. 20,000 came from known crawlers, which it rejects on purpose. The reasons for 528 of them were not recorded, because they were counted before reasons were kept.');
	// A crawler-only surge is still reported, and says nothing was lost.
	assert.equal(surgeWords({ ...reading, crawler: 20528, notRecorded: 0 }), 'The gallery’s counter rejected 20,528 events on Oct 5, 50 times its usual 412 a day. All came from known crawlers, which it rejects on purpose. No visitor events were lost.');
	assert.equal(surgeWords({ ...reading, usual: 0, crawler: 20000, notRecorded: 0, other: 528 }), 'The gallery’s counter rejected 20,528 events on Oct 5, when it usually rejects none. 20,000 came from known crawlers, which it rejects on purpose. 528 were not valid or named an album or photo that does not exist.');
	// Events that could not be stored are a problem with or without a surge.
	const lost = openProblems({ ...base, rejections: { ...reading, count: 3, surge: false, notRecorded: 0, unstored: 3 } });
	assert.deepEqual(lost.map((p) => p.text), ['3 events could not be stored on Oct 5. The browser retries each one once, so some may have been stored on the retry.']);
	assert.deepEqual(openProblems({ ...base, rejections: { ...reading, surge: false } }), []);
});

test('chicagoTime is Chicago time on any day', () => {
	assert.equal(chicagoTime('2026-10-06T13:40:00Z', '2026-10-06'), '8:40 AM');
	assert.equal(chicagoTime('2026-10-05T03:00:00Z', '2026-10-06'), 'Oct 4, 10:00 PM');
});

const baseInput = (asOfDay: string, keys: readonly Key[], over: Partial<HomeInput> = {}): HomeInput => ({
	asOf: `${asOfDay}T15:00:00Z`, today: asOfDay, lastCompleteDay: addDays(asOfDay, -1), launches: world(asOfDay, keys),
	covers: new Map([['Re7kho', 'cover-re']]), week: { window: { start: addDays(asOfDay, -7), end: addDays(asOfDay, -1) }, previous: { start: addDays(asOfDay, -14), end: addDays(asOfDay, -8) }, current: 1, previousTotal: 2, coverage: 'complete', previousCoverage: 'complete' }, freshness: { incompleteDays: [], refreshedAt: `${asOfDay}T14:45:00Z`, checked: true },
	siteReach: { available: false, reason: 'x' }, siteContacts: { available: false, reason: 'y' }, siteActionsStale: null, incidents: [], diagnostics: [], rejections: null, findings: [], findingsCheckedAt: null, ...over
});

test('Home: three cards, newest first, the rest behind a link; the quiet gallery has nothing due and no problem', () => {
	const view = buildHome(baseInput('2026-10-06', ALL));
	assert.equal(view.state, 'quiet');
	assert.equal(HOME_LAUNCH_CARDS, 3);
	assert.deepEqual(view.cards.map((card) => card.albumKey), ['DWdCET', 'Re7kho', 'Big']);
	assert.equal(view.moreLaunches, 4);
	assert.equal(view.totalLaunches, 7);
	assert.equal(view.cards[1].cover, 'cover-re');
	assert.equal(view.cards[0].cover, null);
	assert.deepEqual(view.cards.map((card) => card.status), ['Finished', 'Finished', 'Finished']);
	assert.equal(view.next.text, NO_RECAP_DUE);
	assert.deepEqual(view.next.items, []);
	assert.deepEqual(view.problems, []);
});

test('Home: a launch in progress lists what is due, and unreadable launches say what cannot be said', () => {
	const view = buildHome(baseInput('2026-09-30', ['Re7kho', 'Big']));
	assert.equal(view.state, 'running');
	assert.deepEqual(view.next.items, ['HS Girls VB - JCA at ACC: day 7 recap is due Fri, Oct 2 at 8:00 AM Chicago time.']);
	const down = buildHome(baseInput('2026-10-06', ALL, { launches: null }));
	assert.equal(down.state, 'unavailable');
	assert.deepEqual(down.cards, []);
	assert.equal(down.next.text, 'What is due cannot be said while the launch numbers are unavailable.');
	assert.deepEqual(down.problems.map((p) => p.id), ['launches-unreadable']);
});

test('the week line is shown only for two weeks that are alike; a launch week in either window leaves it out', () => {
	const week: WeekInput = { window: { start: '2026-09-29', end: '2026-10-05' }, previous: { start: '2026-09-22', end: '2026-09-28' }, current: 384, previousTotal: 1451, coverage: 'complete', previousCoverage: 'complete' };
	const jca = world('2026-10-06', ['Re7kho'])[0]; // first week Sep 25 - Oct 1: touches both windows
	const millikin = world('2026-10-06', ['DWdCET'])[0]; // Sep 26 - Oct 2: both windows
	const big = world('2026-10-06', ['Big'])[0]; // Sep 5 - Sep 11: neither
	const late = world('2026-10-06', ['DWdCET']).map((l) => ({ ...l, albumKey: 'Late', albumName: 'Late Launch - 10-01-2026', firstPublishedAt: '2026-10-01T20:00:00Z' }))[0]; // Oct 1 - Oct 7: current only
	const early = world('2026-10-06', ['DWdCET']).map((l) => ({ ...l, albumKey: 'Early', albumName: 'Early Launch - 09-14-2026', firstPublishedAt: '2026-09-14T20:00:00Z' }))[0]; // Sep 14 - Sep 20: neither window
	const prevOnly = { ...early, albumKey: 'Prev', albumName: 'Previous Only - 09-17-2026', firstPublishedAt: '2026-09-17T20:00:00Z' }; // Sep 17 - Sep 23: previous window only (Sep 22, 23)
	const line = (launches: Launch[] | null) => { const value = weekLine(week, '2026-10-06', launches); return value === null ? null : sentenceText(value); };
	// No launch in either window: a plain comparison.
	assert.equal(line([big, early]), 'Gallery photo opens, Sep 29 – Oct 5: 384, down 74% from 1,451 in the 7 days before (Sep 22 – 28).');
	assert.equal(line([]), 'Gallery photo opens, Sep 29 – Oct 5: 384, down 74% from 1,451 in the 7 days before (Sep 22 – 28).');
	// A launch week in the previous window, the current window, both, or the same ones in both (production today): no line at all.
	for (const launches of [[prevOnly, big], [late, big], [late, prevOnly], [millikin, jca, big]]) assert.equal(line(launches), null);
	// Launch dates that could not be read: nothing says the windows are alike, so no change is stated.
	assert.equal(line(null), 'Gallery photo opens, Sep 29 – Oct 5: 384. The 7 days before (Sep 22 – 28) had 1,451. Launch dates could not be read, so no change is stated.');
	// A number that could not be read is still said: unknown is never left out.
	assert.match(sentenceText(weekLine(null, '2026-10-06', [big])!), /could not be read/);
	assert.match(sentenceText(weekLine({ ...week, coverage: 'partial' }, '2026-10-06', [millikin])!), /not stated/);
	// Day 6 is inside the first week; day 7 is not.
	const edge = (day0: string) => ({ ...big, firstPublishedAt: `${day0}T20:00:00Z`, albumName: 'Edge', albumKey: 'Edge' });
	assert.equal(line([edge('2026-09-16')]), null, 'Sep 16 + 6 = Sep 22 is the first day of the earlier window');
	assert.notEqual(line([edge('2026-09-15')]), null, 'Sep 15 + 6 = Sep 21 is before it');
	assert.notEqual(line([edge('2026-10-06')]), null, 'a launch published today starts after the window ends');
	assert.equal(line([edge('2026-10-05')]), null, 'a launch published on the last day of the window is in it');
});

test('"No one has opened a photo since" is computed from every complete day, and only when the days after it are complete and zero', () => {
	// Millikin on Oct 6: days Sep 26 to Oct 5 are complete (10 of them), 90 106 40 12 9 6 3 2 1 0. The last open day is Oct 4 (day 8, 1 open): the days after it hold none.
	const millikin = world('2026-10-06', ['DWdCET'])[0];
	assert.equal(lastOpenedNote(millikin, '2026-10-05'), 'No one has opened a photo since Oct 4 (complete days, through Oct 5).');
	// Not inferred from a few quiet days at the end: with an open on the final complete day there is no such claim.
	const active = { ...millikin, series: millikin.series.map((day, i, all) => (i === all.length - 1 ? { ...day, photoOpens: 2 } : day)) };
	assert.equal(lastOpenedNote(active, '2026-10-05'), null);
	// A day with incomplete records after the last open day is not a quiet day.
	const holed = { ...millikin, series: millikin.series.map((day, i, all) => (i === all.length - 1 ? { ...day, photoOpens: null, coverage: 'partial' as const } : day)) };
	assert.equal(lastOpenedNote(holed, '2026-10-05'), null);
	// A series that stops before the last complete day says nothing about the days since.
	assert.equal(lastOpenedNote({ ...millikin, series: millikin.series.slice(0, 8) }, '2026-10-05'), null);
	// A launch inside its first week has no such note.
	assert.equal(lastOpenedNote({ ...millikin, elapsedDays: 6 }, '2026-10-05'), null);
	// A launch with no open day at all makes no claim about "since".
	assert.equal(lastOpenedNote({ ...millikin, series: millikin.series.map((day) => ({ ...day, photoOpens: 0 })) }, '2026-10-05'), null);
	// The date moves with the data: one more open day at the end shifts "since", it is not a fixed window.
	const later = world('2026-10-08', ['DWdCET'])[0];
	assert.equal(lastOpenedNote(later, '2026-10-07'), 'No one has opened a photo since Oct 4 (complete days, through Oct 7).');
});

test('Home says it once, on the newest launch only, and leaves out the stored "launch is over" findings and the unfair week', () => {
	const finished = { id: 'launch-finished-DWdCET', rule: 'launch_finished', severity: 'low', target: { kind: 'album', albumKey: 'DWdCET' }, title: 'The launch is over' } as never;
	const failed = { id: 'launch-photo-failures-DWdCET', rule: 'launch_failures', severity: 'high', target: { kind: 'album', albumKey: 'DWdCET' }, title: 'x' } as never;
	const finishedOther = { id: 'launch-finished-Re7kho', rule: 'launch_finished', severity: 'low', target: { kind: 'album', albumKey: 'Re7kho' }, title: 'The launch is over' } as never;
	const view = buildHome(baseInput('2026-10-06', ALL, { findings: [finished, failed, finishedOther] }));
	assert.deepEqual(view.cards.map((card) => card.findings.map((f) => f.rule)), [['launch_failures'], [], []]);
	assert.match(view.cards[0].note ?? '', /^No one has opened a photo since Oct 4 /);
	assert.deepEqual(view.cards.slice(1).map((card) => card.note), [null, null]);
	assert.equal(view.week, null, 'both windows hold a launch week');
	assert.equal(view.state, 'quiet');
});

test('the headline says where the newest launch stands, what that place is a place in, and the median it is measured against', () => {
	const launches = world('2026-10-06', ALL);
	const tied = launches.map((launch, i) => (i === 0 ? { ...launch, rank: { ...launch.rank, day7: { rank: 4, compared: 7, tied: true } } } : launch));
	assert.equal(text(open(tied, '2026-10-06')), 'College Women\'s VB - Millikin at North Central finished its first week tied for 4th of 7 launches, with 266 photo opens, below the usual 381 for earlier launches.');
	// The measure is named, and no date is in the headline: the card under it carries the window.
	assert.match(text(open(launches, '2026-10-06')), /with 266 photo opens, below the usual 381 for earlier launches\.$/);
	assert.doesNotMatch(text(open(launches, '2026-10-06')), /Sep|Oct/);
	// With no earlier launch there is no median, and the sentence says no more than it knows.
	assert.doesNotMatch(text(open(world('2026-10-02', ['Re7kho']), '2026-10-02')), /median|against/);
	// A headline that names its measure and its median is longer than a rank alone; it stays one sentence under 160 characters, and Home's two-screen height is measured on the page.
	assert.ok(text(open(launches, '2026-10-06')).length <= 160);
});

test('the overlapping sentence carries no counts, so it fits two lines; the card carries the numbers', () => {
	const opening = open(world('2026-10-02', ALL), '2026-10-02');
	assert.equal(text(opening), 'Two launches are in play: College Women\'s VB - Millikin at North Central is on day 6 of 7, and HS Girls VB - JCA at ACC finished its first week in 2nd place of 6 launches.');
	assert.ok(text(opening).length <= 180);
	assert.doesNotMatch(text(opening), /\d{2}-\d{2}-\d{4}/, 'no trailing album date in any Home sentence');
});

test('every place a Home problem links to exists on the data quality page', () => {
	const base: ProblemInput = { freshness: { incompleteDays: ['2026-10-04'], refreshedAt: '2026-10-06T12:00:00Z', checked: true }, lastCompleteDay: '2026-10-05', now: '2026-10-06T15:00:00Z', today: '2026-10-06', launchesRead: false, weekRead: false, incidents: ['a', 'b', 'c', 'd', 'e'], diagnostics: [{ type: 'delivery_health_unavailable', status: 'failed', count: 1 }, { type: 'provider_delivery_failures', status: 'failed', count: 3 }, { type: 'provider_delivery_overdue', status: 'failed', count: 2 }], siteActionsStale: { refreshedAt: '2026-10-05T03:00:00Z' }, rejections: null };
	const all = [
		...openProblems(base),
		...openProblems({ ...base, incidents: null, diagnostics: null, freshness: { incompleteDays: [], refreshedAt: null, checked: true } })
	];
	assert.ok(all.length >= 9, `expected every kind of problem, saw ${all.map((p) => p.id).join(', ')}`);
	const known = new Set<string>(DATA_ANCHORS);
	for (const problem of all) assert.ok(known.has(problem.href), `${problem.id} links to ${problem.href}, which the data page does not have`);
	assert.deepEqual([...new Set(all.map((p) => p.href))].sort(), ['coverage', 'delivery', 'site-measures', 'status']);
});

test('Home places at most three findings, each on the card of the launch it concerns', async () => {
	const { placeFindings, HOME_FINDINGS } = await import('./home');
	const f = (id: string, albumKey: string | null, severity: 'high' | 'medium' | 'low' = 'medium') => ({ id, rule: 'launch_reach', severity, target: albumKey ? { kind: 'album' as const, albumKey } : { kind: 'gallery' as const }, title: id, explanation: '', action: '', evidence: { windows: { current: { start: '2026-10-01', end: '2026-10-01' } }, cutoff: null, coverage: 'complete' as const, units: '', strength: 'limited' as const }, reportHref: '/', status: 'open' as const });
	const card = (albumKey: string) => ({ albumKey, findings: [] }) as never;
	const placed = placeFindings([card('A'), card('B')], [f('gap-A', 'A'), f('gallery', null), f('old', 'Z'), f('reach-A', 'A'), f('fail-B', 'B', 'high'), f('reach-B', 'B')]);
	assert.equal(HOME_FINDINGS, 3);
	// The newest launch (A) shows everything it has; an older one (B) only what needs action, so its reach note stays on its report.
	assert.deepEqual(placed.map((c) => c.findings.map((x) => x.id)), [['gap-A', 'reach-A'], ['fail-B']]);
	assert.deepEqual(placeFindings([card('A'), card('B')], [f('reach-B', 'B')])[1].findings, []);
	const none = placeFindings([card('A')], []);
	assert.deepEqual(none[0].findings, []);
});

test('findings say when they were last checked: fresh, late past four refresh cadences, and unknown', async () => {
	const { findingsCheck, FINDINGS_LATE_AFTER_MS, placeFindings } = await import('./home');
	assert.equal(FINDINGS_LATE_AFTER_MS, 60 * 60_000);
	assert.deepEqual(findingsCheck('2026-10-06T16:45:00Z', '2026-10-06T17:00:00Z', '2026-10-06'), { text: 'Last checked 11:45 AM Chicago time.', late: false });
	assert.deepEqual(findingsCheck('2026-10-06T16:00:00Z', '2026-10-06T17:00:00Z', '2026-10-06'), { text: 'Last checked 11:00 AM Chicago time.', late: false }, 'exactly an hour is not late');
	assert.deepEqual(findingsCheck('2026-10-06T15:59:00Z', '2026-10-06T17:00:00Z', '2026-10-06'), { text: 'Last checked 10:59 AM Chicago time, more than an hour ago. These may be out of date.', late: true });
	assert.deepEqual(findingsCheck('2026-10-04T03:00:00Z', '2026-10-06T17:00:00Z', '2026-10-06'), { text: 'Last checked Oct 3, 10:00 PM Chicago time, more than an hour ago. These may be out of date.', late: true });
	assert.deepEqual(findingsCheck(null, '2026-10-06T17:00:00Z', '2026-10-06'), { text: 'When these were last checked is not known, so they may be out of date.', late: true });
	const f = { id: 'x', rule: 'launch_reach', target: { kind: 'album' as const, albumKey: 'A' }, title: '', explanation: '', action: '', evidence: { windows: { current: { start: '2026-10-01', end: '2026-10-01' } }, cutoff: null, coverage: 'complete' as const, units: '', strength: 'limited' as const }, reportHref: '/', status: 'open' as const };
	const late = findingsCheck(null, '2026-10-06T17:00:00Z', '2026-10-06');
	const placed = placeFindings([{ albumKey: 'A', findings: [], findingsCheck: null }, { albumKey: 'B', findings: [], findingsCheck: null }] as never, [f], late);
	assert.deepEqual(placed.map((card) => card.findingsCheck), [late, null], 'only a card with findings says when they were checked');
});

test('recovered dates: a mark only where it picks some out; when every date shown is recovered the page says so once and draws none', () => {
	const build = (launches: Launch[]) => buildHome(baseInput('2026-10-06', ALL, { launches }));
	// Every date on the page is recovered: no mark anywhere, one sentence.
	const every = build(world('2026-10-06', ALL));
	assert.deepEqual(every.recovered, { mark: false, note: RECOVERED_ALL_NOTE });
	assert.deepEqual(every.cards.map((card) => card.published.includes('*')), [false, false, false]);
	assert.equal(sentenceText(every.then!), 'No new album since Sep 26, 10 days ago.');
	// Only some are: the mark picks those out, and the one note says what it means.
	const some = build(world('2026-10-06', ALL, {}, ['Re7kho']));
	assert.deepEqual(some.recovered, { mark: true, note: RECOVERED_NOTE });
	assert.deepEqual(some.cards.map((card) => card.published), ['First published Sep 26', 'First published Sep 25*', 'First published Sep 5']);
	// The mark follows what the cards show: only the three newest cards count, so an older recovered date elsewhere does not make the page mark.
	assert.deepEqual(build(world('2026-10-06', ALL, {}, ['jq1Rp7'])).recovered, { mark: false, note: null });
	// None are: nothing to say.
	assert.deepEqual(build(world('2026-10-06', ALL, {}, [])).recovered, { mark: false, note: null });
});

test('the verdict word is the plain comparison of the week with the usual: above, below, or level; one earlier launch is a figure, not a usual', () => {
	const launches = world('2026-10-06', ALL);
	assert.match(text(open(launches, '2026-10-06')), /, below the usual 381 for earlier launches\.$/);
	// One earlier launch.
	const one = world('2026-10-06', ['Re7kho', 'DWdCET']);
	assert.match(text(open(one, '2026-10-06')), /with 266 photo opens, below the 931 of the 1 earlier launch\.$/);
	// The same numbers the other way round, and level.
	const withWeek = (own: number) => open(world('2026-10-06', ALL).map((launch, i) => (i === 0 ? { ...launch, totals: { ...launch.totals, day7: { ...launch.totals.day7, photoOpens: own } } } : launch)), '2026-10-06');
	const lead = (own: number) => text(withWeek(own)).replace(/^.* photo opens?, /, '');
	assert.equal(lead(500), 'above the usual 381 for earlier launches.');
	assert.equal(lead(381), 'level with the usual 381 for earlier launches.');
});

test('one sentence says what share of the counted photo opens came from browsers the counter could not sort, with the real share and its dates', () => {
	const classes = (audience: number, unclassified: number) => ({ start: '2026-09-30', end: '2026-10-06', classes: [{ classification: 'audience', count: audience }, { classification: 'unclassified', count: unclassified }, { classification: 'known_crawler', count: 900 }] });
	// Most: the real share, computed over the counted classes only (a crawler is left out of the counting), with the upper-limit clause.
	assert.equal(unsortedLine(classes(190, 810), '2026-10-07'), 'Most (81%) of the newest launch’s counted opens, Sep 30 – Oct 6, came from browsers the counter could not sort: an upper limit.');
	// Not most: the share, and no upper-limit clause.
	assert.equal(unsortedLine(classes(880, 120), '2026-10-07'), '12% of the newest launch’s counted opens, Sep 30 – Oct 6, came from browsers the counter could not sort.');
	// Exactly half is not most.
	assert.match(unsortedLine(classes(500, 500), '2026-10-07')!, /^50% of the newest launch/);
	// 50.4% rounds to 50 and is still most.
	assert.match(unsortedLine(classes(496, 504), '2026-10-07')!, /^Most \(50%\) of the newest launch’s counted opens, Sep 30 – Oct 6,/);
	// Nothing unsorted, nothing counted, or nothing read: nothing to say.
	assert.equal(unsortedLine(classes(100, 0), '2026-10-07'), null);
	assert.equal(unsortedLine({ start: '2026-09-30', end: '2026-10-06', classes: [] }, '2026-10-07'), null);
	assert.equal(unsortedLine(null, '2026-10-07'), null);
	// It reaches the page.
	assert.match(buildHome(baseInput('2026-10-06', ALL, { traffic: classes(190, 810) })).unsorted ?? '', /^Most \(81%\) of the newest launch’s counted opens/);
	assert.equal(buildHome(baseInput('2026-10-06', ALL)).unsorted, null);
});

test('the caption under the small bars says what a thin mark and a dashed line are, only when they are drawn', () => {
	const bar = (state: 'value' | 'gap' | 'future', opens: number | null) => ({ day: 1, state, opens, height: 0 });
	assert.equal(sparkCaption([bar('value', 103), bar('value', 575)]), 'Opens by day, week 1.');
	assert.equal(sparkCaption([bar('value', 103), bar('value', 0)]), 'Opens by day, week 1. A thin mark is a day with no opens.');
	assert.equal(sparkCaption([bar('value', 103), bar('gap', null), bar('future', null)]), 'Opens by day, week 1. A dashed line is a day not counted.');
	assert.equal(sparkCaption([bar('value', 0), bar('gap', null)]), 'Opens by day, week 1. A thin mark is a day with no opens. A dashed line is a day not counted.');
});
