import assert from 'node:assert/strict';
import test from 'node:test';
import {
	compareAtAge, evaluateLaunchRules, FINISHED_MAX_OPENS, LAUNCH_FINDING_DAYS, MIN_EARLIER_LAUNCHES, quietSince, SEEN_MIN_EXPOSURES,
	type LaunchEvidence, type LaunchFailureEvidence, type LaunchFocus, type LaunchPeer, type LaunchPhotoEvidence
} from './launch-rules';
import { evaluateIntelligenceRules } from './intelligence-rules';
import { minimumSample } from './intelligence-contract';

/*
 * Fixtures follow production's seven launches (series read 2026-10-06, conservative traffic). The day-3 and day-7
 * totals are the read model's; the album names are shortened. Synthetic cases say so.
 */
const PEERS: LaunchPeer[] = [
	{ albumKey: 'jq1Rp7', firstPublishedAt: '2026-07-19T15:00:00Z', day3: 10, day7: 37 },
	{ albumKey: '1BlKk4', firstPublishedAt: '2026-07-26T15:00:00Z', day3: 549, day7: 636 },
	{ albumKey: 'dKe567', firstPublishedAt: '2026-08-12T15:00:00Z', day3: 25, day7: 25 },
	{ albumKey: 'eqYF0h', firstPublishedAt: '2026-08-24T03:46:25Z', day3: 124, day7: 125 },
	{ albumKey: 'fJKdsB', firstPublishedAt: '2026-08-29T02:39:40Z', day3: 1117, day7: 1258 },
	{ albumKey: 'Re7kho', firstPublishedAt: '2026-09-26T01:10:52Z', day3: 804, day7: 931 },
	{ albumKey: 'DWdCET', firstPublishedAt: '2026-09-26T18:50:36Z', day3: 207, day7: 266 }
];
const RE7KHO = [103, 575, 126, 23, 98, 1, 5, 80, 0, 0, 0];
const DWDCET = [80, 106, 21, 2, 9, 0, 48, 0, 0, 0];

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
const noFailures = (start: string, end: string): LaunchFailureEvidence => ({ recordedSince: '2026-09-29', window: { start, end }, photoLoads: 40, photoLoadFailures: 0, downloadRequests: 5, downloadFailures: 0 });

function focus(albumKey: string, name: string, firstPublishedAt: string, day0: string, opens: Array<number | null>, over: Partial<LaunchFocus> = {}): LaunchFocus {
	const series = opens.map((n, i) => ({ day: i, date: addDays(day0, i), photoOpens: n, downloads: n === null ? null : Math.round(n / 15), coverage: n === null ? 'unavailable' as const : 'complete' as const }));
	const total = (age: number) => {
		const days = series.slice(0, age);
		const complete = days.length === age && days.every((d) => d.coverage === 'complete');
		return { complete, photoOpens: complete ? days.reduce((a, d) => a + (d.photoOpens ?? 0), 0) : null, downloads: complete ? days.reduce((a, d) => a + (d.downloads ?? 0), 0) : null };
	};
	return { albumKey, albumName: name, firstPublishedAt, basis: 'inferred', elapsedDays: opens.length, series, day3: total(3), day7: total(7), failures: noFailures(day0, addDays(day0, 6)), ...over };
}

function evidence(focused: LaunchFocus[], peers: LaunchPeer[], over: Partial<LaunchEvidence> = {}): LaunchEvidence {
	const last = focused[0]?.series.at(-1)?.date ?? '2026-10-05';
	return { asOf: `${addDays(last, 1)}T17:00:00Z`, today: addDays(last, 1), lastCompleteDay: last, albumKey: null, peers, focus: focused, ...over };
}
const run = (launch: LaunchEvidence | null) => evaluateLaunchRules({ generatedAt: '2026-10-06T17:00:00Z', cutoff: '2026-10-06T05:00:00Z', launch });
const peersAsOf = (asOf: string, ages: Record<string, { day3: number | null; day7: number | null }>) => PEERS.filter((p) => Date.parse(p.firstPublishedAt) <= Date.parse(asOf)).map((p) => ({ ...p, ...(ages[p.albumKey] ?? {}) }));

