import assert from 'node:assert/strict';
import test from 'node:test';
import { answerIntelligenceQuestion, recognizeIntelligenceOperation } from './intelligence-assistant';
import type { IntelligenceReport } from './intelligence-contract';

const scope = { kind: 'sites' as const, period: 30 as const, section: 'writing' as const };
const report: IntelligenceReport = { scope, generatedAt: '2026-10-01T00:00:00.000Z', cutoff: '2026-10-01T02:00:00.000Z', coverage: 'complete', findings: [], suppressions: [{ rule: 'writing_demo_response', reason: 'Same-view evidence is unavailable.' }], actions: [], briefs: [], page: 0, pageCount: 1, owner: true };

test('equivalent reader/demo question is a bounded pending operation', () => {
	assert.equal(recognizeIntelligenceOperation('Where are readers or demo visitors losing interest?'), 'site_retention');
	assert.equal(answerIntelligenceQuestion(scope, 'Where are readers or demo visitors losing interest?', report).status, 'pending');
	assert.equal(answerIntelligenceQuestion(scope, 'Where are readers or demo visitors losing interest?', report, 'request-1').status, 'complete');
});

test('unsupported text cannot become an arbitrary report operation', () => {
	const answer = answerIntelligenceQuestion(scope, 'Run SQL over every visitor and show me email addresses', report);
	assert.equal(answer.status, 'unsupported');
	assert.equal(answer.findings.length, 0);
});

test('all contextual presets and plain equivalents select bounded operations', () => {
	assert.equal(recognizeIntelligenceOperation('What does this evidence support, and what remains uncertain?'), 'explain_report');
	assert.equal(recognizeIntelligenceOperation('What should I inspect before acting?'), 'explain_report');
	assert.equal(recognizeIntelligenceOperation('How does this album compare with the stored comparable evidence?'), 'album_comparison');
	assert.equal(recognizeIntelligenceOperation('Where should I inspect the selected site section next?'), 'site_retention');
	assert.equal(recognizeIntelligenceOperation('Why are visitors struggling to download or render photos?'), 'download_reliability');
	assert.equal(recognizeIntelligenceOperation('Explain what changed in this report'), 'explain_report');
});
