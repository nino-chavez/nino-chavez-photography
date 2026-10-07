import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatedLaunchAlbum, Launch, LaunchDay, LaunchPhoto, LaunchReadModel, UndatedLaunchAlbum } from './launch-read-model.server';
import { addDays, ALL, D, day, model, NAMES, photos, shape, START, sum, type Shape } from './launch-recap.fixture';
import { buildRecap, cumulativeOpens, launchAhead, median, ordinal, recapToPlain, type ArrivalRow } from './launch-recap';
import { cumulativeCurves, dailyChart, gridPhotos, launchTable, nameWithoutDate } from './launch-report-view';

const ids = (n: number) => new Set(Array.from({ length: n }, (_, i) => `p${i + 1}`));
const recap = (m: LaunchReadModel, arrivals: ArrivalRow[] | null = null, photoIds = ids(4)) => buildRecap({ model: m, arrivals, photoIds });
const text = (m: LaunchReadModel, arrivals: ArrivalRow[] | null = null, photoIds = ids(4)) => {
	const r = recap(m, arrivals, photoIds);
	return [recapToPlain(r.headline), ...r.sentences.map((s) => recapToPlain(s)), r.downloads ? recapToPlain(r.downloads) : '', r.arrivals ? recapToPlain(r.arrivals) : '', recapToPlain(r.window), ...r.limits].join('\n');
};
test('finished launch: week-1 total, rank, the launch ahead, peak day and every photo opened', () => {
	const m = model(shape('Re7kho'), ALL);
	const r = recap(m);
	assert.equal(r.state, 'finished');
	assert.equal(r.eyebrow, 'Week 1 recap');
	assert.equal(recapToPlain(r.published!), 'Published Sep 25 (date recovered afterwards from a log).');
	assert.equal(recapToPlain(r.headline), '931 photo opens in its first week.');
	const lines = r.sentences.map((s) => recapToPlain(s));
	assert.match(lines[0], /^At the same age, the 5 earlier launches had a median of 125 photo opens\.$/);
	assert.match(lines[1], /^That is 2nd of the 7 launches with a week-1 total, behind HS Girls VB - JCA vs PNHS - 08-25-2026 \(1,258\)\.$/);
	assert.match(lines[2], /^Most of it came at once: 575 opens on Sep 26, the day after it was published \(62% of the week\)\.$/);
	assert.equal(lines[3], 'Every one of the 4 photos was opened at least once.');
	assert.equal(r.sentences.length, 4);
});

test('the day Chicago says a launch began is the day it is dated, not the UTC day', () => {
	const m = model(shape('Re7kho'), ALL);
	m.album.firstPublishedAt = '2026-09-26T01:10:52.556+00:00';
	assert.equal(recapToPlain(recap(m).published!), 'Published Sep 25 (date recovered afterwards from a log).');
});

test('a recorded date is not marked inferred', () => {
	const m = model(shape('DWdCET'), ALL);
	assert.equal(recapToPlain(recap(m).published!), 'Published Sep 26.');
});

test('the launch named as ahead is the one the read model ranks directly above, and ranks agree', () => {
	const m = model(shape('Re7kho'), ALL);
	const album = m.album as DatedLaunchAlbum;
	const ahead = launchAhead(m, album, 'day7');
	const mine = album.totals.day7.photoOpens as number;
	assert.ok(ahead && ahead.total > mine);
	// Nothing with a total between this launch and the one named.
	for (const l of m.launches) {
		const t = l.totals.day7.photoOpens;
		if (t !== null && t > mine) assert.ok(t >= ahead.total);
	}
	for (const l of m.launches) {
		const t = l.totals.day7.photoOpens;
		if (t === null) continue;
		const better = m.launches.filter((o) => (o.totals.day7.photoOpens ?? -1) > t).length;
		assert.equal(l.rank.day7.rank, better + 1, `${l.albumKey} rank is competition rank`);
	}
});

