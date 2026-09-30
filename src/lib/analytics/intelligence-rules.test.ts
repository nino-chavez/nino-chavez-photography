import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateIntelligenceRules } from './intelligence-rules';
import type { IntelligenceRuleInput } from './intelligence-rules';

const scope = { kind: 'gallery' as const, query: { start: '2026-09-01', end: '2026-09-30', measure: 'photo_opens' as const, scope: 'all' as const, albumKeys: [], compare: 'previous' as const, traffic: 'conservative' as const } };
const input = (extra: Partial<IntelligenceRuleInput> = {}): IntelligenceRuleInput => ({ scope, generatedAt: '2026-10-01T00:00:00.000Z', cutoff: '2026-10-01T02:00:00.000Z', coverage: 'complete', current: 50, previous: 30, ...extra });

test('missing linked cohorts suppresses behavior rules instead of manufacturing a zero', () => {
	const result = evaluateIntelligenceRules(input());
	assert.equal(result.findings.some((item) => item.rule === 'strong_photo_response'), false);
	assert.match(result.suppressions.find((item) => item.rule === 'strong_photo_response')?.reason ?? '', /exposures/i);
});

test('partial coverage produces health only and blocks behavioral claims', () => {
	const result = evaluateIntelligenceRules(input({ coverage: 'partial' }));
	assert.deepEqual(result.findings.map((item) => item.rule), ['collection_health']);
	assert.ok(result.suppressions.some((item) => item.rule === 'momentum'));
});

test('photo response remains a response pattern, not an artistic-quality verdict', () => {
	const result = evaluateIntelligenceRules(input({ linkedPhotoResponse: [{ photoId: 'photo-1', exposures: 50, responses: 6 }] }));
	const finding = result.findings.find((item) => item.rule === 'strong_photo_response');
	assert.equal(finding?.evidence.numerator, 6);
	assert.match(finding?.explanation ?? '', /not rate/i);
});

test('fixed journey adapters produce review findings without fabricating site or photo quality claims', () => {
	const result = evaluateIntelligenceRules(input({
		discovery: { exposures: 100, opens: 4, directEntries: 0 },
		download: { requests: 40, failed: 2, unknownTerminal: 0, handedOff: 38 },
		search: { searches: 40, empty: 14, errors: 0, selections: 4 },
		distribution: { taggedArrivals: 100, laterActions: 2, sources: 2 }
	}));
	assert.deepEqual(result.findings.filter((item) => ['discovery_friction', 'rendering_download_reliability', 'search_usefulness', 'distribution'].includes(item.rule)).map((item) => item.evidence.units), ['eligible album exposures', 'eligible download requests', 'eligible searches', 'tagged arrival visits']);
	assert.equal(result.findings.some((item) => /quality|caused/i.test(item.title)), false);
});

test('small or missing history cannot become an outage or a follow-up result', () => {
	const result = evaluateIntelligenceRules(input({ current: 4, previous: 2, followUp: { actionId: 'action-1', before: 2, after: 4, coverage: 'complete', previousCoverage: 'complete', concurrentChanges: 0, measure: 'photo_opens', window: { before: { start: '2026-08-01', end: '2026-08-30' }, after: { start: '2026-09-01', end: '2026-09-30' } } } }));
	assert.equal(result.findings.some((item) => item.rule === 'follow_up'), false);
	assert.match(result.suppressions.find((item) => item.rule === 'follow_up')?.reason ?? '', /little volume/i);
});
