import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { INTELLIGENCE_PAGE_SIZE, INTELLIGENCE_RULE_VERSION, intelligenceScopeKey, parseIntelligenceScope, type Finding, type IntelligenceAction, type IntelligenceReport, type IntelligenceScope, type IntelligenceSuppression } from './intelligence-contract';
import { evaluateIntelligenceRules, privateFollowUp, type IntelligenceRuleInput } from './intelligence-rules';
import { loadIntelligenceEvidence, type IntelligenceJourneyContext } from './intelligence-source.server';
import { answerIntelligenceQuestion } from './intelligence-assistant';

type SnapshotRow = { snapshot_id: string; scope_key: string; scope: unknown; generated_at: string; cutoff_at: string | null; coverage: IntelligenceReport['coverage']; findings: unknown; suppressions: unknown; evidence: unknown };
type LifecycleRow = { finding_id: string; status: IntelligenceAction['kind'] | 'open'; snoozed_until: string | null };
const safeArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const safeObject = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const safeInstant = (value: unknown): string | null => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const FOLLOW_UP_DAYS = 14;

export async function intelligenceOwner(cookies: Cookies): Promise<{ owner: boolean; userId: string | null }> {
	const client = createSupabaseServerClient(cookies);
	const { data: { user } } = await client.auth.getUser();
	return { owner: !!user && isAllowedAdmin(user.email), userId: user?.id ?? null };
}

function decodeInput(value: unknown, scope: IntelligenceScope): IntelligenceRuleInput | null {
	const row = safeObject(value); if (!row || parseIntelligenceScope(row.scope) === null) return null;
	const coverage = row.coverage;
	if (!['complete', 'partial', 'unavailable'].includes(String(coverage)) || typeof row.generatedAt !== 'string' || !safeInstant(row.generatedAt)) return null;
	return { ...row, scope, coverage: coverage as IntelligenceReport['coverage'], previousCoverage: ['complete', 'partial', 'unavailable'].includes(String(row.previousCoverage)) ? row.previousCoverage as IntelligenceReport['coverage'] : null, generatedAt: row.generatedAt, cutoff: safeInstant(row.cutoff), current: typeof row.current === 'number' ? row.current : null, previous: typeof row.previous === 'number' ? row.previous : null } as IntelligenceRuleInput;
}
function decodeFinding(value: unknown): Finding | null {
	const row = safeObject(value); const target = safeObject(row?.target); const evidence = safeObject(row?.evidence);
	if (!row || !target || !evidence || typeof row.id !== 'string' || typeof row.rule !== 'string' || typeof row.title !== 'string' || typeof row.explanation !== 'string' || typeof row.action !== 'string' || typeof row.reportHref !== 'string' || !['gallery', 'album', 'photo', 'site', 'page'].includes(String(target.kind))) return null;
	return { ...row, target: { kind: target.kind as Finding['target']['kind'], id: typeof target.id === 'string' ? target.id : null, albumKey: typeof target.albumKey === 'string' ? target.albumKey : null }, evidence: evidence as unknown as Finding['evidence'], status: 'open', ...(Array.isArray(row.evidenceLinks) ? { evidenceLinks: row.evidenceLinks.filter((link): link is string => typeof link === 'string' && link.startsWith('/')).slice(0, 6) } : {}) } as Finding;
}
function decodeSuppression(value: unknown): IntelligenceSuppression | null {
	const row = safeObject(value); if (!row || typeof row.rule !== 'string' || typeof row.reason !== 'string') return null;
	const target = safeObject(row.target);
	return { rule: row.rule, reason: row.reason, ...(target && ['gallery', 'album', 'photo', 'site', 'page'].includes(String(target.kind)) ? { target: { kind: target.kind as Finding['target']['kind'], id: typeof target.id === 'string' ? target.id : null, albumKey: typeof target.albumKey === 'string' ? target.albumKey : null } } : {}) };
}

