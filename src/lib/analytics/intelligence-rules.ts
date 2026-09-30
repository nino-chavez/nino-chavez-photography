import { comparisonWindow, type ReportQuery } from './report-contract';
import type { Finding, FindingEvidence, IntelligenceCoverage, IntelligenceScope, IntelligenceSuppression } from './intelligence-contract';

export interface IntelligenceRuleInput {
	scope: IntelligenceScope;
	generatedAt: string;
	cutoff: string | null;
	coverage: IntelligenceCoverage;
	current: number | null;
	previous: number | null;
	diagnostics?: Array<{ type: string; status: string; count: number }>;
	linkedPhotoResponse?: Array<{ photoId: string; exposures: number; responses: number }>;
	discovery?: { exposures: number; opens: number; directEntries: number };
	search?: { searches: number; empty: number; errors: number; selections: number };
	siteJourney?: { views: number; actions: number; completed: number; kind: 'profile' | 'writing' | 'demos' };
	followUp?: { actionId: string; before: number; after: number; coverage: IntelligenceCoverage };
}

export interface IntelligenceRuleResult { findings: Finding[]; suppressions: IntelligenceSuppression[]; }
export const INTELLIGENCE_RULES = [
	'momentum', 'strong_photo_response', 'discovery_friction', 'rendering_download_reliability', 'search_usefulness',
	'profile_response', 'writing_demo_response', 'distribution', 'collection_health', 'follow_up'
] as const;

const minimumSample = 20;
function windows(scope: IntelligenceScope): FindingEvidence['windows'] {
	if (scope.kind === 'sites') return { current: { start: 'scheduled', end: `${scope.period} complete UTC days` } };
	const previous = comparisonWindow(scope.query);
	return { current: { start: scope.query.start, end: scope.query.end }, previous };
}
function href(scope: IntelligenceScope): string {
	return scope.kind === 'sites' ? `/photography/analytics/sites?period=${scope.period}&section=${scope.section}` : '/gallery';
}
function evidence(input: IntelligenceRuleInput, units: string, values: Partial<Pick<FindingEvidence, 'numerator' | 'denominator' | 'current' | 'previous'>>, strength: FindingEvidence['strength']): FindingEvidence {
	return { windows: windows(input.scope), cutoff: input.cutoff, coverage: input.coverage, units, strength, ...values };
}
function finding(input: IntelligenceRuleInput, rule: string, id: string, title: string, explanation: string, action: string, data: FindingEvidence, target: Finding['target'] = { kind: input.scope.kind === 'gallery' ? 'gallery' : 'site' }): Finding {
	return { id, rule, target, title, explanation, action, evidence: data, reportHref: href(input.scope), status: 'open' };
}
function suppress(result: IntelligenceRuleResult, rule: string, reason: string, target?: Finding['target']): void { result.suppressions.push({ rule, reason, target }); }

/**
 * A deterministic ruleset. A missing cohort is a suppression, never a fabricated zero.
 * The source layer supplies only already-approved aggregate calculations.
 */
