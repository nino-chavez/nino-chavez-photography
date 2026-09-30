import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { INTELLIGENCE_PAGE_SIZE, INTELLIGENCE_RULE_VERSION, intelligenceScopeKey, parseIntelligenceScope, type Finding, type IntelligenceAction, type IntelligenceReport, type IntelligenceScope, type IntelligenceSuppression } from './intelligence-contract';
import { evaluateIntelligenceRules, type IntelligenceRuleInput } from './intelligence-rules';
import { loadIntelligenceEvidence, type IntelligenceJourneyContext } from './intelligence-source.server';
import { answerIntelligenceQuestion } from './intelligence-assistant';
import { projectAlbumComparison } from './intelligence-comparison.server';
import { loadLatestIntelligenceOutcomes } from './intelligence-private-controls.server';
import { loadPersistedActionFollowUp } from './intelligence-followup.server';

type SnapshotRow = { snapshot_id: string; scope_key: string; scope: unknown; generated_at: string; cutoff_at: string | null; coverage: IntelligenceReport['coverage']; findings: unknown; suppressions: unknown; evidence: unknown };
type LifecycleRow = { finding_id: string; status: IntelligenceAction['kind'] | 'open'; snoozed_until: string | null };
const safeArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const safeObject = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const safeInstant = (value: unknown): string | null => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const ACTION_PAGE_SIZE = 20;

export async function intelligenceOwner(cookies: Cookies): Promise<{ owner: boolean; userId: string | null }> {
	const client = createSupabaseServerClient(cookies);
	const { data: { user } } = await client.auth.getUser();
	return { owner: !!user && isAllowedAdmin(user.email), userId: user?.id ?? null };
}

