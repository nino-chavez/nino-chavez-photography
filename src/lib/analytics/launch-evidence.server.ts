import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLaunchReadModel, fetchLaunches, type Launch, type LaunchList, type LaunchReadModel } from './launch-read-model.server';
import { chicagoDate } from './launch-recap';
import { chicagoWallTimeToUtc } from './launch-recap-schedule';
import { FAILURE_WINDOW_DAYS, LAUNCH_FINDING_DAYS, type LaunchEvidence, type LaunchFailureEvidence, type LaunchFocus, type LaunchPeer, type LaunchPhotoEvidence } from './launch-rules';

/**
 * Reads what the launch rules need, for one album's launch or for every recent launch, as of an instant.
 *
 * Every read is bounded and read-only: the launch list (one call), one launch read for an album scope, and
 * four head-only counts per launch spoken about. No row of raw events is returned to this process, and nothing
 * this builds holds a visitor, browser, visit or event identifier. The same function serves the scheduled
 * refresh and the replay of past dates, so a replay runs exactly the code the scheduler runs.
 */

export interface FailureCounts { photoLoads: number; photoLoadFailures: number; downloadRequests: number; downloadFailures: number }

export interface LaunchEvidenceLoaders {
	launches?: (client: SupabaseClient, asOf: Date) => Promise<LaunchList>;
	album?: (client: SupabaseClient, albumKey: string, asOf: Date) => Promise<LaunchReadModel>;
	/** First Chicago day any photo-load or download result was recorded; null when none ever was. */
	recordedSince?: (client: SupabaseClient) => Promise<string | null>;
	failureCounts?: (client: SupabaseClient, albumKey: string, start: string, end: string) => Promise<FailureCounts>;
	/** Photo ids currently listed in the album: in it, and processed. */
	listedPhotos?: (client: SupabaseClient, albumKey: string) => Promise<Set<string>>;
}

const OUTCOME_EVENTS = ['photo_rendered', 'photo_load_failed', 'download_requested', 'download_failed'] as const;

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

async function readLaunches(client: SupabaseClient, asOf: Date): Promise<LaunchList> {
	return fetchLaunches(client, { asOf, days: LAUNCH_FINDING_DAYS, traffic: 'conservative', publicOnly: true });
}

async function readAlbum(client: SupabaseClient, albumKey: string, asOf: Date): Promise<LaunchReadModel> {
	return fetchLaunchReadModel(client, { albumKey, asOf, days: LAUNCH_FINDING_DAYS, traffic: 'conservative', publicOnly: true, photoLimit: 2000 });
}

async function readRecordedSince(client: SupabaseClient): Promise<string | null> {
	const { data, error } = await client.from('analytics_events_v2').select('occurred_at').in('event_name', [...OUTCOME_EVENTS]).order('occurred_at', { ascending: true }).limit(1);
	if (error) throw new Error('failure recording start unavailable');
	const first = data?.[0]?.occurred_at;
	return typeof first === 'string' ? chicagoDate(first) : null;
}

/**
 * Head-only counts: the database returns a number, never a row. Version-2 collection labels each event with the
 * traffic context it arrived with; 'audience' is the conservative choice. Later classification corrections are
 * not applied here, and the finding says so.
 */
async function readFailureCounts(client: SupabaseClient, albumKey: string, start: string, end: string): Promise<FailureCounts> {
	const count = async (names: readonly string[]) => {
		const { count: n, error } = await client.from('analytics_events_v2').select('event_name', { count: 'exact', head: true })
			.eq('album_key', albumKey).in('event_name', [...names]).eq('traffic_context', 'audience').gte('occurred_at', start).lt('occurred_at', end);
		if (error || typeof n !== 'number') throw new Error('failure counts unavailable');
		return n;
	};
	const [photoLoads, photoLoadFailures, downloadRequests, downloadFailures] = await Promise.all([
		count(['photo_rendered', 'photo_load_failed']), count(['photo_load_failed']), count(['download_requested']), count(['download_failed'])
	]);
	return { photoLoads, photoLoadFailures, downloadRequests, downloadFailures };
}

async function readListedPhotos(client: SupabaseClient, albumKey: string): Promise<Set<string>> {
	const ids = new Set<string>();
	for (let from = 0; from < 5000; from += 1000) {
		const { data, error } = await client.from('photo_metadata').select('photo_id').eq('album_key', albumKey).not('sharpness', 'is', null).order('photo_id').range(from, from + 999);
		if (error) throw new Error('album photos unavailable');
		for (const row of data ?? []) ids.add(String(row.photo_id));
		if ((data ?? []).length < 1000) break;
	}
	return ids;
}