async function allowedTargets(client: SupabaseClient, scope: IntelligenceScope, findings: Finding[], suppressions: IntelligenceSuppression[]) {
	const requestedAlbums = scope.kind === 'gallery' ? scope.query.albumKeys : [];
	const albumKeys = [...new Set([...requestedAlbums, ...findings.map((finding) => finding.target.kind === 'album' ? finding.target.id : finding.target.albumKey).filter((key): key is string => !!key), ...suppressions.map((item) => item.target?.kind === 'album' ? item.target.id : item.target?.albumKey).filter((key): key is string => !!key)])];
	const photoIds = [...new Set([...findings, ...suppressions].flatMap((item) => item.target?.kind === 'photo' && item.target.id ? [item.target.id] : []))];
	const [albumsResult, settingsResult, photosResult] = await Promise.all([
		albumKeys.length ? client.from('albums').select('album_key').in('album_key', albumKeys) : Promise.resolve({ data: [] as Array<{ album_key: string }> }),
		albumKeys.length ? client.from('album_settings').select('album_key, visibility').in('album_key', albumKeys) : Promise.resolve({ data: [] as Array<{ album_key: string; visibility: string | null }> }),
		photoIds.length ? client.from('photo_metadata').select('photo_id, album_key').in('photo_id', photoIds) : Promise.resolve({ data: [] as Array<{ photo_id: string; album_key: string }> })
	]);
	const albums = new Set((albumsResult.data ?? []).map((row) => row.album_key));
	const hidden = new Set((settingsResult.data ?? []).filter((row) => row.visibility === 'unlisted').map((row) => row.album_key));
	const publicAlbum = (key: string | null | undefined) => !!key && albums.has(key) && !hidden.has(key);
	if (requestedAlbums.some((key) => !publicAlbum(key))) throw new Error('intelligence report unavailable');
	const photos = new Map((photosResult.data ?? []).map((row) => [row.photo_id, row.album_key]));
	const visible = (target: Finding['target'] | undefined) => {
		if (!target || target.kind === 'gallery' || target.kind === 'site' || target.kind === 'page') return true;
		if (target.kind === 'album') return publicAlbum(target.id);
		return !!target.id && publicAlbum(photos.get(target.id)) && (!target.albumKey || target.albumKey === photos.get(target.id));
	};
	return { findings: findings.filter((finding) => visible(finding.target)).map((finding) => ({ ...finding, evidenceLinks: (finding.evidenceLinks ?? []).filter((link) => !link.startsWith('/photo/') || finding.target.kind === 'photo') })), suppressions: suppressions.filter((item) => visible(item.target)) };
}

export async function refreshIntelligence(client: SupabaseClient, scope: IntelligenceScope, options: { ownerId?: string; now?: Date; journeys?: IntelligenceJourneyContext } = {}): Promise<IntelligenceReport> {
	const checked = parseIntelligenceScope(scope); if (!checked) throw new Error('invalid intelligence scope');
	const now = options.now ?? new Date();
	const evidence = await loadIntelligenceEvidence(client, checked, now, options.journeys);
	const evaluated = evaluateIntelligenceRules(evidence);
	const scopeKey = intelligenceScopeKey(checked);
	const { data: inserted, error: insertError } = await client.from('analytics_intelligence_snapshots').insert({
		scope_key: scopeKey, scope: checked, generated_at: evidence.generatedAt, cutoff_at: evidence.cutoff, coverage: evidence.coverage,
		findings: evaluated.findings, suppressions: evaluated.suppressions, evidence, rule_version: INTELLIGENCE_RULE_VERSION
	}).select('snapshot_id').single();
	if (insertError || !inserted || !uuid(inserted.snapshot_id)) throw new Error('intelligence snapshot storage unavailable');
	const { error: pointerError } = await client.from('analytics_intelligence_snapshot_current').upsert({ scope_key: scopeKey, snapshot_id: inserted.snapshot_id, updated_at: now.toISOString() }, { onConflict: 'scope_key' });
	if (pointerError) throw new Error('intelligence snapshot pointer unavailable');
	return loadIntelligence(client, checked, { ownerId: options.ownerId, page: 0 });
}

