import {
	REPORT_MEASURES,
	rowMatchesMeasure,
	type DailyActionRow,
	type MeasureTotals,
	type ReportMeasure
} from './report-contract';

export type PhotoRank = 'popular' | 'rising' | 'recent';

export interface PhotoWindow {
	page: number;
	pageSize: number;
	rank: PhotoRank;
}

export interface AggregatedGroup {
	key: string;
	count: number;
	lastActivity: string | null;
	publicationAt: string | null;
}

export interface GalleryAggregation {
	currentAlbums: Map<string, AggregatedGroup>;
	previousAlbums: Map<string, AggregatedGroup>;
	currentPhotos: Map<string, AggregatedGroup>;
	previousPhotos: Map<string, AggregatedGroup>;
	currentAlbumOnly: Map<string, AggregatedGroup>;
	previousAlbumOnly: Map<string, AggregatedGroup>;
	albumMeasures: Map<string, MeasureTotals>;
	photoMeasures: Map<string, MeasureTotals>;
}

export const photoGroupKey = (row: Pick<DailyActionRow, 'photo_id' | 'album_key'>) => `${row.photo_id}\u0000${row.album_key}`;

export function emptyMeasureTotals(value: number | null = 0): MeasureTotals {
	return { photo_opens: value, album_opens: value, downloads: value, favorites: value, shares: value };
}

function updateGroup(groups: Map<string, AggregatedGroup>, key: string, row: DailyActionRow): void {
	if (!key) return;
	const group = groups.get(key) ?? { key, count: 0, lastActivity: null, publicationAt: null };
	group.count += Number(row.action_count);
	const activity = row.latest_event_at ?? row.bucket_date;
	group.lastActivity = !group.lastActivity || activity > group.lastActivity ? activity : group.lastActivity;
	group.publicationAt ||= row.publication_at ?? null;
	groups.set(key, group);
}

function updateMeasures(groups: Map<string, MeasureTotals>, key: string, row: DailyActionRow): void {
	if (!key) return;
	const totals = groups.get(key) ?? emptyMeasureTotals();
	for (const measure of REPORT_MEASURES) {
		if (rowMatchesMeasure(row, measure)) {
			totals[measure] = (totals[measure] ?? 0) + Number(row.action_count);
			break;
		}
	}
	groups.set(key, totals);
}

/** Aggregate each evidence row once for album and photo ranking/measure lookups. */
export function aggregateGalleryRows(
	currentRows: readonly DailyActionRow[],
	previousRows: readonly DailyActionRow[],
	measure: ReportMeasure
): GalleryAggregation {
	const result: GalleryAggregation = {
		currentAlbums: new Map(), previousAlbums: new Map(), currentPhotos: new Map(), previousPhotos: new Map(),
		currentAlbumOnly: new Map(), previousAlbumOnly: new Map(), albumMeasures: new Map(), photoMeasures: new Map()
	};
	for (const row of currentRows) {
		updateMeasures(result.albumMeasures, row.album_key, row);
		if (row.photo_id) updateMeasures(result.photoMeasures, photoGroupKey(row), row);
		if (!rowMatchesMeasure(row, measure)) continue;
		updateGroup(result.currentAlbums, row.album_key, row);
		if (row.photo_id) updateGroup(result.currentPhotos, photoGroupKey(row), row);
		else updateGroup(result.currentAlbumOnly, row.album_key, row);
	}
	for (const row of previousRows) {
		if (!rowMatchesMeasure(row, measure)) continue;
		updateGroup(result.previousAlbums, row.album_key, row);
		if (row.photo_id) updateGroup(result.previousPhotos, photoGroupKey(row), row);
		else updateGroup(result.previousAlbumOnly, row.album_key, row);
	}
	return result;
}

export function normalizePhotoWindow(window: PhotoWindow, total: number): PhotoWindow & { pageCount: number } {
	const pageSize = Math.max(0, Math.min(100, Math.trunc(window.pageSize)));
	const pageCount = pageSize === 0 || total === 0 ? 0 : Math.ceil(total / pageSize);
	const page = pageCount === 0 ? 0 : Math.max(0, Math.min(Math.trunc(window.page), pageCount - 1));
	return { page, pageSize, pageCount, rank: window.rank };
}

export function rankAndWindowPhotos<T extends { photoId: string; albumKey: string; count: number | null; risingValue: number | null; lastActivity: string | null }>(
	photos: readonly T[],
	window: PhotoWindow
): { photos: T[]; pagination: PhotoWindow & { total: number; pageCount: number } } {
	const sorted = [...photos].sort((a, b) => {
		const missing = -Number.MAX_SAFE_INTEGER;
		const primary = window.rank === 'recent'
			? (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')
			: window.rank === 'rising'
				? (b.risingValue ?? missing) - (a.risingValue ?? missing)
				: (b.count ?? missing) - (a.count ?? missing);
		if (!Number.isNaN(primary) && primary !== 0) return primary;
		const count = (b.count ?? missing) - (a.count ?? missing);
		return count || a.photoId.localeCompare(b.photoId) || a.albumKey.localeCompare(b.albumKey);
	});
	const normalized = normalizePhotoWindow(window, sorted.length);
	const start = normalized.page * normalized.pageSize;
	return {
		photos: normalized.pageSize === 0 ? [] : sorted.slice(start, start + normalized.pageSize),
		pagination: { ...normalized, total: sorted.length }
	};
}
