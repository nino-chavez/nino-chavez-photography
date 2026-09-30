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
	diagnostics?: Array<{ type: string; status: string; count: number }>;
	linkedPhotoResponse?: Array<{ photoId?: string; albumKey?: string; exposures: number; responses: number; evidenceLinks?: string[] }>;
	discovery?: { exposures: number; opens: number; directEntries: number };
	search?: { searches: number; empty: number; errors: number; selections: number };
	download?: { requests: number; failed: number; unknownTerminal: number; handedOff: number };
	siteJourney?: { views: number; actions: number; completed: number; kind: 'profile' | 'writing' | 'demos' };
	distribution?: { taggedArrivals: number; laterActions: number; sources: number };
	catalogue?: { eligibleAlbums: number; eligiblePhotos: number; missingAlbumFacts: number };
	followUp?: { actionId: string; before: number; after: number; coverage: IntelligenceCoverage; previousCoverage: IntelligenceCoverage | null; concurrentChanges: number; measure: string; window: { before: { start: string; end: string }; after: { start: string; end: string } } };
}
export interface IntelligenceRuleResult { findings: Finding[]; suppressions: IntelligenceSuppression[]; }
export const INTELLIGENCE_RULES = [
	'momentum', 'strong_photo_response', 'discovery_friction', 'rendering_download_reliability', 'search_usefulness',
	'profile_response', 'writing_demo_response', 'distribution', 'collection_health', 'follow_up'
] as const;

const minimumSample = 20;
const meaningfulAbsoluteChange = 5;
function windows(scope: IntelligenceScope): FindingEvidence['windows'] {
	if (scope.kind === 'sites') return { current: { start: 'UTC complete days', end: `${scope.period} days` }, previous: { start: 'previous UTC complete days', end: `${scope.period} days` } };
	return { current: { start: scope.query.start, end: scope.query.end }, previous: comparisonWindow(scope.query) };
}
function href(scope: IntelligenceScope): string {
	return scope.kind === 'sites' ? `/photography/analytics/sites?period=${scope.period}&section=${scope.section}` : '/gallery';
}
function evidence(input: IntelligenceRuleInput, units: string, values: Partial<Pick<FindingEvidence, 'numerator' | 'denominator' | 'current' | 'previous'>>, strength: FindingEvidence['strength']): FindingEvidence {
	return { windows: windows(input.scope), cutoff: input.cutoff, coverage: input.coverage, previousCoverage: input.previousCoverage ?? null, units, eligibility: input.eligibility, strength, ...values };
}
function finding(input: IntelligenceRuleInput, rule: string, id: string, title: string, explanation: string, action: string, data: FindingEvidence, target: Finding['target'] = { kind: input.scope.kind === 'gallery' ? 'gallery' : 'site' }, evidenceLinks?: string[]): Finding {
	return { id, rule, target, title, explanation, action, evidence: data, reportHref: href(input.scope), ...(evidenceLinks?.length ? { evidenceLinks: [...new Set(evidenceLinks)].slice(0, 6) } : {}), status: 'open' };
}
function suppress(result: IntelligenceRuleResult, rule: string, reason: string, target?: Finding['target']): void { result.suppressions.push({ rule, reason, target }); }
function completeComparison(input: IntelligenceRuleInput): boolean { return input.coverage === 'complete' && input.previousCoverage === 'complete'; }
function nonnegative(...values: Array<number | null | undefined>): boolean { return values.every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0); }

/**
 * Deterministic rule adapters over aggregate stored evidence. Each denominator is
 * named in the finding. Missing cohorts become a suppression; they are never zero.
 */
