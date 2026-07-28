import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAlbumManifest, ManifestUnavailable } from './manifest';

/**
 * The distinction under test is "the upstream did not answer" versus "the album is empty".
 *
 * index.ts turns the first into 502 and the second into 404. Collapsing them means a broken
 * dependency reports itself as "Album not found or empty" — a confident claim about the album
 * that sends someone looking for missing data instead of a failing service.
 */

const ORIGIN = 'https://origin.example';
const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function stubFetch(impl: () => Promise<Response> | never) {
	globalThis.fetch = (async () => impl()) as typeof globalThis.fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

test('returns the photo list on a healthy response', async () => {
	stubFetch(async () =>
		jsonResponse({ photos: [{ cf_image_id: 'abc', image_key: 'abc' }] })
	);

	const photos = await fetchAlbumManifest(ORIGIN, 'j5MfJD');

	assert.deepEqual(photos, [{ cf_image_id: 'abc', image_key: 'abc' }]);
});

test('an empty album is an empty list, NOT an error — 404 is the caller\'s job', async () => {
	stubFetch(async () => jsonResponse({ photos: [] }));

	assert.deepEqual(await fetchAlbumManifest(ORIGIN, 'NOSUCHALBUM'), []);
});

test('an upstream error status raises ManifestUnavailable, so it cannot become a 404', async () => {
	for (const status of [500, 502, 503, 429]) {
		stubFetch(async () => new Response('upstream is unhappy', { status }));

		await assert.rejects(
			() => fetchAlbumManifest(ORIGIN, 'j5MfJD'),
			(err: unknown) => err instanceof ManifestUnavailable,
			`status ${status} should raise ManifestUnavailable`
		);
	}
});

test('an unreachable origin raises ManifestUnavailable rather than escaping as a raw fetch error', async () => {
	stubFetch(() => {
		throw new TypeError('network error');
	});

	await assert.rejects(
		() => fetchAlbumManifest(ORIGIN, 'j5MfJD'),
		(err: unknown) => err instanceof ManifestUnavailable
	);
});

test('a 200 whose body is not the expected shape is unavailable, not empty', async () => {
	// The dangerous case: something returns 200 with an unrelated body — an HTML error page, a
	// bot-protection interstitial, a changed contract. Reading `.photos` off that yields
	// undefined, and a naive `?? []` would report a healthy, empty album.
	for (const body of [{}, { photos: null }, { photos: 'nope' }, []]) {
		stubFetch(async () => jsonResponse(body));

		await assert.rejects(
			() => fetchAlbumManifest(ORIGIN, 'j5MfJD'),
			(err: unknown) => err instanceof ManifestUnavailable,
			`body ${JSON.stringify(body)} should raise ManifestUnavailable`
		);
	}
});

test('the album key is URL-encoded into the request', async () => {
	let seen = '';
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		seen = String(input);
		return jsonResponse({ photos: [] });
	}) as typeof globalThis.fetch;

	await fetchAlbumManifest(ORIGIN, 'a b/c?d');

	assert.equal(seen, `${ORIGIN}/photography/api/album-photos?albumKey=a%20b%2Fc%3Fd`);
});
