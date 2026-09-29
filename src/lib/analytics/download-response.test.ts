import assert from 'node:assert/strict';
import test from 'node:test';
import { isDownloadableImageResponse } from './download-response';

test('HTTP failures and HTML bodies can never become ZIP image entries', () => {
	assert.equal(isDownloadableImageResponse(new Response('unavailable', { status: 503, headers: { 'content-type': 'text/html' } })), false);
	assert.equal(isDownloadableImageResponse(new Response('<h1>error</h1>', { headers: { 'content-type': 'text/html' } })), false);
	assert.equal(isDownloadableImageResponse(new Response('bytes', { headers: { 'content-type': 'image/jpeg' } })), true);
});
