import { error } from '@sveltejs/kit';
import { loadIntelligencePanelMode, loadVisibleFindings } from '$lib/analytics/intelligence-panel.server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { fetchLaunchReadModel, type LaunchReadModel } from '$lib/analytics/launch-read-model.server';
import { buildRecap } from '$lib/analytics/launch-recap';
import { albumQuery, LAUNCH_DAYS, readArrivals, readPhotoRows, readStoredRecap, readStoredRecaps } from '$lib/analytics/launch-recap.server';
import { recapRows } from '$lib/analytics/launch-recap-list';
import { recapBlocks, recapTitle } from '$lib/analytics/launch-recap-text';
import { isRecapCheckpoint, type RecapCheckpoint } from '$lib/analytics/launch-recap-schedule';
import { cumulativeCurves, dailyChart, gridPhotos, launchTable } from '$lib/analytics/launch-report-view';
import { isAlbumKey } from '$lib/analytics/report-paths';
import { intelligenceScopeKey, launchScope } from '$lib/analytics/intelligence-contract';
import { LAUNCH_FINDING_DAYS } from '$lib/analytics/launch-rules';
import { findingsCheck } from '$lib/analytics/home';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, setHeaders, url }) => {
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
	const { arrivals } = await readArrivals(admin, model);

	const album = model.album;
	// Launch findings for this album sit above the photo grid. Same rule as the panel: none, or none still public,
	// shows nothing. A launch past its finding window has none to show, whatever an old snapshot holds.
	const inWindow = album.status !== 'no_launch_date' && album.elapsedDays <= LAUNCH_FINDING_DAYS;
	const [launchFindings, intelligence] = await Promise.all([
		inWindow ? loadVisibleFindings(admin, launchScope(albumKey), 'album launch report') : Promise.resolve({ findings: [], checkedAt: null }),
		// The record form and assistant below keep their own scope: this album over the days its numbers cover.
		loadIntelligencePanelMode(admin, intelligenceScopeKey({ kind: 'gallery', query }), !!user, 'album launch report')
	]);

	// Recaps: what is stored, and the one the reader opened with ?recap=3 or ?recap=7.
	const asked = Number(url.searchParams.get('recap'));
	const openCheckpoint: RecapCheckpoint | null = isRecapCheckpoint(asked) ? asked : null;
	const storedRecaps = await readStoredRecaps(admin, albumKey);
	const openRecap = openCheckpoint !== null && storedRecaps?.some((stored) => stored.checkpoint === openCheckpoint) ? await readStoredRecap(admin, albumKey, openCheckpoint) : null;
	const recapRowList = album.status === 'no_launch_date' ? null : recapRows({ launch: album, now: new Date(model.asOf), stored: storedRecaps, owner: !!user });

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
		// Nothing to list (an album with no launch date, or a visitor and no recap yet) means no section at all.
		recaps: recapRowList && (recapRowList.length || openCheckpoint !== null) ? {
			rows: recapRowList,
			open: openRecap ? {
				title: recapTitle(openRecap.checkpoint), subject: openRecap.subject,
				flags: [...(openRecap.source === 'backfill' ? ['Written later from the records'] : openRecap.late ? ['Late'] : []), ...(openRecap.evidence === 'partial' ? ['Some records were incomplete'] : openRecap.evidence === 'unavailable' ? ['Could not be built'] : [])],
				// The page links to the full report itself, so the plain-text address line is left out.
				blocks: recapBlocks(openRecap.body).filter((block) => !(block.kind === 'paragraph' && block.text.startsWith('Full report: ')))
			} : null,
			openMissing: openCheckpoint !== null && !openRecap ? openCheckpoint : null
		} : null,
		photos,
		charts: { daily: dailyChart(model), curves: cumulativeCurves(model), table: launchTable(model) },
		query
	};
};
