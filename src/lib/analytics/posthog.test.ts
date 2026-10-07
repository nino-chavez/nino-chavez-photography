import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverPostHogBatch, hasPostHogScheduleAuthorization } from './posthog-delivery.server';
import { buildPostHogDashboardQuery, buildPostHogJourneyQuery, createPostHogQueryTransport, evaluatePostHogJourneyFixtures, queryGalleryJourneys, reconcilePostHogEventIds, reconcileSubmittedPostHogEvents, type PostHogFixtureEvent } from './posthog-queries.server';
import { scrubPostHogProperties } from './posthog-contract';
import { createPostHogFlagClient, evaluatePhotographyExperiment, postHogRuntimeConfig } from './posthog.server';
import { createPostHogOutboxClient } from './posthog-outbox.server';
import { EVENT_V2_NAMES } from './events-v2';
import { POSTHOG_EVENT_NAMES, type PostHogEnvelope, type PostHogOutboxClient, type PostHogOutboxRow } from './posthog.types';
import { createProviderCache } from './provider-cache.server';

const eventId = '550e8400-e29b-41d4-a716-446655440000';
const envelope: PostHogEnvelope = {
	event_id: eventId,
	schema_version: 2,
	event_name: 'photo_opened',
	occurred_at: '2026-09-29T12:00:00.000Z',
	received_at: '2026-09-29T12:00:01.000Z',
	anonymous_browser_id: 'browser_123',
	visit_id: 'visit_123',
	traffic_context: 'audience',
	export_eligible: true,
	properties: {
		album_key: 'album-one', photo_id: 'photo-one', source: 'ignored',
		email: 'visitor@example.com', search_text: 'a private query', legacy_hash: 'never-export',
		referrer_domain: 'example.org', result_count: 4
	}
};

function observed(event: PostHogFixtureEvent['event'], timestamp: string, visitId: string, properties: Record<string, string | number> = {}, browserId = `browser-${visitId}`): PostHogFixtureEvent {
	return { event, timestamp, distinctId: browserId, properties: { schema_version: 2, traffic_context: 'audience', visit_id: visitId, ...properties } };
}

test('scrubs payloads before they reach PostHog and suppresses person profiles', () => {
	assert.equal(POSTHOG_EVENT_NAMES, EVENT_V2_NAMES);
	const payload = scrubPostHogProperties(envelope);
	assert.deepEqual(payload, {
		$process_person_profile: false, $session_id: 'visit_123', event_id: eventId,
		schema_version: 2, received_at: '2026-09-29T12:00:01.000Z', visit_id: 'visit_123', traffic_context: 'audience', album_key: 'album-one',
		photo_id: 'photo-one', result_count: 4
	});
	assert.equal(scrubPostHogProperties({ ...envelope, traffic_context: 'operator' }), null);
	assert.equal(scrubPostHogProperties({ ...envelope, anonymous_browser_id: null }), null);
	assert.equal(scrubPostHogProperties({ ...envelope, visit_id: null }), null);
});

test('delivery preserves UUID/time, reports duplicate leases, and does not let an SDK retry alter local state', async () => {
	const finishes: Array<[string, string, string | null]> = [];
	const row: PostHogOutboxRow = { event_id: eventId, payload: envelope, attempts: 0 };
	const outbox: PostHogOutboxClient = {
		claim: async () => [row, row],
		recheck: async () => envelope,
		finish: async (id, status, code) => { finishes.push([id, status, code]); },
		submitted: async () => [eventId], confirm: async () => {}, health: async () => ({})
	};
	const captures: Array<Record<string, unknown>> = [];
	const result = await deliverPostHogBatch({ capture: async (event) => { captures.push(event); } }, outbox);
	assert.equal(result.submitted, 1);
	assert.equal(result.duplicateIds, 1);
	assert.deepEqual(finishes, [[eventId, 'submitted', null]]);
	assert.equal(captures[0].uuid, eventId);
	assert.equal((captures[0].timestamp as Date).toISOString(), envelope.occurred_at);
});

test('delivery records provider failure instead of claiming an event was confirmed', async () => {
	const finishes: Array<[string, string, string | null]> = [];
	const outbox: PostHogOutboxClient = {
		claim: async () => [{ event_id: eventId, payload: envelope, attempts: 2 }],
		recheck: async () => envelope,
		finish: async (id, status, code) => { finishes.push([id, status, code]); },
		submitted: async () => [], confirm: async () => {}, health: async () => ({})
	};
	const result = await deliverPostHogBatch({ capture: async () => { throw new Error('503'); } }, outbox);
	assert.deepEqual({ submitted: result.submitted, failed: result.failed }, { submitted: 0, failed: 1 });
	assert.deepEqual(finishes, [[eventId, 'failed', 'posthog_capture_failed']]);
});

test('delivery suppresses an event withdrawn or reclassified after it was leased', async () => {
	let captures = 0;
	const outbox: PostHogOutboxClient = {
		claim: async () => [{ event_id: eventId, payload: envelope, attempts: 0 }],
		recheck: async () => null,
		finish: async () => { throw new Error('atomic recheck already suppresses the row'); },
		submitted: async () => [], confirm: async () => {}, health: async () => ({})
	};
	const result = await deliverPostHogBatch({ capture: async () => { captures += 1; } }, outbox);
	assert.deepEqual({ submitted: result.submitted, skipped: result.skipped, failed: result.failed }, { submitted: 0, skipped: 1, failed: 0 });
	assert.equal(captures, 0);
});

