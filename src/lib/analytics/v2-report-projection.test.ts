import assert from 'node:assert/strict';
import test from 'node:test';
import { buildV2ReportProjection, type V2ReportEvent } from './v2-report-projection.server';
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

test('v2 projection keeps individual accepted observations and applies the full public scope before aggregation', () => {
	const projection = buildV2ReportProjection([
		event(), event({ occurred_at: '2026-09-20T18:01:00.000Z' }),
		event({ album_key: 'unlisted-album' }),
		event({ properties: { album_sport: 'volleyball', photo_category: 'portrait', tagged_source: 'instagram' } }),
		event({ traffic_context: 'operator' })
	], query, { publicAlbumKeys: ['public-album'] });

	assert.equal(projection.available, true);
	assert.equal(projection.counts.find((count) => count.event === 'photo_opened')?.count, 2);
	assert.equal(projection.coverage.observationsIncluded, 2);
	assert.equal(projection.coverage.observationsExcluded, 3);
	assert.equal(projection.photoResponse.laterActions, 2);
});

test('v2 projection does not expose browser, visit, album, or photo identifiers', () => {
	const projection = buildV2ReportProjection([event()], query, { publicAlbumKeys: ['public-album'] });
	const publicShape = JSON.stringify(projection);

	assert.equal(publicShape.includes('public-album'), false);
	assert.equal(publicShape.includes('photo-a'), false);
	assert.equal(publicShape.includes('visit'), false);
	assert.equal(publicShape.includes('browser'), false);
});
