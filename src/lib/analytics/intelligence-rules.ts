import { comparisonWindow } from './report-contract';
import type { Finding, FindingEvidence, IntelligenceAction, IntelligenceCoverage, IntelligenceScope, IntelligenceSuppression } from './intelligence-contract';

export interface IntelligenceRuleInput {
	scope: IntelligenceScope;
	generatedAt: string;
	cutoff: string | null;
	coverage: IntelligenceCoverage;
	previousCoverage?: IntelligenceCoverage | null;
	current: number | null;
	previous: number | null;
	eligibility?: string;
	providerLimitation?: string;
	diagnostics?: Array<{ type: string; status: string; count: number }>;
	linkedPhotoResponse?: Array<{ photoId: string; albumKey: string; exposures: number; responses: number; evidenceLinks: string[] }>;
	albumDiscovery?: Array<{ albumKey: string; exposures: number; opens: number; directEntries: number; evidenceLinks: string[] }>;
	albumMomentum?: Array<{ albumKey: string; current: number | null; previous: number | null; evidenceLinks: string[] }>;
	rendering?: { rendered: number; failed: number; observedTerminal: number | null };
	search?: { submitted: number | null; resultsShown: number | null; emptyResults: number | null; failures: number | null; selections: number | null };
	download?: { requests: number; failed: number; unknownTerminal: number; handedOff: number };
	siteJourneys?: Array<{ views: number; actions: number; completed: number; kind: 'profile' | 'writing' | 'demos'; evidenceLinks: string[] }>;
	distribution?: { taggedArrivals: number; laterNamedAction: number; actionName: string };
	siteWindows?: { current: { start: string; end: string }; previous: { start: string; end: string } };
	catalogue?: { eligibleAlbums: number; eligiblePhotos: number; missingAlbumFacts: number };
	followUp?: { actionId: string; target?: Finding['target']; before: number; after: number; coverage: IntelligenceCoverage; previousCoverage: IntelligenceCoverage | null; concurrentChanges: number; measure: string; window: { before: { start: string; end: string }; after: { start: string; end: string } } };
}
export interface IntelligenceRuleResult { findings: Finding[]; suppressions: IntelligenceSuppression[]; }
export const INTELLIGENCE_RULES = [
	'momentum', 'strong_photo_response', 'discovery_friction', 'rendering_download_reliability', 'search_usefulness',
	'profile_response', 'writing_demo_response', 'distribution', 'collection_health', 'follow_up'
] as const;

const minimumSample = 20;
const meaningfulAbsoluteChange = 5;
const nonnegative = (...values: Array<number | null | undefined>): boolean => values.every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
const completeComparison = (input: IntelligenceRuleInput) => input.coverage === 'complete' && input.previousCoverage === 'complete';

function reportHref(scope: IntelligenceScope, albumKey?: string): string {
	if (scope.kind === 'sites') return `/photography/analytics/sites?period=${scope.period}&section=${encodeURIComponent(scope.section)}`;
	const query = { ...scope.query, ...(albumKey ? { scope: 'album' as const, albumKeys: [albumKey] } : {}) };
	const params = new URLSearchParams({ period: 'custom', start: query.start, end: query.end, measure: query.measure, scope: query.scope, compare: query.compare, traffic: query.traffic });
	if (query.albumKeys.length) params.set('albums', query.albumKeys.join(','));
	if (query.compareStart) params.set('compare_start', query.compareStart);
	if (query.compareEnd) params.set('compare_end', query.compareEnd);
	if (query.sport) params.set('sport', query.sport);
	if (query.category) params.set('category', query.category);
	if (query.source) params.set('source', query.source);
	if (query.eventDate) params.set('event_date', query.eventDate);
	if (query.season) params.set('season', query.season);
	if (query.albumEventType) params.set('event_type', query.albumEventType);
	return `/analytics/operator?${params.toString()}`;
}

