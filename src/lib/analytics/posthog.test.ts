import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverPostHogBatch, hasPostHogScheduleAuthorization } from './posthog-delivery.server';
import { buildPostHogJourneyQuery, queryGalleryJourneys, reconcilePostHogEventIds } from './posthog-queries.server';
import { scrubPostHogProperties } from './posthog-contract';
import { evaluatePhotographyExperiment, postHogRuntimeConfig } from './posthog.server';
import { createPostHogOutboxClient } from './posthog-outbox.server';
import type { PostHogEnvelope, PostHogOutboxClient, PostHogOutboxRow } from './posthog.types';

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

test('scrubs payloads before they reach PostHog and suppresses person profiles', () => {
	const payload = scrubPostHogProperties(envelope);
	assert.deepEqual(payload, {
		$process_person_profile: false, $session_id: 'visit_123', event_id: eventId,
		schema_version: 2, received_at: '2026-09-29T12:00:01.000Z', visit_id: 'visit_123', traffic_context: 'audience', album_key: 'album-one',
		photo_id: 'photo-one', referrer_domain: 'example.org', result_count: 4
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
		finish: async (id, status, code) => { finishes.push([id, status, code]); },
		confirm: async () => {}, health: async () => ({})
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
		finish: async (id, status, code) => { finishes.push([id, status, code]); },
		confirm: async () => {}, health: async () => ({})
	};
	const result = await deliverPostHogBatch({ capture: async () => { throw new Error('503'); } }, outbox);
	assert.deepEqual({ submitted: result.submitted, failed: result.failed }, { submitted: 0, failed: 1 });
	assert.deepEqual(finishes, [[eventId, 'failed', 'posthog_capture_failed']]);
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
	assert.deepEqual(postHogRuntimeConfig({ POSTHOG_PROJECT_API_KEY: 'key', POSTHOG_HOST: 'https://eu.i.posthog.com/path' }), { projectApiKey: 'key', host: 'https://eu.i.posthog.com' });
	assert.deepEqual(await evaluatePhotographyExperiment(null, 'cover-test', 'browser_123'), { available: false, variant: null, reason: 'disabled' });
	assert.deepEqual(await evaluatePhotographyExperiment({ getFeatureFlag: async () => { throw new Error('quota'); } }, 'cover-test', 'browser_123'), { available: false, variant: null, reason: 'quota_or_provider_unavailable' });
	assert.deepEqual(await evaluatePhotographyExperiment({ getFeatureFlag: async () => 'blue' }, 'cover-test', 'browser_123'), { available: true, variant: 'blue', reason: 'evaluated' });
});

test('named queries constrain dates, source, and visible album scope before aggregation', () => {
	const fixed = buildPostHogJourneyQuery({ report: 'photo_response', start: '2026-09-01', end: '2026-09-30', albumKeys: ['album-a', 'album-b'], source: 'instagram', sport: 'volleyball' }, ['album-a', 'album-b']);
	assert.ok(fixed);
	assert.match(fixed.query, /properties\.album_key IN \('album-a', 'album-b'\)/);
	assert.match(fixed.query, /toTimeZone\(timestamp, 'America\/Chicago'\)/);
	assert.match(fixed.query, /properties\.traffic_context = 'audience'/);
	assert.match(fixed.query, /visit_id, photo_id/);
	assert.match(fixed.query, /timestamp > photo_exposed_at/);
	assert.match(fixed.query, /minIfOrNull/);
	assert.equal(buildPostHogJourneyQuery({ report: 'photo_response', start: '2026-09-01', end: '2026-09-30', albumKeys: ['private-album'] }, ['album-a']), null);
	assert.equal(buildPostHogJourneyQuery({ report: 'photo_response', start: '2026-09-01', end: '2026-09-30', source: "x' OR 1=1 --" }, ['album-a']), null);
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
	assert.deepEqual(outcome, { available: true, confirmed: 1 });
	assert.deepEqual(confirmed, [[eventId]]);
});
