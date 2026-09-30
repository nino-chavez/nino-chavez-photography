import { dev } from '$app/environment';
import { json, error } from '@sveltejs/kit';
import { SITE_ORIGIN } from '$lib/site-url';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { answerIntelligenceQuestion } from '$lib/analytics/intelligence-assistant';
import { parseIntelligenceScope } from '$lib/analytics/intelligence-contract';
import { createIntelligenceRequest, intelligenceOwner, loadIntelligence, loadIntelligenceRequest } from '$lib/analytics/intelligence-store.server';
import type { RequestHandler } from './$types';

function sameOrigin(request: Request, origin: string): boolean { return request.headers.get('origin') === origin; }
function plain(status: number, message: string): never { throw error(status, message); }
function parseScopeParam(value: string | null) { try { return value ? parseIntelligenceScope(JSON.parse(value)) : null; } catch { return null; } }

export const GET: RequestHandler = async ({ url, cookies }) => {
	const scope = parseScopeParam(url.searchParams.get('scope'));
	if (!scope) plain(400, 'invalid analytics scope');
	const page = Number(url.searchParams.get('page') ?? '0');
	if (!Number.isSafeInteger(page) || page < 0 || page > 1000) plain(400, 'invalid analytics page');
	const owner = await intelligenceOwner(cookies);
	const admin = createSupabaseAdminClient();
	const requestId = url.searchParams.get('requestId');
	if (requestId) {
		if (!owner.owner || !owner.userId || !/^[0-9a-f-]{36}$/i.test(requestId)) plain(403, 'owner authorization required');
		try { return json(await loadIntelligenceRequest(admin, owner.userId, requestId), { headers: { 'cache-control': 'no-store' } }); } catch { return plain(404, 'analytics request unavailable'); }
	}
	try {
		const report = await loadIntelligence(admin, scope, { ownerId: owner.owner ? owner.userId ?? undefined : undefined, page });
		if (!owner.owner) { report.actions = []; report.briefs = []; report.findings = report.findings.map(({ status: _status, ...finding }) => ({ ...finding, status: 'open' })); }
		return json(report, { headers: { 'cache-control': 'no-store' } });
	} catch { return plain(503, 'analytics report unavailable'); }
};

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (!sameOrigin(request, dev ? url.origin : SITE_ORIGIN)) plain(403, 'cross-origin analytics request rejected');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) plain(403, 'owner authorization required');
	let body!: { scope?: unknown; question?: unknown };
	try { body = await request.json(); } catch { plain(400, 'invalid JSON'); }
	const scope = parseIntelligenceScope(body?.scope);
	const question = typeof body?.question === 'string' ? body.question.trim() : '';
	if (!scope || !question || question.length > 500) plain(400, 'invalid analytics question');
	const admin = createSupabaseAdminClient();
	try {
		const report = await loadIntelligence(admin, scope, { ownerId: owner.userId, page: 0 });
		const draft = answerIntelligenceQuestion(scope, question, report);
		if (draft.status !== 'pending') return json(draft, { headers: { 'cache-control': 'no-store' } });
		const requestId = await createIntelligenceRequest(admin, owner.userId, scope, draft.operation);
		return json(answerIntelligenceQuestion(scope, question, report, requestId), { status: 202, headers: { 'cache-control': 'no-store' } });
	} catch { return plain(503, 'analytics assistant unavailable'); }
};
