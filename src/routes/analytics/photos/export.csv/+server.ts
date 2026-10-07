import { error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { buildOperatorReport, reportCsv } from '$lib/analytics/operator-report.server';
import { readAll } from '$lib/analytics/read-all.server';
import { parseReportQuery } from '$lib/analytics/report-contract';
import { fetchV2ReportProjection, unavailableV2ReportProjection } from '$lib/analytics/v2-report-projection.server';
import type { RequestHandler } from './$types';

/**
 * The photo view's CSV, and the album report's: the same file for the same query. Public albums only, for
 * everyone. A report that cannot be built is a 503, never a file with zeros in it.
 */
export const GET: RequestHandler = async ({ url }) => {
	const query = parseReportQuery(url.searchParams);
	const admin = createSupabaseAdminClient();
	let report;
	try {
		report = await buildOperatorReport(admin, query, { publicOnly: true, rangeMode: 'export', includeDiagnostics: false, includeToday: false, cacheRole: 'service_role' });
	} catch (cause) {
		if (cause instanceof RangeError) throw error(400, cause.message);
		throw cause;
	}
	if (!report.available) throw error(503, report.error ?? 'Analytics report unavailable');
	const [settings, albums] = await Promise.all([
		readAll<{ album_key: string; visibility: string | null }>((from) => admin.from('album_settings').select('album_key, visibility').order('album_key').range(from, from + 999)),
		readAll<{ album_key: string }>((from) => admin.from('albums').select('album_key').order('album_key').range(from, from + 999))
	]);
	const visibility = new Map(settings.data.map((setting) => [setting.album_key, setting.visibility]));
	const v2 = settings.error || albums.error
		? unavailableV2ReportProjection(query)
		: await fetchV2ReportProjection(admin, query, { publicAlbumKeys: albums.data.filter((album) => visibility.get(album.album_key) !== 'unlisted').map((album) => album.album_key) });
	const shortlist = url.searchParams.has('shortlist')
		? new Set((url.searchParams.get('shortlist') ?? '').split(',').filter(Boolean))
		: undefined;
	return new Response(reportCsv(report, shortlist, v2), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="gallery-analytics-${report.query.start}-to-${report.query.end}.csv"`,
			'cache-control': 'private, no-store, max-age=0',
			pragma: 'no-cache',
			'x-robots-tag': 'noindex, nofollow, noarchive'
		}
	});
};
