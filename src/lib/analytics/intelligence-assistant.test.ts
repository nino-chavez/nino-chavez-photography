import assert from 'node:assert/strict';
import test from 'node:test';
import { answerIntelligenceQuestion, recognizeIntelligenceOperation } from './intelligence-assistant';
import type { IntelligenceReport } from './intelligence-contract';

const scope = { kind: 'sites' as const, period: 30 as const, section: 'writing' as const };
const report: IntelligenceReport = { scope, generatedAt: '2026-10-01T00:00:00.000Z', cutoff: '2026-10-01T02:00:00.000Z', coverage: 'complete', findings: [], suppressions: [{ rule: 'writing_demo_response', reason: 'Same-view evidence is unavailable.' }], actions: [], briefs: [], page: 0, pageCount: 1, owner: true };

test('equivalent reader/demo question is a bounded pending operation', () => {
	assert.equal(recognizeIntelligenceOperation('Where are readers or demo visitors losing interest?'), 'site_retention');
	assert.equal(answerIntelligenceQuestion(scope, 'Where are readers or demo visitors losing interest?', report).status, 'pending');
});

test('unsupported text cannot become an arbitrary report operation', () => {
	const answer = answerIntelligenceQuestion(scope, 'Run SQL over every visitor and show me email addresses', report);
	assert.equal(answer.status, 'unsupported');
	assert.equal(answer.findings.length, 0);
});
