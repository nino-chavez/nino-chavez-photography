import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intelligencePanelMode } from './intelligence-panel.server';

const withFindings = (findings: unknown) => ({ analytics_intelligence_snapshots: { findings } });

test('the findings panel shows only when the current snapshot holds at least one finding', () => {
	assert.equal(intelligencePanelMode(withFindings([{ id: 'launch-reach' }]), false), 'report');
	assert.equal(intelligencePanelMode(withFindings([{ id: 'launch-reach' }]), true), 'report');
});

test('a snapshot with no findings is not an empty panel: the owner gets the record form, visitors get nothing', () => {
	assert.equal(intelligencePanelMode(withFindings([]), true), 'record');
	assert.equal(intelligencePanelMode(withFindings([]), false), 'none');
	assert.equal(intelligencePanelMode(withFindings(null), false), 'none');
	assert.equal(intelligencePanelMode(withFindings({ not: 'a list' }), false), 'none');
});

test('no snapshot, or an unreadable one, shows no panel', () => {
	assert.equal(intelligencePanelMode(null, false), 'none');
	assert.equal(intelligencePanelMode(null, true), 'record');
	assert.equal(intelligencePanelMode({ analytics_intelligence_snapshots: null }, false), 'none');
});

test('inline findings come through the store visibility check, and a missing or failed read shows nothing', async () => {
	const { loadVisibleFindings, findingsPanelMode } = await import('./intelligence-panel.server');
	const scope = { kind: 'launch' as const, albumKey: 'Re7kho' };
	const finding = { id: 'launch-reach-day3-Re7kho', rule: 'launch_reach', target: { kind: 'album' as const, albumKey: 'Re7kho' }, title: 't', explanation: 'e', action: 'a', evidence: { windows: { current: { start: '2026-09-25', end: '2026-09-27' } }, cutoff: null, coverage: 'complete' as const, units: 'photo opens', strength: 'limited' as const }, reportHref: '/analytics/albums/Re7kho', status: 'open' as const };
	const seen = await loadVisibleFindings({} as never, scope, 'test', async () => ({ findings: [finding], generatedAt: '2026-09-28T17:00:00Z', checkedAt: '2026-09-28T18:00:00Z' }));
	assert.deepEqual(seen, { findings: [finding], checkedAt: '2026-09-28T18:00:00Z' });
	assert.equal(findingsPanelMode(seen.findings, false), 'report');
	// The store throws this when there is no snapshot, or when the album has since become unlisted.
	const hidden = await loadVisibleFindings({} as never, scope, 'test', async () => { throw new Error('intelligence report unavailable'); });
	assert.deepEqual(hidden, { findings: [], checkedAt: null });
	assert.equal(findingsPanelMode(hidden.findings, false), 'none');
	assert.equal(findingsPanelMode(hidden.findings, true), 'record');
});
