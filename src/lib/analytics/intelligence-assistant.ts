import type { AssistantAnswer, IntelligenceReport, IntelligenceScope } from './intelligence-contract';

export type IntelligenceOperation = 'explain_report' | 'album_comparison' | 'promote_photos' | 'download_reliability' | 'action_follow_up' | 'site_retention';
const OPERATIONS: Record<IntelligenceOperation, { rules: readonly string[]; needsJob: boolean; limit: string }> = {
	explain_report: { rules: [], needsJob: false, limit: 'This answer explains only the stored evidence. It does not refresh collection.' },
	album_comparison: { rules: ['launch_reach', 'launch_finished', 'discovery_friction', 'collection_health'], needsJob: true, limit: 'Comparable albums require known catalogue facts and a completed bounded calculation.' },
	promote_photos: { rules: ['strong_photo_response', 'seen_rarely_opened'], needsJob: false, limit: 'Response patterns do not judge photographic quality.' },
	download_reliability: { rules: ['rendering_download_reliability', 'launch_failures'], needsJob: false, limit: 'A handoff is not evidence that a visitor saved a file.' },
	action_follow_up: { rules: ['follow_up'], needsJob: false, limit: 'An observed difference is not causal proof.' },
	site_retention: { rules: ['profile_response', 'writing_demo_response'], needsJob: true, limit: 'A completed bounded calculation needs eligible same-view journey evidence.' }
};
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (value: string, ...terms: string[]) => terms.some((term) => value.includes(term));
const unsafeRequest = (value: string) => /\b(sql|select|insert|update|delete|drop|table|raw event|visitor|email address|credential|token|ignore previous|system prompt)\b/.test(value);
export function unsupportedProviderScope(scope: IntelligenceScope): string | null {
	if (scope.kind !== 'gallery') return null;
	const query = scope.query;
	if (query.traffic !== 'conservative') return 'Linked provider evidence currently supports conservative traffic only; inclusive traffic is not silently substituted.';
	if (query.eventDate || query.season || query.albumEventType) return 'Linked provider evidence does not yet support this event-date, season, or event-type filter; no broader cohort is substituted.';
	return null;
}

/** Matches the five contextual presets and equivalent ordinary questions, never instructions. */
export function recognizeIntelligenceOperation(question: string): IntelligenceOperation | null {
	const value = normalized(question);
	if (!value || value.length > 500 || unsafeRequest(value)) return null;
	// Exact public presets stay explanations even when they happen to contain a
	// word such as “changed”; free-form state-changing instructions are rejected.
	if (value.startsWith('explain ') || value === 'help' || value === 'what does this evidence support' || value === 'what should i inspect before acting') return 'explain_report';
	if (has(value, 'download', 'render', 'struggling', 'reliability', 'failed')) return 'download_reliability';
	if ((has(value, 'album') && has(value, 'compare', 'comparison', 'comparable', 'similar')) || value === 'compare this album') return 'album_comparison';
	if (has(value, 'photo') && has(value, 'promot', 'response', 'shortlist')) return 'promote_photos';
	if (has(value, 'cover', 'follow up', 'after', 'recorded change') || (has(value, 'what changed') && has(value, 'action', 'change'))) return 'action_follow_up';
	if (has(value, 'reader', 'demo', 'retention', 'losing interest', 'progression', 'site section')) return 'site_retention';
	if (has(value, 'explain', 'report', 'support', 'uncertain', 'inspect before', 'inspect this')) return 'explain_report';
	return null;
}

export function answerIntelligenceQuestion(scope: IntelligenceScope, question: string, report: IntelligenceReport, requestId?: string): AssistantAnswer {
	const operation = recognizeIntelligenceOperation(question);
	const generatedAt = new Date().toISOString();
	if (!operation) return { scope, question, operation: 'unsupported', status: 'unsupported', summary: 'That question is outside the report’s supported calculations.', findings: [], evidenceLinks: [], limitations: ['Choose a visible explanation, album comparison, photo response, download reliability, recorded-change follow-up, or reader/demo question.'], generatedAt };
	const config = OPERATIONS[operation];
	const scopeLimit = operation === 'explain_report' || operation === 'action_follow_up' || operation === 'album_comparison' ? null : unsupportedProviderScope(scope);
	if (scopeLimit) return { scope, question, operation, status: 'unavailable', summary: 'This question needs linked evidence that does not support the selected report scope.', findings: [], evidenceLinks: [], limitations: [scopeLimit, config.limit], generatedAt, requestId };
	if (config.needsJob && !requestId) return { scope, question, operation, status: 'pending', summary: 'This calculation is pending against the fixed report scope.', findings: [], evidenceLinks: [], limitations: [config.limit, 'The request stores only operation and scope, never question text.'], generatedAt };
	const findings = config.rules.length ? report.findings.filter((item) => config.rules.includes(item.rule)) : report.findings;
	const suppressed = config.rules.flatMap((rule) => report.suppressions.filter((item) => item.rule === rule).map((item) => item.reason));
	if (report.coverage !== 'complete') return { scope, question, operation, status: 'unavailable', summary: 'The stored evidence is partial or unavailable, so this report cannot answer that safely.', findings: [], evidenceLinks: [], limitations: [config.limit, ...suppressed], generatedAt, requestId };
	return { scope, question, operation, status: 'complete', summary: findings.length ? 'The stored evidence supports the findings below.' : 'The stored evidence does not support a recommendation for that question yet.', findings, evidenceLinks: [...new Set(findings.flatMap((item) => [item.reportHref, ...(item.evidenceLinks ?? [])]))], limitations: [config.limit, ...suppressed], generatedAt, requestId };
}