test('scheduled delivery authorization fails closed for missing and wrong tokens', () => {
	const makeRequest = (token?: string) => new Request('https://gallery.test/api/internal/analytics-posthog', { headers: token ? { 'x-analytics-posthog-schedule-token': token } : {} });
	assert.equal(hasPostHogScheduleAuthorization(makeRequest(), 'correct'), false);
	assert.equal(hasPostHogScheduleAuthorization(makeRequest('wrong'), 'correct'), false);
	assert.equal(hasPostHogScheduleAuthorization(makeRequest('correct'), 'correct'), true);
});

test('scheduler authorization works without the Node global Buffer', () => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Buffer');
	Reflect.deleteProperty(globalThis, 'Buffer');
	try {
		const request = new Request('https://gallery.test/api/internal/analytics-posthog', { headers: { 'x-analytics-posthog-schedule-token': 'correct' } });
		assert.equal(hasPostHogScheduleAuthorization(request, 'correct'), true);
		assert.equal(hasPostHogScheduleAuthorization(request, 'incorrect'), false);
	} finally { if (descriptor) Object.defineProperty(globalThis, 'Buffer', descriptor); }
});


test('outbox RPC adapter rejects malformed leases instead of delivering an invented event', async () => {
	const calls: string[] = [];
	const outbox = createPostHogOutboxClient({ rpc: async (name) => {
		calls.push(name);
		return { data: [{ event_id: eventId, attempts: 0 }], error: null };
	} });
	await assert.rejects(outbox.claim(1, 60), /invalid payload/);
	assert.deepEqual(calls, ['analytics_claim_posthog_events']);
});

test('runtime configuration and experiment evaluation fail closed without a valid provider response', async () => {
	assert.equal(postHogRuntimeConfig({}), null);
	assert.equal(postHogRuntimeConfig({ POSTHOG_PROJECT_API_KEY: 'key', POSTHOG_HOST: 'http://not-secure.test' }), null);
	assert.equal(postHogRuntimeConfig({ POSTHOG_PROJECT_API_KEY: 'key', POSTHOG_HOST: 'https://us.i.posthog.com' }), null);
	assert.equal(postHogRuntimeConfig({ POSTHOG_ENABLED: 'true', POSTHOG_TARGET_ENVIRONMENT: 'preview', POSTHOG_PROJECT_API_KEY: 'key', POSTHOG_HOST: 'https://us.i.posthog.com' }), null);
	assert.deepEqual(postHogRuntimeConfig({ POSTHOG_ENABLED: 'true', POSTHOG_TARGET_ENVIRONMENT: 'production', POSTHOG_PROJECT_API_KEY: 'key', POSTHOG_HOST: 'https://us.i.posthog.com/path' }), { projectApiKey: 'key', host: 'https://us.i.posthog.com' });
	assert.equal(createPostHogFlagClient(null), null);
	assert.deepEqual(await evaluatePhotographyExperiment(null, 'cover-test', 'browser_123'), { available: false, variant: null, reason: 'disabled' });
	assert.deepEqual(await evaluatePhotographyExperiment({ getFeatureFlag: async () => { throw new Error('quota'); } }, 'cover-test', 'browser_123'), { available: false, variant: null, reason: 'quota_or_provider_unavailable' });
	assert.deepEqual(await evaluatePhotographyExperiment({ getFeatureFlag: async () => 'blue' }, 'cover-test', 'browser_123'), { available: true, variant: 'blue', reason: 'evaluated' });
});

test('album-use semantics require a visible album and an ordered open, render, then action', () => {
	const query = { report: 'album_use' as const, start: '2026-09-01', end: '2026-09-30', albumKeys: ['Public Album 2026'] };
	const fixed = buildPostHogJourneyQuery(query, ['Public Album 2026', 'Private Album']);
	assert.ok(fixed);
	assert.match(fixed.query, /'Public Album 2026'/);
	assert.match(fixed.query, /toTimeZone\(timestamp, 'America\/Chicago'\)/);
	assert.match(fixed.query, /properties\.traffic_context IN \('audience', 'unclassified'\)/);
	assert.match(fixed.query, /PARTITION BY visit_id, album_key/);
	const totals = evaluatePostHogJourneyFixtures(query, ['Public Album 2026', 'Private Album'], [
		observed('photo_rendered', '2026-09-10T09:59:00Z', 'ordered', { album_key: 'Public Album 2026', photo_id: 'p0' }),
		observed('album_opened', '2026-09-10T10:00:00Z', 'ordered', { album_key: 'Public Album 2026' }),
		observed('photo_rendered', '2026-09-10T10:01:00Z', 'ordered', { album_key: 'Public Album 2026', photo_id: 'p1' }),
		observed('favorite_added', '2026-09-10T10:02:00Z', 'ordered', { album_key: 'Public Album 2026', photo_id: 'p1' }),
		observed('photo_rendered', '2026-09-10T10:00:00Z', 'no-open', { album_key: 'Public Album 2026', photo_id: 'p2' }),
		observed('favorite_added', '2026-09-10T10:01:00Z', 'no-open', { album_key: 'Public Album 2026', photo_id: 'p2' }),
		observed('album_opened', '2026-09-10T10:00:00Z', 'wrong-order', { album_key: 'Public Album 2026' }),
		observed('favorite_added', '2026-09-10T10:01:00Z', 'wrong-order', { album_key: 'Public Album 2026', photo_id: 'p3' }),
		observed('photo_rendered', '2026-09-10T10:02:00Z', 'wrong-order', { album_key: 'Public Album 2026', photo_id: 'p3' }),
		observed('album_opened', '2026-09-10T10:00:00Z', 'hidden', { album_key: 'Private Album' }),
		observed('photo_rendered', '2026-09-10T10:01:00Z', 'hidden', { album_key: 'Private Album', photo_id: 'secret' }),
		observed('favorite_added', '2026-09-10T10:02:00Z', 'hidden', { album_key: 'Private Album', photo_id: 'secret' })
	]);
	assert.deepEqual(totals, { album_open_visits: 2, photo_render_visits: 2, album_action_visits: 1 });
	assert.equal(buildPostHogJourneyQuery({ ...query, albumKeys: ['Private Album'] }, ['Public Album 2026']), null);
	assert.match(buildPostHogJourneyQuery({ ...query, source: 'instagram' }, ['Public Album 2026'])!.query, /tagged_source/);
	const quotedAlbum = buildPostHogJourneyQuery({ ...query, albumKeys: ["Nino's Finals"] }, ["Nino's Finals"]);
	assert.ok(quotedAlbum);
	assert.match(quotedAlbum.query, /'Nino''s Finals'/);
	assert.equal(buildPostHogJourneyQuery({ report: 'photo_response', start: '2026-09-01', end: '2026-09-30', albumKeys: ['private-album'] }, ['album-a']), null);
	const dashboard = buildPostHogDashboardQuery('album_use', ['Public Album 2026']);
	assert.ok(dashboard);
	assert.match(dashboard.query, /'Public Album 2026'/);
	assert.match(dashboard.query, /toTimeZone\(now\(\), 'America\/Chicago'\)/);
	assert.doesNotMatch(dashboard.query, /timestamp >= now\(\) - INTERVAL 30 DAY/);
});