test('JCA at ACC at day 3: ranked against the five launches before it, with their median, never a percentage', () => {
	// As of Sep 28: Re7kho has days 0-2. DWdCET (published after it) and its own day 7 do not exist yet.
	const peers = peersAsOf('2026-09-28T17:00:00Z', { Re7kho: { day3: 804, day7: null } });
	const re = focus('Re7kho', 'HS Girls VB - JCA at ACC - 09-22-2026', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO.slice(0, 3));
	const result = run(evidence([re], peers));
	const reach = result.findings.find((f) => f.rule === 'launch_reach');
	assert.equal(reach?.id, 'launch-reach-day3-Re7kho');
	assert.equal(reach?.title, '804 photo opens in its first 3 days', 'the card or page heading above names the album');
	assert.equal(reach?.explanation, '1 of the 5 launches before it had more photo opens by day 3. Their median was 124, so this launch is above it.');
	assert.deepEqual(reach?.evidence.comparison, { age: 3, rank: 2, launches: 6, tied: false, median: 124, lowest: 10, highest: 1117, excluded: 0 });
	assert.match(reach?.evidenceText ?? '', /Sep 25–27/);
	assert.doesNotMatch(`${reach?.title} ${reach?.explanation} ${reach?.why}`, /%|times (more|as)/, 'counts, not ratios');
	assert.equal(reach?.target.albumKey, 'Re7kho');
});

test('a launch is never compared with one published after it, even when that one has reached the same age by now', () => {
	// Millikin (DWdCET) was published 18 hours after JCA at ACC. As of Oct 6 it has its own day-3 and day-7 totals.
	const re = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO.slice(0, 3));
	const c = compareAtAge(re, PEERS, 3);
	assert.ok(c.ok);
	if (c.ok) { assert.equal(c.launches, 6); assert.equal(c.earlier, 5); }
});

test('Millikin at day 7: an even count of earlier launches gives a median between two, said as "about"', () => {
	const peers = peersAsOf('2026-10-03T17:00:00Z', {});
	const mk = focus('DWdCET', 'Millikin at North Central', '2026-09-26T18:50:36Z', '2026-09-26', DWDCET.slice(0, 7));
	const reach = run(evidence([mk], peers)).findings.find((f) => f.rule === 'launch_reach');
	assert.equal(reach?.explanation, '3 of the 6 launches before it had more photo opens by day 7. Their median was about 381, so this launch is below it.');
	assert.equal(reach?.evidence.comparison?.median, 380.5, 'the stored median is exact');
	assert.equal(reach?.action, 'Check where the album was shared, and whether the people in it have the link.');
});

test('tied totals share a rank and say so', () => {
	const peers: LaunchPeer[] = ['a', 'b', 'c'].map((key, i) => ({ albumKey: key, firstPublishedAt: `2026-08-0${i + 1}T12:00:00Z`, day3: [500, 300, 300][i], day7: null }));
	const mine = focus('d', 'Delta (synthetic)', '2026-09-01T17:00:00Z', '2026-09-01', [100, 150, 50]);
	const reach = run(evidence([mine], peers)).findings.find((f) => f.rule === 'launch_reach');
	assert.equal(reach?.explanation, '1 of the 3 launches before it had more photo opens by day 3, and 2 had the same number. Their median was 300, the same as this launch.');
	assert.equal(reach?.evidence.comparison?.tied, true);
});

test('a tiny launch or a thin history is a recorded reason, never a ranked finding', () => {
	const tiny = focus('t', 'Tiny (synthetic)', '2026-09-01T17:00:00Z', '2026-09-01', [5, 4, 3]);
	const result = run(evidence([tiny], PEERS.slice(0, 5)));
	assert.equal(result.findings.some((f) => f.rule === 'launch_reach'), false);
	assert.match(result.suppressions.find((s) => s.rule === 'launch_reach')?.reason ?? '', new RegExp(`12 photo opens in the first 3 days. A launch needs at least ${minimumSample}`));
	const early = focus('e', 'Early (synthetic)', '2026-07-30T17:00:00Z', '2026-07-30', [300, 200, 100]);
	const thin = run(evidence([early], PEERS.slice(0, 2)));
	assert.match(thin.suppressions.find((s) => s.rule === 'launch_reach')?.reason ?? '', new RegExp(`Only 2 earlier launches have a complete day-3 total. At least ${MIN_EARLIER_LAUNCHES}`));
	assert.equal(thin.findings.length, 0);
});

