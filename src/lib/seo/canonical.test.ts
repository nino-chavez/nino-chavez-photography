import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, stripTrailingSlash } from './canonical';

const ORIGIN = 'https://ninochavez.co';

test('the based root loses its trailing slash and equals SITE_URL', () => {
	// The actual bug: SvelteKit serves a based app's root at `${base}/`, and the router
	// rewrites bare /photography to that path internally. Before this, the home page's
	// canonical was the only URL on the site ending in a slash.
	assert.equal(canonicalUrl(ORIGIN, '/photography/'), 'https://ninochavez.co/photography');
});

test('every other route is unchanged', () => {
	// These were already correct; the fix must not move them.
	for (const p of ['/photography/about', '/photography/explore', '/photography/albums', '/photography/photo/DSC06939']) {
		assert.equal(canonicalUrl(ORIGIN, p), `${ORIGIN}${p}`);
	}
});

test('a bare root is kept, not collapsed to the origin', () => {
	assert.equal(stripTrailingSlash('/'), '/');
	assert.equal(canonicalUrl(ORIGIN, '/'), 'https://ninochavez.co/');
});

test('only ONE trailing slash is stripped, and only from the end', () => {
	assert.equal(stripTrailingSlash('/photography//'), '/photography/');
	assert.equal(stripTrailingSlash('/photography/albums/chicago-big-dig-1BlKk4'), '/photography/albums/chicago-big-dig-1BlKk4');
});

test('a query string is not part of pathname and never reaches the canonical', () => {
	// $page.url.pathname excludes search; asserting it so a future switch to url.href
	// (which would publish ?src= attribution as canonical) fails here first.
	assert.equal(canonicalUrl(ORIGIN, '/photography/explore'), 'https://ninochavez.co/photography/explore');
	assert.doesNotMatch(canonicalUrl(ORIGIN, '/photography/explore'), /\?/);
});
