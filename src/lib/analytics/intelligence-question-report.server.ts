import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceScope } from './intelligence-contract';
import { questionAlbumKey, type IntelligenceOperation, type QuestionReportEvidence } from './intelligence-assistant';
import { loadSiteActions } from './site-actions.server';
import { loadSiteTraffic, siteTrafficCache } from './site-traffic.server';
import { fetchScheduledGalleryReport } from './scheduled-gallery-report.server';
import { fetchLaunchReadModel } from './launch-read-model.server';
import { LAUNCH_DAYS } from './launch-recap.server';

export const isReportQuestion = (operation: IntelligenceOperation) => ['site_counts', 'download_meaning', 'album_age', 'report_coverage'].includes(operation);

/** Same readers as Sites, Data, Photos and the album report. No jobs or stored writes. */
export async function loadQuestionReportEvidence(
	client: SupabaseClient, scope: IntelligenceScope, operation: IntelligenceOperation,
	deps: {env: {CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_ANALYTICS_TOKEN?: string}; fetch: typeof fetch}
): Promise<QuestionReportEvidence> {
	const evidence: QuestionReportEvidence = {scope};
	try {
		if (scope.kind === 'sites' && (operation === 'report_coverage' || (operation === 'site_counts' && scope.section === 'all'))) {
			const [actions, traffic] = await Promise.all([
				loadSiteActions(client, scope.period, scope.section, 0),
				operation === 'site_counts' ? loadSiteTraffic(scope.period, deps.env.CLOUDFLARE_ACCOUNT_ID, deps.env.CLOUDFLARE_ANALYTICS_TOKEN, deps.fetch, {cache: siteTrafficCache}) : Promise.resolve(null)
			]);
			evidence.site = {actions, traffic};
		} else if (operation === 'album_age' || (operation === 'report_coverage' && scope.kind === 'launch')) {
			const albumKey = questionAlbumKey(scope);
			if (albumKey) evidence.launch = await fetchLaunchReadModel(client, {albumKey, days: LAUNCH_DAYS, traffic: 'conservative', publicOnly: true, photoLimit: 1});
		} else if (operation === 'report_coverage' && scope.kind === 'gallery') {
			const report = await fetchScheduledGalleryReport(client, scope.query, {publicOnly: true, includeToday: false, photoWindow: {page: 0, pageSize: 1, rank: 'popular'}});
			evidence.gallery = {coverage: report.coverage, total: report.total, observedTotal: report.observedTotal, dataAsOf: report.dataAsOf};
		}
	} catch {
		// A failed read supplies no counts; the answer must not turn the failure into zero.
	}
	return evidence;
}