test('a zero baseline is compared as counts: earlier launches with 0 opens do not make a ratio', () => {
	const peers: LaunchPeer[] = ['a', 'b', 'c'].map((key, i) => ({ albumKey: key, firstPublishedAt: `2026-08-0${i + 1}T12:00:00Z`, day3: 0, day7: 0 }));
	const mine = focus('z', 'Zero baseline (synthetic)', '2026-09-01T17:00:00Z', '2026-09-01', [10, 10, 10]);
	const reach = run(evidence([mine], peers)).findings.find((f) => f.rule === 'launch_reach');
	assert.equal(reach?.explanation, 'None of the 3 launches before it had more photo opens by day 3. Their median was 0, so this launch is above it.');
});

test('unequal coverage: an incomplete day blocks this launch\'s total, and incomplete peers are left out and counted', () => {
	const gappy = focus('g', 'Gappy (synthetic)', '2026-09-26T01:10:52Z', '2026-09-25', [103, null, 126]);
	const result = run(evidence([gappy], PEERS));
	assert.equal(result.findings.some((f) => f.rule === 'launch_reach'), false);
	assert.match(result.suppressions.find((s) => s.rule === 'launch_reach')?.reason ?? '', /Sep 26 is not completely recorded/);
	const gap = result.findings.find((f) => f.rule === 'collection_health');
	assert.equal(gap?.id, 'collection-gap-g');
	assert.equal(gap?.severity, 'high');
	assert.match(gap?.why ?? '', /a quiet day cannot be told apart from a missing one/);

	const peers = PEERS.map((p) => (p.albumKey === '1BlKk4' ? { ...p, day3: null } : p));
	const re = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO.slice(0, 3));
	const reach = run(evidence([re], peers)).findings.find((f) => f.rule === 'launch_reach');
	assert.equal(reach?.evidence.comparison?.excluded, 1);
	assert.ok(reach?.limits?.includes('1 earlier launch is left out because a day in its first 3 days was not completely recorded.'));
});

test('an outage at the end of a launch is a data gap, never a finished launch', () => {
	// Synthetic: JCA at ACC's series with its last three days unrecorded. Unknown must not read as quiet.
	const outage = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', [...RE7KHO.slice(0, 8), null, null, null]);
	const result = run(evidence([outage], PEERS));
	assert.equal(result.findings.some((f) => f.rule === 'launch_finished'), false);
	assert.match(result.suppressions.find((s) => s.rule === 'launch_finished')?.reason ?? '', /cannot be told apart from missing data/);
	assert.match(result.findings.find((f) => f.rule === 'collection_health')?.explanation ?? '', /Oct 3, Oct 4 and Oct 5/);
	assert.equal(result.findings[0].rule, 'collection_health', 'a data gap ranks first');
});

test('launch finished: three quiet complete days after the first week recap the outcome and point to the downloads', () => {
	const re = focus('Re7kho', 'HS Girls VB - JCA at ACC - 09-22-2026', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO);
	const result = run(evidence([re], PEERS));
	const done = result.findings.find((f) => f.rule === 'launch_finished');
	assert.equal(done?.title, 'The launch is over');
	assert.match(done?.explanation ?? '', /^No one has opened a photo since Oct 2, counting complete days through Oct 5\. In its first 7 days it had 931 photo opens and \d+ download requests\. 1 of the 5 launches before it had more photo opens by day 7; their median was 125\.$/);
	assert.ok(done?.evidenceLinks?.some((link) => link.endsWith('#downloads-title')));
	assert.equal(result.findings.some((f) => f.rule === 'launch_reach'), false, 'the recap replaces the reach comparison');
	assert.match(result.suppressions.find((s) => s.rule === 'launch_reach')?.reason ?? '', /recap replaces/);
});

