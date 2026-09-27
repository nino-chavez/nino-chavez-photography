import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	buildUploadAndMarkHdr,
	checkSourceMatchesRow,
	matchLocalFilesToRows,
	type HdrBackfillRow
} from './hdr-web-backfill';

test('matches a local export to its existing row by file_name before image_key', () => {
	const rows: HdrBackfillRow[] = [
		{
			photoId: 'DWdCET-DSC09484',
			imageKey: 'smugmug-assigned-key',
			fileName: 'DSC09484.jpg'
		}
	];

	assert.deepEqual(matchLocalFilesToRows(['DSC09484.JPG', 'no-row.jpg'], rows), [
		{ fileName: 'DSC09484.JPG', row: rows[0] }
	]);
});

test('falls back to image_key when a legacy row has no file_name', () => {
	const row: HdrBackfillRow = {
		photoId: 'Re7kho-legacy-photo',
		imageKey: 'DSC01234',
		fileName: null
	};

	assert.deepEqual(matchLocalFilesToRows(['DSC01234.jpeg'], [row]), [
		{ fileName: 'DSC01234.jpeg', row }
	]);
});

test('marks HDR available only after the R2 upload succeeds', async () => {
	const calls: string[] = [];
	const result = await buildUploadAndMarkHdr({
		build: async () => {
			calls.push('build');
			return Buffer.from('hdr');
		},
		upload: async () => {
			calls.push('upload');
			return true;
		},
		markAvailable: async () => {
			calls.push('mark');
		}
	});

	assert.equal(result, 'uploaded');
	assert.deepEqual(calls, ['build', 'upload', 'mark']);
});

test('does not mark HDR available when the R2 upload fails', async () => {
	let marked = false;
	const result = await buildUploadAndMarkHdr({
		build: async () => Buffer.from('hdr'),
		upload: async () => false,
		markAvailable: async () => {
			marked = true;
		}
	});

	assert.equal(result, 'upload-failed');
	assert.equal(marked, false);
});

test('an HDR copy is only built from the exact bytes the row was ingested from', () => {
	assert.equal(checkSourceMatchesRow('abc', 'abc'), 'match');
	// A re-export or the wrong --album-key: different bytes behind the same photo_id.
	assert.equal(checkSourceMatchesRow('abc', 'def'), 'changed');
	// A row ingested before content hashing cannot be proven either way.
	assert.equal(checkSourceMatchesRow(null, 'abc'), 'unhashed');
	assert.equal(checkSourceMatchesRow(undefined, 'abc'), 'unhashed');
});
