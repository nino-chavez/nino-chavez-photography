import { error } from '@sveltejs/kit';
import { requireOperator } from '$lib/analytics/operator-session.server';
import { addSharingNote, deleteSharingNote, loadSharingNotes, updateSharingNote } from '$lib/analytics/sharing-notes.server';
import { loadIntelligencePanelMode, loadVisibleFindings } from '$lib/analytics/intelligence-panel.server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { fetchLaunchReadModel, type LaunchReadModel } from '$lib/analytics/launch-read-model.server';
import { buildRecap, recoveredDates } from '$lib/analytics/launch-recap';
import { albumQuery, LAUNCH_DAYS, readArrivals, readPhotoRows, readStoredRecap, readStoredRecaps } from '$lib/analytics/launch-recap.server';
import { recapRows } from '$lib/analytics/launch-recap-list';
import { buildRecapView } from '$lib/analytics/launch-recap-view';
import { isRecapCheckpoint } from '$lib/analytics/launch-recap-schedule';
import { cumulativeCurves, dailyChart, gridPhotos, launchTable } from '$lib/analytics/launch-report-view';
import { isAlbumKey } from '$lib/analytics/album-key';
import { intelligenceScopeKey, launchScope } from '$lib/analytics/intelligence-contract';
import { LAUNCH_FINDING_DAYS } from '$lib/analytics/launch-rules';
import { findingsCheck } from '$lib/analytics/home';
import type { Actions, PageServerLoad } from './$types';

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

	// Same rule as every report: an unlisted album is visible only to the signed-in owner. The
	// launch function returns the requested album even when it is unlisted, so the gate is here.
	const { data: setting, error: settingError } = await admin.from('album_settings').select('visibility').eq('album_key', albumKey).maybeSingle();
	if (settingError) throw error(503, 'Album visibility could not be verified.');
	if (!user && setting?.visibility === 'unlisted') throw error(404, 'Album not found');

	// One recap on its own page. The address is what a stored recap and an email link to; it shows that recap and nothing of the report.
	// It comes after the visibility check above, so an unlisted album shows nothing here either, and it reads no photo, arrival, finding or note.
	const recapAsked = url.searchParams.get('recap');
	const recapOnly = url.searchParams.has('recap');

	let model: LaunchReadModel;
	try {
		model = await fetchLaunchReadModel(admin, { albumKey, days: LAUNCH_DAYS, traffic: 'conservative', publicOnly: true, photoLimit: recapOnly ? 1 : 2000 });
	} catch (cause) {
		if (cause instanceof Error && cause.message.startsWith('Unknown album')) throw error(404, 'Album not found');
		console.error('[album launch report] unavailable:', cause instanceof Error ? cause.message : cause);
		throw error(503, 'The launch report could not be built. No number is shown rather than a wrong one.');
	}

	if (recapOnly) {
		const checkpoint = Number(recapAsked);
		const storedRecaps = await readStoredRecaps(admin, albumKey);
		const open = isRecapCheckpoint(checkpoint) && storedRecaps?.some((stored) => stored.checkpoint === checkpoint) ? await readStoredRecap(admin, albumKey, checkpoint) : null;
		return {
			mode: 'recap' as const,
			albumKey,
			recapView: buildRecapView({
				albumKey, albumName: model.album.albumName ?? albumKey, launch: model.album.status === 'no_launch_date' ? null : model.album,
				now: new Date(model.asOf), asked: recapAsked, stored: storedRecaps, open, owner: !!user
			})
		};
	}

	let photoRows: Awaited<ReturnType<typeof readPhotoRows>>;
	try {
		photoRows = await readPhotoRows(admin, albumKey);
	} catch (cause) {
		console.error('[album launch report] photos unavailable:', cause instanceof Error ? cause.message : cause);
		throw error(503, 'The album photos could not be read.');
	}

	const query = albumQuery(model);
	// Tagged arrivals are not part of the launch read model. They come from the scheduled gallery report.
	const { arrivals } = await readArrivals(admin, model);

	const album = model.album;
	// Launch findings for this album sit above the photo grid. Same rule as the panel: none, or none still public,
	// shows nothing. A launch past its finding window has none to show, whatever an old snapshot holds.
	const inWindow = album.status !== 'no_launch_date' && album.elapsedDays <= LAUNCH_FINDING_DAYS;
	const [launchFindings, intelligence, sharing] = await Promise.all([
		inWindow ? loadVisibleFindings(admin, launchScope(albumKey), 'album launch report') : Promise.resolve({ findings: [], checkedAt: null }),
		// The record form and assistant below keep their own scope: this album over the days its numbers cover.
		loadIntelligencePanelMode(admin, intelligenceScopeKey({ kind: 'gallery', query }), !!user, 'album launch report'),
		// The owner's private notes on where this album was shared. A visitor is never offered them.
		user ? loadSharingNotes(admin, albumKey, user.id) : Promise.resolve(null)
	]);

	// Recaps: what is stored. Each opens on its own page (`?recap=3`, `?recap=7`).
	const storedRecaps = await readStoredRecaps(admin, albumKey);
	const recapRowList = album.status === 'no_launch_date' ? null : recapRows({ launch: album, now: new Date(model.asOf), stored: storedRecaps, owner: !!user });

	const photoIds = new Set(photoRows.map((row) => row.photoId));
	// One note per page explains the recovered dates it shows (this album's and the comparison table's), and when every one is recovered it is said once in words with no mark.
	const table = launchTable(model);
	const recovered = recoveredDates([...(album.status !== 'no_launch_date' ? [album.basis === 'inferred'] : []), ...table.map((row) => row.inferred)]);
	const recap = buildRecap({ model, arrivals, photoIds, markRecovered: recovered.mark });
	const photos = gridPhotos(photoRows, album.photos, album.exposure.coverage !== 'none');

	return {
		mode: 'report' as const,
		user: user ? { id: user.id, email: user.email } : null,
		intelligenceOwner: !!user,
		intelligence,
		sharing,
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
		recovered,
		// Nothing to list (an album with no launch date, or a visitor and no recap yet) means no section at all.
		recaps: recapRowList && recapRowList.length ? { rows: recapRowList } : null,
		photos,
		charts: { daily: dailyChart(model), curves: cumulativeCurves(model), table },
		query
	};
};

/** The owner's sharing notes for this album. Each write is scoped to the album in the address and to the owner. */
export const actions: Actions = {
	addNote: async ({ params, cookies, request }) => addSharingNote(createSupabaseAdminClient(), params.albumKey, (await requireOperator(cookies)).id, await request.formData()),
	updateNote: async ({ params, cookies, request }) => updateSharingNote(createSupabaseAdminClient(), params.albumKey, (await requireOperator(cookies)).id, await request.formData()),
	deleteNote: async ({ params, cookies, request }) => deleteSharingNote(createSupabaseAdminClient(), params.albumKey, (await requireOperator(cookies)).id, await request.formData())
};
