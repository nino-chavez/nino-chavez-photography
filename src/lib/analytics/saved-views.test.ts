import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportQuery } from './report-contract';
import { describeSavedView, renamedViewFromForm, savedQueryState, savedViewFromForm, savedViewParams, SAVED_VIEW_NAME_MAX } from './saved-views';

const NOW = new Date('2026-10-06T15:00:00Z');
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };

test('a view saved from settings has exactly the stored shape the gallery report writes', () => {
	const fromSettings = savedViewFromForm(form({ name: '  Last 30 days, photo opens ', period: '30', measure: 'photo_opens' }), NOW);
	assert.equal(fromSettings.ok, true);
	if (!fromSettings.ok) return;
	assert.equal(fromSettings.name, 'Last 30 days, photo opens');
	// What the gallery report stores for the same filters is the same row.
	const gallery = savedQueryState(parseReportQuery(new URLSearchParams({ period: '30', measure: 'photo_opens', traffic: 'conservative', compare: 'previous' }), NOW));
	assert.deepEqual(fromSettings.query, gallery);
	assert.deepEqual(Object.keys(fromSettings.query).sort(), ['albums', 'compare', 'end', 'measure', 'period', 'scope', 'start', 'traffic']);
	assert.equal(fromSettings.query.period, 'custom');
	assert.equal(fromSettings.query.scope, 'all');
	assert.deepEqual(fromSettings.query.albums, []);
	assert.equal(fromSettings.query.start, '2026-09-06');
	assert.equal(fromSettings.query.end, '2026-10-05');
	// 7 and 90 days follow the same rule.
	const week = savedViewFromForm(form({ name: 'Week', period: '7', measure: 'downloads' }), NOW);
	assert.equal(week.ok && week.query.start, '2026-09-29');
	assert.equal(week.ok && week.query.measure, 'downloads');
});

test('a view that cannot be saved says why in plain words, and nothing is invented', () => {
	for (const name of ['', '   ', 'x'.repeat(SAVED_VIEW_NAME_MAX + 1)]) {
		const result = savedViewFromForm(form({ name, period: '30', measure: 'photo_opens' }), NOW);
		assert.deepEqual(result, { ok: false, error: 'Give this view a name of 1–100 characters.' });
	}
	assert.deepEqual(savedViewFromForm(form({ name: 'a', period: '45', measure: 'photo_opens' }), NOW), { ok: false, error: 'Choose 7, 30 or 90 days.' });
	assert.deepEqual(savedViewFromForm(form({ name: 'a', period: '30', measure: 'visitors' }), NOW), { ok: false, error: 'Choose what to count.' });
	assert.deepEqual(savedViewFromForm(form({ name: 'a' }), NOW), { ok: false, error: 'Choose 7, 30 or 90 days.' });
	assert.equal(savedViewFromForm(form({ name: 'x'.repeat(SAVED_VIEW_NAME_MAX), period: '30', measure: 'shares' }), NOW).ok, true);
});

test('renaming changes the name and nothing else', () => {
	assert.deepEqual(renamedViewFromForm(form({ id: 'abc', name: ' New name ' })), { ok: true, id: 'abc', name: 'New name' });
	assert.deepEqual(renamedViewFromForm(form({ name: 'New name' })), { ok: false, error: 'Choose a view to rename.' });
	assert.deepEqual(renamedViewFromForm(form({ id: 'abc', name: '' })), { ok: false, error: 'Give this view a name of 1–100 characters.' });
});

test('a saved view reopens the gallery report with the filters it stored', () => {
	const stored = savedQueryState(parseReportQuery(new URLSearchParams({ period: 'custom', start: '2026-09-25', end: '2026-10-02', scope: 'album', albums: 'Re7kho', measure: 'downloads', traffic: 'inclusive', compare: 'none', sport: 'volleyball' }), NOW));
	const params = savedViewParams(stored)!;
	assert.equal(params.get('albums'), 'Re7kho');
	assert.equal(params.get('measure'), 'downloads');
	assert.equal(params.get('sport'), 'volleyball');
	assert.equal(params.get('traffic'), 'inclusive');
	// Reading it back gives the same query.
	assert.deepEqual(savedQueryState(parseReportQuery(params, NOW)), stored);
	assert.equal(savedViewParams(null), null);
	assert.equal(savedViewParams([1]), null);
	assert.equal(savedViewParams({}), null);
});

test('a saved view is described in words, not as stored fields', () => {
	const stored = savedQueryState(parseReportQuery(new URLSearchParams({ period: 'custom', start: '2026-09-25', end: '2026-10-02', scope: 'all', measure: 'photo_opens', traffic: 'conservative', compare: 'previous' }), NOW));
	assert.equal(describeSavedView(stored), 'Sep 25, 2026 to Oct 2, 2026 · photo opens · all albums · audience traffic');
	const narrowed = { ...stored, scope: 'selected', albums: ['a', 'b'], sport: 'volleyball', traffic: 'inclusive', measure: 'downloads' };
	assert.equal(describeSavedView(narrowed), 'Sep 25, 2026 to Oct 2, 2026 · download requests · 2 albums · sport: volleyball · all traffic');
	assert.equal(describeSavedView({ ...stored, scope: 'album', albums: ['a'] }).includes('one album'), true);
	assert.equal(describeSavedView('nonsense'), 'Its filters could not be read.');
	assert.match(describeSavedView({ measure: 'mystery' }), /an unknown measure/);
});