test('first place and a tie are worded as such', () => {
	const m = model(shape('fJKdsB'), ALL);
	assert.match(recapToPlain(recap(m).sentences[1]), /^That is the most of the 7 launches with a week-1 total\.$/);
	const tied = model(shape('Re7kho'), ALL);
	(tied.album as DatedLaunchAlbum).rank.day7 = { rank: 1, compared: 7, tied: true };
	assert.match(recapToPlain(recap(tied).sentences[1]), /^That is tied for the most of the 7 launches/);
});

test('the only launch with a total has nothing to rank against', () => {
	const m = model(shape('Re7kho'), []);
	assert.match(recapToPlain(recap(m).sentences[0]), /the only launch with a week-1 total, so there is nothing to rank it against yet/);
});

test('an album outside the comparison set is not ranked and is not given a rank sentence', () => {
	const m = model(shape('Re7kho'), ALL);
	(m.album as DatedLaunchAlbum).rank.day7 = { rank: null, compared: 6, tied: false };
	assert.ok(!recap(m).sentences.some((s) => /launches with a week-1 total/.test(recapToPlain(s))));
});

test('in progress with fewer than 3 full days: so-far opens against the median of earlier launches at that age', () => {
	const m = model(shape('Re7kho', '2026-09-27'), ALL, {}, '2026-09-27');
	const r = recap(m);
	assert.equal(r.state, 'early');
	assert.equal(recapToPlain(r.headline), '678 photo opens in its first 2 full days.');
	assert.match(recapToPlain(r.sentences[0]), /^At the same age, the \d+ earlier launches had a median of [\d,]+ photo opens\.$/);
	// Day 3 and day 7 ranks do not exist yet, so none is claimed.
	assert.ok(!r.sentences.some((s) => /week-1 total|day-3 total/.test(recapToPlain(s))));
});

test('the median compares with launches published earlier only, never later ones and never itself', () => {
	const m = model(shape('DWdCET', '2026-09-27'), ALL, {}, '2026-09-27');
	const r = recap(m);
	const early = m.launches.filter((l) => l.albumKey !== 'DWdCET' && Date.parse(l.firstPublishedAt) < Date.parse((m.album as DatedLaunchAlbum).firstPublishedAt));
	const values = early.map((l) => cumulativeOpens(l, 1)).filter((v): v is number => v !== null);
	assert.equal(recapToPlain(r.sentences[0]), `At the same age, the ${values.length} earlier launches had a median of ${median(values)!.toLocaleString('en-US')} photo opens.`);
});

test('with 3 to 6 full days the day-3 rank appears, and from day 4 it states the first-3-days total', () => {
	const three = recap(model(shape('Re7kho', '2026-09-28'), ALL, {}, '2026-09-28'));
	assert.equal(three.state, 'in_progress');
	assert.match(three.sentences.map((s) => recapToPlain(s)).join(' '), /That is \d(st|nd|rd|th) of the \d launches with a day-3 total/);
	const five = recap(model(shape('Re7kho', '2026-09-30'), ALL, {}, '2026-09-30'));
	assert.match(five.sentences.map((s) => recapToPlain(s)).join(' '), /In its first 3 days it had 804 photo opens, \d(st|nd|rd|th) of the \d launches with a day-3 total/);
});

test('published today: no full day yet, no comparison, today kept apart', () => {
	const m = model(shape('Re7kho', '2026-09-25'), ALL, {}, '2026-09-25');
	const r = recap(m);
	assert.equal(r.state, 'just_published');
	assert.equal(recapToPlain(r.headline), 'No full day has passed, so there is nothing to compare yet.');
	assert.match(recapToPlain(r.window), /No full day is counted yet\. Today, Sep 25, is partial and left out: 4 photo opens so far\./);
	assert.ok(!/median/.test(text(m)));
});

