import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthWindow, addMonths, monthName, MONTH_NAMES } from './month-window';

test('October 2025 — the month that exposed the bug', () => {
	// A UTC-5 host produced '2025-10-01T05:00:00.000Z' here, which Postgres reads as the
	// wall clock 05:00 against a timezone-naive column, dropping the 59 photos stamped
	// midnight on Oct 1. 272 became 213.
	assert.deepEqual(monthWindow(2025, 10), {
		start: '2025-10-01T00:00:00',
		endExclusive: '2025-11-01T00:00:00'
	});
});

test('bounds carry no timezone, because the column has none', () => {
	// A trailing Z would work only because Postgres discards it when casting to
	// `timestamp without time zone`. Relying on that is how the original looked correct.
	for (const [y, m] of [[2025, 1], [2025, 6], [2025, 12], [2022, 8]] as const) {
		const { start, endExclusive } = monthWindow(y, m);
		for (const bound of [start, endExclusive]) {
			assert.doesNotMatch(bound, /Z$/, `${bound} carries a UTC marker`);
			assert.doesNotMatch(bound, /[+-]\d{2}:\d{2}$/, `${bound} carries an offset`);
			assert.match(bound, /^\d{4}-\d{2}-\d{2}T00:00:00$/);
		}
	}
});

test('December rolls into the next January', () => {
	assert.deepEqual(monthWindow(2025, 12), {
		start: '2025-12-01T00:00:00',
		endExclusive: '2026-01-01T00:00:00'
	});
});

test('the window is half-open, so no timestamp falls in a gap', () => {
	// The old month-detail query ended at an inclusive 23:59:59 and lost the final second.
	// Consecutive months must meet exactly: one month's end IS the next month's start.
	for (let m = 1; m <= 12; m++) {
		const { year, month } = addMonths(2025, m, 1);
		assert.equal(monthWindow(2025, m).endExclusive, monthWindow(year, month).start);
	}
});

test('months are zero-padded, or the string compares wrong', () => {
	assert.equal(monthWindow(2025, 1).start, '2025-01-01T00:00:00');
	assert.equal(monthWindow(2025, 9).start, '2025-09-01T00:00:00');
});

test('addMonths crosses year boundaries in both directions', () => {
	assert.deepEqual(addMonths(2025, 12, 1), { year: 2026, month: 1 });
	assert.deepEqual(addMonths(2025, 1, -1), { year: 2024, month: 12 });
	assert.deepEqual(addMonths(2025, 6, 0), { year: 2025, month: 6 });
	assert.deepEqual(addMonths(2025, 1, -13), { year: 2023, month: 12 });
	assert.deepEqual(addMonths(2025, 12, 13), { year: 2027, month: 1 });
});

test('addMonths never returns month 0 or 13', () => {
	for (let delta = -30; delta <= 30; delta++) {
		const { month } = addMonths(2025, 7, delta);
		assert.ok(month >= 1 && month <= 12, `delta ${delta} produced month ${month}`);
	}
});

test('month names are fixed, not taken from the runtime locale', () => {
	assert.equal(monthName(10), 'October');
	assert.equal(monthName(1), 'January');
	assert.equal(monthName(12), 'December');
	assert.equal(MONTH_NAMES.length, 12);
	// Out of range returns empty rather than 'undefined' in the middle of a page title.
	assert.equal(monthName(0), '');
	assert.equal(monthName(13), '');
});

test('nothing here depends on the host timezone', () => {
	// The whole point: no Date is constructed, so there is no offset to leak. If a future
	// edit reintroduces one, this fails on any machine that is not UTC.
	const before = process.env.TZ;
	try {
		for (const tz of ['UTC', 'America/Chicago', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
			process.env.TZ = tz;
			assert.deepEqual(monthWindow(2025, 10), {
				start: '2025-10-01T00:00:00',
				endExclusive: '2025-11-01T00:00:00'
			});
			assert.equal(monthName(10), 'October');
		}
	} finally {
		if (before === undefined) delete process.env.TZ;
		else process.env.TZ = before;
	}
});