test('discovery keeps site-wide visits and photo response requires the same visible photo after exposure', () => {
	const discovery = evaluatePostHogJourneyFixtures({ report: 'discovery', start: '2026-09-01', end: '2026-09-30' }, ['Public Album'], [
		observed('gallery_page_viewed', '2026-09-10T09:00:00Z', 'gallery-only'),
		observed('album_exposed', '2026-09-10T10:00:00Z', 'from-card', { album_key: 'Public Album' }),
		observed('album_opened', '2026-09-10T10:01:00Z', 'from-card', { album_key: 'Public Album' }),
		observed('album_opened', '2026-09-10T11:00:00Z', 'direct', { album_key: 'Public Album' }),
		observed('album_exposed', '2026-09-10T11:01:00Z', 'direct', { album_key: 'Public Album' }),
		observed('album_exposed', '2026-09-10T12:00:00Z', 'hidden', { album_key: 'Private Album' })
	]);
	assert.deepEqual(discovery, { eligible_visits: 3, album_exposed_visits: 2, album_opened_after_exposure: 1, direct_album_open_visits: 1 });

	const response = evaluatePostHogJourneyFixtures({ report: 'photo_response', start: '2026-09-01', end: '2026-09-30' }, ['Public Album'], [
		observed('photo_exposed', '2026-09-10T10:00:00Z', 'v1', { album_key: 'Public Album', photo_id: 'p1' }),
		observed('photo_opened', '2026-09-10T10:01:00Z', 'v1', { album_key: 'Public Album', photo_id: 'p2' }),
		observed('favorite_added', '2026-09-10T10:02:00Z', 'v1', { album_key: 'Public Album', photo_id: 'p1' }),
		observed('photo_opened', '2026-09-10T10:59:00Z', 'v2', { album_key: 'Public Album', photo_id: 'p3' }),
		observed('photo_exposed', '2026-09-10T11:00:00Z', 'v2', { album_key: 'Public Album', photo_id: 'p3' }),
		observed('photo_exposed', '2026-09-10T12:00:00Z', 'hidden', { album_key: 'Private Album', photo_id: 'secret' }),
		observed('favorite_added', '2026-09-10T12:01:00Z', 'hidden', { album_key: 'Private Album', photo_id: 'secret' })
	]);
	assert.deepEqual(response, { eligible_photo_exposures: 2, later_photo_actions: 1 });
});

test('search semantics count exact search IDs once and hide selections from non-visible albums', () => {
	const query = { report: 'search_usefulness' as const, start: '2026-09-01', end: '2026-09-30' };
	const totals = evaluatePostHogJourneyFixtures(query, ['Public Album'], [
		observed('search_results_shown', '2026-09-10T10:00:00Z', 'v1', { search_id: 'zero', result_set_id: 'r0', result_count: 0, duration_ms: 50 }),
		observed('search_results_shown', '2026-09-10T10:00:01Z', 'v1', { search_id: 'zero', result_set_id: 'r0', result_count: 0, duration_ms: 50 }),
		observed('search_results_shown', '2026-09-10T10:01:00Z', 'v1', { search_id: 'selected', result_set_id: 'r1', result_count: 3, duration_ms: 70 }),
		observed('search_result_selected', '2026-09-10T10:01:01Z', 'v1', { search_id: 'selected', result_set_id: 'r1', album_key: 'Public Album', photo_id: 'p1', position: 1 }),
		observed('search_result_selected', '2026-09-10T10:01:02Z', 'v1', { search_id: 'selected', result_set_id: 'r1', album_key: 'Public Album', photo_id: 'p2', position: 2 }),
		observed('search_results_shown', '2026-09-10T10:02:00Z', 'v1', { search_id: 'private-selection', result_set_id: 'r2', result_count: 1, duration_ms: 60 }),
		observed('search_result_selected', '2026-09-10T10:02:01Z', 'v1', { search_id: 'private-selection', result_set_id: 'r2', album_key: 'Private Album', photo_id: 'secret', position: 1 })
	]);
	assert.deepEqual(totals, { searches_shown: 3, zero_result_searches: 1, selected_searches: 1, selection_duration_ms: 1000 });
	assert.match(buildPostHogJourneyQuery(query, ['Public Album'])!.query, /selected_searches AS/);
	assert.match(buildPostHogJourneyQuery({ ...query, albumKeys: ['Public Album'] }, ['Public Album'])!.query, /visible_search_selections/);
});