test('a coverage gap in week 1 withholds the total and the rank, and says why', () => {
	const m = model(shape('Re7kho', '2026-10-06', { 4: { coverage: 'partial', photoOpens: 60 } }), ALL);
	const album = m.album as DatedLaunchAlbum;
	assert.equal(album.totals.day7.reached, true);
	assert.equal(album.totals.day7.complete, false);
	album.rank.day7 = { rank: null, compared: 6, tied: false };
	const r = recap(m);
	assert.equal(r.state, 'finished_gap');
	assert.equal(recapToPlain(r.headline), 'The week-1 total cannot be stated: records are incomplete for 1 day.');
	const lines = r.sentences.map((s) => recapToPlain(s));
	assert.match(lines[0], /^The complete days add up to 833 photo opens, which is less than the week\.$/);
	assert.ok(lines.some((l) => /left out of the week-1 ranking/.test(l)));
	// The partial day's 60 opens never enter a sum, a peak or a headline.
	assert.ok(!text(m).includes('931') && !text(m).includes('893'));
});

test('a gap inside an in-progress launch states no total so far', () => {
	const m = model(shape('Re7kho', '2026-09-30', { 1: { coverage: 'unavailable', photoOpens: null } }), ALL, {}, '2026-09-30');
	const r = recap(m);
	assert.equal(recapToPlain(r.headline), 'Records are incomplete for 1 day, so the total so far is not stated.');
	assert.ok(!r.sentences.some((s) => /median|Most of it came/.test(recapToPlain(s))));
});

test('today is partial: reported apart and never added to a total', () => {
	const m = model(shape('Re7kho'), ALL);
	const day7 = (m.album as DatedLaunchAlbum).totals.day7.photoOpens;
	assert.equal(day7, 931);
	assert.match(recapToPlain(recap(m).window), /Today, Oct 6, is partial and left out: 4 photo opens so far\./);
	const unknown = model(shape('Re7kho'), ALL);
	(unknown.album as DatedLaunchAlbum).currentDay = { day: 11, date: '2026-10-06', photoOpens: null, downloads: null, albumOpens: null, coverage: 'unavailable' };
	assert.match(recapToPlain(recap(unknown).window), /Today, Oct 6, is still being recorded and is left out\./);
});

test('week-1 figures and the longer window are told apart when more than seven days are counted', () => {
	const w = recapToPlain(recap(model(shape('Re7kho'), ALL)).window);
	assert.match(w, /^Week-1 figures use 7 full days, Sep 25 to Oct 1\. The chart, downloads and photo counts use all 11 full days, to Oct 5\./);
});

test('no exposure recorded during the launch says so, and partial and complete are worded differently', () => {
	const none = model(shape('jq1Rp7'), ALL, { exposure: { since: '2026-09-29', coverage: 'none' } });
	assert.match(text(none), /Which photos people saw but did not open was not recorded until Sep 29, after these days\./);
	const never = model(shape('jq1Rp7'), ALL, { exposure: { since: null, coverage: 'none' } });
	assert.match(text(never), /did not open has not been recorded/);
	const partial = model(shape('Re7kho'), ALL, { exposure: { since: '2026-09-29', coverage: 'partial' } });
	assert.match(text(partial), /is recorded only from Sep 29/);
	const complete = model(shape('Re7kho'), ALL, { exposure: { since: '2026-09-01', coverage: 'complete' } });
	assert.ok(!/saw but did not open/.test(text(complete)));
});

test('downloads: weak order at 3 or fewer, a real order above, and none requested', () => {
	const weak = recap(model(shape('Re7kho'), ALL, { photos: photos([3, 2, 1, 0]) }));
	assert.match(recapToPlain(weak.downloads!), /No single photo was requested more than 3 times, so there are too few requests to tell which photos people want most\./);
	const strong = recap(model(shape('Re7kho'), ALL, { photos: photos([12, 5, 1, 0]) }));
	assert.match(recapToPlain(strong.downloads!), /The photos below were requested most\./);
	assert.ok(!/too few requests/.test(recapToPlain(strong.downloads!)));
	const none = recap(model(shape('Re7kho'), ALL, { photos: photos([0, 0, 0, 0]) }));
	assert.match(recapToPlain(none.downloads!), /No single photo was requested, so there is no photo order to show\./);
});

