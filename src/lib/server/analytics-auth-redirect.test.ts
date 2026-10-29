import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsAuthCallbackUrl, authReturnPath, signedInReturnPath } from './analytics-auth-redirect';

const gallery = 'https://ninochavez.co/photography';
test('analytics sign-in keeps its callback on the analytics host', () => {
	const url = new URL(analyticsAuthCallbackUrl('analytics.ninochavez.co', gallery, '/analytics/home'));
	assert.equal(url.origin, 'https://analytics.ninochavez.co');
	assert.equal(url.pathname, '/photography/auth/callback');
	assert.equal(url.searchParams.get('next'), '/analytics/home');
});
test('gallery and unknown origin hosts use the canonical gallery callback', () => {
	for (const host of ['ninochavez.co', 'nino-chavez-photography.pages.dev', 'attacker.example']) {
		assert.equal(new URL(analyticsAuthCallbackUrl(host, gallery)).origin, 'https://ninochavez.co');
	}
});
test('a caller cannot supply an external redirect target', () => {
	for (const next of ['https://attacker.example', '//attacker.example', '/\\attacker.example']) {
		assert.equal(new URL(analyticsAuthCallbackUrl('analytics.ninochavez.co', gallery, next)).search, '');
	}
});

test('callback paths reject external, backslash and control-character destinations', () => {
 for (const unsafe of ['https://attacker.invalid', '//attacker.invalid', '/\\attacker.invalid', '/ok\n']) assert.equal(authReturnPath(unsafe), '/admin/tags');
 assert.equal(authReturnPath('/analytics/photos?period=7'), '/analytics/photos?period=7');
 assert.equal(authReturnPath(null, '/analytics/home'), '/analytics/home');
});


test('existing owner sessions return to clean report addresses', () => {
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography','/analytics/sites'),'/sites');
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography','/analytics/photos?period=7'),'/photos?period=7');
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography',null),'/');
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography','//attacker.invalid'),'/');
 assert.equal(signedInReturnPath('ninochavez.co','/photography',null),'/photography/admin/tags');
});

test('a return address from the old gallery report goes straight to where that report went', () => {
 // A magic link sent before the move still carries these.
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography','/analytics/operator'),'/');
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography','/analytics/operator?section=measurement&period=7'),'/data?period=7');
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography','/analytics/operator?section=photos&period=7'),'/photos?period=7');
 assert.equal(signedInReturnPath('analytics.ninochavez.co','/photography','/analytics/operator?scope=album&albums=Re7kho'),'/albums/Re7kho');
});

test('signing in from settings or the data page returns to the same clean address', () => {
 // The login link passes the internal path without the app base; the owner lands on the clean address.
 for (const [next, clean] of [['/analytics/settings', '/settings'], ['/analytics/data', '/data']] as const) {
  assert.equal(authReturnPath(next, '/analytics/home'), next);
  assert.equal(signedInReturnPath('analytics.ninochavez.co', '/photography', next), clean);
  assert.equal(new URL(analyticsAuthCallbackUrl('analytics.ninochavez.co', gallery, next)).searchParams.get('next'), next);
 }
});
