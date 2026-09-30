import type { AssistantAnswer, Finding, IntelligenceReport, IntelligenceScope } from './intelligence-contract';

type Operation = 'explain_report' | 'album_comparison' | 'promote_photos' | 'download_reliability' | 'action_follow_up' | 'site_retention';
const OPERATIONS: Record<Operation, { terms: readonly string[]; rules: readonly string[]; needsJob: boolean; limit: string }> = {
	explain_report: { terms: ['explain', 'what changed', 'report'], rules: [], needsJob: false, limit: 'This answer only explains the stored report; it does not refresh collection.' },
	album_comparison: { terms: ['album', 'similar'], rules: ['momentum', 'discovery_friction'], needsJob: true, limit: 'Comparable albums require known catalogue facts and a completed background calculation.' },
	promote_photos: { terms: ['photo', 'promot'], rules: ['strong_photo_response'], needsJob: false, limit: 'Response patterns do not judge photographic quality.' },
	download_reliability: { terms: ['download', 'render', 'struggling'], rules: ['rendering_download_reliability'], needsJob: false, limit: 'A handoff is not evidence that a visitor saved a file.' },
	action_follow_up: { terms: ['cover', 'changed', 'after', 'follow'], rules: ['follow_up'], needsJob: false, limit: 'An observed difference is not causal proof.' },
	site_retention: { terms: ['reader', 'demo', 'interest', 'losing'], rules: ['writing_demo_response'], needsJob: true, limit: 'A completed background calculation needs same-view eligible journey evidence.' }
};
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Deterministic allowlist recognition. It never interprets instructions or sends text to a model. */
export function recognizeIntelligenceOperation(question: string): Operation | null {
	const value = normalized(question);
	if (!value || value.length > 500) return null;
	for (const [operation, config] of Object.entries(OPERATIONS) as Array<[Operation, typeof OPERATIONS[Operation]]>) {
		if (config.terms.every((term) => value.includes(term))) return operation;
	}
	return value === 'help' ? 'explain_report' : null;
}

export function answerIntelligenceQuestion(scope: IntelligenceScope, question: string, report: IntelligenceReport, requestId?: string): AssistantAnswer {
	const operation = recognizeIntelligenceOperation(question);
	const generatedAt = new Date().toISOString();
	if (!operation) return { scope, question, operation: 'unsupported', status: 'unsupported', summary: 'That question is outside the report’s supported calculations.', findings: [], evidenceLinks: [], limitations: ['Choose an explanation button or ask about albums, photo response, download reliability, a recorded change, readers, or demos.'], generatedAt };
	const config = OPERATIONS[operation];
	if (config.needsJob && !requestId) return { scope, question, operation, status: 'pending', summary: 'This calculation is queued against the fixed report scope.', findings: [], evidenceLinks: [], limitations: [config.limit, 'The request stores no question text.'], generatedAt };
	const findings = config.rules.length ? report.findings.filter((item) => config.rules.includes(item.rule)) : report.findings;
	const suppressed = config.rules.flatMap((rule) => report.suppressions.filter((item) => item.rule === rule).map((item) => item.reason));
	if (report.coverage !== 'complete') return { scope, question, operation, status: 'unavailable', summary: 'The stored evidence is partial or unavailable, so this report cannot answer that safely.', findings: [], evidenceLinks: [], limitations: [config.limit, ...suppressed], generatedAt, requestId };
	return {
		scope, question, operation, status: 'complete',
		summary: findings.length ? 'The stored evidence supports the findings below.' : 'The stored evidence does not support a recommendation for that question yet.',
		findings, evidenceLinks: [...new Set(findings.map((item) => item.reportHref))], limitations: [config.limit, ...suppressed], generatedAt, requestId
	};
}
