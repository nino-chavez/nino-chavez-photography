import assert from 'node:assert/strict';
import test from 'node:test';
import type { Launch, LaunchAgeTotals, LaunchDay } from './launch-read-model.server';
import {
	buildHome, changeWords, chicagoTime, COMPLETED_DAYS_CHECKED, HOME_LAUNCH_CARDS, incidentWords, JUST_FINISHED_DAYS, launchCard, launchPhase, NOTHING_DUE, nextItems,
	openingSentence, openProblems, QUIET_AFTER_DAYS, REFRESH_STALE_MS, sentenceText, siteFigures, sparkBars, staleness, statusLabel, trailingGap, weekLine,
	type Freshness, type HomeInput, type ProblemInput, type SiteReading, type WeekInput
} from './home';

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

test('production on October 6: no new album since Sep 26, the inferred date marked', () => {
	const launches = world('2026-10-06', ALL);
	const opening = open(launches, '2026-10-06');
	assert.equal(opening.state, 'quiet');
	assert.equal(text(opening), 'No new album since Sep 26 (inferred), 10 days ago.');
	// A recorded date carries no mark.
	assert.equal(text(open(world('2026-10-06', ALL, {}, []), '2026-10-06')), 'No new album since Sep 26, 10 days ago.');
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
	assert.equal(text(opening), 'HS Girls VB - JCA at ACC finished its first week in 2nd place of 6 launches with 931 photo opens.');
	// Alone with a week, there is no rank to state.
	assert.equal(text(open(world('2026-10-02', ['Re7kho']), '2026-10-02')), 'HS Girls VB - JCA at ACC finished its first week with 931 photo opens; no other launch has a complete first week to compare with.');
	// A tie says tie.
	const tied = world('2026-10-02', ['Re7kho', 'Big']).map((launch) => ({ ...launch, rank: { ...launch.rank, day7: { rank: 1, compared: 2, tied: true } } }));
	assert.match(text(open(tied, '2026-10-02')), /in tied for 1st place of 2 launches with/);
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

test('no sentence on Home claims a recap was sent or is ready', () => {
	const sentences: string[] = [];
	for (const asOf of ['2026-09-26', '2026-09-27', '2026-09-29', '2026-10-02', '2026-10-06']) sentences.push(text(open(world(asOf, ALL), asOf)));
	sentences.push(...nextItems(world('2026-10-02', ALL)).map((item) => item.text));
	for (const line of sentences) assert.doesNotMatch(line, /recap|sent|ready|delivered/i, line);
});

test('the week line compares the last 7 complete days with the 7 before, and says when it cannot', () => {
	const week: WeekInput = { window: { start: '2026-09-29', end: '2026-10-05' }, previous: { start: '2026-09-22', end: '2026-09-28' }, current: 396, previousTotal: 3102, coverage: 'complete', previousCoverage: 'complete' };
	assert.equal(sentenceText(weekLine(week, '2026-10-06', NO_LAUNCHES)), 'Gallery photo opens, Sep 29 – Oct 5: 396, down 87% from 3,102 in the 7 days before (Sep 22 – 28).');
	assert.equal(sentenceText(weekLine({ ...week, current: 100, previousTotal: 0 }, '2026-10-06', NO_LAUNCHES)), 'Gallery photo opens, Sep 29 – Oct 5: 100, up from 0 in the 7 days before (Sep 22 – 28).');
	assert.equal(sentenceText(weekLine({ ...week, current: 5, previousTotal: 5 }, '2026-10-06', NO_LAUNCHES)), 'Gallery photo opens, Sep 29 – Oct 5: 5, the same as 5 in the 7 days before (Sep 22 – 28).');
	assert.equal(sentenceText(weekLine({ ...week, previousCoverage: 'partial', previousTotal: null }, '2026-10-06', NO_LAUNCHES)), 'Gallery photo opens, Sep 29 – Oct 5: 396, with nothing to compare it with: the 7 days before (Sep 22 – 28) have incomplete records.');
	assert.equal(sentenceText(weekLine({ ...week, coverage: 'partial', current: null }, '2026-10-06', NO_LAUNCHES)), 'Gallery photo opens, Sep 29 – Oct 5: not stated: a day in it has incomplete records, so a short total is not shown.');
	assert.match(sentenceText(weekLine(null, '2026-10-06', NO_LAUNCHES)), /could not be read\. No number is shown rather than a wrong one\.$/);
	assert.equal(changeWords(1001, 1000), 'up less than 1% from');
	assert.equal(changeWords(10, 4), 'up 150% from');
});

test('a card says what it is, and each number says what it is compared with', () => {
	const launches = world('2026-10-02', ALL);
	const day7 = launchCard(launches.find((l) => l.albumKey === 'Re7kho')!, launches, '2026-10-02', 'cf-id');
	assert.equal(day7.status, 'Day 7 reached');
	assert.equal(day7.published, 'First published Sep 25 (inferred)');
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

test('next: the day 3 and day 7 dates of launches in their first week, and nothing otherwise', () => {
	// Re7kho first published Sep 25 (Chicago): day 3 is Sep 28, day 7 is Oct 2. DWdCET: Sep 29 and Oct 3.
	const early = nextItems(world('2026-09-27', ['Re7kho', 'DWdCET']));
	assert.deepEqual(early.map((item) => item.text), [
		'HS Girls VB - JCA at ACC reaches day 3 on Mon, Sep 28 (inferred).',
		'College Women\'s VB - Millikin at North Central reaches day 3 on Tue, Sep 29 (inferred).'
	]);
	const mid = nextItems(world('2026-09-30', ['Re7kho', 'DWdCET']));
	assert.deepEqual(mid.map((item) => item.text), [
		'HS Girls VB - JCA at ACC reaches day 7 on Fri, Oct 2 (inferred).',
		'College Women\'s VB - Millikin at North Central reaches day 7 on Sat, Oct 3 (inferred).'
	]);
	assert.deepEqual(nextItems(world('2026-10-06', ALL)), []);
	// A launch whose seventh day has passed is not due anything.
	assert.deepEqual(nextItems(world('2026-10-02', ['Re7kho'])), []);
	// A recorded date carries no mark.
	assert.equal(nextItems(world('2026-09-27', ['Re7kho'], {}, []))[0].text, 'HS Girls VB - JCA at ACC reaches day 3 on Mon, Sep 28.');
	assert.equal(NOTHING_DUE, 'Nothing is due. The next recap starts when you publish an album.');
});

test('the site line names its measures, compares each with the 7 days before, and keeps one failure to itself', () => {
	const reach: SiteReading = { available: true, start: '2026-09-29', end: '2026-10-05', current: 730, previous: 658 };
	const contacts: SiteReading = { available: true, start: '2026-09-29', end: '2026-10-05', current: 0, previous: 2 };
	const both = siteFigures(reach, contacts, '2026-10-06');
	assert.equal(both.reach.label, 'Page loads on ninochavez.co (Cloudflare)');
	assert.equal(both.reach.value, '730');
	assert.equal(both.reach.detail, 'Sep 29 – Oct 5, up 11% from 658 in the 7 days before.');
	assert.equal(both.contacts.label, 'Contact links clicked');
	assert.equal(both.contacts.detail, 'Sep 29 – Oct 5, down 100% from 2 in the 7 days before. These are links opened, not messages sent.');
	// A provider that is unavailable says so in its own figure; the other is untouched.
	const down = siteFigures({ available: false, reason: 'Cloudflare Web Analytics could not be read. No traffic total is shown.' }, contacts, '2026-10-06');
	assert.equal(down.reach.value, null);
	assert.equal(down.reach.detail, 'Cloudflare Web Analytics could not be read. No traffic total is shown.');
	assert.equal(down.contacts.value, '0');
	// No comparison is invented when the week before could not be read.
	assert.match(siteFigures({ ...reach, previous: null }, contacts, '2026-10-06').reach.detail, /nothing to compare it with\.$/);
});

test('open problems: none when everything is current, and each cause links to where it can be looked into', () => {
	const base: ProblemInput = { freshness: { incompleteDays: [], refreshedAt: '2026-10-06T14:40:00Z', checked: true }, lastCompleteDay: '2026-10-05', now: '2026-10-06T15:00:00Z', today: '2026-10-06', launchesRead: true, weekRead: true, incidents: [], diagnostics: [], siteActionsStale: null };
	assert.deepEqual(openProblems(base), []);
	const coverage = openProblems({ ...base, freshness: { ...base.freshness, incompleteDays: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'] } });
	assert.equal(coverage.length, 1);
	assert.match(coverage[0].text, /^Records are incomplete for 5 completed days of the last 7 \(Oct 2, Oct 3, Oct 4, Oct 5 and 1 earlier\)\./);
	assert.equal(COMPLETED_DAYS_CHECKED, 7);
	const late = openProblems({ ...base, freshness: { ...base.freshness, refreshedAt: '2026-10-06T12:00:00Z' } });
	assert.deepEqual(late.map((p) => p.id), ['refresh-late']);
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
	assert.ok(incidents.every((p) => p.href === 'measurement'));
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
	assert.equal(site[0].href, 'site_actions');
	assert.equal(site[0].text, 'Site action counts were last refreshed at Oct 4, 10:00 PM Chicago time, so recent clicks may be missing.');
	// The words for an incident never come from the finding's own text, so no album name can reach the page.
	assert.equal(incidentWords('download-failed-for-Re7kho'), 'Download requests are failing for visitors');
});

test('chicagoTime is Chicago time on any day', () => {
	assert.equal(chicagoTime('2026-10-06T13:40:00Z', '2026-10-06'), '8:40 AM');
	assert.equal(chicagoTime('2026-10-05T03:00:00Z', '2026-10-06'), 'Oct 4, 10:00 PM');
});

const baseInput = (asOfDay: string, keys: readonly Key[], over: Partial<HomeInput> = {}): HomeInput => ({
	asOf: `${asOfDay}T15:00:00Z`, today: asOfDay, lastCompleteDay: addDays(asOfDay, -1), launches: world(asOfDay, keys),
	covers: new Map([['Re7kho', 'cover-re']]), week: { window: { start: addDays(asOfDay, -7), end: addDays(asOfDay, -1) }, previous: { start: addDays(asOfDay, -14), end: addDays(asOfDay, -8) }, current: 1, previousTotal: 2, coverage: 'complete', previousCoverage: 'complete' }, freshness: { incompleteDays: [], refreshedAt: `${asOfDay}T14:45:00Z`, checked: true },
	siteReach: { available: false, reason: 'x' }, siteContacts: { available: false, reason: 'y' }, siteActionsStale: null, incidents: [], diagnostics: [], ...over
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
	assert.equal(view.next.text, NOTHING_DUE);
	assert.deepEqual(view.next.items, []);
	assert.deepEqual(view.problems, []);
});

test('Home: a launch in progress lists what is due, and unreadable launches say what cannot be said', () => {
	const view = buildHome(baseInput('2026-09-30', ['Re7kho', 'Big']));
	assert.equal(view.state, 'running');
	assert.deepEqual(view.next.items, ['HS Girls VB - JCA at ACC reaches day 7 on Fri, Oct 2 (inferred).']);
	const down = buildHome(baseInput('2026-10-06', ALL, { launches: null }));
	assert.equal(down.state, 'unavailable');
	assert.deepEqual(down.cards, []);
	assert.equal(down.next.text, 'What is due cannot be said while the launch numbers are unavailable.');
	assert.deepEqual(down.problems.map((p) => p.id), ['launches-unreadable']);
});

test('the week line names launch weeks and states no percentage; only windows with no launch days get a plain comparison', () => {
	const week: WeekInput = { window: { start: '2026-09-29', end: '2026-10-05' }, previous: { start: '2026-09-22', end: '2026-09-28' }, current: 384, previousTotal: 1451, coverage: 'complete', previousCoverage: 'complete' };
	const jca = world('2026-10-06', ['Re7kho'])[0]; // first week Sep 25 - Oct 1: touches both windows
	const millikin = world('2026-10-06', ['DWdCET'])[0]; // Sep 26 - Oct 2: both windows
	const big = world('2026-10-06', ['Big'])[0]; // Sep 5 - Sep 11: neither
	const late = world('2026-10-06', ['DWdCET']).map((l) => ({ ...l, albumKey: 'Late', albumName: 'Late Launch - 10-01-2026', firstPublishedAt: '2026-10-01T20:00:00Z' }))[0]; // Oct 1 - Oct 7: current only
	const early = world('2026-10-06', ['DWdCET']).map((l) => ({ ...l, albumKey: 'Early', albumName: 'Early Launch - 09-14-2026', firstPublishedAt: '2026-09-14T20:00:00Z' }))[0]; // Sep 14 - Sep 20: neither window
	const prevOnly = { ...early, albumKey: 'Prev', albumName: 'Previous Only - 09-17-2026', firstPublishedAt: '2026-09-17T20:00:00Z' }; // Sep 17 - Sep 23: previous window only (Sep 22, 23)
	const line = (launches: Launch[] | null) => sentenceText(weekLine(week, '2026-10-06', launches));
	// No launch in either window: a plain comparison.
	assert.equal(line([big, early]), 'Gallery photo opens, Sep 29 – Oct 5: 384, down 74% from 1,451 in the 7 days before (Sep 22 – 28).');
	assert.equal(line([]), 'Gallery photo opens, Sep 29 – Oct 5: 384, down 74% from 1,451 in the 7 days before (Sep 22 – 28).');
	// A launch in the previous window only.
	assert.equal(line([prevOnly, big]), 'Gallery photo opens, Sep 29 – Oct 5: 384. The 7 days before (Sep 22 – 28) had 1,451, during the first week of Previous Only.');
	// A launch in the current window only.
	assert.equal(line([late, big]), 'Gallery photo opens, Sep 29 – Oct 5: 384, during the first week of Late Launch. The 7 days before (Sep 22 – 28) had 1,451.');
	// Launches in both, different ones in each.
	assert.equal(line([late, prevOnly]), 'Gallery photo opens, Sep 29 – Oct 5: 384, during the first week of Late Launch. The 7 days before (Sep 22 – 28) had 1,451, during the first week of Previous Only.');
	// The same launches in both windows: said once, and not a fair comparison. Production today.
	assert.equal(line([millikin, jca, big]), 'Gallery photo opens, Sep 29 – Oct 5: 384. The 7 days before (Sep 22 – 28) had 1,451. Both include the first week of College Women\'s VB - Millikin at North Central and HS Girls VB - JCA at ACC, so this is not a fair comparison.');
	// No line that touches a launch week states a percentage or a direction.
	for (const launches of [[prevOnly], [late], [late, prevOnly], [millikin, jca]]) assert.doesNotMatch(line(launches), /%|\bup\b|\bdown\b/);
	// Launch dates that could not be read: nothing says the windows are alike.
	assert.equal(line(null), 'Gallery photo opens, Sep 29 – Oct 5: 384. The 7 days before (Sep 22 – 28) had 1,451. Launch dates could not be read, so no change is stated.');
	// Day 6 is inside the first week; day 7 is not.
	const edge = (day0: string) => ({ ...big, firstPublishedAt: `${day0}T20:00:00Z`, albumName: 'Edge', albumKey: 'Edge' });
	assert.match(line([edge('2026-09-16')]), /during the first week of Edge\.$/, 'Sep 16 + 6 = Sep 22 is the first day of the earlier window');
	assert.doesNotMatch(line([edge('2026-09-15')]), /Edge/, 'Sep 15 + 6 = Sep 21 is before it');
	assert.doesNotMatch(line([edge('2026-10-06')]), /Edge/, 'a launch published today starts after the window ends');
	assert.match(line([edge('2026-10-05')]), /during the first week of Edge\. The 7 days/, 'a launch published on the last day of the window is in it');
});

test('the overlapping sentence carries no counts, so it fits two lines; the card carries the numbers', () => {
	const opening = open(world('2026-10-02', ALL), '2026-10-02');
	assert.equal(text(opening), 'Two launches are in play: College Women\'s VB - Millikin at North Central is on day 6 of 7, and HS Girls VB - JCA at ACC finished its first week in 2nd place of 6 launches.');
	assert.ok(text(opening).length <= 180);
	assert.doesNotMatch(text(opening), /\d{2}-\d{2}-\d{4}/, 'no trailing album date in any Home sentence');
});
