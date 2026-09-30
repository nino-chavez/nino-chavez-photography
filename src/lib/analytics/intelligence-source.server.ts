import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchScheduledGalleryReport } from './scheduled-gallery-report.server';
import { loadSiteActions } from './site-actions.server';
import type { IntelligenceScope } from './intelligence-contract';
import type { IntelligenceRuleInput } from './intelligence-rules';

/** Reads only stored aggregate report projections. It deliberately never calls a provider on a read path. */
export async function loadIntelligenceEvidence(client: SupabaseClient, scope: IntelligenceScope, now = new Date()): Promise<IntelligenceRuleInput> {
	if (scope.kind === 'gallery') {
		const report = await fetchScheduledGalleryReport(client, scope.query, { publicOnly: true, includeToday: false });
		const coverage = report.coverage;
		const current = report.total;
		const previous = report.previousTotal;
		return {
			scope, generatedAt: now.toISOString(), cutoff: report.dataAsOf, coverage, current, previous,
			diagnostics: undefined,
			// Scheduled gallery payload does not include exposure-linked response or query text. Rules suppress these safely.
			linkedPhotoResponse: undefined, discovery: undefined, search: undefined
		};
	}
	const report = await loadSiteActions(client, scope.period, scope.section, 0);
	if (!report.available) return { scope, generatedAt: now.toISOString(), cutoff: null, coverage: 'unavailable', current: null, previous: null };
	const total = Object.values(report.totals).reduce((sum, value) => sum + Number(value ?? 0), 0);
	const previous = Object.values(report.previousTotals).reduce((sum, value) => sum + Number(value ?? 0), 0);
	const siteJourney = scope.section === 'profile'
		? { views: Number(report.totals.page_views ?? 0), actions: Number(report.totals.contact_clicks ?? 0), completed: 0, kind: 'profile' as const }
		: scope.section === 'writing'
			? { views: Number(report.totals.page_views ?? 0), actions: 0, completed: Number(report.totals.reading_90 ?? 0), kind: 'writing' as const }
			: scope.section === 'demos'
				? { views: Number(report.totals.page_views ?? 0), actions: 0, completed: Number(report.totals.demo_last_section ?? 0), kind: 'demos' as const }
				: undefined;
	return {
		scope, generatedAt: now.toISOString(), cutoff: report.freshness.summaryCutoffAt,
		coverage: report.freshness.status === 'current' ? 'complete' : 'partial', current: total, previous,
		// Action summaries do not establish same-view sequences. The source does not claim that they do.
		siteJourney: siteJourney && undefined
	};
}
