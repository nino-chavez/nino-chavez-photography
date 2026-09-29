import assert from 'node:assert/strict';
import test from 'node:test';
import {
	collectionOutcome,
	createAnalyticsTestMarker,
	hasTrustedAnalyticsTestMarker,
	parseCollectionRequest,
	parseEventV2Request,
	resolveEventV2Target,
	resolveCollectionTarget,
	type CollectionTargetLookup
} from './collection-contract';

test('a successful write is accepted, not just ok', () => {
	assert.deepEqual(collectionOutcome(null), { status: 200, body: { ok: true, accepted: true, duplicate: false } });
});

test('v2 rejects raw search text, incomplete visit context, and invalid target pairs', async () => {
	const eventId = '123e4567-e89b-42d3-a456-426614174000';
	const browserId = '123e4567-e89b-42d3-a456-426614174001';
	const now = Date.UTC(2026, 8, 29, 12);
	const base = { event_id: eventId, schema_version: 2, event_name: 'photo_opened', occurred_at: new Date(now).toISOString(), anonymous_browser_id: browserId, visit_id: browserId, properties: { photo_id: 'p1' } };
	assert.equal(parseEventV2Request({ ...base, properties: { photo_id: 'p1', query_text: 'a person' } }, now).ok, false);
	assert.equal(parseEventV2Request({ ...base, visit_id: null }, now).ok, false);
	const parsed = parseEventV2Request(base, now);
	assert.equal(parsed.ok, true);
	if (!parsed.ok) return;
	const lookup: CollectionTargetLookup = { async albumForPhoto() { return 'alpha'; }, async albumExists() { return true; } };
	assert.deepEqual(await resolveEventV2Target({ ...parsed.value, properties: { photo_id: 'p1', album_key: 'wrong' } }, lookup), { ok: false, error: 'photo and album targets do not match' });
});

test('v2 requires a stable request correlation for download events', () => {
	const event = { event_id: '123e4567-e89b-42d3-a456-426614174000', schema_version: 2, event_name: 'download_requested', occurred_at: new Date().toISOString(), anonymous_browser_id: null, visit_id: null, properties: { album_key: 'alpha' } };
	assert.equal(parseEventV2Request(event).ok, false);
});

test('a deduplicated replay is an acknowledged duplicate', () => {
	assert.deepEqual(collectionOutcome({ code: '23505' }), { status: 200, body: { ok: true, accepted: false, duplicate: true } });
});

test('a database failure never reports a false success', () => {
	assert.deepEqual(collectionOutcome({ code: '42501' }), { status: 503, body: { ok: false, accepted: false, error: 'recording_unavailable' } });
});

test('database target and shape violations are client errors', () => {
	for (const code of ['23503', '23514', '22P02']) {
		assert.deepEqual(collectionOutcome({ code }), {
			status: 400,
			body: { ok: false, accepted: false, error: 'invalid_target' }
		});
	}
});

test('public request shapes reject malformed and server-only arrivals', () => {
	for (const body of [
		null,
		{},
		{ event_type: 'bogus', photo_id: 'p1' },
		{ event_type: 'view', album_key: 'alpha' },
		{ event_type: 'album_open', photo_id: 'p1', album_key: 'alpha' },
		{ event_type: 'album_open' },
		{ event_type: 'download' },
		{ event_type: 'share', album_key: 42 },
		{ event_type: 'favorite', photo_id: '' }
	]) assert.equal(parseCollectionRequest(body).ok, false, JSON.stringify(body));
});

test('photo, album, and album-only action shapes are accepted', () => {
	for (const body of [
		{ event_type: 'view', photo_id: 'p1' },
		{ event_type: 'album_open', album_key: 'alpha' },
		{ event_type: 'download', album_key: 'alpha' },
		{ event_type: 'favorite', photo_id: 'p1' },
		{ event_type: 'share', photo_id: 'p1', album_key: 'alpha' }
	]) assert.equal(parseCollectionRequest(body).ok, true, JSON.stringify(body));
});