test('download actions are called requests, and a whole-album request is separated from photo requests', () => {
	const r = recap(model(shape('Re7kho'), ALL, { photos: photos([3, 2, 1, 0]) }));
	const d = recapToPlain(r.downloads!);
	assert.match(d, /download requests were made/);
	assert.match(d, /6 named a photo and \d+ asked for the whole album/);
	assert.ok(!/saved|downloaded/.test(d));
});

test('every photo opened, some opened, and none opened; a cut activity list claims nothing', () => {
	assert.match(text(model(shape('Re7kho'), ALL)), /Every one of the 4 photos was opened at least once\./);
	const some = model(shape('Re7kho'), ALL, { photos: photos([3, 2, 1, 0], [11, 10, 9, 0]) });
	assert.match(text(some), /3 of the 4 photos were opened at least once\./);
	const one = model(shape('Re7kho'), ALL, { photos: photos([0, 0, 0, 0], [1, 0, 0, 0]) });
	assert.match(text(one), /1 of the 4 photos was opened at least once\./);
	const cut = model(shape('Re7kho'), ALL, { photosWithActivity: 9 });
	assert.ok(!/photos (was|were) opened|Every one of the/.test(text(cut)));
});

test('the photo total is the grid size, so a photo left out of the grid is not counted anywhere', () => {
	const m = model(shape('Re7kho'), ALL, { photosInAlbum: 4 });
	const t = text(m, null, new Set(['p1', 'p2', 'p3']));
	assert.match(t, /Every one of the 3 photos was opened at least once\./);
});

test('arrivals: tagged arrivals by tag when they exist, and a limit when none do', () => {
	const m = model(shape('Re7kho'), ALL);
	const r = recap(m, [{ source: 'links', count: 3 }, { source: 'profile', count: 19 }]);
	assert.equal(recapToPlain(r.arrivals!), '22 arrivals came through tagged links: profile 19 (86%), links 3 (14%). Arrivals that did not use a tagged link cannot be traced to a source.');
	assert.equal(recapToPlain(recap(m, [{ source: 'profile', count: 4 }]).arrivals!), '4 arrivals came through tagged links, all from the "profile" tag. Arrivals that did not use a tagged link cannot be traced to a source.');
	assert.ok(!r.limits.some((l) => /came from/.test(l)));
	const none = recap(m, []);
	assert.equal(none.arrivals, null);
	assert.ok(none.limits.some((l) => /Where people came from is only known for tagged links, and none were recorded\./.test(l)));
	assert.equal(recap(m, null).arrivals, null);
});

test('peak day: a tie is named as a tie, seven equal days are not a peak, a small total gets none', () => {
	const set = (m: LaunchReadModel, values: number[]) => {
		const album = m.album as DatedLaunchAlbum;
		album.series = album.series.map((d, i) => ({ ...d, photoOpens: values[i] ?? 0, coverage: 'complete' as const }));
		const week = values.slice(0, 7).reduce((x, y) => x + y, 0);
		album.totals.day7 = { reached: true, complete: true, photoOpens: week, downloads: 1, albumOpens: 1 };
		return m;
	};
	const tie = text(set(model(shape('Re7kho'), ALL), [20, 20, 5, 5, 5, 5, 5]));
	assert.match(tie, /The busiest days were Sep 25 and Sep 26, with 20 opens each\./);
	const flat = text(set(model(shape('Re7kho'), ALL), [10, 10, 10, 10, 10, 10, 10]));
	assert.match(flat, /No single day stood out: 7 days tied at 10 opens\./);
	const spread = text(set(model(shape('Re7kho'), ALL), [10, 12, 9, 8, 7, 6, 5]));
	assert.match(spread, /The busiest day was Sep 26, the day after it was published, with 12 opens\./);
	const tiny = text(set(model(shape('Re7kho'), ALL), [0, 0, 0, 2, 0, 0, 0]));
	assert.ok(!/busiest|Most of it came|stood out/.test(tiny));
});

