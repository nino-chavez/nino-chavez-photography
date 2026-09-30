import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIntelligenceScope, standardIntelligenceScopes } from './intelligence-contract';

const gallery = { kind: 'gallery', query: { start: '2026-03-01', end: '2026-03-30', measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } };
test('scope validation rejects impossible dates, huge windows, extra fields, and invalid custom comparisons', () => {
	assert.ok(parseIntelligenceScope(gallery));
	assert.equal(parseIntelligenceScope({ ...gallery, extra: true }), null);
	assert.equal(parseIntelligenceScope({ ...gallery, query: { ...gallery.query, start: '2026-02-30' } }), null);
	assert.equal(parseIntelligenceScope({ ...gallery, query: { ...gallery.query, start: '2000-01-01' } }), null);
	assert.equal(parseIntelligenceScope({ ...gallery, query: { ...gallery.query, compare: 'custom', compareStart: '2026-02-01' } }), null);
});

test('scheduled gallery scope uses the last complete Chicago day through DST', () => {
	const scopes = standardIntelligenceScopes(new Date('2026-03-09T13:00:00.000Z'));
	const first = scopes.find((scope) => scope.kind === 'gallery');
	assert.deepEqual(first, { kind: 'gallery', query: { start: '2026-02-07', end: '2026-03-08', measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } });
});