function windows(input: IntelligenceRuleInput): FindingEvidence['windows'] {
	if (input.scope.kind === 'sites') return input.siteWindows ? input.siteWindows : { current: { start: input.generatedAt.slice(0, 10), end: input.generatedAt.slice(0, 10) }, previous: null };
	return { current: { start: input.scope.query.start, end: input.scope.query.end }, previous: comparisonWindow(input.scope.query) };
}
function evidence(input: IntelligenceRuleInput, units: string, values: Partial<Pick<FindingEvidence, 'numerator' | 'denominator' | 'current' | 'previous'>>, strength: FindingEvidence['strength']): FindingEvidence {
	return { windows: windows(input), cutoff: input.cutoff, coverage: input.coverage, previousCoverage: input.previousCoverage ?? null, units, eligibility: input.eligibility, strength, ...values };
}
function finding(input: IntelligenceRuleInput, rule: string, id: string, title: string, explanation: string, action: string, data: FindingEvidence, target: Finding['target'] = { kind: input.scope.kind === 'gallery' ? 'gallery' : 'site' }, evidenceLinks?: string[]): Finding {
	const albumKey = target.kind === 'album' ? target.albumKey ?? target.id ?? undefined : target.albumKey ?? undefined;
	return { id, rule, target, title, explanation, action, evidence: data, reportHref: reportHref(input.scope, albumKey), ...(evidenceLinks?.length ? { evidenceLinks: [...new Set(evidenceLinks)].filter((link) => link.startsWith('/')).slice(0, 6) } : {}), status: 'open' };
}
function suppress(result: IntelligenceRuleResult, rule: string, reason: string, target?: Finding['target']): void { result.suppressions.push({ rule, reason, target }); }

