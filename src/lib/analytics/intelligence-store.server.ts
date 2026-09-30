import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { INTELLIGENCE_PAGE_SIZE, intelligenceScopeKey, type Finding, type IntelligenceAction, type IntelligenceReport, type IntelligenceScope } from './intelligence-contract';
import { evaluateIntelligenceRules } from './intelligence-rules';
import { loadIntelligenceEvidence } from './intelligence-source.server';

type SnapshotRow = { scope_key: string; scope: IntelligenceScope; generated_at: string; cutoff_at: string | null; coverage: IntelligenceReport['coverage']; findings: Finding[]; suppressions: IntelligenceReport['suppressions'] };
const safeArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export async function intelligenceOwner(cookies: Cookies): Promise<{ owner: boolean; userId: string | null }> {
	const client = createSupabaseServerClient(cookies);
	const { data: { user } } = await client.auth.getUser();
	return { owner: !!user && isAllowedAdmin(user.email), userId: user?.id ?? null };
}

export async function refreshIntelligence(client: SupabaseClient, scope: IntelligenceScope, options: { ownerId?: string; now?: Date; journeys?: never } = {}): Promise<IntelligenceReport> {
	const now = options.now ?? new Date();
	const evidence = await loadIntelligenceEvidence(client, scope, now);
	const evaluated = evaluateIntelligenceRules(evidence);
	const snapshot = {
		scope_key: intelligenceScopeKey(scope), scope, generated_at: evidence.generatedAt, cutoff_at: evidence.cutoff, coverage: evidence.coverage,
		findings: evaluated.findings, suppressions: evaluated.suppressions, rule_version: 1
	};
	const { error } = await client.from('analytics_intelligence_snapshots').upsert(snapshot, { onConflict: 'scope_key' });
	if (error) throw new Error('intelligence snapshot storage unavailable');
	return loadIntelligence(client, scope, { ownerId: options.ownerId, page: 0 });
}

export async function loadIntelligence(client: SupabaseClient, scope: IntelligenceScope, options: { ownerId?: string; page?: number } = {}): Promise<IntelligenceReport> {
	const page = Math.max(0, Math.min(1000, Math.floor(options.page ?? 0)));
	const { data, error } = await client.from('analytics_intelligence_snapshots').select('scope_key, scope, generated_at, cutoff_at, coverage, findings, suppressions').eq('scope_key', intelligenceScopeKey(scope)).maybeSingle();
	if (error || !data) throw new Error('intelligence report unavailable');
	const snapshot = data as SnapshotRow;
	const allFindings = safeArray<Finding>(snapshot.findings);
	const pageCount = Math.max(1, Math.ceil(allFindings.length / INTELLIGENCE_PAGE_SIZE));
	const currentPage = Math.min(page, pageCount - 1);
	const findings = allFindings.slice(currentPage * INTELLIGENCE_PAGE_SIZE, (currentPage + 1) * INTELLIGENCE_PAGE_SIZE);
	let actions: IntelligenceAction[] = [];
	let briefs: IntelligenceReport['briefs'] = [];
	if (options.ownerId) {
		const [{ data: actionRows }, { data: briefRows }] = await Promise.all([
			client.from('analytics_intelligence_actions').select('id, kind, finding_id, target, actual_at, hypothesis, primary_measure, follow_up_at, note, created_at').eq('owner_id', options.ownerId).eq('scope_key', snapshot.scope_key).order('created_at', { ascending: false }).limit(100),
			client.from('analytics_intelligence_briefs').select('id, period_key, kind, created_at').eq('owner_id', options.ownerId).eq('scope_key', snapshot.scope_key).order('created_at', { ascending: false }).limit(30)
		]);
		actions = safeArray<Record<string, unknown>>(actionRows).map((row) => ({ id: String(row.id), kind: row.kind as IntelligenceAction['kind'], findingId: row.finding_id as string | null, target: row.target as IntelligenceAction['target'], actualAt: row.actual_at as string | null, hypothesis: row.hypothesis as string | null, primaryMeasure: row.primary_measure as string | null, followUpAt: row.follow_up_at as string | null, note: row.note as string | null, createdAt: String(row.created_at) }));
		briefs = safeArray<Record<string, unknown>>(briefRows).map((row) => ({ id: String(row.id), periodKey: String(row.period_key), kind: row.kind as IntelligenceReport['briefs'][number]['kind'], createdAt: String(row.created_at) }));
	}
	return { scope, generatedAt: snapshot.generated_at, cutoff: snapshot.cutoff_at, coverage: snapshot.coverage, findings, suppressions: safeArray(snapshot.suppressions), actions, briefs, page: currentPage, pageCount, owner: !!options.ownerId };
}

export async function recordIntelligenceAction(client: SupabaseClient, ownerId: string, scope: IntelligenceScope, action: Omit<IntelligenceAction, 'id' | 'createdAt'>): Promise<IntelligenceAction> {
	const { data, error } = await client.from('analytics_intelligence_actions').insert({
		owner_id: ownerId, scope_key: intelligenceScopeKey(scope), kind: action.kind, finding_id: action.findingId ?? null, target: action.target ?? null,
		actual_at: action.actualAt ?? null, hypothesis: action.hypothesis ?? null, primary_measure: action.primaryMeasure ?? null, follow_up_at: action.followUpAt ?? null, note: action.note ?? null
	}).select('id, kind, finding_id, target, actual_at, hypothesis, primary_measure, follow_up_at, note, created_at').single();
	if (error || !data) throw new Error('intelligence action storage unavailable');
	return { id: data.id, kind: data.kind, findingId: data.finding_id, target: data.target, actualAt: data.actual_at, hypothesis: data.hypothesis, primaryMeasure: data.primary_measure, followUpAt: data.follow_up_at, note: data.note, createdAt: data.created_at };
}

export async function createIntelligenceRequest(client: SupabaseClient, ownerId: string, scope: IntelligenceScope, operation: string): Promise<string> {
	const { data, error } = await client.from('analytics_intelligence_requests').upsert({ owner_id: ownerId, scope_key: intelligenceScopeKey(scope), operation, status: 'pending', expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }, { onConflict: 'owner_id,scope_key,operation,status' }).select('id').single();
	if (error || !data) throw new Error('intelligence request storage unavailable');
	return String(data.id);
}

export async function loadIntelligenceRequest(client: SupabaseClient, ownerId: string, requestId: string): Promise<{ status: 'pending' | 'complete' | 'unavailable'; answer: unknown | null }> {
	const { data, error } = await client.from('analytics_intelligence_requests').select('status, answer').eq('id', requestId).eq('owner_id', ownerId).maybeSingle();
	if (error || !data) throw new Error('intelligence request unavailable');
	return { status: data.status === 'complete' ? 'complete' : data.status === 'pending' ? 'pending' : 'unavailable', answer: data.answer ?? null };
}
