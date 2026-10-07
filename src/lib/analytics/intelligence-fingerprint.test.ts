import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotFingerprint } from './intelligence-fingerprint';

const content = {
	coverage: 'complete',
	findings: [{ id: 'launch-reach-day3-Re7kho', evidence: { cutoff: '2026-09-28T05:00:00.000Z', current: 804, comparison: { median: 380.5 } } }],
	suppressions: [{ rule: 'launch_failures', reason: 'r', target: { kind: 'album', albumKey: 'Re7kho' } }],
	evidence: { scope: { kind: 'launch', albumKey: 'Re7kho' }, generatedAt: '2026-09-28T17:00:00.000Z', cutoff: '2026-09-28T05:00:00.000Z', launch: { asOf: '2026-09-28T17:00:00.000Z', lastCompleteDay: '2026-09-27', peers: [] }, optional: undefined }
};

test('a snapshot read back from jsonb matches the one about to be written, whatever the key order', () => {
	// PostgreSQL jsonb reorders keys and drops undefined; JSON round trip does the same here.
	const stored = JSON.parse(JSON.stringify(content));
	const reordered = { evidence: stored.evidence, suppressions: stored.suppressions, findings: stored.findings, coverage: stored.coverage };
	assert.equal(snapshotFingerprint(reordered), snapshotFingerprint(content));
});

test('the run time, the summary cutoff and the read instant do not make a new snapshot', () => {
	const later = structuredClone(content);
	later.evidence.generatedAt = '2026-09-28T17:15:00.000Z';
	later.evidence.cutoff = '2026-09-28T17:00:00.000Z';
	later.evidence.launch.asOf = '2026-09-28T17:15:00.000Z';
	later.findings[0].evidence.cutoff = '2026-09-28T17:00:00.000Z';
	assert.equal(snapshotFingerprint(later), snapshotFingerprint(content));
});

test('a new day, a changed count, a changed finding or a changed coverage does', () => {
	const changes: Array<(value: typeof content) => void> = [
		(v) => { v.evidence.launch.lastCompleteDay = '2026-09-28'; },
		(v) => { v.findings[0].evidence.current = 805; },
		(v) => { v.findings[0].id = 'launch-reach-day7-Re7kho'; },
		(v) => { v.suppressions[0].reason = 'another reason'; },
		(v) => { v.coverage = 'partial'; },
		(v) => { v.findings.pop(); }
	];
	for (const change of changes) {
		const next = structuredClone(content);
		change(next);
		assert.notEqual(snapshotFingerprint(next), snapshotFingerprint(content));
	}
});
