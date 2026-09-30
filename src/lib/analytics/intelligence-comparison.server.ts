import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceScope } from './intelligence-contract';

export type AlbumFact = { album_key: string; sport: string | null; event_type: string | null; event_date: string | null; division: string | null; level: string | null; visibility?: string | null };
export type AlbumComparison = { available: boolean; criteria: string[]; comparableAlbumKeys: string[]; excluded: { missingKnownFacts: number; hidden: number; nonMatching: number }; reason?: string };

/** Pure known-fact comparator. It never infers a team, date, or sport. */
export function comparableAlbums(target: AlbumFact | null, candidates: AlbumFact[]): AlbumComparison {
	if (!target || !target.sport || !target.event_type) return { available: false, criteria: [], comparableAlbumKeys: [], excluded: { missingKnownFacts: 0, hidden: 0, nonMatching: 0 }, reason: 'The selected album lacks the known sport or event type needed for a comparison.' };
	const criteria = [`sport = ${target.sport}`, `event type = ${target.event_type}`];
	if (target.division) criteria.push(`division = ${target.division}`); if (target.level) criteria.push(`level = ${target.level}`); if (target.event_date) criteria.push(`event year = ${target.event_date.slice(0, 4)}`);
	let hidden = 0; let missingKnownFacts = 0; let nonMatching = 0;
	const comparableAlbumKeys = candidates.filter((candidate) => {
		if (candidate.album_key === target.album_key) return false;
		if (candidate.visibility === 'unlisted') { hidden += 1; return false; }
		if (!candidate.sport || !candidate.event_type) { missingKnownFacts += 1; return false; }
		const match = candidate.sport === target.sport && candidate.event_type === target.event_type
			&& (!target.division || candidate.division === target.division) && (!target.level || candidate.level === target.level)
			&& (!target.event_date || candidate.event_date?.slice(0, 4) === target.event_date.slice(0, 4));
		if (!match) nonMatching += 1;
		return match;
	}).map((candidate) => candidate.album_key).sort().slice(0, 25);
	return { available: comparableAlbumKeys.length > 0, criteria, comparableAlbumKeys, excluded: { missingKnownFacts, hidden, nonMatching }, ...(comparableAlbumKeys.length ? {} : { reason: 'No public albums match every available known comparison fact.' }) };
}

export async function calculateAlbumComparison(client: SupabaseClient, scope: IntelligenceScope): Promise<AlbumComparison> {
	if (scope.kind !== 'gallery' || scope.query.albumKeys.length !== 1) return { available: false, criteria: [], comparableAlbumKeys: [], excluded: { missingKnownFacts: 0, hidden: 0, nonMatching: 0 }, reason: 'Album comparison requires one selected album in the stored scope.' };
	const [albums, settings] = await Promise.all([client.from('albums').select('album_key, sport, event_type, event_date, division, level'), client.from('album_settings').select('album_key, visibility')]);
	if (albums.error || settings.error) throw new Error('album catalogue unavailable');
	const visibility = new Map((settings.data ?? []).map((row) => [row.album_key, row.visibility]));
	const facts = (albums.data ?? []).map((row) => ({ ...row, visibility: visibility.get(row.album_key) ?? null }));
	return comparableAlbums(facts.find((row) => row.album_key === scope.query.albumKeys[0]) ?? null, facts);
}
