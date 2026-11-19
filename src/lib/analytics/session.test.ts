import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { computeSessionHash, sessionHashKey } from './session';

// Invented values only.
const ip = '203.0.113.7';
const userAgent = 'Mozilla/5.0 (test)';
const key = 'k'.repeat(48);

test('the visitor identifier is an HMAC-SHA-256 under the server key', async () => {
	const expected = createHmac('sha256', key).update(`${ip}|${userAgent}`).digest('hex');
	assert.equal(await computeSessionHash(ip, userAgent, key), expected);
	assert.equal(await computeSessionHash(ip, userAgent, key), expected, 'stable for the same visitor and key');
});

test('the identifier cannot be reproduced from the IP address and browser alone', async () => {
	const unkeyed = createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
	assert.notEqual(await computeSessionHash(ip, userAgent, key), unkeyed);
	assert.notEqual(await computeSessionHash(ip, userAgent, key), await computeSessionHash(ip, userAgent, 'j'.repeat(48)));
});

test('without a usable key no identifier is produced', async () => {
	for (const raw of [undefined, null, '', '   ', 'short-key']) {
		const usable = sessionHashKey(raw);
		assert.equal(usable, null, String(raw));
		assert.equal(await computeSessionHash(ip, userAgent, usable), null);
	}
	assert.equal(sessionHashKey(`  ${key}  `), key);
});