test('download semantics scope request IDs by visit, derive item totals by mode, and make cancellation terminal', () => {
	const query = { report: 'download_reliability' as const, start: '2026-09-01', end: '2026-09-30', albumKeys: ['Album A'] };
	const totals = evaluatePostHogJourneyFixtures(query, ['Album A', 'Private Album'], [
		observed('download_requested', '2026-09-10T10:00:00Z', 'mixed', { download_request_id: 'same-id', mode: 'saved_photo_zip', requested_item_count: 2 }),
		observed('download_item_requested', '2026-09-10T10:00:01Z', 'mixed', { download_request_id: 'same-id', album_key: 'Album A', photo_id: 'visible' }),
		observed('download_item_requested', '2026-09-10T10:00:02Z', 'mixed', { download_request_id: 'same-id', album_key: 'Private Album', photo_id: 'secret' }),
		observed('download_item_prepared', '2026-09-10T10:00:03Z', 'mixed', { download_request_id: 'same-id', album_key: 'Album A', photo_id: 'visible', byte_count: 10 }),
		observed('download_item_prepared', '2026-09-10T10:00:04Z', 'mixed', { download_request_id: 'same-id', album_key: 'Album A', photo_id: 'visible', byte_count: 10 }),
		observed('download_prepared', '2026-09-10T10:00:05Z', 'mixed', { download_request_id: 'same-id', mode: 'saved_photo_zip' }),
		observed('download_handed_off', '2026-09-10T10:00:06Z', 'mixed', { download_request_id: 'same-id', mode: 'saved_photo_zip' }),
		observed('download_requested', '2026-09-10T11:00:00Z', 'single', { download_request_id: 'same-id', mode: 'single_photo', album_key: 'Album A', photo_id: 'p2', requested_item_count: 1 }),
		observed('download_item_requested', '2026-09-10T11:00:01Z', 'single', { download_request_id: 'same-id', album_key: 'Album A', photo_id: 'p2' }),
		observed('download_failed', '2026-09-10T11:00:02Z', 'single', { download_request_id: 'same-id', mode: 'single_photo', album_key: 'Album A' }),
		observed('download_requested', '2026-09-10T12:00:00Z', 'cancelled', { download_request_id: 'cancel', mode: 'album_zip', album_key: 'Album A', requested_item_count: 1 }),
		observed('download_item_requested', '2026-09-10T12:00:01Z', 'cancelled', { download_request_id: 'cancel', album_key: 'Album A', photo_id: 'p3' }),
		observed('download_cancelled', '2026-09-10T12:00:02Z', 'cancelled', { download_request_id: 'cancel', mode: 'album_zip', album_key: 'Album A' }),
		observed('download_requested', '2026-09-10T13:00:00Z', 'unknown', { download_request_id: 'unknown', mode: 'album_zip', album_key: 'Album A', requested_item_count: 1 }),
		observed('download_item_requested', '2026-09-10T13:00:01Z', 'unknown', { download_request_id: 'unknown', album_key: 'Album A', photo_id: 'p4' }),
		observed('download_requested', '2026-09-10T14:00:00Z', 'private-only', { download_request_id: 'private', mode: 'saved_photo_zip', requested_item_count: 1 }),
		observed('download_item_requested', '2026-09-10T14:00:01Z', 'private-only', { download_request_id: 'private', album_key: 'Private Album', photo_id: 'secret' })
	]);
	assert.deepEqual(totals, {
		requests: 4, prepared: 1, handed_off: 1, failed: 1, cancelled: 1, unknown_terminal_outcome: 1,
		single_photo_requests: 1, saved_photo_zip_requests: 1, album_zip_requests: 2,
		requested_items: 4, prepared_items: 1,
		single_photo_requested_items: 1, single_photo_prepared_items: 0,
		saved_photo_zip_requested_items: 1, saved_photo_zip_prepared_items: 1,
		album_zip_requested_items: 2, album_zip_prepared_items: 0
	});
});

test('experiment semantics join ordinary outcomes to an earlier exposure in the same visit', () => {
	const query = { report: 'experiments' as const, start: '2026-09-01', end: '2026-09-30' };
	const totals = evaluatePostHogJourneyFixtures(query, ['Public Album'], [
		observed('experiment_exposed', '2026-09-10T10:00:00Z', 'converted', { experiment_key: 'cover', variant: 'b', release: 'r1', surface: 'gallery' }),
		observed('experiment_exposed', '2026-09-10T10:00:00Z', 'converted', { experiment_key: 'cover', variant: 'b', release: 'r1', surface: 'gallery' }),
		observed('album_opened', '2026-09-10T10:01:00Z', 'converted', { album_key: 'Public Album' }),
		observed('photo_load_failed', '2026-09-10T10:02:00Z', 'converted', { album_key: 'Public Album', photo_id: 'p1' }),
		observed('experiment_exposed', '2026-09-10T11:00:00Z', 'private-outcome', { experiment_key: 'cover', variant: 'a', release: 'r1', surface: 'gallery' }),
		observed('photo_opened', '2026-09-10T11:01:00Z', 'private-outcome', { album_key: 'Private Album', photo_id: 'secret' }),
		observed('photo_opened', '2026-09-10T11:59:00Z', 'before', { album_key: 'Public Album', photo_id: 'p2' }),
		observed('experiment_exposed', '2026-09-10T12:00:00Z', 'before', { experiment_key: 'nav', variant: 'b', release: 'r1', surface: 'gallery' })
	]);
	assert.deepEqual(totals, { observed_exposures: 3, outcome_visits: 1, guardrail_failures: 1 });
});

