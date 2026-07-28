import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedAdminEmail } from './admin-allowlist';

/**
 * The property under test is the failure direction, not the happy path.
 *
 * On 2026-07-28 this check returned `true` for everyone because `ADMIN_EMAILS` was unset in
 * production, and a self-registered account reached /admin/albums and /analytics — both of
 * which run with service_role. Every "denies" case below is that regression.
 */

test('unset allowlist denies everyone — the regression this file exists for', () => {
	for (const raw of [undefined, '', '   ', ',', ' , , ']) {
		assert.equal(isAllowedAdminEmail('admin@ninochavez.co', raw), false, `raw=${JSON.stringify(raw)}`);
		assert.equal(isAllowedAdminEmail('stranger@example.com', raw), false, `raw=${JSON.stringify(raw)}`);
	}
});

test('a configured allowlist admits only its own entries', () => {
	const raw = 'admin@ninochavez.co';
	assert.equal(isAllowedAdminEmail('admin@ninochavez.co', raw), true);
	assert.equal(isAllowedAdminEmail('stranger@example.com', raw), false);
	// Not a prefix or substring match: a lookalike domain must not pass.
	assert.equal(isAllowedAdminEmail('admin@ninochavez.co.evil.com', raw), false);
	assert.equal(isAllowedAdminEmail('xadmin@ninochavez.co', raw), false);
});

test('matching is case-insensitive and tolerates spacing in the variable', () => {
	const raw = '  Admin@NinoChavez.co ,  second@example.org  ';
	assert.equal(isAllowedAdminEmail('ADMIN@ninochavez.CO', raw), true);
	assert.equal(isAllowedAdminEmail('second@example.org', raw), true);
	assert.equal(isAllowedAdminEmail('third@example.org', raw), false);
});

test('a missing email never passes, even against a populated allowlist', () => {
	const raw = 'admin@ninochavez.co';
	assert.equal(isAllowedAdminEmail(null, raw), false);
	assert.equal(isAllowedAdminEmail(undefined, raw), false);
	assert.equal(isAllowedAdminEmail('', raw), false);
});
