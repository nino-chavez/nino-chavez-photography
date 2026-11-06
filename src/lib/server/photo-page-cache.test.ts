import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	PHOTO_PAGE_ARRIVAL_CACHE_CONTROL,
	PHOTO_PAGE_CACHE_CONTROL,
	photoPageCacheControl
} from './photo-page-cache';

test('an untagged photo page is public and may be served stale while revalidating', () => {
	const value = photoPageCacheControl(null);
	assert.equal(value, PHOTO_PAGE_CACHE_CONTROL);
	assert.match(value, /\bpublic\b/);
	assert.match(value, /\bmax-age=\d+/);
	assert.match(value, /\bstale-while-revalidate=\d+/);
});

test('s-maxage is never used: Cloudflare disables stale-while-revalidate when it is present', () => {
	assert.doesNotMatch(PHOTO_PAGE_CACHE_CONTROL, /s-maxage/);
});

test('a tagged arrival is never cached, so the loader records every one', () => {
	assert.equal(photoPageCacheControl('share-x'), PHOTO_PAGE_ARRIVAL_CACHE_CONTROL);
	assert.match(PHOTO_PAGE_ARRIVAL_CACHE_CONTROL, /no-store/);
	assert.match(PHOTO_PAGE_ARRIVAL_CACHE_CONTROL, /private/);
});

test('a src value the loader would ignore is cacheable', () => {
	assert.equal(photoPageCacheControl('not a valid src!!'), PHOTO_PAGE_CACHE_CONTROL);
	assert.equal(photoPageCacheControl(''), PHOTO_PAGE_CACHE_CONTROL);
});