test('undated album with no record: says why, compares with nothing, and never invents a date', () => {
	const m = model(shape('Re7kho'), ALL);
	const undated: UndatedLaunchAlbum = {
		albumKey: 'eEUGfA', albumName: 'VLA - Spring 2026', firstPublishedAt: null, basis: null, status: 'no_launch_date',
		series: [1, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 3, 0].map((o, i) => ({ day: null, date: addDays('2026-09-22', i), photoOpens: o, downloads: 0, albumOpens: 0, coverage: 'complete' as const })),
		currentDay: null, totals: null, rank: null, firstPublishedAtEvidence: null, reason: { code: 'no_record', text: 'Public with no publication on record.' },
		window: { start: '2026-09-22', end: '2026-10-05' }, photosInAlbum: 4, photosWithActivity: 2, photos: photos([0, 0], [4, 3]).slice(0, 2), exposure: { since: '2026-09-29', coverage: 'complete' }
	};
	m.album = undated;
	const r = recap(m);
	assert.equal(r.state, 'no_launch_date');
	assert.equal(r.published, null);
	assert.equal(recapToPlain(r.headline), '7 photo opens in the last 14 full days. It was already public before records began, so there is no launch date.');
	assert.equal(recapToPlain(r.sentences[0]), 'With no launch date there is no earlier launch to compare it with.');
	assert.match(recapToPlain(r.window), /^Counts cover 14 full days, Sep 22 to Oct 5\. Today, Oct 6, is left out\.$/);
	assert.ok(!/week|rank|median/.test(text(m).replace(/Week-1/g, '')));
	const unobserved = { ...undated, reason: { code: 'unobserved' as const, text: 'x' } };
	m.album = unobserved;
	assert.match(recapToPlain(recap(m).headline), /Its first publication was never observed, so there is no launch date\.$/);
	const notPublished = { ...undated, reason: { code: 'not_published' as const, text: 'Not published yet.' } };
	m.album = notPublished;
	assert.equal(recap(m).state, 'not_published');
	assert.equal(recapToPlain(recap(m).headline), 'This album is not published yet.');
	// An undated album with a records gap states no total.
	m.album = { ...undated, series: undated.series.map((d, i) => (i === 3 ? { ...d, photoOpens: null, coverage: 'unavailable' as const } : d)) };
	assert.match(recapToPlain(recap(m).headline), /^It was already public/);
	assert.ok(recap(m).sentences.some((s) => /Records are incomplete for 1 day, so no total is stated\./.test(recapToPlain(s))));
});

