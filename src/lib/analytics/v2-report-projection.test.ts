import assert from 'node:assert/strict';
import test from 'node:test';
import { buildV2ReportProjection, type V2ArchivedTotal, type V2ReportEvent } from './v2-report-projection.server';
import type { ReportQuery } from './report-contract';

const query: ReportQuery = {
	start: '2026-09-20', end: '2026-09-20', measure: 'photo_opens', scope: 'all', albumKeys: [],
	compare: 'none', traffic: 'conservative', sport: 'volleyball', category: 'action', source: 'instagram'
};

function event(overrides: Partial<V2ReportEvent> = {}): V2ReportEvent {
	return {
		event_name: 'photo_opened', occurred_at: '2026-09-20T18:00:00.000Z', album_key: 'public-album', photo_id: 'photo-a',
		traffic_context: 'audience', properties: { album_sport: 'volleyball', photo_category: 'action', tagged_source: 'instagram' },
		...overrides
	};
}

function archived(overrides: Partial<V2ArchivedTotal> = {}): V2ArchivedTotal {
	return {
		bucket_date: '2026-09-20', event_name: 'photo_opened', traffic_context: 'audience', album_key: 'public-album', photo_id: 'photo-a',
		dimensions: { album_sport: 'volleyball', photo_category: 'action', tagged_source: 'instagram' }, event_count: 7, export_eligible_count: 6, last_recorded_at: '2026-09-20T23:00:00.000Z',
		...overrides
	};
}

const bounds = { firstRecordedAt: '2026-09-01T10:00:00.000Z', rawRetainedFrom: '2026-09-15T00:00:00.000Z', archivedFrom: '2026-09-01', archivedThrough: '2026-09-14' };

test('v2 projection adds disjoint raw and archive observation counts using recorded dimensions', () => {
	const projection = buildV2ReportProjection([
		event(), event({ occurred_at: '2026-09-20T18:01:00.000Z' }),
		event({ album_key: 'unlisted-album' }),
		event({ properties: { album_sport: 'volleyball', photo_category: 'portrait', tagged_source: 'instagram' } }),
		event({ traffic_context: 'operator' })
	], [archived(), archived({ event_count: 11, dimensions: { album_sport: 'volleyball', photo_category: 'portrait', tagged_source: 'instagram' } })], query, { publicAlbumKeys: ['public-album'] }, bounds);

	assert.equal(projection.available, true);
	assert.equal(projection.counts.find((count) => count.event === 'photo_opened')?.count, 9);
	assert.equal(projection.coverage.firstRecordedAt, bounds.firstRecordedAt);
	assert.match(projection.coverage.label, /Archived aggregate snapshots cover 2026-09-01 through 2026-09-14/);
});

test('album-null gallery and search observations remain visible in an all-album report', () => {
	const projection = buildV2ReportProjection([
		event({ event_name: 'gallery_page_viewed', album_key: null, photo_id: null, properties: { tagged_source: 'instagram', album_sport: 'volleyball', photo_category: 'action' } }),
		event({ event_name: 'search_submitted', album_key: null, photo_id: null, properties: { tagged_source: 'instagram', album_sport: 'volleyball', photo_category: 'action' } }),
		event({ event_name: 'photo_opened', album_key: null, photo_id: 'unknown-photo' })
	], [], query, { publicAlbumKeys: ['public-album'] }, bounds);

	assert.equal(projection.counts.find((count) => count.event === 'gallery_page_viewed')?.count, 1);
	assert.equal(projection.counts.find((count) => count.event === 'search_submitted')?.count, 1);
	assert.equal(projection.counts.find((count) => count.event === 'photo_opened')?.count, 0);
});

test('v2 projection exposes no identifiers, raw read counts, or funnel claims', () => {
	const projection = buildV2ReportProjection([event()], [archived()], query, { publicAlbumKeys: ['public-album'] }, bounds);
	const publicShape = JSON.stringify(projection);

	assert.equal(publicShape.includes('public-album'), false);
	assert.equal(publicShape.includes('photo-a'), false);
	assert.equal(publicShape.includes('visit'), false);
	assert.equal(publicShape.includes('browser'), false);
	assert.equal(publicShape.includes('laterActions'), false);
	assert.equal(publicShape.includes('observationsRead'), false);
});

test('a missing coverage bound is never presented as complete or observed zero', () => {
	const projection = buildV2ReportProjection([], [], query, { publicAlbumKeys: [] });
	assert.match(projection.coverage.label, /cannot call the interval complete/);
	assert.match(projection.coverage.label, /no matching public observation/);
});

test('a current raw classification changes aggregation while archived classifications stay identifier-free', () => {
	const current = buildV2ReportProjection([
		event({ event_id: '20000000-0000-4000-8000-000000000099', classification: 'suspected_automation' }),
		event({ event_id: '20000000-0000-4000-8000-000000000098', classification: 'unclassified' })
	], [archived({ traffic_context: 'known_crawler', event_count: 4 }), archived({ traffic_context: 'unclassified', event_count: 3 })], query, { publicAlbumKeys: ['public-album'] }, bounds);

	assert.equal(current.counts.find((count) => count.event === 'photo_opened')?.count, 4);
	assert.equal(JSON.stringify(current).includes('20000000-0000-4000-8000-000000000099'), false);
});
