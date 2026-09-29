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
	const base = { event_id: eventId, schema_version: 2, event_name: 'photo_opened', occurred_at: new Date(now).toISOString(), anonymous_browser_id: browserId, visit_id: browserId, properties: { photo_id: 'p1', album_key: 'alpha', view_id: browserId, entry_surface: 'gallery' } };
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

test('v2 rejects arbitrary safe-looking fields and incomplete required context', () => {
	const id = '123e4567-e89b-42d3-a456-426614174000';
	const base = { event_id: id, schema_version: 2, event_name: 'gallery_page_viewed', occurred_at: new Date().toISOString(), anonymous_browser_id: null, visit_id: null,
		properties: { route_kind: 'explore', canonical_path: '/photography/explore', view_id: id, layout_class: 'wide' } };
	assert.equal(parseEventV2Request(base).ok, true);
	assert.equal(parseEventV2Request({ ...base, properties: { ...base.properties, harmless_extra: 'still rejected' } }).ok, false);
	assert.equal(parseEventV2Request({ ...base, properties: { route_kind: 'explore', canonical_path: '/photography/explore', view_id: id } }).ok, false);
});

test('v2 rejects filter labels outside the gallery vocabulary', () => {
	const id = '123e4567-e89b-42d3-a456-426614174000';
	const event = {
		event_id: id, schema_version: 2, event_name: 'filters_applied', occurred_at: new Date().toISOString(),
		anonymous_browser_id: null, visit_id: null,
		properties: { result_set_id: id, result_count: 0, sport: 'invented_sport' }
	};
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

test('v2 accepts the actual photo and mixed ZIP payloads and derives album facts server-side', async () => {
 const { parseEventV2Request, resolveEventV2Target } = await import('./collection-contract');
 const { eventPropertiesMatchContract } = await import('./events-v2');
 const id = 'c790473e-4c26-4f6c-aed1-13db60383021';
 const payload = (event_name: string, properties: object) => ({event_id:id,schema_version:2,event_name,occurred_at:new Date().toISOString(),anonymous_browser_id:null,visit_id:null,properties});
 const photo = parseEventV2Request(payload('photo_exposed',{photo_id:'photo-one',position:0,result_set_id:id}));
 assert.equal(photo.ok,true);
 if(photo.ok) {
  const resolved = await resolveEventV2Target(photo.value,{albumForPhoto:async()=> 'album-one',albumExists:async()=>true});
  assert.equal(resolved.ok,true);
  if(resolved.ok) assert.equal(resolved.value.properties.album_key,'album-one');
 }
 assert.equal(eventPropertiesMatchContract('download_item_prepared',{photo_id:'photo-one',album_key:undefined,mode:'saved_photo_zip',download_request_id:id,byte_count:20}),true);
 assert.equal(parseEventV2Request(payload('download_requested',{download_request_id:id,mode:'saved_photo_zip',requested_item_count:2})).ok,true);
 assert.equal(parseEventV2Request(payload('download_prepared',{album_key:'album-one',download_request_id:id,mode:'album_zip',requested_item_count:2,item_count_known:false,byte_count:20,duration_ms:10})).ok,true);
 assert.equal(parseEventV2Request(payload('album_opened',{view_id:id,entry_surface:'album'})).ok,false);
 assert.equal(parseEventV2Request(payload('photo_rendered',{photo_id:'photo-one',view_id:id,load_duration_ms:10,raw_search:'private query'})).ok,false);
});
