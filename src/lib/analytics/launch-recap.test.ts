import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatedLaunchAlbum, Launch, LaunchDay, LaunchPhoto, LaunchReadModel, UndatedLaunchAlbum } from './launch-read-model.server';
import { addDays, ALL, D, day, model, NAMES, photos, shape, START, sum, type Shape } from './launch-recap.fixture';
import { buildRecap, cumulativeOpens, launchAhead, median, ordinal, RECOVERED_ALL_NOTE, RECOVERED_NOTE, recapToPlain, recoveredDates, unsortedSentence, type ArrivalRow } from './launch-recap';
import { cumulativeCurves, dailyChart, gridPhotos, launchTable, mergeLimits, nameWithoutDate } from './launch-report-view';

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
	assert.equal(recapToPlain(r.published!), 'Published Sep 25*.');
	assert.equal(recapToPlain(r.headline), '931 photo opens in its first week.');
	const lines = r.sentences.map((s) => recapToPlain(s));
	assert.match(lines[0], /^At the same age, the 5 earlier launches had a median of 125 photo opens\.$/);
	assert.match(lines[1], /^As of Oct 6, over its first 7 days \(Sep 25 to Oct 1\) it is 2nd of the 7 launches with a week-1 total, and the next one up is HS Girls VB - JCA vs PNHS - 08-25-2026 \(1,258\)\.$/);
	assert.match(lines[2], /^Most of it came at once: 575 opens on Sep 26, the day after it was published \(62% of the week\)\.$/);
	assert.equal(lines[3], 'Every one of the 4 photos was opened at least once.');
	assert.equal(r.sentences.length, 4);
});

