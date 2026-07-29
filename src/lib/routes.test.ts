import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatEnabledForRoute } from './routes';

test('mounts on its five routes', () => {
	for (const r of ['/', '/explore', '/collections', '/albums', '/timeline']) {
		assert.equal(chatEnabledForRoute(r), true, `${r} should mount chat`);
	}
});

test('mounts on their children', () => {
	assert.equal(chatEnabledForRoute('/albums/[slug]'), true);
	assert.equal(chatEnabledForRoute('/collections/[slug]'), true);
});

test('"/" is not a prefix for the whole site', () => {
	// The original relied on '/' + '/' being '//' to get this right. If a future edit drops
	// the special case and treats '/' like the others, every route matches and the widget
	// loads on photo pages — the exact ~50-100KB the route list exists to avoid.
	for (const r of ['/photo/[id]', '/about', '/faq', '/privacy', '/settings/accessibility']) {
		assert.equal(chatEnabledForRoute(r), false, `${r} should not mount chat`);
	}
});

test('a based pathname is not a route id and must not match', () => {
	// The bug: comparing `/photography/explore` against '/explore'. If someone passes the
	// pathname again, this fails rather than silently returning false forever.
	assert.equal(chatEnabledForRoute('/photography/explore'), false);
});

test('a null route id (no route matched) is safe', () => {
	assert.equal(chatEnabledForRoute(null), false);
	assert.equal(chatEnabledForRoute(undefined), false);
});