test('quietSince is read from every complete day: the last open day, and only when every later day is complete and zero', () => {
	const day = (i: number, photoOpens: number | null, coverage: 'complete' | 'partial' = 'complete') => ({ date: addDays('2026-09-25', i), photoOpens, coverage });
	// Opens through day 7, then five empty days: since Oct 2, not "since the start of the last three days".
	const long = [103, 575, 126, 23, 98, 1, 5, 80, 0, 0, 0, 0, 0].map((n, i) => day(i, n));
	assert.equal(quietSince(long, '2026-10-07'), '2026-10-02');
	// The same series read through an earlier day gives the same last open day only when it reaches that day.
	assert.equal(quietSince(long, '2026-10-06'), null, 'the series does not end on the day the claim is made through');
	// An open on the final day is still active: no claim.
	assert.equal(quietSince([...long.slice(0, 12), day(12, 1)], '2026-10-07'), null);
	// An incomplete day after the last open is not a quiet day.
	assert.equal(quietSince([...long.slice(0, 11), day(11, null, 'partial'), day(12, 0)], '2026-10-07'), null);
	// A launch with no open at all, or no days, says nothing.
	assert.equal(quietSince(long.map((d) => ({ ...d, photoOpens: 0 })), '2026-10-07'), null);
	assert.equal(quietSince([], '2026-10-07'), null);
});

test('launch finished: the quiet sentence names the last open day from the whole series, and falls back to the count when the last day still has an open', () => {
	const quietish = focus('q', 'Quietish (synthetic)', '2026-09-01T17:00:00Z', '2026-09-01', [300, 200, 100, 50, 20, 10, 5, 1, 1, FINISHED_MAX_OPENS - 2]);
	const text = run(evidence([quietish], PEERS)).findings.find((f) => f.rule === 'launch_finished')?.explanation ?? '';
	assert.match(text, /^3 photo opens on Sep 8–10, the last 3 complete days\. In its first 7 days/);
	assert.doesNotMatch(text, /No one has opened/);
	// Opens through day 7 then four empty days: "since Sep 8" (day 7), though the last three days alone would say nothing about when.
	const long = focus('l', 'Long quiet (synthetic)', '2026-09-01T17:00:00Z', '2026-09-01', [300, 200, 100, 50, 20, 10, 5, 4, 0, 0, 0, 0]);
	assert.match(run(evidence([long], PEERS)).findings.find((f) => f.rule === 'launch_finished')?.explanation ?? '', /^No one has opened a photo since Sep 8, counting complete days through Sep 12\./);
});

test('a late burst keeps a launch open: JCA at ACC is not finished while day 7 (80 opens) is in its last three days', () => {
	for (const days of [8, 9, 10]) {
		const re = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO.slice(0, days));
		const result = run(evidence([re], PEERS));
		assert.equal(result.findings.some((f) => f.rule === 'launch_finished'), false, `day ${days}`);
		assert.match(result.suppressions.find((s) => s.rule === 'launch_finished')?.reason ?? '', /Still active/);
	}
	// "Near zero" is a named limit: at most FINISHED_MAX_OPENS opens over the three days.
	const quietish = focus('q', 'Quietish (synthetic)', '2026-09-01T17:00:00Z', '2026-09-01', [300, 200, 100, 50, 20, 10, 5, 1, 1, FINISHED_MAX_OPENS - 2]);
	assert.ok(run(evidence([quietish], PEERS)).findings.some((f) => f.rule === 'launch_finished'));
});

test('findings end with the launch window: an old launch says nothing on Home or its report', () => {
	const old = focus('fJKdsB', 'JCA vs PNHS', '2026-08-29T02:39:40Z', '2026-08-28', [749, 352, 16, 140, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1], { elapsedDays: LAUNCH_FINDING_DAYS + 1 });
	const result = run(evidence([old], PEERS));
	assert.deepEqual(result.findings, []);
	assert.ok(result.suppressions.every((s) => /past its first 14 days/.test(s.reason)));
});

test('no launch, no read: an empty window and a failed read are said differently, and neither is a finding', () => {
	const quiet = run(evidence([], PEERS));
	assert.deepEqual(quiet.findings, []);
	assert.match(quiet.suppressions[0].reason, /No album was first published in the last 14 days/);
	const failed = run(null);
	assert.deepEqual(failed.findings, []);
	assert.ok(failed.suppressions.every((s) => /This is not a quiet launch/.test(s.reason)));
});