test('the day Chicago says a launch began is the day it is dated, not the UTC day', () => {
	const m = model(shape('Re7kho'), ALL);
	m.album.firstPublishedAt = '2026-09-26T01:10:52.556+00:00';
	assert.equal(recapToPlain(recap(m).published!), 'Published Sep 25*.');
	// Text read away from a page has no footnote to hold the mark, so a stored recap says the words.
	assert.equal(recapToPlain(buildRecap({ model: m, arrivals: null, photoIds: ids(4), stored: true }).published!), 'Published Sep 25 (date recovered afterwards from a log).');
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
	assert.match(recapToPlain(recap(m).sentences[1]), /^As of Oct 6, over its first 7 days \(Aug 28 to Sep 3\) it is first of the 7 launches with a week-1 total\.$/);
	const tied = model(shape('Re7kho'), ALL);
	(tied.album as DatedLaunchAlbum).rank.day7 = { rank: 1, compared: 7, tied: true };
	assert.match(recapToPlain(recap(tied).sentences[1]), /^As of Oct 6, over its first 7 days \(Sep 25 to Oct 1\) it is tied for first of the 7 launches/);
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
	assert.match(three.sentences.map((s) => recapToPlain(s)).join(' '), /As of Sep 28, over its first 3 days \(Sep 25 to Sep 27\) it is \d(st|nd|rd|th) of the \d launches with a day-3 total/);
	const five = recap(model(shape('Re7kho', '2026-09-30'), ALL, {}, '2026-09-30'));
	assert.match(five.sentences.map((s) => recapToPlain(s)).join(' '), /In its first 3 days \(Sep 25 to Sep 27\) it had 804 photo opens, \d(st|nd|rd|th) of the \d launches with a day-3 total as of Sep 30/);
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
	assert.match(w, /^Week-1 figures use 7 full days, Sep 25 to Oct 1\. The chart, download requests and photo counts use all 11 full days, to Oct 5\./);
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
	assert.match(d, /^In week 1 \(Sep 25 to Oct 1\) there were \d+ download requests, /);
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

test('arrivals: arrivals by link label when they exist, said in one plain sentence that no one can be named, and a limit when none do', () => {
	const m = model(shape('Re7kho'), ALL);
	const r = recap(m, [{ source: 'links', count: 3 }, { source: 'profile', count: 19 }]);
	assert.equal(recapToPlain(r.arrivals!), 'Over Sep 25 to Oct 5, 22 arrivals came in through shared links: profile 19 (86%), links 3 (14%). An arrival is one browser landing from a labeled link, counted once a day, so no one can be named. A visit with no label cannot be traced to a source.');
	assert.equal(recapToPlain(recap(m, [{ source: 'profile', count: 4 }]).arrivals!), 'Over Sep 25 to Oct 5, 4 arrivals came in through shared links, all labeled "profile". An arrival is one browser landing from a labeled link, counted once a day, so no one can be named. A visit with no label cannot be traced to a source.');
	assert.ok(!r.limits.some((l) => /came from/.test(l)));
	const none = recap(m, []);
	assert.equal(none.arrivals, null);
	assert.ok(none.limits.some((l) => /Where people came from is only known for links with a label, and none were recorded\./.test(l)));
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
	assert.match(recapToPlain(week.downloads!), /^In week 1 \(Sep 25 to Oct 1\) there were \d+ download requests, against a median of \d+ for the 5 earlier launches\. Over all 11 full days \(Sep 25 to Oct 5\) there were \d+ download requests\./);
	const early = recap(model(shape('Re7kho', '2026-09-27'), ALL, {}, '2026-09-27'));
	assert.match(recapToPlain(early.downloads!), /At the same age, the \d+ earlier launches had a median of \d+\./);
	// A gap in the first week withholds the comparison rather than comparing a short count.
	const gap = recap(model(shape('Re7kho', '2026-10-06', { 4: { coverage: 'partial', photoOpens: 60 } }), ALL));
	assert.ok(!/median/.test(recapToPlain(gap.downloads!)));
	assert.match(recapToPlain(gap.downloads!), /^Over Sep 25 to Oct 5, at least /);
	// No earlier launch, no comparison.
	assert.ok(!/median/.test(recapToPlain(recap(model(shape('Re7kho'), [])).downloads!)));
});

test('each download figure leads with the days it covers: week 1 first, with its comparison, then the longer window', () => {
	const old = recapToPlain(recap(model(shape('Re7kho'), ALL)).downloads!);
	assert.match(old, /^In week 1 \(Sep 25 to Oct 1\) there were 94 download requests, against a median of 13 for the 5 earlier launches\. Over all 11 full days \(Sep 25 to Oct 5\) there were 103 download requests\. /);
	// The week and the longer window say different numbers, each with its own days; neither number stands without them.
	assert.ok(!/that was/.test(old));
	// Nothing came after week 1: one window, said once.
	const after = shape('Re7kho', '2026-10-06', Object.fromEntries([7, 8, 9, 10].map((i) => [i, { photoOpens: 0, downloads: 0 }])));
	const single = recapToPlain(recap(model(after, ALL)).downloads!);
	assert.ok(!/Over all/.test(single), single);
	assert.match(single, /^In week 1 \(Sep 25 to Oct 1\) there were \d+ download requests, against a median of 13 for the 5 earlier launches\. /);
	// One earlier launch is a figure, not a median.
	const one = recapToPlain(recap(model(shape('Re7kho'), [shape('Re7kho'), shape('fJKdsB')])).downloads!);
	assert.match(one, /^In week 1 \(Sep 25 to Oct 1\) there were 94 download requests, against \d+ for the 1 earlier launch\. Over all 11 full days/);
	assert.ok(!/median/.test(one), one);
	// A launch still inside its first week has one window, and the comparison is at the same age.
	const early = recapToPlain(recap(model(shape('Re7kho', '2026-09-27'), ALL, {}, '2026-09-27')).downloads!);
	assert.match(early, /^Over Sep 25 to Sep 26, \d+ download requests were made\. At the same age, the \d+ earlier launches had a median of \d+\./);
	assert.ok(!/\s$/.test(early));
});

test('a recovered launch date carries the mark on a page unless the page says once that every date was recovered; stored text keeps its words', () => {
	const m = model(shape('Re7kho'), ALL);
	assert.equal(recapToPlain(buildRecap({ model: m, arrivals: null, photoIds: ids(4) }).published!), 'Published Sep 25*.');
	assert.equal(recapToPlain(buildRecap({ model: m, arrivals: null, photoIds: ids(4), markRecovered: false }).published!), 'Published Sep 25.');
	const stored = (markRecovered: boolean) => recapToPlain(buildRecap({ model: m, arrivals: null, photoIds: ids(4), stored: true, markRecovered }).published!);
	assert.equal(stored(true), 'Published Sep 25 (date recovered afterwards from a log).');
	assert.equal(stored(false), 'Published Sep 25 (date recovered afterwards from a log).');
	assert.deepEqual(recoveredDates([true, true, true]), { mark: false, note: RECOVERED_ALL_NOTE });
	assert.deepEqual(recoveredDates([true, false, true]), { mark: true, note: RECOVERED_NOTE });
	assert.deepEqual(recoveredDates([false, false]), { mark: false, note: null });
	assert.deepEqual(recoveredDates([]), { mark: false, note: null });
	assert.deepEqual(recoveredDates([true]), { mark: false, note: RECOVERED_ALL_NOTE });
});

test('an album says what share of its counted photo opens came from browsers the counter could not sort, with its own dates and the real share', () => {
	const classes = (audience: number, unclassified: number) => [{ classification: 'audience', count: audience }, { classification: 'unclassified', count: unclassified }, { classification: 'known_crawler', count: 900 }];
	assert.equal(unsortedSentence(classes(44, 232), 'this album’s', 'Sep 25 to Oct 6'), 'Most of this album’s counted photo opens, Sep 25 to Oct 6 (84%), came from browsers the gallery’s counter could not sort. They are counted, and they are not called human, so read these totals as an upper limit on what visitors did.');
	assert.equal(unsortedSentence(classes(240, 36), 'this album’s', 'Sep 25 to Oct 6'), '13% of this album’s counted photo opens, Sep 25 to Oct 6, came from browsers the gallery’s counter could not sort. They are counted, and they are not called human.');
	assert.equal(unsortedSentence(classes(10, 0), 'this album’s', 'Sep 25 to Oct 6'), null);
	assert.equal(unsortedSentence(null, 'this album’s', 'Sep 25 to Oct 6'), null);
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
	// The comparison is the first week, days 0 to 6, whatever age the launch has reached: a second window would give one launch two totals.
	assert.equal(whole.points.length, 7);
	assert.equal(whole.points[6].total, sum(D.fJKdsB, 7));
});

test('one window in the comparison: the chart\'s highest line ends at the table\'s week-1 figure and the recap\'s "behind" figure, not at its day-13 total', () => {
	// Production, 2026-10-07: HS Girls VB - JCA vs PNHS had 1,258 photo opens in week 1 and 1,259 by day 13. The chart used to end its line at its last day
	// while the table and the sentence said 1,258, and a reader took the two numbers for one launch to be an error.
	assert.equal(sum(D.fJKdsB, 7), 1258);
	assert.ok(sum(D.fJKdsB, 14) > 1258, 'the longer window is a different number for the same launch');
	const m = model(shape('Re7kho'), ALL);
	const curves = cumulativeCurves(m);
	const others = curves.filter((c) => !c.current);
	const leader = others.reduce((best, c) => (c.points.at(-1)!.total > best.points.at(-1)!.total ? c : best));
	assert.equal(leader.albumKey, 'fJKdsB');
	assert.equal(leader.points.at(-1)!.day, 6);
	assert.equal(leader.points.at(-1)!.total, 1258);
	assert.equal(leader.points.at(-1)!.total, launchTable(m)[0].day7);
	assert.match(text(m), /and the next one up is HS Girls VB - JCA vs PNHS - 08-25-2026 \(1,258\)/);
	// This album's own line ends at its week-1 total, the headline's number, not at the 1,035 it had by day 11.
	const mine = curves.find((c) => c.current)!;
	assert.equal(mine.points.at(-1)!.total, 931);
	assert.equal(recapToPlain(recap(m).headline), '931 photo opens in its first week.');
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

test('one list of limits per page: the same fact said two ways is said once, and a recovered-date note the page already carries is not said again', () => {
	const own = ['Which photos people saw but did not open is recorded only from Sep 29.', 'Counts are browser actions, not people.'];
	const found = [
		'Counts are photo opens, not people. One person opening ten photos counts ten times.',
		'A download request is a request, not a confirmed saved file.',
		'The rank says how this launch compares, not why.',
		'The first publication time was worked out from server logs, not recorded when the album was published.',
		'The rank says how this launch compares, not why.'
	];
	assert.deepEqual(mergeLimits(own, found, true), [
		'Which photos people saw but did not open is recorded only from Sep 29.',
		'Counts are browser actions, not people.',
		'A download request is a request, not a confirmed saved file.',
		'The rank says how this launch compares, not why.'
	]);
	// A page with no marked date has nowhere else that says it, so the finding's own note stays.
	assert.ok(mergeLimits(own, found, false).includes('The first publication time was worked out from server logs, not recorded when the album was published.'));
	assert.deepEqual(mergeLimits([], [], false), []);
});