test('return semantics separate prior-window browsers from repeat visits and cap lookback at browser retention', () => {
	const query = { report: 'sources_return' as const, start: '2026-09-10', end: '2026-09-20' };
	const totals = evaluatePostHogJourneyFixtures(query, ['Public Album'], [
		observed('gallery_page_viewed', '2026-09-01T12:00:00Z', 'old-visit', {}, 'returning-browser'),
		observed('gallery_page_viewed', '2026-09-12T12:00:00Z', 'new-visit', {}, 'returning-browser'),
		observed('gallery_page_viewed', '2026-09-11T12:00:00Z', 'repeat-1', {}, 'repeat-browser'),
		observed('gallery_page_viewed', '2026-09-13T12:00:00Z', 'repeat-2', {}, 'repeat-browser'),
		observed('gallery_page_viewed', '2026-09-14T12:00:00Z', 'single', {}, 'single-browser'),
		observed('gallery_page_viewed', '2026-05-01T12:00:00Z', 'expired-old', {}, 'expired-browser'),
		observed('gallery_page_viewed', '2026-09-15T12:00:00Z', 'expired-current', {}, 'expired-browser')
	]);
	assert.deepEqual(totals, {
		measured_browsers: 4, before_window_returning_browsers: 1, repeated_visit_browsers_in_window: 1,
		tagged_arrival_visits: 0, tagged_arrival_browsers: 0,
		subsequent_album_open_visits: 0, subsequent_photo_open_visits: 0,
		subsequent_download_request_visits: 0, subsequent_favorite_visits: 0
	});
	assert.equal(buildPostHogJourneyQuery({ ...query, start: '2026-01-01' }, ['Public Album']), null);
});

test('slice filters retain only the matching target and tagged-arrival source visit', () => {
	const album = 'Album A';
	const query = { report: 'album_use' as const, start: '2026-09-01', end: '2026-09-30', albumKeys: [album], source: 'instagram', category: 'action' };
	const totals = evaluatePostHogJourneyFixtures(query, [album, 'Album B', 'Private Album'], [
		observed('gallery_page_viewed', '2026-09-10T10:00:00Z', 'tagged', { tagged_source: 'instagram' }),
		observed('album_opened', '2026-09-10T10:00:01Z', 'tagged', { album_key: album, album_sport: 'volleyball', photo_category: 'action' }),
		observed('photo_rendered', '2026-09-10T10:00:02Z', 'tagged', { album_key: album, photo_id: 'a1', album_sport: 'volleyball', photo_category: 'action' }),
		observed('favorite_added', '2026-09-10T10:00:03Z', 'tagged', { album_key: 'Album B', photo_id: 'b1', album_sport: 'volleyball', photo_category: 'action' }),
		observed('favorite_added', '2026-09-10T10:00:04Z', 'tagged', { album_key: album, photo_id: 'portrait', album_sport: 'volleyball', photo_category: 'portrait' }),
		observed('favorite_added', '2026-09-10T10:00:05Z', 'tagged', { album_key: album, photo_id: 'a1', album_sport: 'volleyball', photo_category: 'action' }),
		observed('gallery_page_viewed', '2026-09-10T11:00:00Z', 'pretender', {}),
		observed('album_opened', '2026-09-10T11:00:01Z', 'pretender', { album_key: album, album_sport: 'volleyball', photo_category: 'action' }),
		observed('photo_rendered', '2026-09-10T11:00:02Z', 'pretender', { album_key: album, photo_id: 'a2', album_sport: 'volleyball', photo_category: 'action' }),
		observed('favorite_added', '2026-09-10T11:00:03Z', 'pretender', { album_key: album, photo_id: 'a2', tagged_source: 'instagram', album_sport: 'volleyball', photo_category: 'action' }),
		observed('album_opened', '2026-09-10T12:00:00Z', 'hidden', { album_key: 'Private Album', album_sport: 'volleyball', photo_category: 'action' })
	]);
	assert.deepEqual(totals, { album_open_visits: 1, photo_render_visits: 1, album_action_visits: 1 });
	const sql = buildPostHogJourneyQuery(query, [album, 'Album B'])!.query;
	assert.match(sql, /tagged_arrivals/);
	assert.match(sql, /source = 'instagram'/);
	assert.match(sql, /photo_category = 'action'/);
	assert.doesNotMatch(sql, /minIfOrNull|toInt64OrZero/);
});

