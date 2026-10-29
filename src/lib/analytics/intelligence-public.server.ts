import type { SupabaseClient } from '@supabase/supabase-js';
import { GALLERY_LAUNCH_SCOPE, intelligenceScopeKey, launchScope, parseIntelligenceScope, type Finding, type IntelligenceScope, type IntelligenceSuppression } from './intelligence-contract';
import { findingSeverity } from './intelligence-rules';
import { openFindings, type LifecycleRow, type SettleAction } from './intelligence-lifecycle';

/**
 * What a visitor or the owner may see of a saved snapshot, read with the service role. It has no session or
 * environment import, so the same code is unit-tested against a fake client. The store builds on it.
 */

const safeObject = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const safeArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const safeInstant = (value: unknown): string | null => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

/** Decodes one stored finding; anything malformed is dropped, never repaired into a claim. */
export function decodeFinding(value: unknown): Finding | null {
	const row = safeObject(value); const target = safeObject(row?.target); const evidence = safeObject(row?.evidence);
	if (!row || !target || !evidence || typeof row.id !== 'string' || typeof row.rule !== 'string' || typeof row.title !== 'string' || typeof row.explanation !== 'string' || typeof row.action !== 'string' || typeof row.reportHref !== 'string' || !['gallery', 'album', 'photo', 'site', 'page'].includes(String(target.kind))) return null;
	return { ...row, severity: ['high','medium','low'].includes(String(row.severity)) ? row.severity : findingSeverity(row.rule,row.id), target: { kind: target.kind as Finding['target']['kind'], id: typeof target.id === 'string' ? target.id : null, albumKey: typeof target.albumKey === 'string' ? target.albumKey : null }, evidence: evidence as unknown as Finding['evidence'], status: 'open', ...(Array.isArray(row.evidenceLinks) ? { evidenceLinks: row.evidenceLinks.filter((link): link is string => typeof link === 'string' && link.startsWith('/')).slice(0, 6) } : {}) } as Finding;
}

/** The public projection: only findings and suppressions whose album or photo is still public, and still where the finding says. */
export async function allowedTargets(client: SupabaseClient, scope: IntelligenceScope, findings: Finding[], suppressions: IntelligenceSuppression[]) {
	const requestedAlbums = scope.kind === 'gallery' ? scope.query.albumKeys : scope.kind === 'launch' && scope.albumKey ? [scope.albumKey] : [];
	const albumKeys = [...new Set([...requestedAlbums, ...findings.map((finding) => finding.target.kind === 'album' ? finding.target.albumKey ?? finding.target.id : finding.target.albumKey).filter((key): key is string => !!key), ...suppressions.map((item) => item.target?.kind === 'album' ? item.target.albumKey ?? item.target.id : item.target?.albumKey).filter((key): key is string => !!key)])];
	const photoIds = [...new Set([...findings, ...suppressions].flatMap((item) => item.target?.kind === 'photo' && item.target.id ? [item.target.id] : []))];
	const photosResult = photoIds.length ? await client.from('photo_metadata').select('photo_id, album_key').in('photo_id', photoIds) : { data: [] as Array<{ photo_id: string; album_key: string }>, error: null };
	if (photosResult.error) throw new Error('public target lookup unavailable');
	for (const photo of photosResult.data ?? []) if (photo.album_key && !albumKeys.includes(photo.album_key)) albumKeys.push(photo.album_key);
	const [albumsResult, settingsResult] = await Promise.all([
		albumKeys.length ? client.from('albums').select('album_key').in('album_key', albumKeys) : Promise.resolve({ data: [] as Array<{ album_key: string }>, error: null }),
		albumKeys.length ? client.from('album_settings').select('album_key, visibility').in('album_key', albumKeys) : Promise.resolve({ data: [] as Array<{ album_key: string; visibility: string | null }>, error: null })
	]);
	if (albumsResult.error || settingsResult.error || photosResult.error) throw new Error('public target lookup unavailable');
	const albums = new Set((albumsResult.data ?? []).map((row) => row.album_key));
	const hidden = new Set((settingsResult.data ?? []).filter((row) => row.visibility === 'unlisted').map((row) => row.album_key));
	const publicAlbum = (key: string | null | undefined) => !!key && albums.has(key) && !hidden.has(key);
	if (requestedAlbums.some((key) => !publicAlbum(key))) throw new Error('intelligence report unavailable');
	const photos = new Map((photosResult.data ?? []).map((row) => [row.photo_id, row.album_key]));
	const visible = (target: Finding['target'] | undefined) => {
		if (!target || target.kind === 'gallery' || target.kind === 'site' || target.kind === 'page') return true;
		if (target.kind === 'album') return publicAlbum(target.albumKey ?? target.id);
		return !!target.id && publicAlbum(photos.get(target.id)) && (!target.albumKey || target.albumKey === photos.get(target.id));
	};
	return { findings: findings.filter((finding) => visible(finding.target)).map((finding) => ({ ...finding, evidenceLinks: (finding.evidenceLinks ?? []).filter((link) => !link.startsWith('/photo/') || finding.target.kind === 'photo') })), suppressions: suppressions.filter((item) => visible(item.target)) };
}