/** Deterministic aggregate rules. Unknown cohorts stay suppressions; they never become zero. */
export function evaluateIntelligenceRules(input: IntelligenceRuleInput): IntelligenceRuleResult {
	const result: IntelligenceRuleResult = { findings: [], suppressions: [] };
	if (input.coverage !== 'complete') {
        for (const diagnostic of input.diagnostics ?? []) if (diagnostic.status === 'failed' && nonnegative(diagnostic.count) && diagnostic.count > 0) result.findings.push(finding(input, 'collection_health', `collection-health-${diagnostic.type}`, 'A collection diagnostic needs attention', `${diagnostic.count} observations match the stable ${diagnostic.type} incident source.`, 'Inspect the collection diagnostic and confirm recovery before closing it.', evidence(input, 'diagnostic observations', { numerator: diagnostic.count }, 'limited')));
        for (const rule of INTELLIGENCE_RULES) suppress(result, rule, 'The selected evidence window is partial or unavailable. This alone does not establish a collection outage.');
        return result;
    }

	const momentum = input.scope.kind === 'gallery' && input.albumMomentum?.length
		? input.albumMomentum.map((row) => ({ ...row, target: { kind: 'album' as const, albumKey: row.albumKey } }))
		: [{ albumKey: null, current: input.current, previous: input.previous, evidenceLinks: [], target: { kind: input.scope.kind === 'gallery' ? 'gallery' as const : 'site' as const } }];
	for (const row of momentum) {
		if (!completeComparison(input) || !nonnegative(row.current, row.previous) || row.current === null || row.previous === null) { suppress(result, 'momentum', 'A complete comparable period is not available.', row.target); continue; }
		if (row.current < minimumSample || row.previous < minimumSample) { suppress(result, 'momentum', `Both periods need at least ${minimumSample} ${input.scope.kind === 'sites' ? 'page views' : 'recorded actions'}.`, row.target); continue; }
		if (Math.abs(row.current - row.previous) < meaningfulAbsoluteChange) { suppress(result, 'momentum', 'The absolute change is too small to recommend a review.', row.target); continue; }
		if (row.current <= row.previous) { suppress(result, 'momentum', 'The comparable activity did not increase.', row.target); continue; }
		result.findings.push(finding(input, 'momentum', `momentum-increase-${row.albumKey ?? input.scope.kind}`, 'Recorded activity increased', `The current window has ${row.current} recorded actions versus ${row.previous} in the declared comparable window. This is not proof of audience growth.`, 'Inspect the affected known catalogue or publication context before deciding whether to repeat a promotion.', evidence(input, input.scope.kind === 'sites' ? 'page views' : 'recorded actions', { current: row.current, previous: row.previous }, 'exploratory'), row.target, row.evidenceLinks));
	}

	if (input.providerLimitation) for (const rule of ['strong_photo_response','discovery_friction','rendering_download_reliability','search_usefulness','distribution']) suppress(result, rule, input.providerLimitation);
	if (!input.linkedPhotoResponse?.length) suppress(result, 'strong_photo_response', 'Per-photo eligible exposures with the named favorite-or-download-item response union are not available.');
	else for (const row of input.linkedPhotoResponse) {
		const target: Finding['target'] = { kind: 'photo', id: row.photoId, albumKey: row.albumKey };
		if (!nonnegative(row.exposures, row.responses) || row.responses > row.exposures || row.exposures < minimumSample) { suppress(result, 'strong_photo_response', 'The eligible exposure denominator is too small or incomplete.', target); continue; }
		if (row.responses >= 3 && row.responses / row.exposures >= 0.1) result.findings.push(finding(input, 'strong_photo_response', `photo-response-${row.photoId}`, 'Eligible photo exposure was followed by response', `${row.responses} favorite-or-download-item response visits followed ${row.exposures} eligible photo exposures. This does not rate photographic quality.`, 'Inspect the linked public photo with comparable photos before deciding what to promote.', evidence(input, 'eligible photo exposures', { numerator: row.responses, denominator: row.exposures }, 'exploratory'), target, row.evidenceLinks));
		else suppress(result, 'strong_photo_response', 'The measured later-response rate does not cross the review threshold.', target);
	}

	if (!input.albumDiscovery?.length) suppress(result, 'discovery_friction', 'Per-album eligible exposure and later-open cohorts are not available.');
	else for (const row of input.albumDiscovery) {
		const target: Finding['target'] = { kind: 'album', albumKey: row.albumKey };
		if (!nonnegative(row.exposures, row.opens, row.directEntries) || row.opens > row.exposures || row.exposures < minimumSample) { suppress(result, 'discovery_friction', 'The eligible album-observation denominator is too small or incomplete.', target); continue; }
		if (row.opens / row.exposures < 0.08 && row.directEntries < row.opens) result.findings.push(finding(input, 'discovery_friction', `discovery-friction-${row.albumKey}`, 'People see an album but rarely open it', `${row.opens} later opens followed ${row.exposures} eligible exposures for this album. Direct-entry opens are excluded from this interpretation.`, 'Test one cover, title, or card-placement change and record it before comparing the same measure.', evidence(input, 'eligible album observations', { numerator: row.opens, denominator: row.exposures }, 'exploratory'), target, row.evidenceLinks));
		else suppress(result, 'discovery_friction', 'The measured album open rate does not cross the review threshold.', target);
	}

	if (input.rendering && nonnegative(input.rendering.observedTerminal, input.rendering.failed) && input.rendering.observedTerminal! >= minimumSample && input.rendering.failed >= 2 && input.rendering.failed <= input.rendering.observedTerminal!) result.findings.push(finding(input, 'rendering_download_reliability', 'render-failures', 'Observed photo views include rendering failures', `${input.rendering.failed} photo-view outcomes included a load failure among ${input.rendering.observedTerminal} photo views with an observed render or failure outcome. A retry may also render successfully; missing outcomes are excluded.`, 'Inspect the affected image flow before treating this as a visitor abandonment rate.', evidence(input, 'photo views with an observed outcome', { numerator: input.rendering.failed, denominator: input.rendering.observedTerminal! }, 'exploratory')));
	if (input.rendering && input.rendering.failed > 0 && input.rendering.observedTerminal === null) suppress(result, 'rendering_download_reliability', `${input.rendering.failed} failed render observations and ${input.rendering.rendered} rendered observations were recorded, but the source does not provide a deduplicated observed-terminal denominator. A render failure rate is unavailable.`);
	if (!input.download || !nonnegative(input.download.requests, input.download.failed, input.download.unknownTerminal, input.download.handedOff)) suppress(result, 'rendering_download_reliability', 'Eligible download request outcomes are unavailable.');
	else if (input.download.requests < minimumSample) suppress(result, 'rendering_download_reliability', `Fewer than ${minimumSample} eligible download requests are available.`);
	else if (input.download.failed > 0) result.findings.push(finding(input, 'rendering_download_reliability', 'download-failures', 'Recorded download failures need review', `${input.download.failed} failed requests occurred across ${input.download.requests} eligible download requests. A handoff is not a confirmed file save.`, 'Inspect the named download flow and its release context before claiming a repair worked.', evidence(input, 'eligible download requests', { numerator: input.download.failed, denominator: input.download.requests }, 'strong')));
	else if (input.download.unknownTerminal / input.download.requests > 0.1) result.findings.push(finding(input, 'rendering_download_reliability', 'download-unknown-terminal', 'Some download requests have no observed terminal outcome', `${input.download.unknownTerminal} requests have no observed handoff, failure, or cancellation across ${input.download.requests} eligible requests. This is unknown, not a failed download.`, 'Inspect lifecycle instrumentation and the named flow before treating the gap as a visitor failure.', evidence(input, 'eligible download requests', { numerator: input.download.unknownTerminal, denominator: input.download.requests }, 'limited')));
	else suppress(result, 'rendering_download_reliability', 'The recorded download outcomes do not cross a review threshold.');

	const search = input.search;
	if (!search) suppress(result, 'search_usefulness', 'Search submission, results, and failure cohorts are unavailable.');
	else {
		let observed = false;
		if (nonnegative(search.submitted, search.failures) && search.submitted !== null && search.failures !== null && search.failures <= search.submitted) {
			observed = true;
			if (search.submitted >= minimumSample && search.failures > 0) result.findings.push(finding(input, 'search_usefulness', 'search-failures', 'Search submissions have recorded failures', `${search.failures} failures occurred across ${search.submitted} submitted searches. Failed searches are not added to empty result sets.`, 'Inspect search delivery and filters with aggregate evidence; do not infer a visitor’s query.', evidence(input, 'submitted searches', { numerator: search.failures, denominator: search.submitted }, 'exploratory')));
		}
		if (nonnegative(search.resultsShown, search.emptyResults) && search.resultsShown !== null && search.emptyResults !== null && search.emptyResults <= search.resultsShown) {
			observed = true;
			if (search.resultsShown >= minimumSample && search.emptyResults / search.resultsShown > 0.3) result.findings.push(finding(input, 'search_usefulness', 'search-empty-results', 'Search result sets are often empty', `${search.emptyResults} empty result sets occurred across ${search.resultsShown} results-shown searches. This denominator excludes submitted searches without a results observation.`, 'Review filters and result relevance with aggregate evidence; do not infer a visitor’s query.', evidence(input, 'results-shown searches', { numerator: search.emptyResults, denominator: search.resultsShown }, 'exploratory')));
		}
		if (!observed) suppress(result, 'search_usefulness', 'The available search cohorts are incomplete or incompatible; no search rate is calculated.');
		else if (!result.findings.some((item) => item.rule === 'search_usefulness')) suppress(result, 'search_usefulness', 'The separately observed search cohorts do not cross a review threshold.');
	}

	if (!input.siteJourneys?.length) {
		suppress(result, 'profile_response', 'Same-view profile and contact-link evidence is unavailable.');
		suppress(result, 'writing_demo_response', 'Same-view article or demo progression evidence is unavailable.');
	} else for (const journey of input.siteJourneys) {
		const rule = journey.kind === 'profile' ? 'profile_response' : 'writing_demo_response';
		if (!nonnegative(journey.views, journey.actions, journey.completed) || journey.views < minimumSample) { suppress(result, rule, `Fewer than ${minimumSample} eligible same-view observations are available.`); continue; }
		if (journey.kind === 'profile' && journey.actions / journey.views < 0.02) result.findings.push(finding(input, rule, 'profile-response', 'Profile visitors rarely reach a contact link', `${journey.actions} contact-link actions followed ${journey.views} eligible profile views. A click is not an inquiry.`, 'Test clearer positioning or contact-link placement, then compare the same eligible same-view measure.', evidence(input, 'eligible profile views', { numerator: journey.actions, denominator: journey.views }, 'exploratory'), { kind: 'site' }, journey.evidenceLinks));
		else if (journey.kind !== 'profile' && journey.completed / journey.views < 0.2) result.findings.push(finding(input, rule, `content-progress-${journey.kind}`, 'Readers or demo visitors are not reaching the later step', `${journey.completed} progression observations followed ${journey.views} eligible ${journey.kind} views. This does not prove comprehension.`, 'Inspect the opening and sequence, then test one recorded change with the same measure.', evidence(input, 'eligible content views', { numerator: journey.completed, denominator: journey.views }, 'exploratory'), { kind: 'site' }, journey.evidenceLinks));
		else suppress(result, rule, 'The available same-view evidence does not cross a review threshold.');
	}

	if (!input.distribution || !nonnegative(input.distribution.taggedArrivals, input.distribution.laterNamedAction)) suppress(result, 'distribution', 'Provider overall tagged-arrival and later named-action cohorts are unavailable.');
	else if (input.distribution.taggedArrivals < minimumSample) suppress(result, 'distribution', `Fewer than ${minimumSample} tagged arrivals are available.`);
	else if (input.distribution.laterNamedAction / input.distribution.taggedArrivals < 0.05) result.findings.push(finding(input, 'distribution', 'distribution-review', 'Tagged arrivals rarely reach a later named action', `${input.distribution.laterNamedAction} later ${input.distribution.actionName} visits followed ${input.distribution.taggedArrivals} tagged arrival visits. Source rows are not summed because visitors can overlap sources.`, 'Review the landing context and known promotion records before changing distribution.', evidence(input, 'tagged arrival visits', { numerator: input.distribution.laterNamedAction, denominator: input.distribution.taggedArrivals }, 'limited')));
	else suppress(result, 'distribution', 'The tagged-arrival evidence does not cross a review threshold.');

	if (!input.diagnostics?.length) suppress(result, 'collection_health', 'No stable collection diagnostic was supplied by the bounded source.');
	else for (const diagnostic of input.diagnostics) {
		if (diagnostic.status !== 'failed' || !nonnegative(diagnostic.count) || diagnostic.count === 0) continue;
		result.findings.push(finding(input, 'collection_health', `collection-health-${diagnostic.type}`, 'A collection diagnostic needs attention', `${diagnostic.count} observations match the stable ${diagnostic.type} incident source.`, 'Inspect the named collection diagnostic and confirm recovery before closing the incident.', evidence(input, 'diagnostic observations', { numerator: diagnostic.count }, 'limited')));
	}

	if (!input.followUp) suppress(result, 'follow_up', 'No recorded action has a completed matching observation window.');
	else if (input.followUp.coverage !== 'complete' || input.followUp.previousCoverage !== 'complete') suppress(result, 'follow_up', 'The declared before or after window is incomplete.');
	else if (input.followUp.concurrentChanges > 0) suppress(result, 'follow_up', `${input.followUp.concurrentChanges} other recorded changes overlap the observation window.`);
	else if (input.followUp.before < minimumSample || input.followUp.after < minimumSample || Math.abs(input.followUp.after - input.followUp.before) < meaningfulAbsoluteChange) suppress(result, 'follow_up', 'The declared measure has too little volume or too small a change for a follow-up finding.');
	else { const item = finding(input, 'follow_up', `follow-up-${input.followUp.actionId}`, 'A recorded action has a clean follow-up comparison', `The declared ${input.followUp.measure} measure was ${input.followUp.before} in ${input.followUp.window.before.start} to ${input.followUp.window.before.end} and ${input.followUp.after} in ${input.followUp.window.after.start} to ${input.followUp.window.after.end}. This is an observation, not a causal claim.`, 'Review the declared target and measure before deciding whether to repeat the action.', evidence(input, `declared ${input.followUp.measure} measure`, { current: input.followUp.after, previous: input.followUp.before }, 'limited')); item.target = input.followUp.target ?? item.target; item.evidence.windows = { current: input.followUp.window.after, previous: input.followUp.window.before }; result.findings.push(item); }
	return result;
}

export function validRuleScope(scope: IntelligenceScope): boolean { return scope.kind === 'sites' || scope.query.start <= scope.query.end; }