test('a recap has a headline and two to four sentences in every state', () => {
	const gap = model(shape('Re7kho', '2026-10-06', { 4: { coverage: 'partial', photoOpens: 60 } }), ALL);
	const undated = model(shape('Re7kho'), ALL);
	undated.album = {
		albumKey: 'eEUGfA', albumName: 'VLA', firstPublishedAt: null, basis: null, status: 'no_launch_date', currentDay: null, totals: null, rank: null, firstPublishedAtEvidence: null,
		reason: { code: 'no_record', text: null }, window: { start: '2026-10-01', end: '2026-10-02' }, photosInAlbum: 4, photosWithActivity: 4, photos: photos(),
		exposure: { since: null, coverage: 'none' }, series: [{ day: null, date: '2026-10-01', photoOpens: 2, downloads: 0, albumOpens: 0, coverage: 'complete' }, { day: null, date: '2026-10-02', photoOpens: 0, downloads: 0, albumOpens: 0, coverage: 'complete' }]
	};
	const notPublished = model(shape('Re7kho'), ALL);
	notPublished.album = { ...undated.album, reason: { code: 'not_published', text: null } } as UndatedLaunchAlbum;
	const seen = new Set<string>();
	for (const m of [
		model(shape('Re7kho'), ALL), model(shape('Re7kho', '2026-09-25'), ALL, {}, '2026-09-25'), model(shape('Re7kho', '2026-09-27'), ALL, {}, '2026-09-27'),
		model(shape('Re7kho', '2026-09-30'), ALL, {}, '2026-09-30'), model(shape('jq1Rp7'), ALL), gap, undated, notPublished
	]) {
		const r = recap(m);
		seen.add(r.state);
		assert.ok(r.headline.length > 0, r.state);
		assert.ok(r.sentences.length >= 2 && r.sentences.length <= 4, `${r.state}: ${r.sentences.length}`);
	}
	assert.deepEqual([...seen].sort(), ['early', 'finished', 'finished_gap', 'in_progress', 'just_published', 'no_launch_date', 'not_published']);
});

test('download requests are compared with the median of earlier launches at the same age', () => {
	const week = recap(model(shape('Re7kho'), ALL));
	assert.match(recapToPlain(week.downloads!), /^\d+ download requests were made\. In week 1 that was \d+, against a median of \d+ for the 5 earlier launches\./);
	const early = recap(model(shape('Re7kho', '2026-09-27'), ALL, {}, '2026-09-27'));
	assert.match(recapToPlain(early.downloads!), /At the same age, the \d+ earlier launches had a median of \d+\./);
	// A gap in the first week withholds the comparison rather than comparing a short count.
	const gap = recap(model(shape('Re7kho', '2026-10-06', { 4: { coverage: 'partial', photoOpens: 60 } }), ALL));
	assert.ok(!/median/.test(recapToPlain(gap.downloads!)));
	assert.match(recapToPlain(gap.downloads!), /^At least /);
	// No earlier launch, no comparison.
	assert.ok(!/median/.test(recapToPlain(recap(model(shape('Re7kho'), [])).downloads!)));
});

test('words that must not appear: people as a count, saved, guessed causes', () => {
	for (const m of [model(shape('Re7kho'), ALL), model(shape('jq1Rp7'), ALL)]) {
		const t = text(m, [{ source: 'profile', count: 4 }]);
		assert.ok(!/\bpeople (opened|viewed|visited)|visitors|users|saved|because of|caused/i.test(t.replace('Where people came from', '')), t);
	}
});

test('ordinals', () => {
	assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 112].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '112th']);
});

test('the daily chart: a gap is null, never zero, and the median uses earlier launches only', () => {
	const m = model(shape('Re7kho', '2026-10-06', { 2: { coverage: 'partial', photoOpens: 50 } }), ALL);
	const chart = dailyChart(m);
	assert.equal(chart.bars.length, 11);
	assert.equal(chart.bars[1].opens, 575);
	assert.equal(chart.bars[2].opens, null);
	assert.ok(chart.bars.every((b) => b.median !== null && b.medianOf > 0));
	assert.ok(chart.max >= 575);
	const earlier = m.launches.filter((l) => l.albumKey !== 'Re7kho' && Date.parse(l.firstPublishedAt) < Date.parse((m.album as DatedLaunchAlbum).firstPublishedAt));
	assert.equal(chart.bars[0].medianOf, earlier.length);
	// Millikin (DWdCET) was published a day after this album and must not be in its comparison.
	assert.equal(earlier.length, 5);
	assert.ok(!earlier.some((l) => l.albumKey === 'DWdCET'));
	assert.equal(chart.bars[0].median, median(earlier.map((l) => l.series[0].photoOpens as number)));
});