/**
 * Launch findings no owner has dismissed or snoozed. A launch finding can be dismissed from Home (the gallery-wide
 * scope) or from its album report (the album scope); both count, wherever it is shown.
 */
async function unsettledLaunchFindings(client: SupabaseClient, findings: Finding[], now: Date): Promise<Finding[]> {
	if (!findings.length) return findings;
	const albums = [...new Set(findings.map((finding) => finding.target.albumKey).filter((key): key is string => !!key))];
	const keys = [intelligenceScopeKey(GALLERY_LAUNCH_SCOPE), ...albums.map((key) => intelligenceScopeKey(launchScope(key)))];
	const ids = findings.map((finding) => finding.id);
	const [rows, actions] = await Promise.all([
		client.from('analytics_intelligence_finding_lifecycle').select('owner_id, finding_id, status, snoozed_until').in('scope_key', keys).in('finding_id', ids),
		client.from('analytics_intelligence_actions').select('owner_id, finding_id, target_context, created_at').in('scope_key', keys).in('finding_id', ids).in('kind', ['dismiss', 'snooze']).order('created_at', { ascending: false }).limit(200)
	]);
	// A failed lifecycle read shows nothing rather than findings the owner may have dismissed; the caller logs it.
	if (rows.error || actions.error) throw new Error('finding lifecycle unavailable');
	return openFindings(findings, safeArray<LifecycleRow>(rows.data), safeArray<SettleAction>(actions.data), now, true);
}

/**
 * The current findings for a scope, as the inline surfaces show them: decoded, still public, and for launch
 * scopes not dismissed or snoozed. Throws 'intelligence report unavailable' when there is no snapshot, or when the
 * scope's own album is no longer public.
 */
export async function loadPublicFindings(client: SupabaseClient, scope: IntelligenceScope, now = new Date()): Promise<{ findings: Finding[]; checkedAt: string | null; generatedAt: string }> {
	const checked = parseIntelligenceScope(scope); if (!checked) throw new Error('invalid intelligence scope');
	const scopeKey = intelligenceScopeKey(checked);
	const { data, error } = await client.from('analytics_intelligence_snapshot_current').select('updated_at, snapshot:analytics_intelligence_snapshots(snapshot_id, scope_key, generated_at, findings)').eq('scope_key', scopeKey).maybeSingle();
	const row = safeObject(data); const snapshot = safeObject(row?.snapshot);
	if (error || !snapshot || snapshot.scope_key !== scopeKey || typeof snapshot.generated_at !== 'string') throw new Error('intelligence report unavailable');
	const decoded = safeArray(snapshot.findings).map(decodeFinding).filter((item): item is Finding => !!item);
	const visible = (await allowedTargets(client, checked, decoded, [])).findings;
	const findings = checked.kind === 'launch' ? await unsettledLaunchFindings(client, visible, now) : visible;
	return { findings, checkedAt: safeInstant(row?.updated_at), generatedAt: snapshot.generated_at };
}
