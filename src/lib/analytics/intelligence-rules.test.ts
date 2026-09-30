import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateIntelligenceRules } from './intelligence-rules';
import type { IntelligenceRuleInput } from './intelligence-rules';

const scope = { kind: 'gallery' as const, query: { start: '2026-09-01', end: '2026-09-30', measure: 'photo_opens' as const, scope: 'all' as const, albumKeys: [], compare: 'previous' as const, traffic: 'conservative' as const } };
const input = (extra: Partial<IntelligenceRuleInput> = {}): IntelligenceRuleInput => ({ scope, generatedAt: '2026-10-01T00:00:00.000Z', cutoff: '2026-10-01T02:00:00.000Z', coverage: 'complete', previousCoverage: 'complete', current: 50, previous: 30, ...extra });

test('missing linked cohorts suppresses behavior rules instead of manufacturing a zero', () => {
	const result = evaluateIntelligenceRules(input());
	assert.equal(result.findings.some((item) => item.rule === 'strong_photo_response'), false);
	assert.match(result.suppressions.find((item) => item.rule === 'strong_photo_response')?.reason ?? '', /exposures/i);
});

test('partial coverage suppresses behavior without inventing an outage', () => {
	const result = evaluateIntelligenceRules(input({ coverage: 'partial' }));
	assert.deepEqual(result.findings, []);
	assert.ok(result.suppressions.some((item) => item.rule === 'momentum'));
});

test('photo response uses only the named favorite-or-download-item union and visible photo route', () => {
	const result = evaluateIntelligenceRules(input({ linkedPhotoResponse: [{ photoId: 'photo-1', albumKey: 'album-1', exposures: 50, responses: 6, evidenceLinks: ['/photo/photo-1'] }] }));
	const finding = result.findings.find((item) => item.rule === 'strong_photo_response');
	assert.equal(finding?.evidence.numerator, 6);
	assert.deepEqual(finding?.evidenceLinks, ['/photo/photo-1']);
	assert.match(finding?.explanation ?? '', /quality/i);
});

test('per-album discovery and momentum keep targets, calendar counts, and exact report filters', () => {
	const result = evaluateIntelligenceRules(input({
		albumMomentum: [{ albumKey: 'album-1', current: 40, previous: 20, evidenceLinks: ['/analytics/operator?scope=album'] }],
		albumDiscovery: [{ albumKey: 'album-1', exposures: 100, opens: 4, directEntries: 0, evidenceLinks: ['/analytics/operator?scope=album'] }]
	}));
	const discovery = result.findings.find((item) => item.rule === 'discovery_friction');
	const momentum = result.findings.find((item) => item.rule === 'momentum');
	assert.equal(discovery?.target.albumKey, 'album-1');
	assert.deepEqual(discovery?.evidence, { ...discovery?.evidence, numerator: 4, denominator: 100 });
	assert.equal(momentum?.target.albumKey, 'album-1');
	assert.match(momentum?.reportHref ?? '', /scope=album/);
});

test('search and distribution retain distinct cohorts without adding overlapping source actions', () => {
	const result = evaluateIntelligenceRules(input({
		search: { submitted: 40, failures: 1, resultsShown: 40, emptyResults: 14, selections: 4 },
		distribution: { taggedArrivals: 100, laterNamedAction: 2, actionName: 'favorite-added' }
	}));
	const search = result.findings.filter((item) => item.rule === 'search_usefulness');
	assert.deepEqual(search.map((item) => item.evidence.units).sort(), ['results-shown searches', 'submitted searches']);
	assert.equal(search.some((item) => item.evidence.numerator === 15), false);
	assert.equal(result.findings.find((item) => item.rule === 'distribution')?.evidence.numerator, 2);
});

test('render observations without a deduplicated terminal union do not become a failure rate', () => {
	const result = evaluateIntelligenceRules(input({ rendering: { rendered: 80, failed: 2, observedTerminal: null } }));
	assert.match(result.suppressions.find((item) => item.rule === 'rendering_download_reliability')?.reason ?? '', /deduplicated observed-terminal denominator/i);
});

test('all site families receive native journey rows without calling clicks inquiries or progression comprehension', () => {
	const siteScope = { kind: 'sites' as const, period: 30 as const, section: 'all' as const };
	const result = evaluateIntelligenceRules({ ...input({ scope: siteScope, siteWindows: { current: { start: '2026-09-01', end: '2026-09-30' }, previous: { start: '2026-08-02', end: '2026-08-31' } } }), siteJourneys: [
		{ kind: 'profile', views: 100, actions: 1, completed: 0, evidenceLinks: ['/photography/analytics/sites?period=30&section=profile'] },
		{ kind: 'writing', views: 100, actions: 0, completed: 1, evidenceLinks: ['/photography/analytics/sites?period=30&section=writing'] },
		{ kind: 'demos', views: 100, actions: 0, completed: 1, evidenceLinks: ['/photography/analytics/sites?period=30&section=demos'] }
	] });
	assert.deepEqual(result.findings.filter((item) => ['profile_response', 'writing_demo_response'].includes(item.rule)).map((item) => item.id).sort(), ['content-progress-demos', 'content-progress-writing', 'profile-response']);
	assert.match(result.findings.find((item) => item.rule === 'profile_response')?.explanation ?? '', /not an inquiry/i);
	assert.match(result.findings.find((item) => item.id === 'content-progress-writing')?.explanation ?? '', /does not prove comprehension/i);
});

test('small or missing history cannot become an outage or a follow-up result', () => {
	const result = evaluateIntelligenceRules(input({ current: 4, previous: 2, followUp: { actionId: 'action-1', before: 2, after: 4, coverage: 'complete', previousCoverage: 'complete', concurrentChanges: 0, measure: 'photo_opens', window: { before: { start: '2026-08-01', end: '2026-08-30' }, after: { start: '2026-09-01', end: '2026-09-30' } } } }));
	assert.equal(result.findings.some((item) => item.rule === 'follow_up'), false);
	assert.match(result.suppressions.find((item) => item.rule === 'follow_up')?.reason ?? '', /little volume/i);
});

test('real delivery diagnostic is visible even when the selected history is partial', () => {
 const result=evaluateIntelligenceRules(input({coverage:'partial',diagnostics:[{type:'provider_delivery_failures',status:'failed',count:2}]}));
 assert.deepEqual(result.findings.map(row=>row.id), ['collection-health-provider_delivery_failures']);
 assert.equal(result.findings[0].evidence.numerator,2);
});
test('render union measures failed views without summing retry successes and failures',()=>{
 const result=evaluateIntelligenceRules(input({rendering:{rendered:98,failed:4,observedTerminal:100}}));
 const finding=result.findings.find(row=>row.id==='render-failures');assert.equal(finding?.evidence.denominator,100);assert.equal(finding?.evidence.numerator,4);
});


test('observed failures rank before promotion without changing evidence strength', () => {
 const result=evaluateIntelligenceRules(input({download:{requests:30,failed:3,unknownTerminal:0,handedOff:27}, diagnostics:[{type:'relay',status:'failed',count:2}]}));
 assert.equal(result.findings[0].severity,'high');
 assert.equal(result.findings.find(f=>f.rule==='momentum')?.severity,'low');
 assert.equal(result.findings.find(f=>f.rule==='momentum')?.evidence.strength,'exploratory');
 assert.ok(result.findings.findIndex(f=>f.rule==='rendering_download_reliability')<result.findings.findIndex(f=>f.rule==='momentum'));
});