test('the daily chart of an undated album has no comparison line', () => {
	const m = model(shape('Re7kho'), ALL);
	m.album = {
		albumKey: 'eEUGfA', albumName: 'VLA', firstPublishedAt: null, basis: null, status: 'no_launch_date', currentDay: null, totals: null, rank: null, firstPublishedAtEvidence: null,
		reason: { code: 'no_record', text: null }, window: { start: '2026-10-01', end: '2026-10-02' }, photosInAlbum: 0, photosWithActivity: 0, photos: [], exposure: { since: null, coverage: 'none' },
		series: [{ day: null, date: '2026-10-01', photoOpens: 2, downloads: 0, albumOpens: 0, coverage: 'complete' }, { day: null, date: '2026-10-02', photoOpens: 0, downloads: 0, albumOpens: 0, coverage: 'complete' }]
	};
	const chart = dailyChart(m);
	assert.deepEqual(chart.bars.map((b) => b.median), [null, null]);
	assert.deepEqual(chart.bars.map((b) => b.label), ['Oct 1', 'Oct 2']);
});

test('cumulative curves stop at the first incomplete day and mark this album', () => {
	const m = model(shape('Re7kho', '2026-10-06', { 4: { coverage: 'partial', photoOpens: 60 } }), ALL);
	const curves = cumulativeCurves(m);
	assert.equal(curves.length, 7);
	const mine = curves.find((c) => c.current)!;
	assert.equal(curves.filter((c) => c.current).length, 1);
	assert.equal(mine.points.length, 4);
	assert.equal(mine.cutByGap, true);
	assert.deepEqual(mine.points.map((p) => p.total), [103, 678, 804, 827]);
	const whole = curves.find((c) => c.albumKey === 'fJKdsB')!;
	assert.equal(whole.cutByGap, false);
	assert.equal(whole.points.length, 14);
	assert.equal(whole.points[13].total, sum(D.fJKdsB, 14));
});

test('an album outside the comparison set still draws its own curve and row', () => {
	const m = model(shape('Re7kho'), ALL);
	m.launches = m.launches.filter((l) => l.albumKey !== 'Re7kho');
	assert.equal(cumulativeCurves(m).filter((c) => c.current).length, 1);
	assert.equal(launchTable(m).filter((r) => r.current).length, 1);
});

test('the launch table ranks week 1 best first and marks a records gap', () => {
	const m = model(shape('Re7kho', '2026-10-06', { 4: { coverage: 'partial', photoOpens: 60 } }), ALL);
	const rows = launchTable(m);
	assert.equal(rows[0].name, 'HS Girls VB - JCA vs PNHS - 08-25-2026');
	assert.deepEqual(rows.filter((r) => r.day7 !== null).map((r) => r.day7), [1258, 636, 266, 125, 37, 20]);
	const mine = rows.find((r) => r.current)!;
	assert.equal(mine.day7, null);
	assert.equal(mine.gap, true);
	assert.equal(mine.day7State, 'incomplete');
	assert.equal(mine.day3State, 'ok');
	assert.equal(rows.find((r) => r.name === 'Millikin at North Central')!.day7State, 'ok');
	assert.equal(mine.day3, 804);
	assert.equal(mine.published, 'Sep 25');
});

test('the grid lists every photo, ranked by downloads then opens, with silent photos last', () => {
	const rows = [{ photoId: 'a', cfImageId: 'ia' }, { photoId: 'b', cfImageId: 'ib' }, { photoId: 'c', cfImageId: null }, { photoId: 'd', cfImageId: 'id' }];
	const activity: LaunchPhoto[] = [
		{ photoId: 'b', opens: 9, downloads: 2, favorites: 0, exposureRecorded: true, opensInExposureWindow: 3, exposures: 4, renders: 4 },
		{ photoId: 'a', opens: 20, downloads: 2, favorites: 1, exposureRecorded: true, opensInExposureWindow: 5, exposures: 9, renders: 9 },
		{ photoId: 'd', opens: 1, downloads: 0, favorites: 0, exposureRecorded: true, opensInExposureWindow: 1, exposures: 1, renders: 1 }
	];
	const grid = gridPhotos(rows, activity, true);
	assert.deepEqual(grid.map((g) => g.photoId), ['a', 'b', 'd', 'c']);
	assert.equal(grid.length, rows.length);
	// A photo with no activity row is a true zero where exposure ran, and unknown where it did not.
	assert.equal(grid[3].exposures, 0);
	assert.equal(gridPhotos(rows, activity, false)[3].exposures, null);
	assert.equal(gridPhotos(rows, activity, false)[3].exposureRecorded, false);
});

