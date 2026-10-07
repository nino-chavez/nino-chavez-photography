import type { DatedLaunchAlbum, Launch, LaunchAgeTotals, LaunchDay, LaunchPhoto, LaunchReadModel } from './launch-read-model.server';

/*
 * Fixtures follow production on 2026-10-06 (read-only analytics_read_launch, conservative traffic): the
 * daily photo opens of the seven launches, Chicago days from first publication. Re7kho (HS Girls VB - JCA
 * at ACC, inferred first publication Sep 25 Chicago) opened 103 575 126 23 98 1 5 in week 1.
 */
export const D = {
	fJKdsB: [749, 369, 49, 8, 61, 11, 11, 4, 3, 2, 1, 2, 1, 0],
	Re7kho: [103, 575, 126, 23, 98, 1, 5, 80, 5, 2, 1, 1, 3, 2],
	dKe567: [8, 5, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
	Big: [150, 300, 90, 40, 30, 15, 11, 2, 2, 0, 0, 0, 0, 0],
	DWdCET: [90, 106, 40, 12, 9, 6, 3, 2, 1, 0, 0, 0, 0, 0],
	Bump: [60, 30, 15, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0],
	jq1Rp7: [2, 3, 4, 5, 12, 6, 5, 1, 1, 0, 0, 0, 0, 0]
} as const;
// First publication, Chicago day 0 (a UTC instant that is already the next UTC day for Re7kho, on purpose).
export const START: Record<keyof typeof D, string> = {
	fJKdsB: '2026-08-28', dKe567: '2026-08-25', Big: '2026-09-05', Bump: '2026-08-22', jq1Rp7: '2026-07-19', DWdCET: '2026-09-26', Re7kho: '2026-09-25'
};
export const NAMES: Record<keyof typeof D, string> = {
	fJKdsB: 'HS Girls VB - JCA vs PNHS - 08-25-2026', Re7kho: 'HS Girls VB - JCA at ACC - 09-22-2026', dKe567: 'Fall Showcase', Big: 'Chicago Big Dig 2026',
	DWdCET: 'Millikin at North Central', Bump: 'Bump Bash #5', jq1Rp7: 'Summer Open'
};

export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const day = (start: string, i: number, opens: number | null, over: Partial<LaunchDay> = {}): LaunchDay => ({
	day: i, date: addDays(start, i), photoOpens: opens, downloads: opens === null ? null : Math.round(opens / 10), albumOpens: opens === null ? null : 1, coverage: opens === null ? 'unavailable' : 'complete', ...over
});
export const rankOf = (value: number | null, all: Array<number | null>) => {
	const have = all.filter((v): v is number => v !== null);
	if (value === null) return { rank: null, compared: have.length, tied: false };
	return { rank: 1 + have.filter((v) => v > value).length, compared: have.length, tied: have.filter((v) => v === value).length > 1 };
};
export const sum = (a: readonly number[], n: number) => a.slice(0, n).reduce((x, y) => x + y, 0);

export interface Shape { key: keyof typeof D; asOfDay: string; cut?: Record<number, Partial<LaunchDay>>; }
export function seriesFor(shape: Shape): { series: LaunchDay[]; currentDay: LaunchDay | null; elapsed: number } {
	const start = START[shape.key];
	const elapsed = Math.max(0, Math.round((Date.parse(`${shape.asOfDay}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000));
	const complete = Math.min(14, elapsed);
	const series = D[shape.key].slice(0, complete).map((opens, i) => day(start, i, opens, shape.cut?.[i]));
	return { series, currentDay: elapsed < 14 ? day(start, elapsed, 4, { coverage: 'partial' }) : null, elapsed };
}
export function totalsAt(series: LaunchDay[], n: number): LaunchAgeTotals {
	const reached = series.length >= n;
	const slice = series.slice(0, n);
	const complete = reached && slice.every((d) => d.coverage === 'complete');
	return { reached, complete, photoOpens: complete ? slice.reduce((s, d) => s + (d.photoOpens as number), 0) : null, downloads: complete ? 1 : null, albumOpens: complete ? 1 : null };
}
export function model(album: Shape, others: Array<Shape>, extras: Partial<DatedLaunchAlbum> = {}, asOf = '2026-10-06'): LaunchReadModel {
	const all = [album, ...others].filter((s, i, a) => a.findIndex((t) => t.key === s.key) === i);
	const built = all.map((shape) => {
		const { series, currentDay, elapsed } = seriesFor(shape);
		return { shape, series, currentDay, elapsed, totals: { day3: totalsAt(series, 3), day7: totalsAt(series, 7) } };
	});
	const d3 = built.map((b) => b.totals.day3.photoOpens);
	const d7 = built.map((b) => b.totals.day7.photoOpens);
	const launches: Launch[] = built.map((b) => ({
		albumKey: b.shape.key, albumName: NAMES[b.shape.key], firstPublishedAt: `${addDays(START[b.shape.key], 0)}T20:10:00-05:00`, basis: (b.shape.key === 'Re7kho' || b.shape.key === 'fJKdsB' ? 'inferred' : 'recorded') as 'inferred' | 'recorded',
		status: (b.elapsed >= 7 ? 'finished' : 'in_progress') as 'finished' | 'in_progress', elapsedDays: b.elapsed, series: b.series, currentDay: b.currentDay, totals: b.totals,
		rank: { day3: rankOf(b.totals.day3.photoOpens, d3), day7: rankOf(b.totals.day7.photoOpens, d7) }
	})).sort((x, y) => Date.parse(y.firstPublishedAt) - Date.parse(x.firstPublishedAt));
	const mine = launches.find((l) => l.albumKey === album.key) as Launch;
	const albumExtras = {
		firstPublishedAtEvidence: null, reason: null as null, window: { start: mine.series[0]?.date ?? START[album.key], end: mine.series.at(-1)?.date ?? START[album.key] },
		photosInAlbum: 4, photosWithActivity: 4, photos: photos(), exposure: { since: '2026-09-29', coverage: 'partial' as const }, ...extras
	};
	return { asOf: `${asOf}T18:00:00.000Z`, today: asOf, lastCompleteDay: addDays(asOf, -1), days: 14, traffic: 'conservative', album: { ...mine, ...albumExtras }, launches };
}
export function photos(downloads: number[] = [3, 2, 1, 0], opens: number[] = [11, 10, 9, 8]): LaunchPhoto[] {
	return downloads.map((d, i) => ({ photoId: `p${i + 1}`, opens: opens[i], downloads: d, favorites: 0, exposureRecorded: true, opensInExposureWindow: 2, exposures: 5, renders: 5 }));
}

export const ALL: Shape[] = (['fJKdsB', 'Re7kho', 'dKe567', 'Big', 'Bump', 'jq1Rp7', 'DWdCET'] as const).map((key) => ({ key, asOfDay: '2026-10-06' }));
export const shape = (key: keyof typeof D, asOfDay = '2026-10-06', cut?: Shape['cut']): Shape => ({ key, asOfDay, cut });

