import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPersistedActionFollowUp } from './intelligence-followup.server';
import type { IntelligenceAction } from './intelligence-contract';

const action: IntelligenceAction = {
	id: '11111111-1111-4111-8111-111111111111', kind: 'record', target: { kind: 'album', albumKey: 'alpha' }, actualAt: '2026-09-01T15:00:00.000Z',
	hypothesis: 'A public promotion may increase album opens.', primaryMeasure: 'album_opens', observationDays: 7, followUpAt: '2026-09-09T05:00:00.000Z', createdAt: '2026-09-01T15:00:00.000Z'
};

test('follow-up remains pending until its declared calendar window ends', async () => {
	const result = await loadPersistedActionFollowUp({ rpc: async () => { throw new Error('must not query'); } } as never, action, new Date('2026-09-08T00:00:00Z'));
	assert.deepEqual(result, { status: 'pending' });
});

test('incomplete daily coverage stays visible as inconclusive rather than invented as a result', async () => {
	const result = await loadPersistedActionFollowUp({ rpc: async () => ({ error: null, data: { before: null, after: null, coverage: 'partial', previousCoverage: 'complete', measure: 'album_opens', window: { before: { start: '2026-08-25', end: '2026-08-31' }, after: { start: '2026-09-02', end: '2026-09-08' } } } }) } as never, action, new Date('2026-09-10T00:00:00Z'));
	assert.deepEqual(result, { status: 'inconclusive' });
});

test('complete aggregate windows return only before and after counts', async () => {
	const result = await loadPersistedActionFollowUp({ rpc: async () => ({ error: null, data: { before: 12, after: 18, coverage: 'complete', previousCoverage: 'complete', measure: 'album_opens', window: { before: { start: '2026-08-25', end: '2026-08-31' }, after: { start: '2026-09-02', end: '2026-09-08' } } } }) } as never, action, new Date('2026-09-10T00:00:00Z'));
	assert.equal(result.status, 'ready');
	assert.deepEqual(result.followUp?.window.after, { start: '2026-09-02', end: '2026-09-08' });
	assert.equal(result.followUp?.after, 18);
});