test('an album name loses its trailing event date and is otherwise left whole', () => {
	assert.equal(nameWithoutDate('HS Girls VB - JCA vs PNHS - 08-25-2026'), 'HS Girls VB - JCA vs PNHS');
	assert.equal(nameWithoutDate("College Women's VB - Millikin at North Central - 09-23-2026"), "College Women's VB - Millikin at North Central");
	assert.equal(nameWithoutDate('Jalape\u00f1o Open - July 2026'), 'Jalape\u00f1o Open - July 2026');
	assert.equal(nameWithoutDate('09-23-2026'), '09-23-2026');
});

test('stored: the text leaves out today and points to the report instead of "below"; the page text is unchanged', () => {
	const m = model(shape('Re7kho', '2026-09-28'), ALL.map((one) => ({ ...one, asOfDay: '2026-09-28' })), { photos: photos([5, 2, 1, 0]) }, '2026-09-28');
	const page = buildRecap({ model: m, arrivals: null, photoIds: ids(4) });
	const stored = buildRecap({ model: m, arrivals: null, photoIds: ids(4), stored: true });
	assert.match(recapToPlain(page.window), /Counts cover 3 full days, Sep 25 to Sep 27\. Today, Sep 28, is partial and left out: 4 photo opens so far\./);
	assert.equal(recapToPlain(stored.window), 'Counts cover 3 full days, Sep 25 to Sep 27.');
	assert.match(recapToPlain(page.downloads!), /The photos below were requested most\./);
	assert.doesNotMatch(recapToPlain(stored.downloads!), /below/);
	assert.match(recapToPlain(stored.downloads!), /The album report lists the photos requested most\.$/);
	// Everything else is the same words.
	assert.deepEqual(stored.headline, page.headline);
	// The peak sentence says "of the total so far" on the page and names the days in a stored text, since the total is no longer "so far".
	const unpeak = (list: typeof page.sentences) => list.map((sentence) => recapToPlain(sentence).replace(/\(\d+% of .*\)\.$/, '(N%).'));
	assert.deepEqual(unpeak(stored.sentences), unpeak(page.sentences));
	assert.match(recapToPlain(stored.sentences.at(-2)!), /of its first 3 days\)\./);
	assert.deepEqual(stored.limits, page.limits);
});

test('the first launch ever says once that there is nothing to compare it with, not twice', () => {
	const m = model(shape('jq1Rp7', '2026-07-22'), [shape('jq1Rp7', '2026-07-22')], {}, '2026-07-22');
	const lines = recap(m).sentences.map((sentence) => recapToPlain(sentence));
	assert.equal(lines.filter((line) => /nothing to rank it against|No earlier launch/.test(line)).length, 1);
	assert.ok(lines.some((line) => /the only launch with a day-3 total/.test(line)));
});

test('one earlier launch is "had 10 photo opens", never a median of one', () => {
	const m = model(shape('Re7kho', '2026-09-28'), [shape('Re7kho', '2026-09-28'), shape('fJKdsB', '2026-09-28')], {}, '2026-09-28');
	const line = recap(m).sentences.map((sentence) => recapToPlain(sentence)).find((text) => /^At the same age/.test(text));
	assert.equal(line, 'At the same age, the 1 earlier launch had 1,167 photo opens.');
});
