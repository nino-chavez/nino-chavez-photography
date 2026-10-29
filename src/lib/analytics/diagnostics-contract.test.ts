import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDownloadDiagnostic } from './diagnostics-contract';

test('normal requested downloads accept a null optional error code', () => {
	assert.deepEqual(parseDownloadDiagnostic({ type: 'download', status: 'requested', photo_id: 'p1', error_code: null }), { type: 'download', status: 'requested', photo_id: 'p1', error_code: null });
});
