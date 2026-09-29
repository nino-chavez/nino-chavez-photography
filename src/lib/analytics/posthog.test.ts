import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverPostHogBatch, hasPostHogScheduleAuthorization } from './posthog-delivery.server';
import { buildPostHogDashboardQuery, buildPostHogJourneyQuery, evaluatePostHogJourneyFixtures, queryGalleryJourneys, reconcilePostHogEventIds, reconcileSubmittedPostHogEvents, type PostHogFixtureEvent } from './posthog-queries.server';
import { scrubPostHogProperties } from './posthog-contract';
import { createPostHogFlagClient, evaluatePhotographyExperiment, postHogRuntimeConfig } from './posthog.server';
import { createPostHogOutboxClient } from './posthog-outbox.server';
import { EVENT_V2_NAMES } from './events-v2';
import { POSTHOG_EVENT_NAMES, type PostHogEnvelope, type PostHogOutboxClient, type PostHogOutboxRow } from './posthog.types';

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
	assert.match(fixed.query, /properties\.traffic_context = 'audience'/);
	assert.match(fixed.query, /album_renders AS/);
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
	assert.match(buildPostHogJourneyQuery({ ...query, albumKeys: ['Public Album'] }, ['Public Album'])!.query, /cohort|visit_id IN/);
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
	assert.deepEqual(totals, { measured_browsers: 4, before_window_returning_browsers: 1, repeated_visit_browsers_in_window: 1 });
	assert.equal(buildPostHogJourneyQuery({ ...query, start: '2026-01-01' }, ['Public Album']), null);
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