export function evaluateIntelligenceRules(input: IntelligenceRuleInput): IntelligenceRuleResult {
	const result: IntelligenceRuleResult = { findings: [], suppressions: [] };
	if (input.coverage !== 'complete') {
		result.findings.push(finding(input, 'collection_health', 'collection-health', 'Analytics evidence needs attention', 'The selected collection window is partial or unavailable. Behavioral recommendations are withheld until a complete refresh exists.', 'Repair or refresh the collection, then compare complete windows.', evidence(input, 'report coverage', {}, 'limited')));
		for (const rule of INTELLIGENCE_RULES.filter((rule) => rule !== 'collection_health')) suppress(result, rule, 'The selected evidence window is not complete.');
		return result;
	}
	const current = input.current; const previous = input.previous;
	if (!completeComparison(input) || !nonnegative(current, previous) || current === null || previous === null) suppress(result, 'momentum', 'A complete comparable period is not available.');
	else if (current < minimumSample || previous < minimumSample) suppress(result, 'momentum', `Both periods need at least ${minimumSample} ${input.scope.kind === 'sites' ? 'page views' : 'recorded actions'}.`);
	else if (Math.abs(current - previous) < meaningfulAbsoluteChange) suppress(result, 'momentum', 'The absolute change is too small to recommend a review.');
	else if (current > previous) result.findings.push(finding(input, 'momentum', 'momentum-increase', 'Recorded activity increased', `The current window has ${current} ${input.scope.kind === 'sites' ? 'page views' : 'recorded actions'} versus ${previous} in the declared comparable window. This is not proof of audience growth.`, 'Inspect the affected known catalogue or publication context before deciding whether to repeat a promotion.', evidence(input, input.scope.kind === 'sites' ? 'page views' : 'recorded actions', { current, previous }, 'exploratory')));
	else suppress(result, 'momentum', 'The comparable activity did not increase.');

	if (!input.linkedPhotoResponse?.length) suppress(result, 'strong_photo_response', 'Eligible photo exposures with later named actions are not available.');
	else for (const row of input.linkedPhotoResponse) {
		const target: Finding['target'] = row.photoId ? { kind: 'photo', id: row.photoId, albumKey: row.albumKey ?? null } : { kind: 'gallery' };
		if (!nonnegative(row.exposures, row.responses) || row.responses > row.exposures || row.exposures < minimumSample) { suppress(result, 'strong_photo_response', 'The eligible exposure denominator is too small or incomplete.', target); continue; }
		if (row.responses >= 3 && row.responses / row.exposures >= 0.1) result.findings.push(finding(input, 'strong_photo_response', `photo-response-${row.photoId ?? 'aggregate'}`, 'Eligible photo exposure was followed by response', `${row.responses} named later actions followed ${row.exposures} eligible photo exposures. This does not rate photographic quality.`, 'Inspect the linked public photo with comparable photos before deciding what to promote.', evidence(input, 'eligible photo exposures', { numerator: row.responses, denominator: row.exposures }, 'exploratory'), target, row.evidenceLinks));
		else suppress(result, 'strong_photo_response', 'The measured later-response rate does not cross the review threshold.', target);
	}

	if (!input.discovery || !nonnegative(input.discovery.exposures, input.discovery.opens, input.discovery.directEntries)) suppress(result, 'discovery_friction', 'Separate eligible album-exposure and later-open cohorts are not available.');
	else if (input.discovery.exposures < minimumSample) suppress(result, 'discovery_friction', `Fewer than ${minimumSample} eligible album exposures are available.`);
	else if (input.discovery.opens / input.discovery.exposures < 0.08 && input.discovery.directEntries < input.discovery.opens) result.findings.push(finding(input, 'discovery_friction', 'discovery-friction', 'People see an album but rarely open it', `${input.discovery.opens} later opens followed ${input.discovery.exposures} eligible album exposures. Direct-entry opens are excluded from this interpretation.`, 'Test one cover, title, or card-placement change and record it before comparing the same measure.', evidence(input, 'eligible album exposures', { numerator: input.discovery.opens, denominator: input.discovery.exposures }, 'exploratory')));
	else suppress(result, 'discovery_friction', 'The measured open rate does not cross the review threshold.');

	if (!input.download || !nonnegative(input.download.requests, input.download.failed, input.download.unknownTerminal, input.download.handedOff)) suppress(result, 'rendering_download_reliability', 'Bounded rendering or download outcome evidence is unavailable.');
	else if (input.download.requests < minimumSample) suppress(result, 'rendering_download_reliability', `Fewer than ${minimumSample} eligible download requests are available.`);
	else if (input.download.failed > 0 || input.download.unknownTerminal / input.download.requests > 0.1) result.findings.push(finding(input, 'rendering_download_reliability', 'flow-reliability', 'A recorded download flow needs review', `${input.download.failed} failures and ${input.download.unknownTerminal} unknown terminal outcomes occurred across ${input.download.requests} eligible requests. A handoff is not a confirmed file save.`, 'Inspect the named rendering or download flow and its release context before claiming a repair worked.', evidence(input, 'eligible download requests', { numerator: input.download.failed + input.download.unknownTerminal, denominator: input.download.requests }, 'strong')));
	else suppress(result, 'rendering_download_reliability', 'The recorded download outcomes do not cross a review threshold.');

	if (!input.search || !nonnegative(input.search.searches, input.search.empty, input.search.errors, input.search.selections)) suppress(result, 'search_usefulness', 'Linked aggregate search results and later selections are not available.');
	else if (input.search.searches < minimumSample) suppress(result, 'search_usefulness', `Fewer than ${minimumSample} eligible searches are available.`);
	else if (input.search.errors > 0 || input.search.empty / input.search.searches > 0.3) result.findings.push(finding(input, 'search_usefulness', 'search-friction', 'Search results need review', `${input.search.empty} empty result sets and ${input.search.errors} errors occurred across ${input.search.searches} eligible searches. Search text is not stored.`, 'Review filters and result relevance with aggregate evidence; do not infer a visitor’s query.', evidence(input, 'eligible searches', { numerator: input.search.empty + input.search.errors, denominator: input.search.searches }, 'exploratory')));
	else suppress(result, 'search_usefulness', 'The aggregate search signals do not cross a review threshold.');

	if (!input.siteJourney || !nonnegative(input.siteJourney.views, input.siteJourney.actions, input.siteJourney.completed)) {
		suppress(result, 'profile_response', 'Same-view profile and contact-link evidence is unavailable.');
		suppress(result, 'writing_demo_response', 'Same-view article or demo progression evidence is unavailable.');
	} else if (input.siteJourney.views < minimumSample) suppress(result, input.siteJourney.kind === 'profile' ? 'profile_response' : 'writing_demo_response', `Fewer than ${minimumSample} eligible same-view observations are available.`);
	else if (input.siteJourney.kind === 'profile' && input.siteJourney.actions / input.siteJourney.views < 0.02) result.findings.push(finding(input, 'profile_response', 'profile-response', 'Profile visitors rarely reach a contact link', `${input.siteJourney.actions} contact-link actions followed ${input.siteJourney.views} eligible profile views. A click is not an inquiry.`, 'Test clearer positioning or contact-link placement, then compare the same eligible same-view measure.', evidence(input, 'eligible profile views', { numerator: input.siteJourney.actions, denominator: input.siteJourney.views }, 'exploratory')));
	else if (input.siteJourney.kind !== 'profile' && input.siteJourney.completed / input.siteJourney.views < 0.2) result.findings.push(finding(input, 'writing_demo_response', 'content-progress', 'Readers or demo visitors are not reaching the later step', `${input.siteJourney.completed} progression observations followed ${input.siteJourney.views} eligible views. This does not prove comprehension.`, 'Inspect the opening and sequence, then test one recorded change with the same measure.', evidence(input, 'eligible content views', { numerator: input.siteJourney.completed, denominator: input.siteJourney.views }, 'exploratory')));
	else suppress(result, input.siteJourney.kind === 'profile' ? 'profile_response' : 'writing_demo_response', 'The available same-view evidence does not cross a review threshold.');

	if (!input.distribution || !nonnegative(input.distribution.taggedArrivals, input.distribution.laterActions, input.distribution.sources)) suppress(result, 'distribution', 'Tagged-arrival cohorts with later eligible actions are not available.');
	else if (input.distribution.taggedArrivals < minimumSample) suppress(result, 'distribution', `Fewer than ${minimumSample} tagged arrivals are available.`);
	else if (input.distribution.laterActions / input.distribution.taggedArrivals < 0.05) result.findings.push(finding(input, 'distribution', 'distribution-review', 'Tagged arrivals rarely reach a later gallery action', `${input.distribution.laterActions} later gallery actions followed ${input.distribution.taggedArrivals} tagged arrivals across ${input.distribution.sources} bounded source labels.`, 'Review the landing context and known promotion records before changing distribution.', evidence(input, 'tagged arrival visits', { numerator: input.distribution.laterActions, denominator: input.distribution.taggedArrivals }, 'limited')));
	else suppress(result, 'distribution', 'The tagged-arrival evidence does not cross a review threshold.');

	if (!input.catalogue) suppress(result, 'collection_health', 'Known catalogue coverage was not available with this stored report.');
	else if (input.catalogue.missingAlbumFacts > 0) result.findings.push(finding(input, 'collection_health', 'catalogue-facts', 'Some compared albums lack known catalogue facts', `${input.catalogue.missingAlbumFacts} eligible albums lack a recorded publication fact needed for like-for-like age comparison. This is a catalogue gap, not a performance result.`, 'Add the known catalogue fact before using publication-age comparison.', evidence(input, 'eligible catalogue albums', { current: input.catalogue.eligibleAlbums }, 'limited')));
	else suppress(result, 'collection_health', 'The stored catalogue has no flagged missing comparison facts.');

	if (!input.followUp) suppress(result, 'follow_up', 'No recorded action has a completed matching observation window.');
	else if (input.followUp.coverage !== 'complete' || input.followUp.previousCoverage !== 'complete') suppress(result, 'follow_up', 'The declared before or after window is incomplete.');
	else if (input.followUp.concurrentChanges > 0) suppress(result, 'follow_up', `${input.followUp.concurrentChanges} other recorded changes overlap the observation window.`);
	else if (input.followUp.before < minimumSample || input.followUp.after < minimumSample || Math.abs(input.followUp.after - input.followUp.before) < meaningfulAbsoluteChange) suppress(result, 'follow_up', 'The declared measure has too little volume or too small a change for a follow-up finding.');
	else result.findings.push(finding(input, 'follow_up', `follow-up-${input.followUp.actionId}`, 'A recorded action has a clean follow-up comparison', `The declared ${input.followUp.measure} measure was ${input.followUp.before} in ${input.followUp.window.before.start} to ${input.followUp.window.before.end} and ${input.followUp.after} in ${input.followUp.window.after.start} to ${input.followUp.window.after.end}. This is an observation, not a causal claim.`, 'Review the declared target and measure before deciding whether to repeat the action.', evidence(input, `declared ${input.followUp.measure} measure`, { current: input.followUp.after, previous: input.followUp.before }, 'limited')));
	return result;
}

