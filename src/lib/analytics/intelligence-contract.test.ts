import assert from 'node:assert/strict';
import test from 'node:test';
import { intelligenceScopeKey, parseIntelligenceScope, parsePublicIntelligenceTarget, standardIntelligenceScopes, type IntelligenceScope } from './intelligence-contract';

const gallery: IntelligenceScope = { kind: 'gallery', query: { start: '2026-03-01', end: '2026-03-30', measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } };
test('scope validation rejects impossible dates, huge windows, extra fields, and invalid custom comparisons', () => {
	assert.ok(parseIntelligenceScope(gallery));
	assert.equal(parseIntelligenceScope({ ...gallery, extra: true }), null);
	assert.equal(parseIntelligenceScope({ ...gallery, query: { ...gallery.query, start: '2026-02-30' } }), null);
	assert.equal(parseIntelligenceScope({ ...gallery, query: { ...gallery.query, start: '2000-01-01' } }), null);
	assert.equal(parseIntelligenceScope({ ...gallery, query: { ...gallery.query, compare: 'custom', compareStart: '2026-02-01' } }), null);
});

test('scope keys use PostgreSQL jsonb-stable field ordering rather than caller insertion order', () => {
	const reordered: IntelligenceScope = { kind: 'gallery', query: { traffic: 'conservative', compare: 'previous', albumKeys: [], scope: 'all', measure: 'photo_opens', end: '2026-03-30', start: '2026-03-01' } };
	assert.equal(intelligenceScopeKey(gallery), intelligenceScopeKey(reordered));
	assert.equal(intelligenceScopeKey(gallery), '{"kind": "gallery", "query": {"end": "2026-03-30", "scope": "all", "start": "2026-03-01", "compare": "previous", "measure": "photo_opens", "traffic": "conservative", "albumKeys": []}}');
});

test('scheduled gallery scope uses the last complete Chicago day through DST', () => {
	const scopes = standardIntelligenceScopes(new Date('2026-03-09T13:00:00.000Z'));
	const first = scopes.find((scope) => scope.kind === 'gallery');
	assert.deepEqual(first, { kind: 'gallery', query: { start: '2026-02-07', end: '2026-03-08', measure: 'photo_opens', scope: 'all', albumKeys: [], compare: 'previous', traffic: 'conservative' } });
});

test('standalone action targets accept only a small public target contract', () => {
	assert.deepEqual(parsePublicIntelligenceTarget({ kind: 'album', albumKey: 'fall-classic' }), { kind: 'album', albumKey: 'fall-classic' });
	assert.deepEqual(parsePublicIntelligenceTarget({ kind: 'page', id: '/photography' }), { kind: 'page', id: '/photography' });
	assert.equal(parsePublicIntelligenceTarget({ kind: 'page', id: '/admin' }), null);
	assert.equal(parsePublicIntelligenceTarget({ kind: 'album', albumKey: 'fall', id: 'ignored' }), null);
	assert.equal(parsePublicIntelligenceTarget({ kind: 'photo', id: '../private' }), null);
});
