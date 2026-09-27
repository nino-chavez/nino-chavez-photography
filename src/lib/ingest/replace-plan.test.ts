import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyReplacePlan, describeReplacePlan, type ExistingRowForReplace } from './replace-plan';

function existing(map: Record<string, string | null>): Map<string, ExistingRowForReplace> {
	return new Map(Object.entries(map).map(([k, v]) => [k, { contentHash: v }]));
}

test('a file with no existing row is new, regardless of hash', () => {
	const plan = classifyReplacePlan([{ key: 'DSC001', hash: 'aaa' }], existing({}));
	assert.deepEqual(plan, { changed: [], unchanged: [], newFiles: ['DSC001'] });
});

test('a file whose hash matches the stored hash is unchanged', () => {
	const plan = classifyReplacePlan([{ key: 'DSC001', hash: 'aaa' }], existing({ DSC001: 'aaa' }));
	assert.deepEqual(plan, { changed: [], unchanged: ['DSC001'], newFiles: [] });
});

test('a file whose hash differs from the stored hash is changed', () => {
	const plan = classifyReplacePlan([{ key: 'DSC001', hash: 'bbb' }], existing({ DSC001: 'aaa' }));
	assert.deepEqual(plan, { changed: ['DSC001'], unchanged: [], newFiles: [] });
});

test('a row with a null stored hash (pre-content-hash-migration) is treated as unchanged, never forced to replace', () => {
	const plan = classifyReplacePlan([{ key: 'DSC001', hash: 'anything' }], existing({ DSC001: null }));
	assert.deepEqual(plan, { changed: [], unchanged: ['DSC001'], newFiles: [] });
});

test('a mixed album classifies every file independently', () => {
	const plan = classifyReplacePlan(
		[
			{ key: 'DSC001', hash: 'same' }, // unchanged
			{ key: 'DSC002', hash: 'new-bytes' }, // changed (was 'old-bytes')
			{ key: 'DSC003', hash: 'x' }, // new file, no prior row
			{ key: 'DSC004', hash: 'y' } // unchanged (null prior hash)
		],
		existing({ DSC001: 'same', DSC002: 'old-bytes', DSC004: null })
	);
	assert.deepEqual(plan.changed, ['DSC002']);
	assert.deepEqual(plan.unchanged, ['DSC001', 'DSC004']);
	assert.deepEqual(plan.newFiles, ['DSC003']);
});

test('an empty local listing against existing rows classifies nothing (missing-file reporting is a separate concern)', () => {
	const plan = classifyReplacePlan([], existing({ DSC001: 'aaa' }));
	assert.deepEqual(plan, { changed: [], unchanged: [], newFiles: [] });
});

test('describeReplacePlan summarizes all three buckets', () => {
	const summary = describeReplacePlan({ changed: ['a'], unchanged: ['b', 'c'], newFiles: [] });
	assert.equal(summary, '1 changed (replace in place), 2 unchanged (skip), 0 new');
});