export async function loadIntelligence(client: SupabaseClient, scope: IntelligenceScope, options: { ownerId?: string; page?: number; snapshotId?: string } = {}): Promise<IntelligenceReport> {
	const checked = parseIntelligenceScope(scope); if (!checked) throw new Error('invalid intelligence scope');
	const page = Math.max(0, Math.min(1000, Math.floor(options.page ?? 0)));
	const scopeKey = intelligenceScopeKey(checked);
	const selected = options.snapshotId
		? await client.from('analytics_intelligence_snapshots').select('snapshot_id, scope_key, scope, generated_at, cutoff_at, coverage, findings, suppressions, evidence').eq('snapshot_id', options.snapshotId).eq('scope_key', scopeKey).maybeSingle()
		: await client.from('analytics_intelligence_snapshot_current').select('snapshot:analytics_intelligence_snapshots(snapshot_id, scope_key, scope, generated_at, cutoff_at, coverage, findings, suppressions, evidence)').eq('scope_key', scopeKey).maybeSingle();
	const { error } = selected;
	const snapshot = (options.snapshotId ? safeObject(selected.data) : safeObject(safeObject(selected.data)?.snapshot)) as SnapshotRow | null;
	if (error || !snapshot || snapshot.scope_key !== scopeKey || !uuid(snapshot.snapshot_id) || parseIntelligenceScope(snapshot.scope) === null) throw new Error('intelligence report unavailable');
	const allFindings = safeArray(snapshot.findings).map(decodeFinding).filter((item): item is Finding => !!item);
	const allSuppressions = safeArray(snapshot.suppressions).map(decodeSuppression).filter((item): item is IntelligenceSuppression => !!item);
	const visible: { findings: Finding[]; suppressions: IntelligenceSuppression[] } = await allowedTargets(client, checked, allFindings, allSuppressions);
	let actions: IntelligenceAction[] = []; let briefs: IntelligenceReport['briefs'] = [];
	if (options.ownerId) {
		const [{ data: actionRows }, { data: briefRows }, { data: lifecycleRows }] = await Promise.all([
			client.from('analytics_intelligence_actions').select('id, kind, finding_id, target, actual_at, hypothesis, primary_measure, follow_up_at, note, created_at, reverses_action_id').eq('owner_id', options.ownerId).eq('scope_key', scopeKey).order('created_at', { ascending: false }).limit(100),
			client.from('analytics_intelligence_briefs').select('id, period_key, kind, created_at, body, findings, snapshot_ids').eq('owner_id', options.ownerId).order('created_at', { ascending: false }).limit(30),
			client.from('analytics_intelligence_finding_lifecycle').select('finding_id, status, snoozed_until').eq('owner_id', options.ownerId).eq('scope_key', scopeKey)
		]);
		actions = safeArray<Record<string, unknown>>(actionRows).flatMap((row) => uuid(row.id) && ['record', 'dismiss', 'snooze', 'undo'].includes(String(row.kind)) ? [{ id: row.id, kind: row.kind as IntelligenceAction['kind'], findingId: typeof row.finding_id === 'string' ? row.finding_id : null, target: safeObject(row.target) as IntelligenceAction['target'], actualAt: safeInstant(row.actual_at), hypothesis: typeof row.hypothesis === 'string' ? row.hypothesis : null, primaryMeasure: typeof row.primary_measure === 'string' ? row.primary_measure : null, followUpAt: safeInstant(row.follow_up_at), note: typeof row.note === 'string' ? row.note : null, createdAt: String(row.created_at), actionId: uuid(row.reverses_action_id) ? row.reverses_action_id : null } as IntelligenceAction] : []);
		briefs = safeArray<Record<string, unknown>>(briefRows).flatMap((row) => uuid(row.id) && typeof row.period_key === 'string' && ['daily', 'weekly', 'operational'].includes(String(row.kind)) ? [{ id: row.id, periodKey: row.period_key, kind: row.kind as IntelligenceReport['briefs'][number]['kind'], createdAt: String(row.created_at), ...(typeof row.body === 'string' ? { body: row.body } : {}), ...(Array.isArray(row.findings) ? { findings: row.findings.map(decodeFinding).filter((item): item is Finding => !!item) } : {}), ...(Array.isArray(row.snapshot_ids) ? { snapshotIds: row.snapshot_ids.filter((id): id is string => uuid(id)) } : {}) }] : []);
		const lifecycle = new Map(safeArray<LifecycleRow>(lifecycleRows).map((row) => [row.finding_id, row]));
		for (const finding of visible.findings) {
			const row = lifecycle.get(finding.id);
			if (row && (row.status === 'dismiss' || row.status === 'snooze') && (!row.snoozed_until || Date.parse(row.snoozed_until) > Date.now())) finding.status = row.status === 'dismiss' ? 'dismissed' : 'snoozed';
		}
		const input = decodeInput(snapshot.evidence, checked);
		if (input) {
			const followUp = privateFollowUp(input, actions);
			if (followUp) visible.findings.push(...evaluateIntelligenceRules({ ...input, followUp }).findings.filter((finding) => finding.rule === 'follow_up'));
		}
	}
	const pageCount = Math.max(1, Math.ceil(visible.findings.length / INTELLIGENCE_PAGE_SIZE));
	const currentPage = Math.min(page, pageCount - 1);
	return { snapshotId: snapshot.snapshot_id, scope: checked, generatedAt: snapshot.generated_at, cutoff: snapshot.cutoff_at, coverage: snapshot.coverage, findings: visible.findings.slice(currentPage * INTELLIGENCE_PAGE_SIZE, (currentPage + 1) * INTELLIGENCE_PAGE_SIZE), suppressions: visible.suppressions, actions, briefs, page: currentPage, pageCount, owner: !!options.ownerId };
}