test('failures during a launch: two photo-load failures in the first week, with the late start and the small sample said', () => {
	const mk = focus('DWdCET', 'Millikin at North Central', '2026-09-26T18:50:36Z', '2026-09-26', DWDCET.slice(0, 7), {
		failures: { recordedSince: '2026-09-29', window: { start: '2026-09-29', end: '2026-10-02' }, photoLoads: 14, photoLoadFailures: 2, downloadRequests: 7, downloadFailures: 0 }
	});
	const found = run(evidence([mk], PEERS)).findings.find((f) => f.rule === 'launch_failures');
	assert.equal(found?.id, 'launch-photo-failures-DWdCET');
	assert.equal(found?.severity, 'high');
	assert.equal(found?.title, '2 of 14 photo loads failed during the launch');
	assert.equal(found?.explanation, '2 photo loads failed on Sep 29 – Oct 2, out of 14 with a recorded result. A load with no recorded result is not counted either way.');
	assert.match(found?.action ?? '', /If they all do, nothing needs fixing\.$/);
	assert.ok(found?.limits?.some((l) => /day 3 of this launch/.test(l)));
	assert.ok(found?.limits?.some((l) => /small sample/.test(l)));
	assert.equal(found?.evidence.strength, 'limited');

	const one = focus('x', 'One failure (synthetic)', '2026-09-26T18:50:36Z', '2026-09-26', DWDCET.slice(0, 7), { failures: { recordedSince: '2026-09-29', window: { start: '2026-09-29', end: '2026-10-02' }, photoLoads: 30, photoLoadFailures: 1, downloadRequests: 7, downloadFailures: 1 } });
	assert.equal(run(evidence([one], PEERS)).findings.some((f) => f.rule === 'launch_failures'), false);
	const unread = focus('u', 'Unread (synthetic)', '2026-09-26T18:50:36Z', '2026-09-26', DWDCET.slice(0, 7), { failures: null });
	assert.match(run(evidence([unread], PEERS)).suppressions.find((s) => s.rule === 'launch_failures')?.reason ?? '', /not a report of zero failures/);
	const before = focus('b', 'Before recording (synthetic)', '2026-08-29T02:39:40Z', '2026-08-28', [749, 352, 16, 140, 1, 0, 0], { failures: { recordedSince: '2026-09-29', window: null, photoLoads: 0, photoLoadFailures: 0, downloadRequests: 0, downloadFailures: 0 } });
	assert.match(run(evidence([before], PEERS)).suppressions.find((s) => s.rule === 'launch_failures')?.reason ?? '', /first recorded on Sep 29, after this launch/);
});

function photosOf(rows: Array<[string, number, number]>, over: Partial<LaunchPhotoEvidence> = {}): LaunchPhotoEvidence {
	return { exposureSince: '2026-09-29', exposureCoverage: 'partial', window: { start: '2026-09-25', end: '2026-10-05' }, photos: rows.map(([photoId, exposures, opensInExposureWindow]) => ({ photoId, exposures, opensInExposureWindow })), ...over };
}

test('seen but rarely opened: a prompt to look, named only when the album\'s own typical photo predicts at least 5 opens', () => {
	// Synthetic: eight photos seen 40 times; the typical one was opened 10 times. One was opened once.
	const rows: Array<[string, number, number]> = [['p1', 40, 10], ['p2', 40, 11], ['p3', 40, 9], ['p4', 40, 10], ['p5', 40, 12], ['p6', 40, 10], ['low', 40, 1], ['ok', 40, 8]];
	const re = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO.slice(0, 5));
	const result = run(evidence([re], PEERS, { albumKey: 'Re7kho', photos: photosOf(rows) }));
	const seen = result.findings.filter((f) => f.rule === 'seen_rarely_opened');
	assert.deepEqual(seen.map((f) => f.target), [{ kind: 'photo', id: 'low', albumKey: 'Re7kho' }]);
	assert.equal(seen[0].explanation, 'Its tile was on screen 40 times in the gallery grid, and it was opened 1 time on those days. Photos in this album seen as often were typically opened about 10 times.');
	assert.match(seen[0].why ?? '', /not a verdict on the photo/);
	assert.doesNotMatch(`${seen[0].title} ${seen[0].explanation} ${seen[0].action}`, /quality|better|worse|bad/i);
	assert.ok(seen[0].limits?.some((l) => /day 4 of this launch/.test(l)), 'exposure began after the launch started, and it says so');
	assert.deepEqual(seen[0].evidenceLinks, ['/photo/low']);
});

