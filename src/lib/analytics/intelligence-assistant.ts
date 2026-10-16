import { intelligenceScopeKey, type AssistantAnswer, type IntelligenceReport, type IntelligenceScope } from './intelligence-contract';
import { siteMeasuresView } from './data-quality';
import type { SiteTrafficResult } from './site-traffic.server';
import type { SiteActionReport } from './site-actions';
import type { LaunchReadModel } from './launch-read-model.server';
import { chicagoDate, earlierLaunches, median } from './launch-recap';
import { filterParams } from './photo-view';

/** Read models from the linked reports, never counts inferred from missing findings. */
export type QuestionReportEvidence = {
	scope: IntelligenceScope;
	unavailableReason?: string;
	site?: { traffic: SiteTrafficResult | null; actions: SiteActionReport | null };
	launch?: LaunchReadModel;
	gallery?: {coverage: 'complete' | 'partial' | 'unavailable'; total: number | null; observedTotal: number; dataAsOf: string | null};
};

export type IntelligenceOperation = 'explain_report' | 'album_comparison' | 'promote_photos' | 'download_reliability' | 'action_follow_up' | 'site_retention' | 'site_counts' | 'download_meaning' | 'album_age' | 'report_coverage';
const OPERATIONS: Record<IntelligenceOperation, { rules: readonly string[]; needsJob: boolean; limit: string }> = {
	report_coverage: { rules: [], needsJob: false, limit: 'Zero means no recorded activity for this measure and window. It does not prove that nobody visited. No findings is not the same as no activity.' },
	album_age: { rules: [], needsJob: false, limit: 'Attention means recorded photo opens, not people or photographic quality. A difference does not establish its cause.' },
	download_meaning: { rules: [], needsJob: false, limit: 'A handoff to the browser does not prove that a file was saved.' },
	site_counts: { rules: [], needsJob: false, limit: 'Different collection methods can explain a difference; these counts do not prove its cause.' },
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

/** The launch report cannot apply calendar-report dimension filters. */
export function questionAlbumKey(scope: IntelligenceScope): string | null {
	if (scope.kind === 'launch') return scope.albumKey;
	if (scope.kind !== 'gallery') return null;
	const q = scope.query;
	return q.albumKeys.length === 1 && q.traffic === 'conservative' && !q.sport && !q.category && !q.source && !q.eventDate && !q.season && !q.albumEventType ? q.albumKeys[0] : null;
}
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
	if (has(value, 'zero', 'missing history', 'unavailable evidence', 'coverage', 'no activity')) return 'report_coverage';
	if (has(value, 'album') && has(value, 'same age', 'after publication', 'since publication', 'first 3 days', 'first 7 days')) return 'album_age';
	if (has(value, 'download') && has(value, 'mean', 'completed transfer', 'saved file', 'count as')) return 'download_meaning';
	if (has(value, 'cloudflare') && has(value, 'count', 'differ', 'match', 'page load', 'page view')) return 'site_counts';
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

export function answerIntelligenceQuestion(scope: IntelligenceScope, question: string, report: IntelligenceReport, requestId?: string, evidence?: QuestionReportEvidence): AssistantAnswer {
	const operation = recognizeIntelligenceOperation(question);
	const generatedAt = new Date().toISOString();
	if (!operation) return { scope, question, operation: 'unsupported', status: 'unsupported', summary: 'That question is outside the report’s supported calculations.', findings: [], evidenceLinks: [], limitations: ['Choose a visible explanation, album comparison, photo response, download reliability, recorded-change follow-up, or reader/demo question.'], generatedAt };
	const config = OPERATIONS[operation];
	if (operation === 'report_coverage') {
		const href = scope.kind === 'sites' ? `/analytics/sites?period=${scope.period}&section=${scope.section}` : scope.kind === 'gallery' ? `/analytics/photos?${filterParams(scope.query)}` : scope.albumKey ? `/analytics/albums/${encodeURIComponent(scope.albumKey)}` : '/analytics/albums';
		const base = {scope, question, operation, findings: [], generatedAt, evidenceLinks: [href, '/analytics/data'], limitations: [config.limit]};
		const unavailable = (summary: string): AssistantAnswer => ({...base, status: 'unavailable', summary});
		if (!evidence || intelligenceScopeKey(evidence.scope) !== intelligenceScopeKey(scope)) return unavailable('The report totals are unavailable. Missing evidence is not zero.');
		if (evidence.unavailableReason) {
			if (scope.kind === 'gallery') base.evidenceLinks = [...scope.query.albumKeys.map(key => `/analytics/albums/${encodeURIComponent(key)}`), '/analytics/data'];
			return unavailable(evidence.unavailableReason);
		}
		if (scope.kind === 'sites') {
			const actions = evidence.site?.actions;
			if (!actions?.available) return unavailable('The site’s own page-view evidence is unavailable, not zero.');
			base.limitations.push(`Site counter, ${actions.start} to ${actions.end}, UTC days. Refreshed ${actions.freshness.refreshedAt}. Cloudflare page loads are a separate measure.`);
			if (!actions.firstRecordedAt) return unavailable('The site counter has no recorded history yet. This is unknown, not zero.');
			if (actions.freshness.status !== 'current' || actions.freshness.completedThrough < actions.end) return unavailable('The site counter is stale or has not covered the end of this window. This is not evidence of zero activity.');
			if (Date.parse(actions.firstRecordedAt) > Date.parse(`${actions.start}T00:00:00Z`)) return unavailable(`There is missing history: the site counter began ${actions.firstRecordedAt}, after this window started. The full-window total is unknown, not zero.`);
			return {...base, status: 'complete', summary: `The site counter recorded ${actions.totals.page_views ?? 0} page views from ${actions.start} to ${actions.end}, with history covering the requested UTC days.`};
		}
		if (scope.kind === 'gallery') {
			const gallery = evidence.gallery;
			if (!gallery || gallery.coverage === 'unavailable') return unavailable('The selected gallery evidence is unavailable, not zero.');
			if (gallery.dataAsOf) base.limitations.push(`Report data as of ${gallery.dataAsOf}; public albums, ${scope.query.traffic} traffic, Chicago days.`);
			if (gallery.coverage === 'partial') return unavailable('This window has missing history. Its full total is unknown, not zero.');
			if (gallery.total === null || !gallery.dataAsOf || chicagoDate(gallery.dataAsOf) <= scope.query.end) return unavailable('The report has not confirmed a complete total through the end of this window. This is not zero.');
			const units = scope.query.measure === 'downloads' ? 'download requests' : scope.query.measure.replaceAll('_', ' ');
			return {...base, status: 'complete', summary: `The report recorded ${gallery.total} ${units} from ${scope.query.start} to ${scope.query.end}, with complete history for those Chicago days.`};
		}
		const launch = evidence.launch;
		if (!launch || launch.album.albumKey !== scope.albumKey) return unavailable('The selected launch evidence is unavailable, not zero.');
		const days = launch.album.series;
		base.limitations.push(`Launch report as of ${launch.asOf}. Complete Chicago days only; today is excluded.`);
		if (!days.length) return unavailable('No complete launch day is available yet. This is not zero.');
		if (days.some(day => day.coverage !== 'complete' || day.photoOpens === null)) return unavailable('The launch window has missing history. Its full photo-open total is unknown, not zero.');
		return {...base, status: 'complete', summary: `The launch report recorded ${days.reduce((total, day) => total + day.photoOpens!, 0)} photo opens from ${days[0].date} to ${days.at(-1)!.date}, with complete history for those Chicago days.`};
	}
	if (operation === 'album_age') {
		const key = questionAlbumKey(scope);
		const base = {scope, question, operation, findings: [], generatedAt, evidenceLinks: key ? [`/analytics/albums/${encodeURIComponent(key)}`] : ['/analytics/albums'], limitations: [config.limit]};
		if (has(normalized(question), 'download', 'favorite', 'share', 'album open') || (scope.kind === 'gallery' && scope.query.measure !== 'photo_opens')) return {...base, status: 'unsupported', summary: 'The same-age attention answer supports photo opens only. Open the album report to inspect other measures.'};
		if (!key) return {...base, status: 'unavailable', summary: 'Open one album without additional filters to compare its first days after publication. No broader album group is substituted.'};
		const model = evidence?.launch;
		if (!model || intelligenceScopeKey(evidence.scope) !== intelligenceScopeKey(scope) || model.album.albumKey !== key || model.traffic !== 'conservative') return {...base, status: 'unavailable', summary: 'The selected album’s launch report could not be read. This is not zero attention.'};
		const album = model.album;
		base.limitations.push(`Report read as of ${model.asOf}. Complete Chicago days only; today is excluded.`, 'This compares the first 3 or 7 days after publication, independent of the selected calendar window. Earlier public launches are not necessarily similar events.');
		if (album.status === 'no_launch_date') return {...base, status: 'unavailable', summary: 'There is no known first-publication date, so a same-age comparison is unavailable.'};
		const explicit = normalized(question).match(/\b(\d+) days\b/);
		if (explicit && !['3', '7'].includes(explicit[1])) return {...base, status: 'unsupported', summary: 'The launch report supports comparisons after the first 3 or 7 days.'};
		const days = explicit ? Number(explicit[1]) : album.totals.day7.reached ? 7 : 3;
		const age = days === 7 ? 'day7' : 'day3';
		const own = album.totals[age];
		if (!own.reached) return {...base, status: 'unavailable', summary: `This album has not reached ${days} complete Chicago days after publication yet.`};
		if (!own.complete || own.photoOpens === null) return {...base, status: 'unavailable', summary: `The first ${days} days have missing history. The total is unknown, not zero.`};
		const peers = earlierLaunches(model, album);
		const complete = peers.filter(peer => peer.totals[age].reached && peer.totals[age].complete && peer.totals[age].photoOpens !== null);
		const middle = median(complete.map(peer => peer.totals[age].photoOpens!));
		if (album.basis === 'inferred' || complete.some(peer => peer.basis === 'inferred')) base.limitations.push('At least one first-publication date was recovered from a log rather than recorded at publication.');
		base.limitations.push(`${peers.length - complete.length} earlier launches lacked a complete total at this age and were excluded. Small comparisons describe these albums only.`);
		if (middle === null) return {...base, status: 'unavailable', summary: `This album had ${own.photoOpens} photo opens in its first ${days} days, but no earlier public launch has a complete same-age total to compare.`};
		const direction = own.photoOpens > middle ? 'more than' : own.photoOpens < middle ? 'fewer than' : 'equal to';
		return {...base, status: 'complete', summary: `This album had ${own.photoOpens} photo opens in its first ${days} days: ${direction} the median of ${middle} across ${complete.length} earlier public launches at the same age.`};
	}
	if (operation === 'download_meaning') return {scope, question, operation, status: 'complete', summary: 'Downloads count requests, not completed transfers. Prepared, handed off, failed, cancelled, and unknown outcomes describe stages of a request.', findings: [], evidenceLinks: ['/analytics/data'], limitations: [config.limit, 'Photo-level requests and whole-album requests are separate counts; a ZIP request can contain multiple photos.', 'This explains the measure. It does not establish an outcome for any individual download.'], generatedAt};
	if (operation === 'site_counts') {
		const base = {scope, question, operation, findings: [], generatedAt};
		if (scope.kind !== 'sites' || scope.section !== 'all') return {...base, status: 'unavailable', summary: 'Open All sections in Sites to compare the two whole-site counters.', evidenceLinks: ['/analytics/sites'], limitations: ['A section count is not compared with a whole-site count.']};
		const links = [`/analytics/data?period=${scope.period}#site-measures`, `/analytics/sites?period=${scope.period}`];
		if (!evidence?.site || intelligenceScopeKey(evidence.scope) !== intelligenceScopeKey(scope)) return {...base, status: 'unavailable', summary: 'The two counters could not be read for this report. Missing evidence is not zero.', evidenceLinks: links, limitations: [config.limit]};
		const view = siteMeasuresView({...evidence.site, days: scope.period, owner: report.owner});
		const actions = evidence.site.actions;
		const stale = actions?.available && (actions.freshness.status === 'stale' || actions.freshness.completedThrough < actions.end);
		const freshness = actions?.available ? [`Site counter refreshed ${actions.freshness.refreshedAt}; complete through ${actions.freshness.completedThrough}.${stale ? ' The saved counts are stale; they cannot establish current activity.' : ''}`] : [];
		return {...base, status: !stale && view.cloudflare.value !== null && view.firstParty.value !== null ? 'complete' : 'unavailable', summary: view.crossCheck, evidenceLinks: links, limitations: [view.cloudflare.detail, view.firstParty.detail, ...freshness, view.sampling, config.limit]};
	}
	const scopeLimit = operation === 'explain_report' || operation === 'action_follow_up' || operation === 'album_comparison' ? null : unsupportedProviderScope(scope);
	if (scopeLimit) return { scope, question, operation, status: 'unavailable', summary: 'This question needs linked evidence that does not support the selected report scope.', findings: [], evidenceLinks: [], limitations: [scopeLimit, config.limit], generatedAt, requestId };
	if (config.needsJob && !requestId) return { scope, question, operation, status: 'pending', summary: 'This calculation is pending against the fixed report scope.', findings: [], evidenceLinks: [], limitations: [config.limit, 'The request stores only operation and scope, never question text.'], generatedAt };
	const findings = config.rules.length ? report.findings.filter((item) => config.rules.includes(item.rule)) : report.findings;
	const suppressed = config.rules.flatMap((rule) => report.suppressions.filter((item) => item.rule === rule).map((item) => item.reason));
	if (report.coverage !== 'complete') return { scope, question, operation, status: 'unavailable', summary: 'The stored evidence is partial or unavailable, so this report cannot answer that safely.', findings: [], evidenceLinks: [], limitations: [config.limit, ...suppressed], generatedAt, requestId };
	return { scope, question, operation, status: 'complete', summary: findings.length ? 'The stored evidence supports the findings below.' : 'The stored evidence does not support a recommendation for that question yet.', findings, evidenceLinks: [...new Set(findings.flatMap((item) => [item.reportHref, ...(item.evidenceLinks ?? [])]))], limitations: [config.limit, ...suppressed], generatedAt, requestId };
}
