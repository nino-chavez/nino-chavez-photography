import { dev } from '$app/environment';
import { json, error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { answerIntelligenceQuestion, recognizeIntelligenceOperation } from '$lib/analytics/intelligence-assistant';
import { parseIntelligenceScope, type IntelligenceReport } from '$lib/analytics/intelligence-contract';
import { createIntelligenceRequest, intelligenceOwner, loadIntelligence, loadIntelligenceRequest } from '$lib/analytics/intelligence-store.server';
import type { RequestHandler } from './$types';

const ANALYTICS_ORIGIN = 'https://analytics.ninochavez.co';
const BODY_LIMIT = 12_000;
function plain(status: number, message: string): never { throw error(status, message); }
function trustedOrigin(request: Request, url: URL): boolean { return request.headers.get('origin') === (dev ? url.origin : ANALYTICS_ORIGIN); }
function parseScopeParam(value: string | null) { try { return value ? parseIntelligenceScope(JSON.parse(value)) : null; } catch { return null; } }
async function bodyObject(request: Request): Promise<Record<string, unknown>> {
	const reader = request.body?.getReader(); if (!reader) plain(400, 'invalid JSON');
	const chunks: Uint8Array[] = []; let total = 0;
	for (;;) {
		const next = await reader.read(); if (next.done) break;
		total += next.value.byteLength; if (total > BODY_LIMIT) plain(413, 'analytics request body is too large');
		chunks.push(next.value);
	}
	const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	let value: unknown; try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { plain(400, 'invalid JSON'); }
	if (!value || typeof value !== 'object' || Array.isArray(value)) plain(400, 'invalid analytics request');
	return value as Record<string, unknown>;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const scope = parseScopeParam(url.searchParams.get('scope'));
	if (!scope) plain(400, 'invalid analytics scope');
	const page = Number(url.searchParams.get('page') ?? '0');
	const actionsPage = Number(url.searchParams.get('actionsPage') ?? '0');
	const snapshotId = url.searchParams.get('snapshotId') ?? undefined;
	if (snapshotId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshotId)) plain(400, 'invalid evidence snapshot');
	const briefsPage = Number(url.searchParams.get('briefsPage') ?? '0');
	if (!Number.isSafeInteger(actionsPage) || actionsPage < 0 || actionsPage > 1000) plain(400, 'invalid private history page');
	if (!Number.isSafeInteger(briefsPage) || briefsPage < 0 || briefsPage > 1000) plain(400, 'invalid private brief page');
	if (!Number.isSafeInteger(page) || page < 0 || page > 1000) plain(400, 'invalid analytics page');
	const owner = await intelligenceOwner(cookies);
	const admin = createSupabaseAdminClient();
	const requestId = url.searchParams.get('requestId');
	if (requestId) {
		if (!owner.owner || !owner.userId || !/^[0-9a-f-]{36}$/i.test(requestId)) plain(403, 'owner authorization required');
		try { return json(await loadIntelligenceRequest(admin, owner.userId, scope, requestId), { headers: { 'cache-control': 'no-store' } }); } catch { return plain(404, 'analytics request unavailable'); }
	}
	try {
		const report = await loadIntelligence(admin, scope, { ownerId: owner.owner ? owner.userId ?? undefined : undefined, page, actionsPage, briefsPage, snapshotId });
		if (!owner.owner) { report.actions = []; report.briefs = []; report.findings = report.findings.map(({ status: _status, ...finding }) => ({ ...finding, status: 'open' })); }
		return json(report, { headers: { 'cache-control': 'no-store' } });
	} catch (failure) { if (dev) console.error('[intelligence local report]', failure instanceof Error ? failure.message : 'unavailable'); return plain(503, 'analytics report unavailable'); }
};

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (!trustedOrigin(request, url)) plain(403, 'cross-origin analytics request rejected');
	const body = await bodyObject(request);
	if (Object.keys(body).some((key) => key !== 'scope' && key !== 'question')) plain(400, 'unknown analytics request field');
	const scope = parseIntelligenceScope(body.scope);
	const question = typeof body.question === 'string' ? body.question.trim() : '';
	if (!scope || !question || question.length > 500) plain(400, 'invalid analytics question');
	const operation = recognizeIntelligenceOperation(question);
	if (!operation) plain(400, 'unsupported analytics question');
	const owner = await intelligenceOwner(cookies);
	// Public callers may receive only a deterministic explanation of already
	// visible stored evidence. Any new calculation or free text remains private.
	if (!owner.owner && operation !== 'explain_report') plain(403, 'owner authorization required');
	const admin = createSupabaseAdminClient();
	try {
		const report: IntelligenceReport = operation === 'album_comparison' || operation === 'site_retention'
   ? {scope,generatedAt:new Date().toISOString(),cutoff:null,coverage:'unavailable',findings:[],suppressions:[],actions:[],briefs:[],page:0,pageCount:1,owner:owner.owner}
   : await loadIntelligence(admin, scope, { ownerId: owner.owner ? owner.userId ?? undefined : undefined, page: 0 });
		const draft = answerIntelligenceQuestion(scope, question, report);
		if (draft.status !== 'pending') return json(draft, { headers: { 'cache-control': 'no-store' } });
		if (!owner.userId) plain(403, 'owner authorization required');
		const requestId = await createIntelligenceRequest(admin, owner.userId, scope, draft.operation);
		// A queued calculation remains pending until its owned job writes a matching
		// immutable report. The request id is a polling handle, not a result.
		return json({ ...draft, requestId }, { status: 202, headers: { 'cache-control': 'no-store' } });
	} catch { return plain(503, 'analytics assistant unavailable'); }
};
