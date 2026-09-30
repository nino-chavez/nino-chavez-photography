import { dev } from '$app/environment';
import { json, error } from '@sveltejs/kit';
import { SITE_ORIGIN } from '$lib/site-url';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { parseIntelligenceScope, type IntelligenceAction } from '$lib/analytics/intelligence-contract';
import { intelligenceOwner, recordIntelligenceAction } from '$lib/analytics/intelligence-store.server';
import type { RequestHandler } from './$types';

const validKinds = new Set<IntelligenceAction['kind']>(['record', 'dismiss', 'snooze', 'undo']);
const text = (value: unknown, limit: number) => typeof value === 'string' && value.trim().length <= limit ? value.trim() || null : value === undefined ? null : undefined;
const instant = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : SITE_ORIGIN)) throw error(403, 'cross-origin analytics action rejected');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'owner authorization required');
	let body: Record<string, unknown>;
	try { body = await request.json(); } catch { throw error(400, 'invalid JSON'); }
	const scope = parseIntelligenceScope(body.scope);
	if (!scope || !validKinds.has(body.kind as IntelligenceAction['kind']) || !instant(body.actualAt) || !instant(body.followUpAt)) throw error(400, 'invalid analytics action');
	const fields = { findingId: text(body.findingId, 120), hypothesis: text(body.hypothesis, 500), primaryMeasure: text(body.primaryMeasure, 120), note: text(body.note, 1000) };
	if (Object.values(fields).some((value) => value === undefined)) throw error(400, 'invalid analytics action');
	if (body.kind === 'record' && (!fields.findingId || !fields.hypothesis || !fields.primaryMeasure || !body.actualAt || !body.followUpAt)) throw error(400, 'recorded actions need a finding, hypothesis, measure, action time, and follow-up time');
	try {
		const action = await recordIntelligenceAction(createSupabaseAdminClient(), owner.userId, scope, { kind: body.kind as IntelligenceAction['kind'], findingId: fields.findingId, target: null, actualAt: body.actualAt as string | null, hypothesis: fields.hypothesis, primaryMeasure: fields.primaryMeasure, followUpAt: body.followUpAt as string | null, note: fields.note });
		return json({ action }, { headers: { 'cache-control': 'no-store' } });
	} catch { throw error(503, 'analytics action unavailable'); }
};
