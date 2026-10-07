import assert from 'node:assert/strict';
import test from 'node:test';
import { intelligenceScopeKey, parseIntelligenceBriefSourceWindow, parseIntelligenceScope, parsePublicIntelligenceTarget, standardIntelligenceScopes, type IntelligenceScope } from './intelligence-contract';

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

test('brief provenance preserves complete saved windows and rejects malformed unknowns', () => {
	const decoded = parseIntelligenceBriefSourceWindow({ scope: gallery, cutoff: '2026-09-30T14:00:00.000Z', timezone: 'America/Chicago', current: { start: '2026-09-01', end: '2026-09-30' }, previous: { start: '2026-08-02', end: '2026-08-31' } });
	assert.deepEqual(decoded?.current, { start: '2026-09-01', end: '2026-09-30' });
	assert.equal(decoded?.timezone, 'America/Chicago');
	assert.equal(parseIntelligenceBriefSourceWindow({ scope: gallery, cutoff: 'not-a-date', timezone: 'America/Chicago', current: { start: '2026-09-31', end: '2026-09-30' } }), null);
	assert.equal(parseIntelligenceBriefSourceWindow({ scope: gallery, cutoff: null, timezone: 'not/a-timezone' }), null);
});

test('launch scopes: one per album and one for every launch, keyed exactly as PostgreSQL prints the jsonb', () => {
	// Read back from production on 2026-10-06: analytics_intelligence_scope_key('{"albumKey":"Re7kho","kind":"launch"}').
	assert.equal(intelligenceScopeKey({ kind: 'launch', albumKey: 'Re7kho' }), '{"kind": "launch", "albumKey": "Re7kho"}');
	assert.equal(intelligenceScopeKey({ kind: 'launch', albumKey: null }), '{"kind": "launch", "albumKey": null}');
	assert.deepEqual(parseIntelligenceScope({ albumKey: 'Re7kho', kind: 'launch' }), { kind: 'launch', albumKey: 'Re7kho' });
	assert.equal(parseIntelligenceScope({ kind: 'launch' }), null, 'the album key is stated, even when it is null');
	assert.equal(parseIntelligenceScope({ kind: 'launch', albumKey: '../x' }), null);
	assert.equal(parseIntelligenceScope({ kind: 'launch', albumKey: 'Re7kho', start: '2026-09-25' }), null, 'a launch key never holds a date');
	const window = parseIntelligenceBriefSourceWindow({ scope: { kind: 'launch', albumKey: null }, cutoff: null, timezone: 'America/Chicago', current: null, previous: null });
	assert.deepEqual(window?.scope, { kind: 'launch', albumKey: null });
});