test('search displays use the matched visit/search/result set while selections remain visible-target only', () => {
	const query = { report: 'search_usefulness' as const, start: '2026-09-01', end: '2026-09-30', albumKeys: ['Album A'] };
	const totals = evaluatePostHogJourneyFixtures(query, ['Album A', 'Private Album'], [
		observed('search_results_shown', '2026-09-10T10:00:00Z', 'v', { search_id: 's1', result_set_id: 'r1', result_count: 12 }),
		observed('search_result_selected', '2026-09-10T10:00:01Z', 'v', { search_id: 's1', result_set_id: 'r1', album_key: 'Private Album', photo_id: 'private', position: 1 }),
		observed('search_result_selected', '2026-09-10T10:00:02Z', 'v', { search_id: 's1', result_set_id: 'r1', album_key: 'Album A', photo_id: 'a1', position: 2 }),
		observed('search_results_shown', '2026-09-10T10:01:00Z', 'v', { search_id: 's1', result_set_id: 'r2', result_count: 0 }),
		observed('search_result_selected', '2026-09-10T10:01:01Z', 'v', { search_id: 's1', result_set_id: 'r2', album_key: 'Private Album', photo_id: 'private', position: 1 })
	]);
	assert.deepEqual(totals, { searches_shown: 1, zero_result_searches: 0, selected_searches: 1, selection_duration_ms: 2000 });
	assert.match(buildPostHogJourneyQuery(query, ['Album A'])!.query, /visible_search_selections/);
});