export function evaluateIntelligenceRules(input: IntelligenceRuleInput): IntelligenceRuleResult {
	const result: IntelligenceRuleResult = { findings: [], suppressions: [] };
	if (input.coverage !== 'complete') {
		result.findings.push(finding(input, 'collection_health', 'collection-health', 'Analytics evidence needs attention', 'The selected report is partial or unavailable, so behavioral recommendations are withheld.', 'Repair the collection or refresh problem, then rerun this report.', evidence(input, 'report coverage', {}, 'limited')));
		for (const rule of INTELLIGENCE_RULES.filter((rule) => rule !== 'collection_health')) suppress(result, rule, 'The selected evidence window is not complete.');
		return result;
	}
	if (input.current === null || input.previous === null) suppress(result, 'momentum', 'A complete comparable period is not available.');
	else if (input.current < minimumSample || input.previous < minimumSample) suppress(result, 'momentum', `Both periods need at least ${minimumSample} recorded actions.`);
	else if (Math.abs(input.current - input.previous) < 5) suppress(result, 'momentum', 'The absolute change is too small to recommend a promotion decision.');
	else if (input.current > input.previous) result.findings.push(finding(input, 'momentum', 'momentum-increase', 'Recorded gallery activity increased', `The current window has ${input.current} recorded actions versus ${input.previous} in its comparable window. This is activity, not proof of audience growth.`, 'Inspect the affected album and its known publication or promotion context before considering a reshare.', evidence(input, 'recorded actions', { current: input.current, previous: input.previous }, 'exploratory')));
	else suppress(result, 'momentum', 'The comparable activity did not increase.');

	if (!input.linkedPhotoResponse?.length) suppress(result, 'strong_photo_response', 'Eligible photo exposures linked to named later actions are not available.');
	else for (const row of input.linkedPhotoResponse) {
		if (row.exposures < minimumSample) { suppress(result, 'strong_photo_response', `Photo ${row.photoId} has fewer than ${minimumSample} eligible exposures.`, { kind: 'photo', id: row.photoId }); continue; }
		if (row.responses / row.exposures >= 0.1 && row.responses >= 3) result.findings.push(finding(input, 'strong_photo_response', `photo-response-${row.photoId}`, 'A photo has repeated recorded response', `${row.responses} named favorite or download-item actions followed ${row.exposures} eligible exposures. This does not rate the photo’s artistic quality.`, 'Shortlist this photo and inspect it with comparable photos before deciding what to promote.', evidence(input, 'eligible photo exposures', { numerator: row.responses, denominator: row.exposures }, 'exploratory'), { kind: 'photo', id: row.photoId }));
	}

	if (!input.discovery) suppress(result, 'discovery_friction', 'Separate eligible album exposure and open cohorts are not available.');
	else if (input.discovery.exposures < minimumSample) suppress(result, 'discovery_friction', `Fewer than ${minimumSample} eligible album exposures are available.`);
	else if (input.discovery.opens / input.discovery.exposures < 0.08 && input.discovery.directEntries < input.discovery.opens) result.findings.push(finding(input, 'discovery_friction', 'discovery-friction', 'People see this album but rarely open it', `${input.discovery.opens} opens followed ${input.discovery.exposures} eligible exposures, excluding direct-entry evidence from this interpretation.`, 'Test one cover, title, or card-placement change and record the change before comparing later evidence.', evidence(input, 'eligible album exposures', { numerator: input.discovery.opens, denominator: input.discovery.exposures }, 'exploratory')));
	else suppress(result, 'discovery_friction', 'The measured open rate does not cross the review threshold.');

	const failures = (input.diagnostics ?? []).filter((item) => item.status === 'failed' || item.status === 'error').reduce((total, item) => total + item.count, 0);
	if (!input.diagnostics) suppress(result, 'rendering_download_reliability', 'Rendering and download diagnostic evidence is unavailable.');
	else if (failures > 0) result.findings.push(finding(input, 'rendering_download_reliability', 'flow-reliability', 'A recorded visitor flow failed', `${failures} diagnostic failure observations were recorded. A handoff is not a confirmed file save.`, 'Inspect the named rendering or download flow and its release context before claiming the repair worked.', evidence(input, 'diagnostic observations', { current: failures }, 'strong')));
	else suppress(result, 'rendering_download_reliability', 'No recorded failure observation is available in this complete window.');

	if (!input.search) suppress(result, 'search_usefulness', 'Linked aggregate search results and later selections are not available.');
	else if (input.search.searches < minimumSample) suppress(result, 'search_usefulness', `Fewer than ${minimumSample} eligible searches are available.`);
	else if (input.search.errors > 0 || input.search.empty / input.search.searches > 0.3) result.findings.push(finding(input, 'search_usefulness', 'search-friction', 'Search results need review', `${input.search.empty} empty results and ${input.search.errors} errors occurred across ${input.search.searches} eligible searches. Search text is deliberately not included.`, 'Review filters and result relevance with aggregate evidence; do not infer a visitor’s query.', evidence(input, 'eligible searches', { numerator: input.search.empty + input.search.errors, denominator: input.search.searches }, 'exploratory')));
	else suppress(result, 'search_usefulness', 'The aggregate search signals do not cross a review threshold.');

	if (!input.siteJourney) { suppress(result, 'profile_response', 'Same-view profile and contact-link evidence is unavailable.'); suppress(result, 'writing_demo_response', 'Same-view article or demo progression evidence is unavailable.'); }
	else if (input.siteJourney.views < minimumSample) suppress(result, input.siteJourney.kind === 'profile' ? 'profile_response' : 'writing_demo_response', `Fewer than ${minimumSample} eligible same-view observations are available.`);
	else if (input.siteJourney.kind === 'profile' && input.siteJourney.actions / input.siteJourney.views < 0.02) result.findings.push(finding(input, 'profile_response', 'profile-response', 'Profile visitors rarely reach a contact link', `${input.siteJourney.actions} contact-link actions followed ${input.siteJourney.views} eligible profile views. A click is not an inquiry.`, 'Test clearer positioning or contact-link placement, then record the change and compare the same measure.', evidence(input, 'eligible profile views', { numerator: input.siteJourney.actions, denominator: input.siteJourney.views }, 'exploratory')));
	else if (input.siteJourney.kind !== 'profile' && input.siteJourney.completed / input.siteJourney.views < 0.2) result.findings.push(finding(input, 'writing_demo_response', 'content-progress', 'Readers or demo visitors are not reaching the later step', `${input.siteJourney.completed} progression observations followed ${input.siteJourney.views} eligible views. This does not prove comprehension.`, 'Inspect the opening and sequence, then test one change with a recorded follow-up.', evidence(input, 'eligible content views', { numerator: input.siteJourney.completed, denominator: input.siteJourney.views }, 'exploratory')));
	else suppress(result, input.siteJourney.kind === 'profile' ? 'profile_response' : 'writing_demo_response', 'The available same-view evidence does not cross a review threshold.');

	suppress(result, 'distribution', 'Tagged-arrival cohorts with comparable promotion records are not available.');
	if (!input.followUp) suppress(result, 'follow_up', 'No recorded action with a completed valid observation window is available.');
	else if (input.followUp.coverage !== 'complete') suppress(result, 'follow_up', 'Post-action coverage is incomplete.');
	else result.findings.push(finding(input, 'follow_up', `follow-up-${input.followUp.actionId}`, 'A recorded action has a follow-up comparison', `The pre-action value was ${input.followUp.before}; the post-action value was ${input.followUp.after}. This is an observation, not a causal claim.`, 'Review competing changes and the declared primary measure before deciding whether to repeat the action.', evidence(input, 'declared primary measure', { current: input.followUp.after, previous: input.followUp.before }, 'limited')));
	return result;
}

export function validRuleScope(scope: IntelligenceScope): boolean {
	return scope.kind === 'sites' || (scope.kind === 'gallery' && scope.query.start <= scope.query.end);
}
