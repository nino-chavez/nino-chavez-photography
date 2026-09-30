import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsAuthCallbackUrl } from './analytics-auth-redirect';

const gallery = 'https://ninochavez.co/photography';
test('analytics sign-in keeps its callback on the analytics host', () => {
	const url = new URL(analyticsAuthCallbackUrl('analytics.ninochavez.co', gallery, '/analytics/operator'));
	assert.equal(url.origin, 'https://analytics.ninochavez.co');
	assert.equal(url.pathname, '/photography/auth/callback');
	assert.equal(url.searchParams.get('next'), '/analytics/operator');
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