export async function recordIntelligenceAction(client: SupabaseClient, ownerId: string, scope: IntelligenceScope, action: Omit<IntelligenceAction, 'id' | 'createdAt' | 'followUpAt'> & { actionId?: string | null }): Promise<IntelligenceAction> {
	const checked = parseIntelligenceScope(scope); if (!checked || !uuid(ownerId)) throw new Error('invalid intelligence action');
	const scopeKey = intelligenceScopeKey(checked);
	const report = await loadIntelligence(client, checked, { ownerId, page: 0 });
	const finding = action.findingId ? report.findings.find((item) => item.id === action.findingId) : undefined;
	if (action.kind !== 'undo' && !finding) throw new Error('finding is not in the owner scope');
	if (action.kind === 'undo' && (!action.actionId || !uuid(action.actionId))) throw new Error('undo requires an owned action');
	if (action.kind === 'record' && (!action.actualAt || !action.hypothesis || !action.primaryMeasure)) throw new Error('record requires action context');
	const actualAt = action.kind === 'record' ? safeInstant(action.actualAt) : null;
	if (action.kind === 'record' && !actualAt) throw new Error('invalid action time');
	const followUpAt = actualAt ? new Date(Date.parse(actualAt) + FOLLOW_UP_DAYS * 86_400_000).toISOString() : null;
	const { data, error } = await client.rpc('analytics_record_intelligence_action', {
		p_owner_id: ownerId, p_scope_key: scopeKey, p_kind: action.kind, p_finding_id: action.kind === 'undo' ? null : finding?.id ?? null,
		p_target: action.kind === 'undo' ? null : finding?.target ?? null, p_actual_at: actualAt, p_hypothesis: action.hypothesis ?? null,
		p_primary_measure: action.primaryMeasure ?? null, p_follow_up_at: followUpAt, p_note: action.note ?? null, p_reverses_action_id: action.actionId ?? null,
		p_change_type: action.changeType ?? null, p_channel: action.channel ?? null, p_campaign: action.campaign ?? null, p_release: action.release ?? null,
		p_variant: action.variant ?? null, p_outcome: action.outcome ?? null, p_observation_days: action.observationDays ?? FOLLOW_UP_DAYS,
		p_target_context: { target: action.kind === 'undo' ? null : finding?.target ?? null, scope: checked }
	}).single();
	const row = safeObject(data);
	if (error || !row || !uuid(row.id)) throw new Error('intelligence action storage unavailable');
	return { id: row.id, kind: row.kind as IntelligenceAction['kind'], findingId: typeof row.finding_id === 'string' ? row.finding_id : null, target: safeObject(row.target) as IntelligenceAction['target'], actualAt: safeInstant(row.actual_at), hypothesis: typeof row.hypothesis === 'string' ? row.hypothesis : null, primaryMeasure: typeof row.primary_measure === 'string' ? row.primary_measure : null, followUpAt: safeInstant(row.follow_up_at), note: typeof row.note === 'string' ? row.note : null, createdAt: String(row.created_at) };
}

