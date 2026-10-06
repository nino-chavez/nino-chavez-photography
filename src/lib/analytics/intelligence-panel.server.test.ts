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
