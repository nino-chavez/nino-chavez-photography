import { error } from '@sveltejs/kit';
import { loadIntelligencePanelMode, loadVisibleFindings } from '$lib/analytics/intelligence-panel.server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { buildOperatorReport } from '$lib/analytics/operator-report.server';
import { parseReportQuery, type ReportQuery } from '$lib/analytics/report-contract';
import { fetchLaunchReadModel, type LaunchReadModel } from '$lib/analytics/launch-read-model.server';
import { buildRecap, type ArrivalRow } from '$lib/analytics/launch-recap';
import { cumulativeCurves, dailyChart, gridPhotos, launchTable } from '$lib/analytics/launch-report-view';
import { isAlbumKey } from '$lib/analytics/report-paths';
import { intelligenceScopeKey, launchScope } from '$lib/analytics/intelligence-contract';
import { LAUNCH_FINDING_DAYS } from '$lib/analytics/launch-rules';
import { findingsCheck } from '$lib/analytics/home';
import type { PageServerLoad } from './$types';

/** The window every report on this page covers: the launch's first two weeks, as the read model returns them. */
const LAUNCH_DAYS = 14;

async function readPhotoRows(admin: ReturnType<typeof createSupabaseAdminClient>, albumKey: string) {
	// Photos with no sharpness are unprocessed and are never listed, here or in the gallery.
	const rows: Array<{ photoId: string; cfImageId: string | null }> = [];
	for (let from = 0; from < 5000; from += 1000) {
		const { data, error: readError } = await admin
			.from('photo_metadata')
			.select('photo_id, cf_image_id')
			.eq('album_key', albumKey)
			.not('sharpness', 'is', null)
			.order('photo_id')
			.range(from, from + 999);
		if (readError) throw readError;
		rows.push(...(data ?? []).map((row) => ({ photoId: String(row.photo_id), cfImageId: typeof row.cf_image_id === 'string' && row.cf_image_id ? row.cf_image_id : null })));
		if ((data ?? []).length < 1000) break;
	}
	return rows;
}

/** The report query behind this page's CSV export, assistant and arrivals: this album over the days its numbers cover. */
function albumQuery(model: LaunchReadModel): ReportQuery {
	const album = model.album;
	const params = new URLSearchParams({ period: 'custom', scope: 'album', albums: album.albumKey, measure: 'photo_opens', traffic: 'conservative', compare: 'none' });
	const first = album.series[0]?.date;
	const last = album.series.at(-1)?.date;
	if (first && last) {
		params.set('start', first);
		params.set('end', last);
	}
	return parseReportQuery(params);
}

export const load: PageServerLoad = async ({ params, cookies, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		pragma: 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const albumKey = params.albumKey;
	if (!isAlbumKey(albumKey)) throw error(404, 'Album not found');

	const { data: { user: signedInUser } } = await createSupabaseServerClient(cookies).auth.getUser();
	const user = signedInUser && isAllowedAdmin(signedInUser.email) ? signedInUser : null;
	const admin = createSupabaseAdminClient();

	// Same rule as the operator report: an unlisted album is visible only to the signed-in owner. The
	// launch function returns the requested album even when it is unlisted, so the gate is here.
	const { data: setting, error: settingError } = await admin.from('album_settings').select('visibility').eq('album_key', albumKey).maybeSingle();
	if (settingError) throw error(503, 'Album visibility could not be verified.');
	if (!user && setting?.visibility === 'unlisted') throw error(404, 'Album not found');

	let model: LaunchReadModel;
	try {
		model = await fetchLaunchReadModel(admin, { albumKey, days: LAUNCH_DAYS, traffic: 'conservative', publicOnly: true, photoLimit: 2000 });
	} catch (cause) {
		if (cause instanceof Error && cause.message.startsWith('Unknown album')) throw error(404, 'Album not found');
		console.error('[album launch report] unavailable:', cause instanceof Error ? cause.message : cause);
		throw error(503, 'The launch report could not be built. No number is shown rather than a wrong one.');
	}

	let photoRows: Awaited<ReturnType<typeof readPhotoRows>>;
	try {
		photoRows = await readPhotoRows(admin, albumKey);
	} catch (cause) {
		console.error('[album launch report] photos unavailable:', cause instanceof Error ? cause.message : cause);
		throw error(503, 'The album photos could not be read.');
	}

	const query = albumQuery(model);
	// Tagged arrivals are not part of the launch read model. They come from the report the operator page uses.
	let arrivals: ArrivalRow[] | null = null;
	if (model.album.series.length > 0) {
		try {
			const report = await buildOperatorReport(admin, query, {
				publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role'
			});
			arrivals = report.available ? report.sources.arrivals : null;
		} catch (cause) {
			console.error('[album launch report] arrivals unavailable:', cause instanceof Error ? cause.message : cause);
		}
	}

	const album = model.album;
	// Launch findings for this album sit above the photo grid. Same rule as the panel: none, or none still public,
	// shows nothing. A launch past its finding window has none to show, whatever an old snapshot holds.
	const inWindow = album.status !== 'no_launch_date' && album.elapsedDays <= LAUNCH_FINDING_DAYS;
	const [launchFindings, intelligence] = await Promise.all([
		inWindow ? loadVisibleFindings(admin, launchScope(albumKey), 'album launch report') : Promise.resolve({ findings: [], checkedAt: null }),
		// The record form and assistant below keep their own scope: this album over the days its numbers cover.
		loadIntelligencePanelMode(admin, intelligenceScopeKey({ kind: 'gallery', query }), !!user, 'album launch report')
	]);

	const photoIds = new Set(photoRows.map((row) => row.photoId));
	const recap = buildRecap({ model, arrivals, photoIds });
	const photos = gridPhotos(photoRows, album.photos, album.exposure.coverage !== 'none');

	return {
		user: user ? { id: user.id, email: user.email } : null,
		intelligenceOwner: !!user,
		intelligence,
		findings: { findings: launchFindings.findings, checked: launchFindings.findings.length ? findingsCheck(launchFindings.checkedAt, new Date().toISOString(), model.today) : null },
		album: {
			key: album.albumKey,
			name: album.albumName ?? album.albumKey,
			status: album.status,
			reasonCode: album.status === 'no_launch_date' ? album.reason.code : null,
			elapsedDays: album.status === 'no_launch_date' ? null : album.elapsedDays,
			exposure: album.exposure,
			window: album.window,
			asOf: model.asOf,
			today: model.today
		},
		recap,
		photos,
		charts: { daily: dailyChart(model), curves: cumulativeCurves(model), table: launchTable(model) },
		query
	};
};