/** Private history is opt-in. An absent row is deliberately still undecided. */
export async function retentionChosen(client: SupabaseClient, ownerId: string): Promise<boolean> {
	const { data, error } = await client.from('analytics_intelligence_preferences').select('retention_policy').eq('owner_id', ownerId).maybeSingle();
	return !error && data?.retention_policy !== 'undecided' && typeof data?.retention_policy === 'string';
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
function decodeAction(row: Record<string, unknown>): IntelligenceAction | null {
	const createdAt = safeInstant(row.created_at);
	if (!uuid(row.id) || !['record', 'dismiss', 'snooze', 'undo'].includes(String(row.kind)) || !createdAt) return null;
	const outcomeCount = typeof row.outcome_count === 'number' && Number.isSafeInteger(row.outcome_count) && row.outcome_count >= 0 ? row.outcome_count : null;
	return {
		id: row.id, kind: row.kind as IntelligenceAction['kind'], findingId: typeof row.finding_id === 'string' ? row.finding_id : null,
		target: safeObject(row.target) as IntelligenceAction['target'], actualAt: safeInstant(row.actual_at), hypothesis: typeof row.hypothesis === 'string' ? row.hypothesis : null,
		primaryMeasure: typeof row.primary_measure === 'string' ? row.primary_measure : null, changeType: typeof row.change_type === 'string' ? row.change_type as IntelligenceAction['changeType'] : null,
		channel: typeof row.channel === 'string' ? row.channel : null, campaign: typeof row.campaign === 'string' ? row.campaign : null,
		release: typeof row.release === 'string' ? row.release : null, variant: typeof row.variant === 'string' ? row.variant : null,
		outcome: typeof row.outcome === 'string' ? row.outcome as IntelligenceAction['outcome'] : null, outcomeCount,
		observationDays: typeof row.observation_days === 'number' && Number.isSafeInteger(row.observation_days) ? row.observation_days : null,
		followUpAt: safeInstant(row.follow_up_at), note: typeof row.note === 'string' ? row.note : null, createdAt,
		actionId: uuid(row.reverses_action_id) ? row.reverses_action_id : null
	};
}

async function allowedTargets(client: SupabaseClient, scope: IntelligenceScope, findings: Finding[], suppressions: IntelligenceSuppression[]) {
	const requestedAlbums = scope.kind === 'gallery' ? scope.query.albumKeys : [];
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

async function resolvePublicTarget(client: SupabaseClient, scope: IntelligenceScope, target: IntelligenceAction['target'] | undefined | null): Promise<NonNullable<IntelligenceAction['target']>> {
	const candidate = target ?? (scope.kind === 'gallery' ? { kind: 'gallery' as const } : { kind: 'site' as const });
	if (!targetMatchesScope(candidate, scope)) throw new Error('public action target does not match report');
	const visible = await allowedTargets(client, scope, [{
		id: 'action-target', rule: 'action_target', target: candidate, title: '', explanation: '', action: '',
		evidence: { windows: { current: { start: '1970-01-01', end: '1970-01-01' } }, cutoff: null, coverage: 'unavailable', units: '', strength: 'limited' }, reportHref: '/', status: 'open'
	}], []);
	if (visible.findings.length !== 1) throw new Error('public action target is unavailable');
	return candidate;
}

async function allVisibleFindings(client: SupabaseClient, scope: IntelligenceScope, ownerId: string, snapshotId: string): Promise<IntelligenceReport> {
	const first = await loadIntelligence(client, scope, { ownerId, snapshotId, page: 0 });
	if (first.pageCount > 10) throw new Error('too many finding pages');
	if (first.pageCount === 1) return first;
	const pages = await Promise.all(Array.from({ length: first.pageCount - 1 }, (_, index) => loadIntelligence(client, scope, { snapshotId, page: index + 1 })));
	return { ...first, findings: [first.findings, ...pages.map((page) => page.findings)].flat(), page: 0, pageCount: 1 };
}

function targetMatchesScope(target: IntelligenceAction['target'], scope: IntelligenceScope): boolean {
	return !!target && (scope.kind === 'gallery' ? ['gallery', 'album', 'photo'].includes(target.kind) : ['site', 'page'].includes(target.kind));
}

async function findingForAction(client: SupabaseClient, scope: IntelligenceScope, ownerId: string, findingId: string): Promise<Finding | undefined> {
	const first = await loadIntelligence(client, scope, { ownerId, page: 0 });
	if (first.pageCount > 10) throw new Error('too many finding pages');
	if (first.findings.find((finding) => finding.id === findingId)) return first.findings.find((finding) => finding.id === findingId);
	for (let page = 1; page < first.pageCount; page += 1) {
		const report = await loadIntelligence(client, scope, { ownerId, page });
		const finding = report.findings.find((item) => item.id === findingId);
		if (finding) return finding;
	}
	return undefined;
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

export async function loadIntelligence(client: SupabaseClient, scope: IntelligenceScope, options: { ownerId?: string; page?: number; actionsPage?: number; snapshotId?: string } = {}): Promise<IntelligenceReport> {
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
	const actionsPage = Math.max(0, Math.min(1000, Math.floor(options.actionsPage ?? 0))); let actionsPageCount = 1;
	if (options.ownerId) {
		const [{ data: actionRows, count: actionCount, error: actionError }, { data: briefRows }, { data: lifecycleRows }] = await Promise.all([
			client.from('analytics_intelligence_actions').select('id, kind, finding_id, target, actual_at, hypothesis, primary_measure, follow_up_at, note, created_at, reverses_action_id, change_type, channel, campaign, release, variant, outcome, outcome_count, observation_days', { count: 'exact' }).eq('owner_id', options.ownerId).in('target->>kind', checked.kind === 'gallery' ? ['gallery', 'album', 'photo'] : ['site', 'page']).order('created_at', { ascending: false }).order('id', { ascending: false }).range(actionsPage * ACTION_PAGE_SIZE, (actionsPage + 1) * ACTION_PAGE_SIZE - 1),
			client.from('analytics_intelligence_briefs').select('id, period_key, kind, created_at, body, findings, snapshot_ids').eq('owner_id', options.ownerId).order('created_at', { ascending: false }).limit(30),
			client.from('analytics_intelligence_finding_lifecycle').select('finding_id, status, snoozed_until').eq('owner_id', options.ownerId).eq('scope_key', scopeKey)
		]);
		if (actionError) throw new Error('private action history unavailable');
		actionsPageCount = Math.max(1, Math.ceil((actionCount ?? 0) / ACTION_PAGE_SIZE));
		actions = safeArray<Record<string, unknown>>(actionRows).map(decodeAction).filter((item): item is IntelligenceAction => !!item).filter((item) => targetMatchesScope(item.target, checked));
		const latestOutcomes = await loadLatestIntelligenceOutcomes(client, options.ownerId, actions.filter((item) => item.kind === 'record').map((item) => item.id));
		actions = actions.map((item) => { const latest = latestOutcomes.get(item.id); return latest ? { ...item, outcome: latest.outcome, outcomeCount: latest.outcomeCount } : item; });
		briefs = safeArray<Record<string, unknown>>(briefRows).flatMap((row) => uuid(row.id) && typeof row.period_key === 'string' && ['daily', 'weekly', 'operational'].includes(String(row.kind)) ? [{ id: row.id, periodKey: row.period_key, kind: row.kind as IntelligenceReport['briefs'][number]['kind'], createdAt: String(row.created_at), ...(typeof row.body === 'string' ? { body: row.body } : {}), ...(Array.isArray(row.findings) ? { findings: row.findings.map(decodeFinding).filter((item): item is Finding => !!item) } : {}), ...(Array.isArray(row.snapshot_ids) ? { snapshotIds: row.snapshot_ids.filter((id): id is string => uuid(id)) } : {}) }] : []);
		const lifecycle = new Map(safeArray<LifecycleRow>(lifecycleRows).map((row) => [row.finding_id, row]));
		for (const finding of visible.findings) {
			const row = lifecycle.get(finding.id);
			if (row && (row.status === 'dismiss' || row.status === 'snooze') && (!row.snoozed_until || Date.parse(row.snoozed_until) > Date.now())) finding.status = row.status === 'dismiss' ? 'dismissed' : 'snoozed';
		}
		const input = decodeInput(snapshot.evidence, checked);
		if (input) {
			const due = actions.filter((item) => item.kind === 'record' && item.followUpAt && Date.parse(item.followUpAt) <= Date.now()).slice(0, 4);
			for (const action of due) {
				const result = await loadPersistedActionFollowUp(client, action);
				action.followUpStatus = result.status;
				if (!result.followUp) continue;
				const overlapping = await client.from('analytics_intelligence_actions').select('id', { count: 'exact', head: true }).eq('owner_id', options.ownerId).eq('kind', 'record').neq('id', action.id).contains('target', action.target!).lte('actual_at', action.followUpAt!).gte('follow_up_at', action.actualAt!);
				if (overlapping.error) { action.followUpStatus = 'inconclusive'; continue; }
				const concurrentChanges = overlapping.count ?? 0;
				const followUp = { ...result.followUp, concurrentChanges };
				action.followUp = { before: followUp.before, after: followUp.after, concurrentChanges, measure: followUp.measure, window: followUp.window };
				visible.findings.push(...evaluateIntelligenceRules({ ...input, followUp }).findings.filter((finding) => finding.rule === 'follow_up'));
			}
		}
	}
	const pageCount = Math.max(1, Math.ceil(visible.findings.length / INTELLIGENCE_PAGE_SIZE));
	const currentPage = Math.min(page, pageCount - 1);
	return { snapshotId: snapshot.snapshot_id, scope: checked, generatedAt: snapshot.generated_at, cutoff: snapshot.cutoff_at, coverage: snapshot.coverage, findings: visible.findings.slice(currentPage * INTELLIGENCE_PAGE_SIZE, (currentPage + 1) * INTELLIGENCE_PAGE_SIZE), suppressions: visible.suppressions, actions, briefs, page: currentPage, pageCount, actionsPage, actionsPageCount, owner: !!options.ownerId };
}

export async function recordIntelligenceAction(client: SupabaseClient, ownerId: string, scope: IntelligenceScope, action: Omit<IntelligenceAction, 'id' | 'createdAt' | 'followUpAt'> & { actionId?: string | null }): Promise<IntelligenceAction> {
	const checked = parseIntelligenceScope(scope); if (!checked || !uuid(ownerId)) throw new Error('invalid intelligence action');
	if (!await retentionChosen(client, ownerId)) throw new Error('retention decision required');
	const scopeKey = intelligenceScopeKey(checked);
	const finding = action.findingId ? await findingForAction(client, checked, ownerId, action.findingId) : undefined;
	if (action.kind !== 'undo' && action.kind !== 'record' && !finding) throw new Error('finding is not in the owner scope');
	if (action.kind === 'undo' && (!action.actionId || !uuid(action.actionId))) throw new Error('undo requires an owned action');
	if (action.kind === 'record' && (!action.actualAt || !action.hypothesis || !action.primaryMeasure || !action.changeType || !action.observationDays)) throw new Error('record requires action context');
	const actualAt = action.kind === 'record' ? safeInstant(action.actualAt) : null;
	if (action.kind === 'record' && (!actualAt || Date.parse(actualAt) > Date.now())) throw new Error('invalid action time');
	const observationDays = action.observationDays ?? null;
	const followUpAt = actualAt && observationDays ? new Date(Date.parse(actualAt) + observationDays * 86_400_000).toISOString() : null;
	const target = action.kind === 'undo' ? null : finding?.target ?? await resolvePublicTarget(client, checked, action.target);
	const { data, error } = await client.rpc('analytics_record_intelligence_action', {
		p_owner_id: ownerId, p_scope_key: scopeKey, p_kind: action.kind, p_finding_id: action.kind === 'undo' ? null : finding?.id ?? null,
		p_target: target, p_actual_at: actualAt, p_hypothesis: action.hypothesis ?? null,
		p_primary_measure: action.primaryMeasure ?? null, p_follow_up_at: followUpAt, p_note: action.note ?? null, p_reverses_action_id: action.actionId ?? null,
		p_change_type: action.changeType ?? null, p_channel: action.channel ?? null, p_campaign: action.campaign ?? null, p_release: action.release ?? null,
		p_variant: action.variant ?? null, p_outcome: action.outcome ?? null, p_outcome_count: action.outcomeCount ?? null, p_observation_days: observationDays,
		p_target_context: { target, scope: checked }
	}).single();
	const row = safeObject(data);
	if (error || !row || !uuid(row.id)) throw new Error('intelligence action storage unavailable');
	const decoded = decodeAction(row); if (!decoded) throw new Error('intelligence action storage unavailable');
	return decoded;
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
	const report = await allVisibleFindings(client, scope, ownerId, data.report_id);
	const question = data.operation === 'album_comparison' ? 'Compare this album with the stored comparable evidence' : 'Where are readers or demo visitors losing interest?';
	const answer = answerIntelligenceQuestion(scope, question, report, requestId);
	if (data.operation === 'album_comparison') {
		const stored = safeObject(data.answer);
		answer.comparison = await projectAlbumComparison(client, scope, stored?.comparison);
		answer.status = answer.comparison.available ? 'complete' : 'unavailable';
		answer.summary = answer.comparison.available ? 'Compare the selected album and its public peers below.' : answer.comparison.reason ?? 'The saved comparison is unavailable.';
	}
	// Stored request payloads are not trusted as display data. Rebuild the typed,
	// visibility-filtered answer from the immutable snapshot on every read.
	return { status: 'complete', answer };
}

/** Only an authorized operator queues a new scope; reads never call the provider. */
export async function queueIntelligenceRefresh(client: SupabaseClient, scope: IntelligenceScope, now = new Date()): Promise<void> {
 const checked = parseIntelligenceScope(scope); if (!checked) throw new Error('invalid intelligence scope');
 const result = await client.rpc('analytics_prepare_intelligence_periods', {
  p_daily_period: null, p_weekly_period: null, p_standard_scopes: [checked],
  p_refresh_cadence_seconds: 900, p_provider_pending_retry_seconds: 300, p_max_catchup_periods: 4, p_now: now.toISOString()
 });
 if (result.error) throw new Error('intelligence queue unavailable');
}