export function validRuleScope(scope: IntelligenceScope): boolean { return scope.kind === 'sites' || scope.query.start <= scope.query.end; }
export function privateFollowUp(input: IntelligenceRuleInput, actions: IntelligenceAction[], now = new Date()): IntelligenceRuleInput['followUp'] | undefined {
	if (!completeComparison(input) || !nonnegative(input.current, input.previous) || input.current === null || input.previous === null) return undefined;
	const comparison = input.scope.kind === 'gallery' ? comparisonWindow(input.scope.query) : null;
	if (!comparison) return undefined;
	const measure = input.scope.kind === 'gallery' ? input.scope.query.measure : 'page_views';
	const action = actions.find((item) => item.kind === 'record' && item.primaryMeasure === measure && item.actualAt && item.followUpAt && Date.parse(item.followUpAt) <= now.getTime() && Date.parse(item.actualAt) >= Date.parse(`${comparison.start}T00:00:00Z`) && Date.parse(item.actualAt) <= Date.parse(`${input.scope.kind === 'gallery' ? input.scope.query.start : input.generatedAt.slice(0, 10)}T23:59:59Z`));
	if (!action?.actualAt || !action.followUpAt) return undefined;
	const actionAt = action.actualAt; const followUpAt = action.followUpAt;
	const concurrentChanges = actions.filter((item) => item.kind === 'record' && item.id !== action.id && item.actualAt && Date.parse(item.actualAt) >= Date.parse(actionAt) && Date.parse(item.actualAt) <= Date.parse(followUpAt)).length;
	return { actionId: action.id, before: input.previous, after: input.current, coverage: input.coverage, previousCoverage: input.previousCoverage ?? null, concurrentChanges, measure, window: { before: comparison, after: input.scope.kind === 'gallery' ? { start: input.scope.query.start, end: input.scope.query.end } : { start: 'UTC previous period', end: 'UTC current period' } } };
}
