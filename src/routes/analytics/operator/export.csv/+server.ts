import { error } from '@sveltejs/kit';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { buildOperatorReport, reportCsv } from '$lib/analytics/operator-report.server';
import { parseReportQuery } from '$lib/analytics/report-contract';
import { fetchV2ReportProjection, unavailableV2ReportProjection } from '$lib/analytics/v2-report-projection.server';
import type { RequestHandler } from './$types';

async function readAll<T>(page: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
	const data: T[] = [];
	for (let from = 0; ; from += 1000) {
		const result = await page(from);
		if (result.error) return { data: [] as T[], error: result.error };
		data.push(...(result.data ?? []));
		if ((result.data ?? []).length < 1000) return { data, error: null };
	}
}

export const GET: RequestHandler = async ({ cookies, url, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		'pragma': 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const { data: { user } } = await createSupabaseServerClient(cookies).auth.getUser();
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
		readAll<{ album_key: string; sport: string | null; event_date: string | null }>((from) => admin.from('albums').select('album_key, sport, event_date').order('album_key').range(from, from + 999))
	]);
	const settingsByAlbum = new Map(settings.data.map((setting) => [setting.album_key, setting.visibility]));
	const publicAlbums = albums.data.filter((album) => settingsByAlbum.get(album.album_key) !== 'unlisted');
	const v2 = settings.error || albums.error
		? unavailableV2ReportProjection(query)
		: await fetchV2ReportProjection(admin, query, {
			publicAlbumKeys: publicAlbums.map((album) => album.album_key)
		});
	const shortlist = url.searchParams.has('shortlist')
		? new Set((url.searchParams.get('shortlist') ?? '').split(',').filter(Boolean))
		: undefined;
	return new Response(reportCsv(report, shortlist, v2), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="gallery-analytics-${report.query.start}-to-${report.query.end}.csv"`,
			'cache-control': 'private, no-store, max-age=0',
			'x-robots-tag': 'noindex, nofollow, noarchive'
		}
	});
};
