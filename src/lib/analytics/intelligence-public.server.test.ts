import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPublicFindings } from './intelligence-public.server';
import { loadVisibleFindings } from './intelligence-panel.server';
import { findingVersion } from './intelligence-lifecycle';
import { albumScope, HOME, launchFinding, publicClient } from './intelligence-public.fixture';

const NOW = new Date('2026-10-06T17:00:00Z');
const millikin = launchFinding('launch-finished-DWdCET', 'DWdCET');
const jca = launchFinding('launch-finished-Re7kho', 'Re7kho', { evidence: { ...millikin.evidence, current: 931 } });

test('an album unlisted after its snapshot was written shows no findings on Home, for anyone', async () => {
	const world = { snapshots: [{ scope: HOME, findings: [millikin, jca] }], albums: ['DWdCET', 'Re7kho'], unlisted: ['DWdCET'] };
	const home = await loadVisibleFindings(publicClient(world), HOME, 'test');
	assert.deepEqual(home.findings.map((f) => f.id), ['launch-finished-Re7kho'], 'the other launch still shows');
});

test('an album unlisted after its snapshot was written shows no findings on its own report, for anyone', async () => {
	const world = { snapshots: [{ scope: albumScope('DWdCET'), findings: [millikin] }], albums: ['DWdCET'], unlisted: ['DWdCET'] };
	await assert.rejects(loadPublicFindings(publicClient(world), albumScope('DWdCET'), NOW), /intelligence report unavailable/);
	assert.deepEqual(await loadVisibleFindings(publicClient(world), albumScope('DWdCET'), 'test'), { findings: [], checkedAt: null });
	// Control: the same snapshot while the album is public.
	const listed = await loadVisibleFindings(publicClient({ ...world, unlisted: [] }), albumScope('DWdCET'), 'test');
	assert.deepEqual(listed.findings.map((f) => f.id), ['launch-finished-DWdCET']);
	assert.equal(listed.checkedAt, '2026-10-06T16:45:00Z');
});

test('a photo moved out of its album is not named', async () => {
	const photo = launchFinding('seen-rarely-opened-p1', 'DWdCET', { rule: 'seen_rarely_opened', target: { kind: 'photo', id: 'p1', albumKey: 'DWdCET' } });
	const world = { snapshots: [{ scope: albumScope('DWdCET'), findings: [photo] }], albums: ['DWdCET', 'other'], photos: [{ photo_id: 'p1', album_key: 'other' }] };
	assert.deepEqual((await loadPublicFindings(publicClient(world), albumScope('DWdCET'), NOW)).findings, []);
});

test('a dismissed launch finding is hidden for everyone, on Home and on its report, wherever it was dismissed', async () => {
	const dismissed = { owner_id: 'o1', scope: albumScope('DWdCET'), finding_id: millikin.id, status: 'dismiss' as const, snoozed_until: null };
	const action = { owner_id: 'o1', scope: albumScope('DWdCET'), finding_id: millikin.id, kind: 'dismiss' as const, target_context: { findingVersion: findingVersion(millikin) }, created_at: '2026-10-06T15:00:00Z' };
	const world = { snapshots: [{ scope: HOME, findings: [millikin, jca] }, { scope: albumScope('DWdCET'), findings: [millikin] }], albums: ['DWdCET', 'Re7kho'], lifecycle: [dismissed], actions: [action] };
	assert.deepEqual((await loadPublicFindings(publicClient(world), HOME, NOW)).findings.map((f) => f.id), ['launch-finished-Re7kho']);
	assert.deepEqual((await loadPublicFindings(publicClient(world), albumScope('DWdCET'), NOW)).findings, []);
});

test('a failed lifecycle read shows nothing rather than findings the owner may have dismissed', async () => {
	const world = { snapshots: [{ scope: HOME, findings: [millikin] }], albums: ['DWdCET'], failLifecycle: true };
	assert.deepEqual(await loadVisibleFindings(publicClient(world), HOME, 'test'), { findings: [], checkedAt: null });
});