export async function createIntelligenceRequest(client: SupabaseClient, ownerId: string, scope: IntelligenceScope, operation: string): Promise<string> {
	const checked = parseIntelligenceScope(scope); if (!checked || !uuid(ownerId) || !['album_comparison', 'site_retention'].includes(operation)) throw new Error('invalid intelligence request');
	const report = await loadIntelligence(client, checked, { ownerId, page: 0 });
	if (!report.snapshotId) throw new Error('intelligence request snapshot unavailable');
	const scopeKey = intelligenceScopeKey(checked);
	const active = await client.from('analytics_intelligence_requests').select('id').eq('owner_id', ownerId).eq('scope_key', scopeKey).eq('operation', operation).in('status', ['pending', 'leased']).maybeSingle();
	if (active.data && uuid(active.data.id)) return active.data.id;
	const inserted = await client.from('analytics_intelligence_requests').insert({ owner_id: ownerId, scope_key: scopeKey, operation, status: 'pending', report_id: report.snapshotId, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }).select('id').single();
	if (inserted.error || !inserted.data || !uuid(inserted.data.id)) {
		const raced = await client.from('analytics_intelligence_requests').select('id').eq('owner_id', ownerId).eq('scope_key', scopeKey).eq('operation', operation).in('status', ['pending', 'leased']).maybeSingle();
		if (raced.data && uuid(raced.data.id)) return raced.data.id;
		throw new Error('intelligence request storage unavailable');
	}
	return inserted.data.id;
}

export async function loadIntelligenceRequest(client: SupabaseClient, ownerId: string, scope: IntelligenceScope, requestId: string): Promise<{ status: 'pending' | 'complete' | 'unavailable'; answer: unknown | null }> {
	if (!uuid(ownerId) || !uuid(requestId)) throw new Error('intelligence request unavailable');
	const { data, error } = await client.from('analytics_intelligence_requests').select('status, answer, scope_key, operation, report_id').eq('id', requestId).eq('owner_id', ownerId).eq('scope_key', intelligenceScopeKey(scope)).maybeSingle();
	if (error || !data) throw new Error('intelligence request unavailable');
	if (data.status !== 'complete') return { status: data.status === 'pending' || data.status === 'leased' ? 'pending' : 'unavailable', answer: null };
	if (data.operation !== 'album_comparison' && data.operation !== 'site_retention') return { status: 'unavailable', answer: null };
	if (!uuid(data.report_id)) return { status: 'unavailable', answer: null };
	const report = await loadIntelligence(client, scope, { ownerId, page: 0, snapshotId: data.report_id });
	const question = data.operation === 'album_comparison' ? 'Compare this album with the stored comparable evidence' : 'Where are readers or demo visitors losing interest?';
	const answer = answerIntelligenceQuestion(scope, question, report, requestId);
	const stored = safeObject(data.answer);
	return { status: 'complete', answer: stored?.comparison ? { ...answer, comparison: stored.comparison } : answer };
}
