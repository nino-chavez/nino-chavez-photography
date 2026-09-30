import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { intelligenceOwner } from '$lib/analytics/intelligence-store.server';
import type { IntelligenceOutcomeKind } from '$lib/analytics/intelligence-private-controls.server';
import type { RequestHandler } from './$types';

const ANALYTICS_ORIGIN = 'https://analytics.ninochavez.co';
const BODY_LIMIT = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set<IntelligenceOutcomeKind>(['unknown', 'inquiry', 'booking', 'other']);

async function bodyObject(request: Request): Promise<Record<string, unknown>> {
	const reader = request.body?.getReader();
	if (!reader) throw error(400, 'invalid intelligence outcome');
	const chunks: Uint8Array[] = []; let total = 0;
	for (;;) {
		const next = await reader.read(); if (next.done) break;
		total += next.value.byteLength;
		if (total > BODY_LIMIT) throw error(413, 'intelligence outcome body is too large');
		chunks.push(next.value);
	}
	const bytes = new Uint8Array(total); let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
		return value as Record<string, unknown>;
	} catch { throw error(400, 'invalid intelligence outcome'); }
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : ANALYTICS_ORIGIN)) throw error(403, 'cross-origin intelligence outcome rejected');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'owner authorization required');
	const body = await bodyObject(request);
	if (Object.keys(body).some((key) => !['actionId', 'outcome', 'outcomeCount', 'note'].includes(key))) throw error(400, 'unknown intelligence outcome field');
	const actionId = typeof body.actionId === 'string' && UUID.test(body.actionId) ? body.actionId : null;
	const outcome = typeof body.outcome === 'string' && OUTCOMES.has(body.outcome as IntelligenceOutcomeKind) ? body.outcome as IntelligenceOutcomeKind : null;
	const outcomeCount = body.outcomeCount === undefined || body.outcomeCount === null ? null : Number.isSafeInteger(body.outcomeCount) && (body.outcomeCount as number) >= 0 && (body.outcomeCount as number) <= 100000 ? body.outcomeCount as number : undefined;
	const note = body.note === undefined || body.note === null ? null : typeof body.note === 'string' && body.note.trim().length > 0 && body.note.trim().length <= 500 ? body.note.trim() : undefined;
	if (!actionId || !outcome || outcomeCount === undefined || note === undefined) throw error(400, 'invalid intelligence outcome');
	const { data, error: writeError } = await createSupabaseAdminClient().rpc('analytics_record_intelligence_outcome', {
		p_owner_id: owner.userId,
		p_action_id: actionId,
		p_outcome: outcome,
		p_outcome_count: outcomeCount,
		p_note: note
	}).single();
	if (writeError || !data) {
		if (writeError?.message.includes('retention decision required')) throw error(409, 'choose private record retention before saving an observed result');
		throw error(400, 'observed result could not be saved');
	}
	return json({ saved: true }, { headers: { 'cache-control': 'private, no-store' } });
};
