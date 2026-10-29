import assert from 'node:assert/strict';
import test from 'node:test';
import { findingVersion, openFindings, settledState, type LifecycleRow, type SettleAction } from './intelligence-lifecycle';
import { launchFinding } from './intelligence-public.fixture';

const NOW = new Date('2026-10-06T17:00:00Z');
const finding = launchFinding('launch-photo-failures-DWdCET', 'DWdCET', {
	rule: 'launch_failures', evidence: { windows: { current: { start: '2026-09-29', end: '2026-10-02' } }, cutoff: '2026-10-06T05:00:00Z', coverage: 'complete', units: 'photo loads with a recorded result', numerator: 2, denominator: 64, strength: 'limited' }
});
const row = (status: string, snoozed_until: string | null = null, owner_id = 'o1'): LifecycleRow => ({ owner_id, finding_id: finding.id, status, snoozed_until });
const action = (version: string | null, created_at = '2026-10-06T15:00:00Z', owner_id = 'o1'): SettleAction => ({ owner_id, finding_id: finding.id, target_context: version ? { target: finding.target, findingVersion: version } : { target: finding.target }, created_at });

test('dismiss: hidden until undone', () => {
	assert.equal(settledState(finding, [row('dismiss')], [action(findingVersion(finding))], NOW, true), 'dismissed');
	assert.equal(settledState(finding, [row('open')], [action(findingVersion(finding))], NOW, true), 'open', 'an undo writes the row back to open');
	assert.deepEqual(openFindings([finding], [], [], NOW, true), [finding]);
});

test('snooze: hidden for its 7 days, then shown again', () => {
	assert.equal(settledState(finding, [row('snooze', '2026-10-13T15:00:00Z')], [action(findingVersion(finding))], NOW, true), 'snoozed');
	assert.equal(settledState(finding, [row('snooze', '2026-10-06T16:59:59Z')], [action(findingVersion(finding))], NOW, true), 'open', 'expired');
	assert.equal(settledState(finding, [row('snooze', '2026-10-06T17:00:00Z')], [action(findingVersion(finding))], NOW, true), 'open', 'expires at the instant');
});

test('a finding that changed after it was dismissed shows again', () => {
	const dismissedVersion = findingVersion(finding);
	const worse = { ...finding, evidence: { ...finding.evidence, numerator: 4, denominator: 90 } };
	assert.notEqual(findingVersion(worse), dismissedVersion);
	assert.equal(settledState(worse, [row('dismiss')], [action(dismissedVersion)], NOW, true), 'open');
	// The latest dismissal by that owner is the one that counts.
	assert.equal(settledState(worse, [row('dismiss')], [action(dismissedVersion, '2026-10-05T10:00:00Z'), action(findingVersion(worse), '2026-10-06T10:00:00Z')], NOW, true), 'dismissed');
});

test('wording, cutoff and a recap\'s sliding quiet window are not changes', () => {
	const recap = launchFinding('launch-finished-Re7kho', 'Re7kho');
	const nextDay = { ...recap, explanation: 'Photo opens fell to 0 over Oct 4–6.', evidence: { ...recap.evidence, cutoff: '2026-10-07T05:00:00Z', windows: { ...recap.evidence.windows, previous: { start: '2026-10-04', end: '2026-10-06' } } } };
	assert.equal(findingVersion(nextDay), findingVersion(recap));
});

test('an older dismissal without a recorded version still hides; checks without versions ignore them', () => {
	assert.equal(settledState(finding, [row('dismiss')], [action(null)], NOW, true), 'dismissed');
	const worse = { ...finding, evidence: { ...finding.evidence, numerator: 9 } };
	assert.equal(settledState(worse, [row('dismiss')], [action(findingVersion(finding))], NOW, false), 'dismissed');
});

test('any owner\'s active dismissal hides it; another owner\'s open row does not reopen it', () => {
	assert.equal(settledState(finding, [row('open', null, 'o2'), row('dismiss', null, 'o1')], [action(findingVersion(finding))], NOW, true), 'dismissed');
});