/** The Chicago days a launch's failures are counted over: its first week, from when results were recorded, complete days only. */
export function failureWindow(firstPublishedAt: string, recordedSince: string | null, today: string): { start: string; end: string } | null {
	if (!recordedSince) return null;
	const day0 = chicagoDate(firstPublishedAt);
	const start = recordedSince > day0 ? recordedSince : day0;
	const weekEnd = addDays(day0, FAILURE_WINDOW_DAYS - 1);
	const lastComplete = addDays(today, -1);
	const end = weekEnd < lastComplete ? weekEnd : lastComplete;
	return start <= end ? { start, end } : null;
}

function peer(launch: Launch): LaunchPeer {
	return {
		albumKey: launch.albumKey, firstPublishedAt: launch.firstPublishedAt,
		day3: launch.totals.day3.complete ? launch.totals.day3.photoOpens : null,
		day7: launch.totals.day7.complete ? launch.totals.day7.photoOpens : null
	};
}

function focus(launch: Launch, failures: LaunchFailureEvidence | null): LaunchFocus {
	const age = (totals: Launch['totals']['day3']) => ({ complete: totals.complete, photoOpens: totals.photoOpens, downloads: totals.downloads });
	return {
		albumKey: launch.albumKey, albumName: launch.albumName, firstPublishedAt: launch.firstPublishedAt, basis: launch.basis, elapsedDays: launch.elapsedDays,
		series: launch.series.slice(0, LAUNCH_FINDING_DAYS).map((day) => ({ day: day.day ?? 0, date: day.date, photoOpens: day.photoOpens, downloads: day.downloads, coverage: day.coverage })),
		day3: age(launch.totals.day3), day7: age(launch.totals.day7), failures
	};
}

export async function loadLaunchEvidence(client: SupabaseClient, albumKey: string | null, asOf: Date, loaders: LaunchEvidenceLoaders = {}): Promise<LaunchEvidence> {
	const list = await (loaders.launches ?? readLaunches)(client, asOf);
	// The launch list has no as-of filter on publication: a past as-of still returns albums first published later,
	// with empty series. They had not launched yet, so they are neither compared with nor spoken about.
	const launched = list.launches.filter((launch) => Date.parse(launch.firstPublishedAt) <= asOf.getTime());
	const spoken = albumKey ? launched.filter((launch) => launch.albumKey === albumKey) : launched.filter((launch) => launch.elapsedDays <= LAUNCH_FINDING_DAYS);

	let since: string | null | undefined;
	const sinceOnce = async () => (since === undefined ? (since = await (loaders.recordedSince ?? readRecordedSince)(client)) : since);
	const focused: LaunchFocus[] = [];
	for (const launch of spoken) {
		let failures: LaunchFailureEvidence | null = null;
		if (launch.elapsedDays <= LAUNCH_FINDING_DAYS) {
			try {
				const recordedSince = await sinceOnce();
				const window = failureWindow(launch.firstPublishedAt, recordedSince, list.today);
				const counts = window
					? await (loaders.failureCounts ?? readFailureCounts)(client, launch.albumKey, chicagoWallTimeToUtc(window.start, 0, 0), chicagoWallTimeToUtc(addDays(window.end, 1), 0, 0))
					: { photoLoads: 0, photoLoadFailures: 0, downloadRequests: 0, downloadFailures: 0 };
				failures = { recordedSince, window, ...counts };
			} catch {
				failures = null;
			}
		}
		focused.push(focus(launch, failures));
	}

	let photos: LaunchPhotoEvidence | null | undefined;
	const target = albumKey ? focused[0] : undefined;
	if (target && target.elapsedDays <= LAUNCH_FINDING_DAYS) {
		try {
			const [model, listed] = await Promise.all([(loaders.album ?? readAlbum)(client, target.albumKey, asOf), (loaders.listedPhotos ?? readListedPhotos)(client, target.albumKey)]);
			if (model.album.albumKey !== target.albumKey) throw new Error('launch read returned another album');
			// A photo moved to another album, hidden, or not yet processed is not named, even when it has counts.
			photos = {
				exposureSince: model.album.exposure.since, exposureCoverage: model.album.exposure.coverage, window: model.album.window,
				photos: model.album.photos.filter((photo) => photo.exposureRecorded && listed.has(photo.photoId)).map((photo) => ({ photoId: photo.photoId, exposures: photo.exposures ?? 0, opensInExposureWindow: photo.opensInExposureWindow ?? 0 }))
			};
		} catch {
			photos = null;
		}
	}

	return {
		asOf: list.asOf, today: list.today, lastCompleteDay: list.lastCompleteDay, albumKey,
		peers: launched.map(peer), focus: focused, ...(albumKey ? { photos: photos ?? null } : {})
	};
}