test('latest provider correction version controls source-query inclusion regardless of delivery order', () => {
	const original = { ...observed('photo_exposed', '2026-09-10T10:00:00Z', 'v', { album_key: 'Album A', photo_id: 'a1' }), eventId: 'original-a' };
	const classified = (version: number, classification: string, timestamp: string): PostHogFixtureEvent => ({
		event: 'analytics_classification_changed', eventId: `control-${version}`, timestamp, distinctId: 'operator',
		properties: { target_event_id: 'original-a', classification_version: version, classification }
	});
	const query = { report: 'photo_response' as const, start: '2026-09-01', end: '2026-09-30' };
	assert.deepEqual(evaluatePostHogJourneyFixtures(query, ['Album A'], [original, classified(4, 'audience', '2026-09-01T00:00:00Z'), classified(3, 'operator', '2026-09-30T00:00:00Z')]), { eligible_photo_exposures: 1, later_photo_actions: 0 });
	assert.deepEqual(evaluatePostHogJourneyFixtures(query, ['Album A'], [original, classified(4, 'operator', '2026-09-01T00:00:00Z'), classified(5, 'unclassified', '2026-09-02T00:00:00Z')]), { eligible_photo_exposures: 1, later_photo_actions: 0 });
	assert.deepEqual(evaluatePostHogJourneyFixtures(query, ['Album A'], [original, classified(6, 'self_excluded', '2026-09-01T00:00:00Z')]), { eligible_photo_exposures: 0, later_photo_actions: 0 });
	const sql = buildPostHogJourneyQuery(query, ['Album A'])!.query;
	assert.match(sql, /analytics_classification_changed/);
	assert.match(sql, /argMax\(toString\(properties\.classification\), toIntOrZero/);
	assert.match(sql, /'audience', 'unclassified'/);
});

test('source return reports tagged arrivals and only subsequent relevant actions', () => {
	const query = { report: 'sources_return' as const, start: '2026-09-10', end: '2026-09-20', albumKeys: ['Album A'] };
	const totals = evaluatePostHogJourneyFixtures(query, ['Album A', 'Private Album'], [
		observed('gallery_page_viewed', '2026-09-09T10:00:00Z', 'old', {}, 'browser-returning'),
		observed('album_opened', '2026-09-09T10:00:01Z', 'old', { album_key: 'Album A' }, 'browser-returning'),
		observed('gallery_page_viewed', '2026-09-11T10:00:00Z', 'tagged', { tagged_source: 'instagram' }, 'browser-returning'),
		observed('album_opened', '2026-09-11T10:00:01Z', 'tagged', { album_key: 'Album A' }, 'browser-returning'),
		observed('photo_opened', '2026-09-11T10:00:02Z', 'tagged', { album_key: 'Album A', photo_id: 'a1' }, 'browser-returning'),
		observed('favorite_added', '2026-09-11T10:00:03Z', 'tagged', { album_key: 'Album A', photo_id: 'a1' }, 'browser-returning'),
		observed('download_item_requested', '2026-09-11T10:00:04Z', 'tagged', { album_key: 'Album A', photo_id: 'a1', download_request_id: 'd1' }, 'browser-returning'),
		observed('favorite_added', '2026-09-11T10:00:05Z', 'tagged', { album_key: 'Private Album', photo_id: 'secret' }, 'browser-returning')
	]);
	assert.deepEqual(totals, {
		measured_browsers: 1, before_window_returning_browsers: 1, repeated_visit_browsers_in_window: 0,
		tagged_arrival_visits: 1, tagged_arrival_browsers: 1,
		subsequent_album_open_visits: 1, subsequent_photo_open_visits: 1,
		subsequent_download_request_visits: 1, subsequent_favorite_visits: 1
	});
	assert.match(buildPostHogJourneyQuery(query, ['Album A'])!.query, /GROUP BY arrival_source/);
	assert.match(buildPostHogJourneyQuery(query, ['Album A'])!.query, /LIMIT 21/);
});

test('journey results retain their real denominators and remain unavailable on provider failure', async () => {
	const query = { report: 'photo_response' as const, start: '2026-09-01', end: '2026-09-30' };
	const success = await queryGalleryJourneys({ query: async () => ({ columns: ['eligible_photo_exposures', 'later_photo_actions'], results: [[12, 3]] }) }, query, { publicOnly: true, allowedAlbumKeys: ['album-a'] });
	assert.deepEqual(success.totals, { eligible_photo_exposures: 12, later_photo_actions: 3 });
	assert.equal(success.available, true);
	const privateScope = await queryGalleryJourneys({ query: async () => ({ columns: ['eligible_photo_exposures', 'later_photo_actions'], results: [[12, 3]] }) }, query, { publicOnly: false, allowedAlbumKeys: ['album-a'] });
	assert.equal(privateScope.available, false);
	assert.equal(privateScope.error, 'invalid_query');
	const unavailable = await queryGalleryJourneys({ query: async () => { throw new Error('timeout'); } }, query, { publicOnly: true, allowedAlbumKeys: ['album-a'] });
	assert.equal(unavailable.available, false);
	assert.deepEqual(unavailable.totals, { eligible_photo_exposures: null, later_photo_actions: null });
});

test('source-return provider rows expose only bounded source aggregates', async () => {
	const response = {
		columns: ['row_kind', 'source', 'measured_browsers', 'before_window_returning_browsers', 'repeated_visit_browsers_in_window', 'tagged_arrival_visits', 'tagged_arrival_browsers', 'subsequent_album_open_visits', 'subsequent_photo_open_visits', 'subsequent_download_request_visits', 'subsequent_favorite_visits'],
		results: [
			['overall', '', 4, 1, 2, 3, 3, 2, 2, 1, 1],
			['source', 'instagram', 2, 1, 1, 2, 2, 1, 1, 1, 1],
			['source', 'x'.repeat(33), 1, 0, 0, 1, 1, 0, 0, 0, 0]
		]
	};
	const result = await queryGalleryJourneys({ query: async () => response }, { report: 'sources_return', start: '2026-09-10', end: '2026-09-20' }, { publicOnly: true, allowedAlbumKeys: ['album-a'] });
	assert.deepEqual(result.totals, {
		measured_browsers: 4, before_window_returning_browsers: 1, repeated_visit_browsers_in_window: 2,
		tagged_arrival_visits: 3, tagged_arrival_browsers: 3,
		subsequent_album_open_visits: 2, subsequent_photo_open_visits: 2,
		subsequent_download_request_visits: 1, subsequent_favorite_visits: 1
	});
	assert.deepEqual(result.breakdown, [{
		source: 'instagram', tagged_arrival_visits: 2, measured_browsers: 2,
		before_window_returning_browsers: 1, repeated_visit_browsers_in_window: 1,
		subsequent_album_open_visits: 1, subsequent_photo_open_visits: 1,
		subsequent_download_request_visits: 1, subsequent_favorite_visits: 1
	}]);
});

test('reconciliation only confirms returned provider UUIDs', async () => {
	const confirmed: string[][] = [];
	const outcome = await reconcilePostHogEventIds({ query: async () => ({ results: [[eventId], ['not-requested']] }) }, [eventId], async (ids) => { confirmed.push(ids); });
	assert.deepEqual(outcome, { available: true, requested: 1, confirmed: 1, missing: 0 });
	assert.deepEqual(confirmed, [[eventId]]);
});

test('scheduler reconciliation checks the durable submitted backlog and leaves provider gaps unconfirmed', async () => {
	const previousId = '550e8400-e29b-41d4-a716-446655440001';
	const confirmed: string[][] = [];
	const outbox: PostHogOutboxClient = {
		claim: async () => [], recheck: async () => null, finish: async () => {},
		submitted: async () => [previousId, eventId],
		confirm: async (ids) => { confirmed.push(ids); }, health: async () => ({})
	};
	const outcome = await reconcileSubmittedPostHogEvents({ query: async () => ({ results: [[eventId]] }) }, outbox);
	assert.deepEqual(outcome, { available: true, requested: 2, confirmed: 1, missing: 1 });
	assert.deepEqual(confirmed, [[eventId]]);
});

test('reconciliation requeues only provider-missing IDs after a successful query', async () => {
	const missingId = '550e8400-e29b-41d4-a716-446655440002';
	const requeued: string[][] = [];
	const confirmed: string[][] = [];
	const success = await reconcilePostHogEventIds({ query: async () => ({ results: [[eventId]] }) }, [eventId, missingId], async (ids) => { confirmed.push(ids); }, async (ids) => { requeued.push(ids); });
	assert.deepEqual(success, { available: true, requested: 2, confirmed: 1, missing: 1 });
	assert.deepEqual(confirmed, [[eventId]]);
	assert.deepEqual(requeued, [[missingId]]);
	const unavailable = await reconcilePostHogEventIds({ query: async () => { throw new Error('timeout'); } }, [missingId], async () => {}, async (ids) => { requeued.push(ids); });
	assert.deepEqual(unavailable, { available: false, requested: 1, confirmed: 0, missing: 1 });
	assert.deepEqual(requeued, [[missingId]]);
});

test('content-sliced search cannot claim zero-result coverage or an unbiased denominator', async () => {
 const result=await queryGalleryJourneys({query:async()=>({columns:['searches_shown','zero_result_searches','selected_searches','selection_duration_ms'],results:[[1,0,1,200]]})}, {report:'search_usefulness',start:'2026-09-01',end:'2026-09-02',category:'action'}, {publicOnly:true,allowedAlbumKeys:['Album A']});
 assert.equal(result.available,true);
 assert.equal(result.totals.zero_result_searches,null);
 assert.match(result.coverage.metadata,/Do not interpret this subset as a search success rate/);
});

test('source overall totals do not depend on UNION response order',async()=>{
 const result=await queryGalleryJourneys({query:async()=>({columns:['row_kind','source','measured_browsers'],results:[['source','instagram',1],['overall','',4]]})}, {report:'sources_return',start:'2026-09-01',end:'2026-09-02'}, {publicOnly:true,allowedAlbumKeys:['Album A']});
 assert.equal(result.totals.measured_browsers,4);
});

test('public journey reads deduplicate only identical provider and visibility scopes', async () => {
	let now = 1_000;
	let calls = 0;
	const cache = createProviderCache({ ttlMs: 100, maxEntries: 8, maxInFlight: 4, maxBytes: 20_000, now: () => now });
	const response = { columns: ['eligible_photo_exposures', 'later_photo_actions'], results: [[12, 3]] };
	const client = (account: string, credential: string) => ({
		providerCache: { origin: 'https://us.posthog.com', account, credentialIdentity: Promise.resolve(credential) },
		query: async () => { calls += 1; await Promise.resolve(); return response; }
	});
	const query = { report: 'photo_response' as const, start: '2026-09-01', end: '2026-09-30' };
	const options = { publicOnly: true, allowedAlbumKeys: ['album-a'], cache, now: () => new Date(now) };
	await Promise.all([
		queryGalleryJourneys(client('1', 'credential-a'), query, options),
		queryGalleryJourneys(client('1', 'credential-a'), query, options)
	]);
	assert.equal(calls, 1);
	await queryGalleryJourneys(client('2', 'credential-a'), query, options);
	await queryGalleryJourneys(client('1', 'credential-b'), query, options);
	await queryGalleryJourneys(client('1', 'credential-a'), { ...query, category: 'action' }, options);
	await queryGalleryJourneys(client('1', 'credential-a'), query, { ...options, allowedAlbumKeys: ['album-b'] });
	assert.equal(calls, 5);
	now += 101;
	await queryGalleryJourneys(client('1', 'credential-a'), query, options);
	assert.equal(calls, 6);
});

test('PostHog transport uses one total deadline across polling and aborts unfinished requests', async () => {
	const source = {
		POSTHOG_ENABLED: 'true', POSTHOG_TARGET_ENVIRONMENT: 'production',
		POSTHOG_QUERY_API_KEY: 'query-key', POSTHOG_PROJECT_ID: '42', POSTHOG_HOST: 'https://us.i.posthog.com'
	};
	let now = 0;
	let fetchCalls = 0;
	const pending = () => new Response(JSON.stringify({ query_status: { id: 'job', complete: false } }), { status: 200 });
	const transport = createPostHogQueryTransport(source, {
		fetcher: async () => { fetchCalls += 1; return pending(); },
		now: () => now,
		totalDeadlineMs: 1_000,
		pollIntervalMs: 600,
		sleep: async (milliseconds) => { now += milliseconds; },
		scheduleAbort: () => 1,
		cancelAbort: () => {}
	});
	await assert.rejects(transport!.query({ query: { kind: 'HogQLQuery', query: 'SELECT 1' } }), { name: 'PostHogQueryPendingError' });
	assert.equal(now, 1_000);
	assert.equal(fetchCalls, 2);

	let sawAbort = false;
	const unfinished = createPostHogQueryTransport(source, {
		fetcher: async (_url, init) => {
			sawAbort = init?.signal?.aborted === true;
			throw new DOMException('aborted', 'AbortError');
		},
		scheduleAbort: (abort) => { abort(); return 1; },
		cancelAbort: () => {}
	});
	await assert.rejects(unfinished!.query({ query: { kind: 'HogQLQuery', query: 'SELECT 1' } }), { name: 'PostHogQueryPendingError' });
	assert.equal(sawAbort, true);
});

test('PostHog transport keeps three queries in flight and bounds the wait for a slot', async () => {
	const source = {
		POSTHOG_ENABLED: 'true', POSTHOG_TARGET_ENVIRONMENT: 'production',
		POSTHOG_QUERY_API_KEY: 'query-key', POSTHOG_PROJECT_ID: '42', POSTHOG_HOST: 'https://us.i.posthog.com'
	};
	const settle = () => new Promise((resolve) => setImmediate(resolve));
	const query = { query: { kind: 'HogQLQuery' as const, query: 'SELECT 1' } };
	let inFlight = 0;
	let most = 0;
	const held: Array<() => void> = [];
	const transport = createPostHogQueryTransport(source, {
		fetcher: async () => {
			inFlight += 1; most = Math.max(most, inFlight);
			await new Promise<void>((resolve) => held.push(resolve));
			inFlight -= 1;
			return new Response(JSON.stringify({ results: [] }), { status: 200 });
		},
		scheduleAbort: () => 1,
		cancelAbort: () => {}
	});
	// Two gallery jobs in one wake-up send eight queries together; PostHog runs three per project at once.
	const queries = Array.from({ length: 8 }, () => transport!.query(query));
	await settle();
	assert.equal(most, 3);
	while (held.length) { held.shift()!(); await settle(); }
	await Promise.all(queries);
	assert.equal(most, 3);

	const timers: Array<() => void> = [];
	const busyHeld: Array<() => void> = [];
	let sent = 0;
	const busy = createPostHogQueryTransport(source, {
		fetcher: async () => {
			sent += 1;
			await new Promise<void>((resolve) => busyHeld.push(resolve));
			return new Response(JSON.stringify({ results: [] }), { status: 200 });
		},
		scheduleAbort: (callback) => { timers.push(callback); return timers.length; },
		cancelAbort: () => {}
	});
	const running = [busy!.query(query), busy!.query(query), busy!.query(query)];
	await settle();
	const queued = busy!.query(query);
	timers.at(-1)!();
	await assert.rejects(queued, { name: 'PostHogQueryPendingError' });
	assert.equal(sent, 3);
	busyHeld.forEach((release) => release());
	await Promise.all(running);
});
