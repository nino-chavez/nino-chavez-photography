import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPublishRouteUrl, chatEnabledForRoute } from './routes';

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

test('the share route never publishes its own URL — the token is the secret', () => {
	// Production emitted, on a private client album:
	//   <link rel="canonical" href="https://ninochavez.co/photography/share/<uuid>">
	//   <meta property="og:url" content="…same…">
	//   <meta property="twitter:url" content="…same…">
	// beside that same page's `<meta name="robots" content="noindex, nofollow">`.
	assert.equal(canPublishRouteUrl('/share/[token]'), false);
});

test('every other route still publishes its URL', () => {
	// The suppression must stay surgical: canonical is a live SEO asset everywhere else, and
	// silently dropping it sitewide would be a worse regression than the leak it fixes.
	for (const r of ['/', '/albums', '/albums/[slug]', '/photo/[id]', '/photos/[year]/[month]', '/faq']) {
		assert.equal(canPublishRouteUrl(r), true, `${r} should publish a canonical URL`);
	}
});

test('a null route id suppresses rather than publishes', () => {
	// The catch-all 404 has no canonical address. Fail closed.
	assert.equal(canPublishRouteUrl(null), false);
	assert.equal(canPublishRouteUrl(undefined), false);
});