test('seen but rarely opened stays silent on today\'s real volume and before exposure was recorded', () => {
	// Production, Oct 6: the most any JCA at ACC photo was on screen is 19 times.
	const real = photosOf([['a', 19, 3], ['b', 14, 2], ['c', 12, 0], ['d', 9, 1], ['e', 6, 0]]);
	const re = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO.slice(0, 5));
	const quiet = run(evidence([re], PEERS, { albumKey: 'Re7kho', photos: real }));
	assert.equal(quiet.findings.some((f) => f.rule === 'seen_rarely_opened'), false);
	assert.match(quiet.suppressions.find((s) => s.rule === 'seen_rarely_opened')?.reason ?? '', new RegExp(`0 photos were on screen at least ${SEEN_MIN_EXPOSURES} times.*most any photo was on screen is 19 times`));
	const old = focus('fJKdsB', 'JCA vs PNHS', '2026-08-29T02:39:40Z', '2026-08-28', [749, 352, 16, 140, 1]);
	const none = run(evidence([old], PEERS, { albumKey: 'fJKdsB', photos: photosOf([], { exposureCoverage: 'none' }) }));
	assert.match(none.suppressions.find((s) => s.rule === 'seen_rarely_opened')?.reason ?? '', /first recorded on Sep 29, after this launch/);
	// Many photos checked at once: at most three are named, the furthest below first.
	const many: Array<[string, number, number]> = [...Array.from({ length: 6 }, (_, i): [string, number, number] => [`n${i}`, 50, 15]), ['l1', 50, 0], ['l2', 50, 1], ['l3', 50, 2], ['l4', 50, 3]];
	const named = run(evidence([re], PEERS, { albumKey: 'Re7kho', photos: photosOf(many) })).findings.filter((f) => f.rule === 'seen_rarely_opened').map((f) => f.target.id);
	assert.deepEqual(named, ['l1', 'l2', 'l3']);
});

test('the gallery-wide scope speaks about every recent launch but names photos only on an album\'s own scope', () => {
	const re = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO);
	const mk = focus('DWdCET', 'Millikin', '2026-09-26T18:50:36Z', '2026-09-26', DWDCET);
	const result = run(evidence([mk, re], PEERS, { albumKey: null }));
	assert.deepEqual(result.findings.map((f) => f.id).sort(), ['launch-finished-DWdCET', 'launch-finished-Re7kho']);
	assert.equal(result.suppressions.some((s) => s.rule === 'seen_rarely_opened'), false);
});

test('the same evidence gives the same findings, through the intelligence entry point', () => {
	const re = focus('Re7kho', 'JCA at ACC', '2026-09-26T01:10:52Z', '2026-09-25', RE7KHO.slice(0, 7));
	const launch = evidence([re], PEERS, { albumKey: 'Re7kho', photos: photosOf([]) });
	const input = { scope: { kind: 'launch' as const, albumKey: 'Re7kho' }, generatedAt: '2026-10-02T17:00:00Z', cutoff: '2026-10-02T05:00:00Z', coverage: 'complete' as const, current: null, previous: null, launch };
	const first = evaluateIntelligenceRules(input);
	const second = evaluateIntelligenceRules(JSON.parse(JSON.stringify(input)));
	assert.deepEqual(second, first);
	assert.equal(first.findings.find((f) => f.rule === 'launch_reach')?.id, 'launch-reach-day7-Re7kho');
	assert.equal(evaluateIntelligenceRules({ ...input, launch: null, launchUnavailable: 'Launch reporting is not installed. This is not a quiet launch.' }).findings.length, 0);
});

test('day boundaries are counted in days, not hours, across the November DST change', () => {
	// Synthetic: published 10:00 CDT Oct 29, 2026. Clocks fall back Nov 1. Day 6 is Nov 4.
	const dst = focus('dst', 'Across DST (synthetic)', '2026-10-29T15:00:00Z', '2026-10-29', [300, 200, 100, 40, 30, 20, 10]);
	const reach = run(evidence([dst], PEERS)).findings.find((f) => f.rule === 'launch_reach');
	assert.deepEqual(reach?.evidence.windows.current, { start: '2026-10-29', end: '2026-11-04' });
	assert.match(reach?.evidenceText ?? '', /Oct 29 – Nov 4/);
});