test('photo-only requests derive the authoritative album and mismatches fail', async () => {
	const lookup: CollectionTargetLookup = {
		async albumForPhoto(photoId) { return photoId === 'p1' ? 'alpha' : null; },
		async albumExists(albumKey) { return albumKey === 'alpha'; }
	};
	const photoOnly = parseCollectionRequest({ event_type: 'view', photo_id: 'p1' });
	assert.equal(photoOnly.ok, true);
	if (!photoOnly.ok) return;
	assert.deepEqual(await resolveCollectionTarget(photoOnly.value, lookup), {
		ok: true,
		value: { event_type: 'view', photo_id: 'p1', album_key: 'alpha', source: null }
	});

	const mismatch = parseCollectionRequest({ event_type: 'share', photo_id: 'p1', album_key: 'beta' });
	assert.equal(mismatch.ok, true);
	if (mismatch.ok) assert.deepEqual(await resolveCollectionTarget(mismatch.value, lookup), {
		ok: false,
		error: 'photo and album targets do not match'
	});

	const missingPhoto = parseCollectionRequest({ event_type: 'favorite', photo_id: 'missing' });
	assert.equal(missingPhoto.ok, true);
	if (missingPhoto.ok) assert.deepEqual(await resolveCollectionTarget(missingPhoto.value, lookup), {
		ok: false,
		error: 'photo target not found'
	});
});

test('album-only actions verify that the album exists', async () => {
	const lookup: CollectionTargetLookup = {
		async albumForPhoto() { return null; },
		async albumExists(albumKey) { return albumKey === 'alpha'; }
	};
	const accepted = parseCollectionRequest({ event_type: 'download', album_key: 'alpha' });
	const missing = parseCollectionRequest({ event_type: 'share', album_key: 'missing' });
	assert.equal(accepted.ok, true);
	assert.equal(missing.ok, true);
	if (accepted.ok) assert.equal((await resolveCollectionTarget(accepted.value, lookup)).ok, true);
	if (missing.ok) assert.deepEqual(await resolveCollectionTarget(missing.value, lookup), {
		ok: false,
		error: 'album target not found'
	});
});

test('controlled marker is signed, expiring, origin-bound, and route-scoped', () => {
	const now = Date.UTC(2026, 8, 28, 12, 0, 0);
	const secret = 'local-secret';
	const marker = createAnalyticsTestMarker({
		exp: Math.floor(now / 1000) + 300,
		origin: 'http://127.0.0.1:5187',
		pathPrefix: '/photography/api/'
	}, secret);
	const request = new Request('http://127.0.0.1:5187/photography/api/engagement', { headers: { origin: 'http://127.0.0.1:5187' } });
	assert.equal(hasTrustedAnalyticsTestMarker(marker, secret, request, now), true);
	assert.equal(hasTrustedAnalyticsTestMarker(marker, secret, new Request('http://127.0.0.1:5187/photography/explore', { headers: { origin: 'http://127.0.0.1:5187' } }), now), false);
	assert.equal(hasTrustedAnalyticsTestMarker(marker, secret, new Request(request.url, { headers: { origin: 'http://localhost:5187' } }), now), false);
	assert.equal(hasTrustedAnalyticsTestMarker(marker, secret, request, now + 301_000), false);
	assert.equal(hasTrustedAnalyticsTestMarker('local-secret', secret, request, now), false);
});


test('controlled markers bind to the configured public origin behind the apex router', () => {
 const now = Date.now();
 const secret = 'synthetic-test-secret';
 const origin = 'https://ninochavez.co';
 const marker = createAnalyticsTestMarker({origin, pathPrefix:'/photography', exp:Math.floor(now/1000)+300},secret);
 const request = new Request('https://nino-chavez-photography.pages.dev/photography/api/engagement',{headers:{origin}});
 assert.equal(hasTrustedAnalyticsTestMarker(marker,secret,request,now,origin),true);
 assert.equal(hasTrustedAnalyticsTestMarker(marker,secret,new Request(request.url,{headers:{origin:'https://attacker.example'}}),now,origin),false);
 assert.equal(hasTrustedAnalyticsTestMarker(marker,secret,request,now,'https://another.example'),false);
});
