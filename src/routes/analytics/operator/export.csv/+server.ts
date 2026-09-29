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
	const report = await buildOperatorReport(admin, query, { publicOnly: true });
	if (!report.available) throw error(503, report.error ?? 'Analytics report unavailable');
	const [settings, albums, categories] = await Promise.all([
		readAll<{ album_key: string; visibility: string | null }>((from) => admin.from('album_settings').select('album_key, visibility').order('album_key').range(from, from + 999)),
		readAll<{ album_key: string; sport: string | null; event_date: string | null }>((from) => admin.from('albums').select('album_key, sport, event_date').order('album_key').range(from, from + 999)),
		query.category
			? readAll<{ photo_id: string; photo_category: string | null }>((from) => admin.from('photo_metadata').select('photo_id, photo_category').eq('photo_category', query.category!).order('photo_id').range(from, from + 999))
			: Promise.resolve({ data: [] as Array<{ photo_id: string; photo_category: string | null }>, error: null })
	]);
	const settingsByAlbum = new Map(settings.data.map((setting) => [setting.album_key, setting.visibility]));
	const publicAlbums = albums.data.filter((album) => settingsByAlbum.get(album.album_key) !== 'unlisted');
	const publicScopedAlbumKeys = publicAlbums.filter((album) =>
		(query.scope === 'all' || query.albumKeys.includes(album.album_key))
		&& (!query.sport || (album.sport ?? 'unknown') === query.sport)
		&& (!query.eventDate || album.event_date === query.eventDate)
		&& (!query.season || (album.event_date?.slice(0, 4) ?? 'unknown') === query.season)
	).map((album) => album.album_key);
	const v2 = settings.error || albums.error || categories.error
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
